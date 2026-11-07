import { serviceLabels } from "../features/workspace/service-detail-data";
import {
  ServiceCard,
  ServiceSections,
  ServiceHeader,
  ServiceNotice,
  ServiceFacts,
} from "../features/workspace/ServiceDetailUI";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { api, ApiError } from "../api/client";
import { getSessionGeneration, useSession } from "../auth/session";
import type { Page } from "../types/domain";
import { DirectoryPicker } from "./registration-shared";
import { errorText } from "./registration-data";
import { displayName } from "../display-names";

const labels: Record<string, string> = {
  DRAFT: "Bản nháp",
  PENDING_CUSTOMER_CONFIRMATION: "Chờ khách xác nhận",
  ACTIVATED: "Đã xác nhận và kích hoạt",
  REJECTED: "Đã từ chối",
  CANCELLED: "Đã hủy",
  EXPIRED: "Hết hạn",
};
type Handover = {
  id: string;
  handoverNo: string;
  equipmentId: string;
  customerId: string;
  status: string;
  createdByName?: string | null;
  customerSiteName?: string | null;
  customerSiteCode?: string | null;
  snapshot: {
    assetCode: string;
    name: string;
    model: string;
    serialNumber: string;
    customerName: string;
    customerSiteId: string;
    customerSiteName?: string;
    createdByName?: string;
    deliveryAt: string;
    condition: string;
    notes: string;
    contentVersion: number;
  };
  createdBy?: string;
  expiresAt: string;
  submittedAt: string | null;
  acceptedAt: string | null;
  activatedAt: string | null;
  rejectedReason: string | null;
  supersededById: string | null;
  equipmentStatus?: string;
  isCurrent?: boolean;
  audit?: { action: string; occurredAt: string }[];
};
const date = (value: string | null) =>
  value
    ? new Date(value).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })
    : "—";
function useContext() {
  const { profile } = useSession();
  const customer = profile?.userType === "CUSTOMER";
  return {
    customer,
    canRespond: profile?.roles.includes("CUSTOMER_ADMIN"),
    base: `${customer ? "/my" : ""}/equipment-handovers`,
    path: `${customer ? "/portal" : "/app"}/equipment-handovers`,
  };
}

export function HandoverListPage() {
  const { customer, base, path } = useContext();
  const [page, setPage] = useState(1),
    [status, setStatus] = useState(""),
    [q, setQ] = useState("");
  const [revision, setRevision] = useState(0);
  const generation = getSessionGeneration();
  const key = `${base}:${page}:${status}:${q}:${revision}:${generation}`;
  const [state, setState] = useState<{
    key: string;
    data?: Page<Handover>;
    error?: string;
  }>({ key: "" });
  useEffect(() => {
    let active = true;
    api
      .asset<Page<Handover>>(
        `${base}?${new URLSearchParams({ page: String(page), pageSize: "20", ...(status ? { status } : {}), ...(q ? { q } : {}) })}`,
      )
      .then(
        (data) => {
          if (active) setState({ key, data });
        },
        (error) => {
          if (active) setState({ key, error: errorText(error) });
        },
      );
    return () => {
      active = false;
    };
  }, [base, page, status, q, key]);
  const data = state.key === key ? state.data : undefined;
  return (
    <section className="m2-page">
      <h1>
        {customer ? "Xác nhận bàn giao thiết bị" : "Quản lý bàn giao thiết bị"}
      </h1>
      {!customer && (
        <p>
          <Link className="m1-button" to={`${path}/new`}>
            Tạo yêu cầu bàn giao
          </Link>
          {" · "}
          <Link to="/app/equipment-registrations/new?handoverRequired=true">
            Đăng ký thiết bị mới chờ xác nhận
          </Link>
        </p>
      )}
      <div className="registration-actions">
        <label>
          Tìm mã bàn giao / thiết bị
          <input
            value={q}
            maxLength={100}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <label>
          Trạng thái
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Tất cả</option>
            {Object.entries(labels)
              .filter(([s]) => !customer || s !== "DRAFT")
              .map(([s, label]) => (
                <option key={s} value={s}>
                  {label}
                </option>
              ))}
          </select>
        </label>
        <button onClick={() => setRevision((v) => v + 1)}>Làm mới</button>
      </div>
      {state.key !== key ? (
        <p role="status">Đang tải…</p>
      ) : state.error ? (
        <p role="alert" className="m1-error">
          {state.error}
        </p>
      ) : !data?.items.length ? (
        <p>Chưa có yêu cầu phù hợp.</p>
      ) : (
        <ul className="m2-linked-list">
          {data.items.map((row) => (
            <li key={row.id}>
              <span>
                <Link to={`${path}/${row.id}`}>{row.handoverNo}</Link>
                <p>
                  {row.snapshot.assetCode} · {row.snapshot.name} ·{" "}
                  {row.snapshot.serialNumber}
                </p>
                <p>{row.snapshot.customerName}</p>
                <small>
                  Gửi: {date(row.submittedAt)} · Hạn: {date(row.expiresAt)} ·
                  Xác nhận: {date(row.acceptedAt)}
                </small>
                {!customer && (
                  <small>
                    {" "}
                    · Người tạo:{" "}
                    {displayName(
                      "user",
                      { name: row.createdByName },
                      { name: row.snapshot.createdByName },
                    )}
                  </small>
                )}
              </span>
              <strong>{labels[row.status] ?? row.status}</strong>
            </li>
          ))}
        </ul>
      )}
      <div className="registration-pagination">
        <button disabled={page === 1} onClick={() => setPage((v) => v - 1)}>
          Trước
        </button>
        <span>
          Trang {page} · {data?.total ?? "…"} yêu cầu
        </span>
        <button
          disabled={!data || page * 20 >= data.total}
          onClick={() => setPage((v) => v + 1)}
        >
          Sau
        </button>
      </div>
    </section>
  );
}

export function HandoverCreatePage() {
  const navigate = useNavigate(),
    [params] = useSearchParams();
  const [equipmentId, setEquipmentId] = useState(
    params.get("equipmentId") ?? "",
  );
  const [condition, setCondition] = useState(""),
    [notes, setNotes] = useState("");
  const [deliveryAt, setDeliveryAt] = useState(""),
    [expiresAt, setExpiresAt] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const locked = useRef(false),
    generation = getSessionGeneration();
  const [uncertain, setUncertain] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (locked.current || uncertain || generation !== getSessionGeneration())
      return;
    const expiry = new Date(expiresAt + "+07:00").getTime();
    if (
      !Number.isFinite(expiry) ||
      expiry <= Date.now() ||
      expiry > Date.now() + 90 * 86400000
    ) {
      setError(
        "Hạn xác nhận phải trong tương lai, tối đa 90 ngày kể từ hiện tại.",
      );
      return;
    }
    locked.current = true;
    setBusy(true);
    setError("");
    try {
      const row = await api.asset<Handover>("/equipment-handovers", {
        method: "POST",
        body: {
          equipmentId,
          condition: condition.trim(),
          notes: notes.trim(),
          deliveryAt: new Date(deliveryAt + "+07:00").toISOString(),
          expiresAt: new Date(expiresAt + "+07:00").toISOString(),
        },
      });
      if (generation === getSessionGeneration())
        navigate(`/app/equipment-handovers/${row.id}`);
    } catch (cause) {
      if (generation === getSessionGeneration()) {
        const unknown =
          !(cause instanceof ApiError) ||
          [401, 408].includes(cause.status) ||
          cause.status >= 500;
        setUncertain(unknown);
        setError(
          unknown
            ? `${errorText(cause)} Kiểm tra danh sách bàn giao trước khi tạo lại để tránh trùng hồ sơ.`
            : errorText(cause),
        );
      }
    } finally {
      locked.current = false;
      if (generation === getSessionGeneration()) setBusy(false);
    }
  }
  return (
    <section className="m2-page sd-page">
      <ServiceHeader
        back="/app/equipment-handovers"
        backLabel="Bàn giao thiết bị"
        code="BÀN GIAO THIẾT BỊ"
        title="Tạo yêu cầu bàn giao"
        description="Chuẩn bị nội dung bàn giao cho khách hàng kiểm tra và xác nhận."
      />
      <ServiceNotice title="Lưu bản nháp trước khi gửi">
        <p>
          Khách hàng và địa điểm nhận lấy từ hồ sơ thiết bị. Kiểm tra serial,
          tình trạng và thời hạn xác nhận. Lưu bản nháp chưa gửi thông báo cho
          khách hàng.
        </p>
      </ServiceNotice>
      <form className="m1-card m1-form" onSubmit={submit}>
        <DirectoryPicker
          label="Thiết bị"
          area="assetM2"
          path="/equipment"
          selected={equipmentId}
          onChange={setEquipmentId}
        />
        <label>
          Thời gian bàn giao (giờ Việt Nam)
          <input
            required
            type="datetime-local"
            value={deliveryAt}
            onChange={(e) => setDeliveryAt(e.target.value)}
          />
        </label>
        <label>
          Hạn xác nhận (tối đa 90 ngày)
          <input
            required
            type="datetime-local"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
          />
        </label>
        <label>
          Tình trạng thiết bị
          <textarea
            required
            maxLength={2000}
            value={condition}
            onChange={(e) => setCondition(e.target.value)}
          />
        </label>
        <label>
          Ghi chú bàn giao cho khách hàng
          <textarea
            maxLength={4000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>
        {error && (
          <p role="alert" className="m1-error">
            {error}{" "}
            <Link to="/app/equipment-handovers">Kiểm tra danh sách</Link>
          </p>
        )}
        <button
          disabled={busy || uncertain || !equipmentId || !condition.trim()}
        >
          {busy ? "Đang lưu…" : "Lưu bản nháp"}
        </button>
      </form>
    </section>
  );
}

export function HandoverDetailPage() {
  const { id } = useParams(),
    { customer, canRespond, base, path } = useContext();
  const [revision, setRevision] = useState(0),
    [busy, setBusy] = useState(false);
  const [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [reason, setReason] = useState("");
  const [action, setAction] = useState<
    "accept" | "reject" | "submit" | "cancel" | null
  >(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const actionLock = useRef(false);
  const generation = getSessionGeneration(),
    key = `${base}:${id}:${revision}:${generation}`;
  const [state, setState] = useState<{
    key: string;
    data?: Handover;
    error?: string;
  }>({ key: "" });
  useEffect(() => {
    let active = true;
    api.asset<Handover>(`${base}/${id}`).then(
      (data) => {
        if (active) setState({ key, data });
      },
      (cause) => {
        if (active) setState({ key, error: errorText(cause) });
      },
    );
    return () => {
      active = false;
    };
  }, [base, id, key]);
  const row = state.key === key ? state.data : undefined;
  async function confirm(e: FormEvent) {
    e.preventDefault();
    if (
      !action ||
      actionLock.current ||
      generation !== getSessionGeneration() ||
      (action === "reject" && !reason.trim())
    )
      return;
    actionLock.current = true;
    setBusy(true);
    setError("");
    try {
      await api.asset(`${base}/${id}/${action}`, {
        method: "POST",
        body: action === "reject" ? { reason: reason.trim() } : {},
      });
      if (generation !== getSessionGeneration()) return;
      setMessage(
        action === "reject"
          ? "Đã gửi phản hồi từ chối."
          : "Đã ghi nhận thao tác. Trạng thái mới nhất hiển thị bên dưới.",
      );
      dialog.current?.close();
      setAction(null);
      setRevision((v) => v + 1);
    } catch (cause) {
      if (generation === getSessionGeneration()) {
        setError(errorText(cause));
        setRevision((v) => v + 1);
      }
    } finally {
      actionLock.current = false;
      if (generation === getSessionGeneration()) setBusy(false);
    }
  }
  const open = (value: NonNullable<typeof action>) => {
    setAction(value);
    setReason("");
    setError("");
    dialog.current?.showModal();
  };
  const pending =
    row?.status === "PENDING_CUSTOMER_CONFIRMATION" &&
    row.isCurrent &&
    !row.supersededById &&
    new Date(row.expiresAt) > new Date();
  return (
    <section className="m2-page sd-page">
      {!row && <h1>Chi tiết bàn giao</h1>}
      {message && <p role="status">{message}</p>}
      {error && (
        <p role="alert" className="m1-error">
          {error}
        </p>
      )}
      {state.key !== key ? (
        <p role="status">Đang tải…</p>
      ) : state.error ? (
        <p role="alert" className="m1-error">
          {state.error}
        </p>
      ) : (
        row && (
          <>
            <ServiceHeader
              back={path}
              backLabel="Bàn giao thiết bị"
              code={row.handoverNo}
              title={row.snapshot.name || row.snapshot.assetCode}
              description="Đối chiếu thiết bị, nội dung bàn giao và xác nhận của khách hàng."
              status={row.status}
            />
            <ServiceNotice
              title={
                row.status === "DRAFT"
                  ? "Kiểm tra nội dung trước khi gửi"
                  : row.status === "ACTIVATED"
                    ? "Bàn giao đã được xác nhận và kích hoạt"
                    : "Theo dõi phản hồi bàn giao"
              }
            >
              <p>
                {row.status === "DRAFT"
                  ? "Đây là bản nháp. Gửi khách xác nhận sau khi đã kiểm tra thông tin thiết bị và địa điểm."
                  : "Nội dung được lưu theo phiên bản tại thời điểm gửi; thông tin hiện tại của thiết bị có thể thay đổi sau đó."}
              </p>
            </ServiceNotice>
            <ServiceSections
              items={[
                {
                  key: "content",
                  label: "Nội dung bàn giao",
                  content: (
                    <div className="sd-columns">
                      <ServiceCard title="Thiết bị bàn giao">
                        <ServiceFacts
                          items={[
                            {
                              label: "Mã tài sản",
                              value: row.snapshot.assetCode,
                            },
                            { label: "Model", value: row.snapshot.model },
                            {
                              label: "Số serial",
                              value: row.snapshot.serialNumber,
                            },
                            {
                              label: "Khách hàng",
                              value: row.snapshot.customerName,
                            },
                            {
                              label: "Địa điểm",
                              value: (
                                <>
                                  {displayName(
                                    "site",
                                    {
                                      name: row.customerSiteName,
                                      code: row.customerSiteCode,
                                    },
                                    { name: row.snapshot.customerSiteName },
                                  )}
                                  {!row.snapshot.customerSiteName &&
                                    row.customerSiteName && (
                                      <small> (tên hiện tại)</small>
                                    )}
                                </>
                              ),
                            },
                            {
                              label: "Thời gian bàn giao",
                              value: date(row.snapshot.deliveryAt),
                            },
                          ]}
                        />
                        <h3>Tình trạng khi bàn giao</h3>
                        <p className="sd-prose">{row.snapshot.condition}</p>
                        <h3>Ghi chú cho khách hàng</h3>
                        <p className="sd-prose">
                          {row.snapshot.notes || "Không có ghi chú bổ sung"}
                        </p>
                      </ServiceCard>
                      <ServiceCard title="Xác nhận & kích hoạt">
                        <dl className="sd-facts">
                          <div>
                            <dt>Phiên bản nội dung</dt>
                            <dd>{row.snapshot.contentVersion}</dd>
                          </div>
                          <div>
                            <dt>Trạng thái thiết bị hiện tại</dt>
                            <dd>
                              {customer
                                ? row.equipmentStatus
                                : row.equipmentStatus === "ACTIVE"
                                  ? "Đang hoạt động"
                                  : (serviceLabels[row.equipmentStatus ?? ""] ??
                                    "Chưa xác nhận")}
                            </dd>
                          </div>
                          <div>
                            <dt>Hạn xác nhận</dt>
                            <dd>{date(row.expiresAt)}</dd>
                          </div>
                          <div>
                            <dt>Gửi khách lúc</dt>
                            <dd>{date(row.submittedAt)}</dd>
                          </div>
                          <div>
                            <dt>Khách xác nhận</dt>
                            <dd>{date(row.acceptedAt)}</dd>
                          </div>
                          <div>
                            <dt>Kích hoạt hoàn tất</dt>
                            <dd>{date(row.activatedAt)}</dd>
                          </div>
                        </dl>
                        <p>
                          <Link
                            to={`${customer ? "/portal" : "/app"}/equipment/${row.equipmentId}`}
                          >
                            Mở hồ sơ thiết bị →
                          </Link>
                        </p>
                      </ServiceCard>
                    </div>
                  ),
                },
                {
                  key: "history",
                  label: "Lịch sử bàn giao",
                  content: (
                    <ServiceCard title="Lịch sử bàn giao">
                      <ol className="sd-history">
                        {row.audit?.map((entry, i) => (
                          <li key={i}>
                            <strong>
                              {serviceLabels[entry.action] ??
                                labels[entry.action] ??
                                "Cập nhật bàn giao"}
                            </strong>
                            <time>{date(entry.occurredAt)}</time>
                          </li>
                        ))}
                      </ol>
                      {!row.audit?.length && (
                        <p>Chưa có lịch sử được ghi nhận.</p>
                      )}
                    </ServiceCard>
                  ),
                },
              ]}
            />
            {row.rejectedReason && <p>Lý do từ chối: {row.rejectedReason}</p>}
            {row.supersededById && (
              <p>
                Yêu cầu đã được thay thế.{" "}
                <Link to={`${path}/${row.supersededById}`}>Mở yêu cầu mới</Link>
              </p>
            )}
            {row.status === "PENDING_CUSTOMER_CONFIRMATION" && !pending && (
              <p>
                Yêu cầu không còn đủ điều kiện xác nhận hoặc đã hết hạn. Hãy làm
                mới trạng thái.
              </p>
            )}
            <div className="registration-actions">
              <button disabled={busy} onClick={() => setRevision((v) => v + 1)}>
                Làm mới trạng thái
              </button>
              {customer && canRespond && pending && (
                <>
                  <button disabled={busy} onClick={() => open("accept")}>
                    Chấp thuận
                  </button>
                  <button disabled={busy} onClick={() => open("reject")}>
                    Từ chối
                  </button>
                </>
              )}
              {!customer && row.status === "DRAFT" && (
                <button disabled={busy} onClick={() => open("submit")}>
                  Gửi khách xác nhận
                </button>
              )}
              {!customer &&
                ["DRAFT", "PENDING_CUSTOMER_CONFIRMATION"].includes(
                  row.status,
                ) && (
                  <button disabled={busy} onClick={() => open("cancel")}>
                    Hủy yêu cầu
                  </button>
                )}
              {!customer &&
                ["REJECTED", "CANCELLED", "EXPIRED", "ACTIVATED"].includes(
                  row.status,
                ) && (
                  <Link to={`${path}/new?equipmentId=${row.equipmentId}`}>
                    Tạo lần bàn giao mới
                  </Link>
                )}
            </div>
          </>
        )
      )}
      <dialog
        ref={dialog}
        aria-labelledby="handover-confirm-title"
        onCancel={(e) => {
          if (busy) e.preventDefault();
          else setAction(null);
        }}
      >
        <form className="m1-form" onSubmit={confirm}>
          <h2 id="handover-confirm-title">Xác nhận thao tác</h2>
          <p>
            {action === "accept"
              ? "Bạn xác nhận đã nhận thiết bị theo nội dung bàn giao. Thiết bị sẽ được yêu cầu kích hoạt sau xác nhận."
              : action === "reject"
                ? "Vui lòng nêu lý do từ chối bàn giao."
                : action === "cancel"
                  ? "Hủy yêu cầu này? Khách hàng sẽ không thể xác nhận bằng liên kết cũ."
                  : "Gửi nội dung bàn giao này cho khách hàng xác nhận?"}
          </p>
          {action === "reject" && (
            <label>
              Lý do
              <textarea
                autoFocus
                required
                maxLength={2000}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
          )}
          {error && <p role="alert">{error}</p>}
          <button disabled={busy || (action === "reject" && !reason.trim())}>
            {busy ? "Đang xử lý…" : "Xác nhận"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              dialog.current?.close();
              setAction(null);
            }}
          >
            Quay lại
          </button>
        </form>
      </dialog>
    </section>
  );
}
