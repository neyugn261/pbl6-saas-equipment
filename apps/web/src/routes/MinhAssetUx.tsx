import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { bases } from "../api/config";
import { getSessionGeneration, useSession } from "../auth/session";
import { DirectoryPicker, SetupPage } from "./registration-shared";
import { useDirectory, errorText } from "./registration-data";
import type { Page } from "../types/domain";
import { locationOptions } from '../display-names';
import { mapImportRows, parseCsvFile, parseXlsx, type SheetRow } from '../features/equipment/spreadsheet';
import "./minh-asset-ux.css";

type BulkResult = {
  id: string;
  status: string;
  registrations: {
    id: string;
    equipmentId: string;
    status: string;
    equipmentSummary?: {
      assetCode: string;
      serialNumber: string;
      displayName: string | null;
    };
  }[];
};
type Preview = {
  valid: boolean;
  count: number;
  rows: { row: number; valid: boolean; message?: string }[];
};
const sample =
  "modelId,assetCode,serialNumber,displayName,customerSiteId,locationId,purchaseDate,handoverDate\n, MAY-001,SERIAL-001,Máy thứ nhất,,,,\n, MAY-002,SERIAL-002,Máy thứ hai,,,,\n";
export function BulkHandoverPage() {
  const { profile } = useSession();
  return (
    <BulkHandoverForm
      key={`${getSessionGeneration()}:${profile?.id}`}
      storageKey={`pbl6.registration.bulk.${profile?.tenantId}.${profile?.id}`}
    />
  );
}
function BulkHandoverForm({ storageKey }: { storageKey: string }) {
  const generation = getSessionGeneration();
  const pending = useRef(false);
  const fileRead = useRef(0);
  const [saved] = useState(() => {
    try {
      const text = sessionStorage.getItem(storageKey);
      if (!text) return { command: null, error: "" };
      const command = JSON.parse(text) as { key: string; body: unknown };
      if (!command.key || !command.body) throw new Error("Invalid saved batch");
      return { command, error: "" };
    } catch {
      return {
        command: null,
        error:
          "Không đọc được dữ liệu phục hồi. Kiểm tra danh sách hồ sơ trước khi tạo lô mới.",
      };
    }
  });
  const [customerId, setCustomer] = useState(""),
    [customerSiteId, setSite] = useState(""),
    [modelId, setModel] = useState("");
  const [defaultLocationId, setLocation] = useState('');
  const locations = useDirectory<{ id: string; name: string; parentId?: string | null; customerSiteId?: string }[]>('organization', customerSiteId ? `/sites/${customerSiteId}/locations` : null);
  const [deliveryMethod, setMethod] = useState("CUSTOMER_SITE"),
    [csv, setCsv] = useState("");
  const [fileRows, setFileRows] = useState<SheetRow[] | null>(null),
    [importFileName, setImportFileName] = useState("");
  const importFields = ['modelId', 'assetCode', 'serialNumber', 'displayName', 'customerSiteId', 'locationId', 'purchaseDate', 'handoverDate'];
  const fieldLabels: Record<string, string> = { modelId: 'Model', assetCode: 'Mã thiết bị', serialNumber: 'Số sê-ri', displayName: 'Tên máy', customerSiteId: 'Cơ sở lắp đặt', locationId: 'Vị trí chi tiết', purchaseDate: 'Ngày mua', handoverDate: 'Ngày bàn giao' };
  const [columnMap, setColumnMap] = useState<Record<string, string>>({});
  const mappedRows = fileRows ? mapImportRows(fileRows, columnMap, importFileName.toLowerCase().endsWith('.xlsx')) : null;
  const [preview, setPreview] = useState<Preview | null>(null),
    [result, setResult] = useState<BulkResult | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(saved.error),
    [locked, setLocked] = useState(!!saved.command || !!saved.error);
  const [command, setCommand] = useState<{ key: string; body: unknown } | null>(
    saved.command,
  );
  function invalidate() {
    setPreview(null);
    setError("");
  }
  function requestBody() {
    const common = { customerId, customerSiteId, deliveryMethod, defaultModelId: modelId, ...(defaultLocationId ? { defaultLocationId } : {}) };
    return mappedRows
      ? { ...common, rows: mappedRows.map(row => ({
          ...(row.modelId || modelId ? { modelId: row.modelId || modelId } : {}),
          assetCode: row.assetCode,
          serialNumber: row.serialNumber,
          ...(row.displayName ? { displayName: row.displayName } : {}),
          ...(row.customerSiteId ? { customerSiteId: row.customerSiteId } : {}),
          ...(row.locationId ? { locationId: row.locationId } : {}),
          ...(row.purchaseDate ? { purchaseDate: row.purchaseDate } : {}),
          ...(row.handoverDate ? { handoverDate: row.handoverDate } : {}),
        })) }
      : { ...common, csv };
  }
  async function check(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setPreview(null);
    try {
      setPreview(
        await api.asset<Preview>("/bulk-handovers/preview", {
          method: "POST",
          body: requestBody(),
        }),
      );
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }
  async function submit() {
    if (pending.current || getSessionGeneration() !== generation) return;
    const activeCommand = command ?? {
      key: crypto.randomUUID(),
      body: requestBody(),
    };
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(activeCommand));
    } catch {
      setError(
        "Không lưu được mã phục hồi. Chưa gửi lô; kiểm tra khả năng lưu trữ của trình duyệt.",
      );
      return;
    }
    pending.current = true;
    setCommand(activeCommand);
    setBusy(true);
    setLocked(true);
    setError("");
    try {
      const value = await api.asset<BulkResult>("/bulk-handovers", {
        method: "POST",
        headers: { "Idempotency-Key": activeCommand.key },
        body: activeCommand.body,
      });
      if (generation === getSessionGeneration()) {
        setResult(value);
        sessionStorage.removeItem(storageKey);
      }
    } catch (cause) {
      if (
        cause instanceof ApiError &&
        [400, 422].includes(cause.status) &&
        !command
      ) {
        setLocked(false);
        setCommand(null);
        setPreview(null);
        sessionStorage.removeItem(storageKey);
      }
      setError(`${errorText(cause)} Kiểm tra kết quả lô trước khi nhập lại.`);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  async function recover() {
    if (!command) return;
    setBusy(true);
    setError("");
    try {
      setResult(await api.asset<BulkResult>(`/bulk-handovers/${command.key}`));
      sessionStorage.removeItem(storageKey);
    } catch (cause) {
      setError(
        cause instanceof ApiError && cause.status === 404
          ? "Chưa có kết quả lô. Bạn có thể gửi lại đúng lô bằng nút bên dưới; hệ thống giữ nguyên mã chống trùng."
          : errorText(cause),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <SetupPage
      title="Nhập lô thiết bị — tạo hồ sơ đăng ký"
      description="Nhập CSV/XLSX tối đa 2.000 dòng; mỗi máy có thể dùng model, cơ sở, vị trí và ngày riêng. Bước này lưu hồ sơ nháp, chưa tự kích hoạt bảo hành."
      actions={
        <Link to="/app/equipment-registrations">Hồ sơ đăng ký thiết bị</Link>
      }
    >
      <ol className="minh-steps">
        <li>1 · Chọn khách và danh sách máy</li>
        <li>2 · Kiểm tra dữ liệu</li>
        <li>3 · Tạo hồ sơ nháp, tiếp tục từng máy</li>
      </ol>
      <details className="m1-card minh-ux-card">
        <summary>Đăng ký và bàn giao khác nhau thế nào?</summary>
        <p>Nhập lô là cách đăng ký nhiều máy cùng lúc. Sau khi tạo lô, mở từng hồ sơ để kiểm tra serial, nơi đặt máy, ngày thực tế và chính sách bảo hành/bảo trì.</p>
        <p>Tại địa điểm khách hàng: nhân viên gửi hồ sơ bàn giao, khách xem và xác nhận đúng nội dung đã gửi. Tại cửa hàng: nhân viên hoàn tất theo ngày bàn giao thực tế, không có bước khách xác nhận trên Portal.</p>
        <p>Bảo hành và bảo trì chỉ được áp dụng khi đủ điều kiện của phương thức bàn giao; không bắt đầu chỉ vì đã tải CSV.</p>
        <Link to="/app/equipment-registrations?handoverStatus=PENDING_CUSTOMER_CONFIRMATION">Theo dõi hồ sơ chờ khách xác nhận</Link>
      </details>
      {!result && (
        <form
          onSubmit={(event) => void check(event)}
          className="m1-card minh-ux-card"
        >
          <fieldset disabled={busy || locked}>
            <DirectoryPicker
              label="Khách hàng"
              area="organization"
              path="/customers?status=ACTIVE"
              selected={customerId}
              onChange={(id) => {
                setCustomer(id);
                setSite("");
                setLocation('');
                invalidate();
              }}
            />
            <DirectoryPicker
              key={customerId || 'no-customer'}
              label="Địa điểm khách hàng"
              area="organization"
              path={customerId ? `/customers/${customerId}/sites` : null}
              responseShape="list"
              selected={customerSiteId}
              onChange={(id) => {
                setSite(id);
                setLocation('');
                invalidate();
              }}
            />
            <DirectoryPicker
              label="Model mặc định của lô"
              area="assetM2"
              path="/equipment-models?status=ACTIVE"
              selected={modelId}
              onChange={(id) => {
                setModel(id);
                invalidate();
              }}
            />
            <label>
              Phương thức bàn giao
              <select
                value={deliveryMethod}
                onChange={(e) => {
                  setMethod(e.target.value);
                  invalidate();
                }}
              >
                <option value="CUSTOMER_SITE">Tại địa điểm khách hàng</option>
                <option value="STORE">Tại cửa hàng</option>
              </select>
            </label>
            <label>Vị trí mặc định trong địa điểm khách hàng
              <select value={defaultLocationId} disabled={!customerSiteId || locations.loading} onChange={event => { setLocation(event.target.value); invalidate(); }}>
                <option value="">Chưa xác định vị trí cụ thể</option>
                {locationOptions(locations.value ?? [], customerSiteId).map(row => <option key={row.id} value={row.id}>{row.label}</option>)}
              </select>
            </label>
            {locations.error && <p role="alert">{locations.error}</p>}
            <label>
              File CSV / XLSX (tối đa 5 MB, 2.000 dòng)
              <input
                type="file"
                accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={async (event) => {
                  const readId = ++fileRead.current;
                  const file = event.target.files?.[0];
                  if (!file) return;
                  setFileRows(null);
                  setCsv("");
                  setImportFileName("");
                  invalidate();
                  if (file.size > 5000000) { setError("Chọn tệp không quá 5 MB."); return; }
                  const name = file.name.toLowerCase();
                  if (!name.endsWith('.xlsx') && !name.endsWith('.csv')) { setError('Chỉ nhận file .xlsx hoặc .csv.'); return; }
                  try {
                    const imported = name.endsWith('.xlsx') ? await parseXlsx(file) : await parseCsvFile(file);
                    if (readId !== fileRead.current || generation !== getSessionGeneration()) return;
                    setFileRows(imported); setColumnMap(Object.fromEntries(importFields.map(field => [field, field in (imported[0] ?? {}) ? field : ''])));
                    setImportFileName(file.name); setCsv(''); invalidate();
                  } catch (cause) { if (readId === fileRead.current && generation === getSessionGeneration()) { setFileRows(null); setError(errorText(cause)); } }
                }}
              />
            </label>
            <a
              download="mau-ban-giao.csv"
              href={`data:text/csv;charset=utf-8,${encodeURIComponent("\uFEFF" + sample)}`}
            >
              Tải mẫu CSV
            </a>
            <label>
              Nội dung CSV (nếu không chọn file)
              <textarea
                required={!fileRows}
                maxLength={5000000}
                rows={8}
                value={csv}
                disabled={!!fileRows}
                placeholder={sample}
                onChange={(e) => {
                  fileRead.current++;
                  setCsv(e.target.value);
                  invalidate();
                }}
              />
            </label>
            {importFileName && <p>Đã đọc {importFileName}{fileRows ? ` · ${fileRows.length.toLocaleString("vi-VN")} dòng` : " · CSV"}</p>}
            {!!fileRows?.length && <fieldset><legend>Ghép cột trong tệp</legend><div className="management-fields">{importFields.map(field => <label key={field}>{fieldLabels[field]}<select value={columnMap[field] || ''} onChange={event => { setColumnMap(current => ({ ...current, [field]: event.target.value })); invalidate(); }}><option value="">{['assetCode', 'serialNumber'].includes(field) ? 'Chọn cột bắt buộc' : 'Không có / dùng giá trị mặc định'}</option>{Object.keys(fileRows[0]).map(header => <option key={header} value={header}>{header}</option>)}</select></label>)}</div><p>Ngày theo YYYY-MM-DD; model, cơ sở và vị trí dùng mã định danh từ danh mục hiện có.</p></fieldset>}
            <p>Ngày dùng YYYY-MM-DD hoặc ngày Excel. Các cột modelId, customerSiteId, locationId, purchaseDate và handoverDate được phép khai báo theo từng máy. Ngày mua không thay đổi ngày bắt đầu bảo hành.</p>
          </fieldset>
          <button
            disabled={
              busy ||
              locked ||
              !customerId ||
              !customerSiteId ||
              (!modelId && !mappedRows?.every(row => row.modelId)) ||
              (!!fileRows && (!columnMap.assetCode || !columnMap.serialNumber)) ||
              !(fileRows?.length || csv)
            }
          >
            {busy ? "Đang kiểm tra…" : "Kiểm tra danh sách"}
          </button>
        </form>
      )}
      {error && (
        <p role="alert" className="m1-error">
          {error}
        </p>
      )}
      {preview && !result && (
        <section className="m1-card minh-ux-card">
          <h2>
            {preview.valid
              ? `${preview.count} máy hợp lệ`
              : "Cần sửa dữ liệu trước khi tạo"}
          </h2>
          <table>
            <thead>
              <tr>
                <th>Dòng dữ liệu</th>
                <th>Kết quả kiểm tra</th>
              </tr>
            </thead>
            <tbody>
              {preview.rows.map((row) => (
                <tr key={row.row}>
                  <td>{row.row}</td>
                  <td>{row.valid ? "Hợp lệ" : row.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>
            Chưa kích hoạt bảo hành hoặc bảo trì ở bước này. Mỗi máy có hồ sơ
            chính sách và xác nhận riêng.
          </p>
          {preview.valid && (
            <button disabled={busy} onClick={() => void submit()}>
              {locked
                ? "Gửi lại đúng lô đã chọn"
                : `Tạo ${preview.count} hồ sơ bàn giao`}
            </button>
          )}
        </section>
      )}
      {locked && !result && command && (
        <section className="m1-card minh-ux-card">
          <h2>Đối chiếu kết quả</h2>
          <p>
            Mã lô: <code>{command.key}</code>
          </p>
          <button disabled={busy} onClick={() => void recover()}>
            Kiểm tra lô đã tạo
          </button>
          <button disabled={busy} onClick={() => void submit()}>
            Gửi lại đúng lô đã lưu
          </button>
        </section>
      )}
      {locked && !command && saved.error && <button onClick={() => {
        sessionStorage.removeItem(storageKey); setLocked(false); setError('');
      }}>Tôi đã đối chiếu hồ sơ, bắt đầu lô mới</button>}
      {result && (
        <section className="m1-card minh-ux-card">
          <h2>Đã tạo {result.registrations.length} hồ sơ nháp</h2>
          <p>
            Tiếp tục vào từng hồ sơ để kiểm tra bảo hành, bảo trì và gửi xác
            nhận theo phương thức bàn giao.
          </p>
          <ol>
            {result.registrations.map((row, index) => (
              <li key={row.id}>
                <Link to={`/app/equipment-registrations/${row.id}`}>
                  {row.equipmentSummary
                    ? `${row.equipmentSummary.assetCode} · ${row.equipmentSummary.serialNumber}`
                    : `Máy dòng ${index + 1}`}{" "}
                  · Hoàn thiện bàn giao
                </Link>
              </li>
            ))}
          </ol>
          <button
            onClick={() => {
              setResult(null);
              setLocked(false);
              setPreview(null);
              setCommand(null);
              setCsv("");
              setFileRows(null);
              setImportFileName("");
            }}
          >
            Nhập lô tiếp theo
          </button>
        </section>
      )}
    </SetupPage>
  );
}

type PublicEquipment = {
  name: string;
  model: string;
  warrantyStatus: string;
  formToken: string;
  formExpiresAt: string;
};
async function anonymous<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${bases.asset}${path}`, {
    method: body ? "POST" : "GET",
    credentials: "omit",
    referrerPolicy: "no-referrer",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok)
    throw new ApiError(response.status, 'PUBLIC_QR_ERROR',
      response.status === 429
        ? "Bạn đã thao tác nhiều lần. Vui lòng chờ một phút rồi thử lại."
        : "Chưa thể thực hiện. Mã có thể chưa được bật tra cứu công khai, đã thu hồi hoặc biểu mẫu đã hết hạn.",
    );
  return response.json();
}
export function PublicQrLandingPage() {
  const { token = "" } = useParams();
  return <PublicQrLanding key={token} token={token} />;
}
function PublicQrLanding({ token }: { token: string }) {
  const [data, setData] = useState<PublicEquipment | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [reference, setReference] = useState("");
  const [pendingBody, setPendingBody] = useState<Record<string, unknown> | null>(null);
  const inFlight = useRef(false);
  useEffect(() => {
    let active = true;
    anonymous<PublicEquipment>(
      `/public/equipment-by-qr/${encodeURIComponent(token)}`,
    ).then(
      (value) => {
        if (active) {
          setData(value);
          setError("");
        }
      },
      (cause) => {
        if (active) setError(cause instanceof ApiError ? cause.message : 'Chưa tải được thông tin thiết bị. Kiểm tra kết nối và thử lại.');
      },
    );
    return () => {
      active = false;
    };
  }, [token]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data || inFlight.current) return;
    const form = new FormData(event.currentTarget);
    const body = pendingBody ?? {
      formToken: data.formToken, contactName: form.get('name'), contactPhone: form.get('phone'),
      description: form.get('description'), consent: form.get('consent') === 'on',
    };
    setPendingBody(body); inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await anonymous<{ reference: string }>(
        `/public/equipment-by-qr/${encodeURIComponent(token)}/inquiries`,
        body,
      );
      setReference(result.reference);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 400 && !pendingBody) setPendingBody(null);
      setError(
        cause instanceof ApiError
          ? cause.message
          : "Chưa xác định được kết quả gửi. Giữ biểu mẫu để thử lại cùng nội dung.",
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  return (
    <main className="minh-public-page">
      <header>
        <span className="minh-eyebrow">DỊCH VỤ THIẾT BỊ</span>
        <h1>Thông tin và hỗ trợ thiết bị</h1>
        <p>Tra cứu bằng mã được dán trên máy.</p>
      </header>
      {error && (
        <p role="alert" className="m1-error">
          {error}
        </p>
      )}
      {!data && !error && <p role="status">Đang kiểm tra mã…</p>}
      {data && (
        <section className="m1-card minh-ux-card">
          <h2>{data.name}</h2>
          <p>
            Model: <strong>{data.model}</strong>
          </p>
          <p>
            Bảo hành:{" "}
            <strong>
              {{
                IN_WARRANTY: "Còn thời hạn",
                OUT_OF_WARRANTY: "Đã hết thời hạn",
                NO_WARRANTY: "Chưa có bảo hành có hiệu lực",
              }[data.warrantyStatus] ?? "Cần xác minh"}
            </strong>
          </p>
          <p>
            Tình trạng bảo hành được tính theo thời điểm tra cứu. Nhân viên sẽ
            đánh giá sự cố có thuộc phạm vi bảo hành hay không.
          </p>
        </section>
      )}
      {reference ? (
        <section className="m1-card minh-ux-card" role="status">
          <h2>Đã ghi nhận thông tin</h2>
          <p>
            Nhân viên cần liên hệ xác minh trước khi tiếp nhận thành yêu cầu
            dịch vụ.
          </p>
          <p>
            Mã tham chiếu: <code>{reference}</code>
          </p>
          <p>Biểu mẫu này chưa đặt lịch hoặc tạo lệnh công việc.</p>
        </section>
      ) : (
        data && (
          <section className="m1-card minh-ux-card">
            <h2>Báo sự cố để được liên hệ</h2>
            <form
              onSubmit={(event) => void submit(event)}
              className="minh-intake-form"
            >
              <fieldset disabled={busy || !!pendingBody}>
                <label>
                  Họ và tên
                  <input
                    name="name"
                    required
                    maxLength={100}
                    autoComplete="name"
                  />
                </label>
                <label>
                  Số điện thoại
                  <input
                    name="phone"
                    required
                    type="tel"
                    pattern="\+?[0-9 \(\)\-]{8,30}"
                    maxLength={30}
                    autoComplete="tel"
                  />
                </label>
                <label>
                  Mô tả sự cố
                  <textarea
                    name="description"
                    required
                    minLength={10}
                    maxLength={4000}
                    rows={5}
                    placeholder="Máy đang gặp vấn đề gì, xuất hiện từ khi nào?"
                  />
                </label>
                <label className="minh-consent">
                  <input type="checkbox" name="consent" required /> Tôi đồng ý
                  cung cấp thông tin để doanh nghiệp liên hệ xác minh và xử lý
                  sự cố.
                </label>
              </fieldset>
              <p>
                Biểu mẫu có hiệu lực 15 phút. Giữ nguyên nội dung khi thử lại
                sau lỗi kết nối. Ảnh/video sẽ được bổ sung qua nhân viên sau khi
                xác minh.
              </p>
              <button disabled={busy}>
                {busy ? "Đang gửi…" : "Gửi thông tin sự cố"}
              </button>
            </form>
          </section>
        )
      )}
      <Link to={`/portal/qr/${encodeURIComponent(token)}/secure`}>
        Đăng nhập để xem hồ sơ thiết bị theo quyền
      </Link>
    </main>
  );
}

type QrSettings = {
  enabled: boolean;
  hasQr: boolean;
  eligible: boolean;
  routingReady: boolean;
  name: string;
  publicUrl: string | null;
};
export function PublicQrSettingsPage() {
  const { id = "" } = useParams();
  const [revision, setRevision] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const state = useDirectory<QrSettings>(
    "assetM2",
    `/equipment/${id}/qr-codes/public`,
    revision,
  );
  async function setPublic(enabled: boolean) {
    setBusy(true);
    setError("");
    try {
      await api.asset(`/equipment/${id}/qr-codes/public`, {
        method: "PUT",
        body: { enabled },
      });
      setRevision((v) => v + 1);
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <SetupPage
      title="Quyền tra cứu QR công khai"
      actions={<Link to={`/app/equipment/${id}`}>Hồ sơ thiết bị</Link>}
    >
      {state.loading && <p role="status">Đang tải…</p>}
      {(state.error || error) && <p role="alert">{state.error || error}</p>}
      {state.value && (
        <section className="m1-card minh-ux-card">
          <h2>{state.value.name}</h2>
          <p>
            Trạng thái:{" "}
            <strong>
              {state.value.enabled
                ? "Đang cho phép tra cứu công khai"
                : "Chỉ xem hồ sơ sau đăng nhập"}
            </strong>
          </p>
          <p>
            Khi bật, người giữ QR xem được tên/model và tình trạng bảo hành; có
            thể gửi thông tin để chờ xác minh. Khách hàng, địa điểm, serial đầy
            đủ và lịch sử phục vụ được giữ trong hồ sơ có phân quyền.
          </p>
          {!state.value.hasQr && (
            <p>
              Thiết bị chưa có mã QR hiệu lực. Vào hồ sơ thiết bị để tạo mã
              trước.
            </p>
          )}
          {!state.value.routingReady && <p>Địa điểm cần được phân bổ cho chi nhánh phục vụ trước khi bật báo lỗi công khai. Liên hệ quản trị doanh nghiệp để hoàn thiện cấu hình.</p>}
          <button
            disabled={busy || !state.value.hasQr || (!state.value.enabled && !state.value.eligible)}
            onClick={() => void setPublic(!state.value!.enabled)}
          >
            {busy
              ? "Đang cập nhật…"
              : state.value.enabled
                ? "Tắt tra cứu công khai"
                : "Bật tra cứu công khai"}
          </button>
          {state.value.enabled && state.value.publicUrl && (
            <p>
              <a href={state.value.publicUrl} target="_blank" rel="noreferrer">
                Mở trang công khai để kiểm tra
              </a>
            </p>
          )}
          <p>
            Mã đổi/thu hồi hoặc máy chuyển địa điểm sẽ cần kiểm tra và bật lại
            quyền công khai.
          </p>
        </section>
      )}
    </SetupPage>
  );
}

type Inquiry = {
  id: string;
  equipmentId: string;
  contactName: string;
  contactPhone: string;
  description: string;
  status: string;
  createdAt: string;
  resolutionNote: string | null;
};
function InquiryCard({ row, onSaved }: { row: Inquiry; onSaved: () => void }) {
  const [note, setNote] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function decide(status: string) {
    if (!note.trim()) {
      setError("Ghi kết quả xác minh hoặc lý do từ chối.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api.asset(`/public-qr-inquiries/${row.id}/decision`, {
        method: "POST",
        body: { status, note },
      });
      onSaved();
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="m1-card minh-ux-card">
      <h2>{row.contactName}</h2>
      <p>
        <a href={`tel:${row.contactPhone.replace(/[^+0-9]/g, "")}`}>
          {row.contactPhone}
        </a>{" "}
        · {new Date(row.createdAt).toLocaleString("vi-VN")}
      </p>
      <p className="minh-preserve-text">{row.description}</p>
      <Link to={`/app/equipment/${row.equipmentId}`}>
        Đối chiếu hồ sơ thiết bị
      </Link>
      {row.status === "NEW" ? (
        <>
          <label>
            Kết quả liên hệ / lý do xử lý
            <textarea
              value={note}
              maxLength={2000}
              disabled={busy}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          <div className="registration-actions">
            <button disabled={busy} onClick={() => void decide("ACKNOWLEDGED")}>
              Đã liên hệ xác minh
            </button>
            <button disabled={busy} onClick={() => void decide("REJECTED")}>
              Không tiếp nhận
            </button>
          </div>
          <p>
            Sau khi xác minh, tạo yêu cầu dịch vụ bằng tài khoản nhân viên và
            ghi mã tham chiếu này: {row.id}. Đánh dấu đã liên hệ chưa tự tạo yêu
            cầu hoặc WO.
          </p>
        </>
      ) : (
        <p>
          {row.status === "ACKNOWLEDGED"
            ? "Đã liên hệ xác minh"
            : "Không tiếp nhận"}{" "}
          · {row.resolutionNote}
        </p>
      )}
      {error && <p role="alert">{error}</p>}
    </article>
  );
}
export function PublicQrInquiriesPage() {
  const [status, setStatus] = useState("NEW"),
    [page, setPage] = useState(1),
    [revision, setRevision] = useState(0);
  const state = useDirectory<Page<Inquiry>>(
    "assetM2",
    `/public-qr-inquiries?page=${page}&pageSize=20&status=${status}`,
    revision,
  );
  return (
    <SetupPage
      title="Báo lỗi QR chờ xác minh"
      description="Thông tin từ người quét QR chưa được xác thực. Liên hệ người gửi và đối chiếu thiết bị trước khi tiếp nhận dịch vụ."
    >
      <label>
        Trạng thái
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="NEW">Chờ liên hệ</option>
          <option value="ACKNOWLEDGED">Đã liên hệ xác minh</option>
          <option value="REJECTED">Không tiếp nhận</option>
        </select>
      </label>
      {state.loading && <p role="status">Đang tải…</p>}
      {state.error && <p role="alert">{state.error}</p>}
      {state.value?.items.map((row) => (
        <InquiryCard
          key={row.id}
          row={row}
          onSaved={() => setRevision((v) => v + 1)}
        />
      ))}
      {state.value && !state.value.items.length && (
        <p>Không có báo lỗi trong nhóm này.</p>
      )}
      <div className="registration-pagination">
        <button disabled={page === 1} onClick={() => setPage(page - 1)}>
          Trước
        </button>
        <span>
          Trang {page} · {state.value?.total ?? 0} báo lỗi
        </span>
        <button
          disabled={!state.value || page * 20 >= state.value.total}
          onClick={() => setPage(page + 1)}
        >
          Sau
        </button>
      </div>
    </SetupPage>
  );
}
