import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { Link, useParams } from "react-router-dom";
import { ApiError, api } from "../../api/client";
import { getSessionGeneration, useSession } from "../../auth/session";
import type { Page } from "../../types/domain";
import { StockMutation, type StockRequest } from "./stock-mutation";
import { displayName } from "../../display-names";
import {
  quantityText,
  quantityEntry,
  quantityInput,
  stockLabels,
} from "../workspace/ui-values";

type Part = {
  id: string;
  sku: string;
  name: string;
  unit: string;
  allowFractional: boolean;
  description: string | null;
  status: "ACTIVE" | "INACTIVE";
};
type Warehouse = {
  id: string;
  branchId: string;
  branchName?: string | null;
  branchCode?: string | null;
  code: string;
  name: string;
  address: string | null;
  status: "ACTIVE" | "INACTIVE";
};
type Branch = { id: string; code: string; name: string; status: string };
type WorkOrderOption = { id: string; workOrderNo: string; status: string };
type Stock = {
  warehouseId: string;
  partId: string;
  quantity: string;
  quantityQuarantined: string;
  minQuantity: string;
  isLowStock: boolean;
  shortageQuantity: string;
  part: Part;
  warehouse: Warehouse;
};
type LedgerRow = {
  id: string;
  partSnapshot?: { name?: string; sku?: string } | null;
  warehouseSnapshot?: { name?: string; code?: string } | null;
  part?: { name?: string; sku?: string } | null;
  warehouse?: { name?: string; code?: string } | null;
  type: string;
  reasonCode?: string | null;
  quantity: string;
  createdAt: string;
  referenceType: string | null;
  referenceId: string | null;
  note: string | null;
  partId: string;
  warehouseId: string;
};
type Usage = {
  id: string;
  partId: string;
  warehouseId: string;
  quantityIssued: string;
  quantityReturned: string;
  quantityOutstanding: string;
  quantityConfirmedUsed: string;
  quantityUnreconciled: string;
  partSnapshot: { sku?: string; name?: string; unit?: string } | null;
  returns: { id: string; quantity: string }[];
};

const pageSize = 20;
const message = (error: unknown) => {
  if (!(error instanceof ApiError))
    return error instanceof Error
      ? error.message
      : "Không thể hoàn tất thao tác.";
  switch (error.status) {
    case 401:
      return "Phiên đăng nhập hết hạn. Đăng nhập lại rồi tải lại dữ liệu.";
    case 403:
      return "Tài khoản không có quyền thực hiện thao tác kho này.";
    case 404:
      return "Không tìm thấy phụ tùng, kho hoặc Work Order trong phạm vi tài khoản.";
    case 409:
      return `Xung đột tồn kho hoặc trạng thái Work Order (${error.code}). Tải lại tồn kho trước khi thử lại.`;
    case 422:
      return `Tham chiếu không hợp lệ: ${error.message}`;
    case 503:
      return `Dịch vụ phụ thuộc chưa sẵn sàng: ${error.message}`;
    default:
      return `${error.status} · ${error.message}`;
  }
};
const date = (value: string) =>
  new Date(value).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
const isZero = (value: string) => /^0(?:\.0+)?$/.test(value);
const isManager = (roles: string[]) => roles.includes("INVENTORY_STAFF");

function usePage<T>(path: string, revision: number) {
  const sessionGeneration = getSessionGeneration();
  const key = `${path}:revision-${revision}:session-${sessionGeneration}`;
  const [state, setState] = useState<{
    key: string;
    data: Page<T> | null;
    error: string;
  }>({
    key: "",
    data: null,
    error: "",
  });
  useEffect(() => {
    let active = true;
    api.inventory<Page<T>>(path).then(
      (value) => {
        if (active) setState({ key, data: value, error: "" });
      },
      (cause: unknown) => {
        if (active) setState({ key, data: null, error: message(cause) });
      },
    );
    return () => {
      active = false;
    };
  }, [path, key]);
  const current = state.key === key;
  return {
    data: current ? state.data : null,
    loading: !current,
    error: current ? state.error : "",
  };
}

function PageStatus({
  loading,
  error,
  children,
}: {
  loading: boolean;
  error: string;
  children: ReactNode;
}) {
  if (loading) return <p role="status">Đang tải dữ liệu kho…</p>;
  if (error)
    return (
      <p role="alert" className="m1-error">
        {error}
      </p>
    );
  return <>{children}</>;
}

function Pager({
  page,
  total,
  onPage,
}: {
  page: number;
  total: number;
  onPage: (page: number) => void;
}) {
  return (
    <div className="registration-pagination">
      <span>
        Trang {page} · {total} kết quả
      </span>
      <button disabled={page <= 1} onClick={() => onPage(page - 1)}>
        Trước
      </button>
      <button
        disabled={page * pageSize >= total}
        onClick={() => onPage(page + 1)}
      >
        Sau
      </button>
    </div>
  );
}

export function InventoryPartsPage() {
  const { profile } = useSession();
  const canManage = isManager(profile?.roles ?? []);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [revision, setRevision] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    sku: "",
    name: "",
    unit: "",
    allowFractional: false,
    description: "",
  });
  const path = `/parts?page=${page}&pageSize=${pageSize}${query ? `&q=${encodeURIComponent(query)}` : ""}`;
  const state = usePage<Part>(path, revision);

  async function create(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.inventory("/parts", {
        method: "POST",
        body: { ...form, description: form.description || undefined },
      });
      setForm({
        sku: "",
        name: "",
        unit: "",
        allowFractional: false,
        description: "",
      });
      setShowForm(false);
      setRevision((value) => value + 1);
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="m2-page">
      <h1>Danh mục phụ tùng</h1>
      <p>
        Tra cứu phụ tùng, đơn vị tính và tồn khả dụng để chuẩn bị xử lý dịch vụ.
      </p>
      {canManage && (
        <button onClick={() => setShowForm((value) => !value)}>
          Thêm phụ tùng
        </button>
      )}
      {canManage && showForm && (
        <form className="m2-editor" onSubmit={(event) => void create(event)}>
          <label>
            Mã SKU
            <input
              required
              maxLength={100}
              value={form.sku}
              onChange={(event) =>
                setForm({ ...form, sku: event.target.value })
              }
            />
          </label>
          <label>
            Tên phụ tùng
            <input
              required
              maxLength={200}
              value={form.name}
              onChange={(event) =>
                setForm({ ...form, name: event.target.value })
              }
            />
          </label>
          <label>
            Đơn vị
            <input
              required
              maxLength={30}
              value={form.unit}
              onChange={(event) =>
                setForm({ ...form, unit: event.target.value })
              }
            />
          </label>
          <label>
            Mô tả
            <input
              maxLength={4000}
              value={form.description}
              onChange={(event) =>
                setForm({ ...form, description: event.target.value })
              }
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={form.allowFractional}
              onChange={(event) =>
                setForm({ ...form, allowFractional: event.target.checked })
              }
            />{" "}
            Cho phép số lượng lẻ
          </label>
          <button disabled={busy}>{busy ? "Đang tạo…" : "Lưu phụ tùng"}</button>
        </form>
      )}
      {error && (
        <p role="alert" className="m1-error">
          {error}
        </p>
      )}
      <form
        className="m2-filters"
        onSubmit={(event) => {
          event.preventDefault();
          setPage(1);
          setQuery(search.trim());
        }}
      >
        <label>
          Tìm SKU hoặc tên
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <button>Tìm</button>
      </form>
      <PageStatus loading={state.loading} error={state.error}>
        {state.data && (
          <>
            <div className="m2-inventory-table">
              <table>
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Tên phụ tùng</th>
                    <th>Đơn vị</th>
                    <th>Cho phép lượng lẻ</th>
                    <th>Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {state.data.items.map((part) => (
                    <tr key={part.id}>
                      <td>
                        <Link to={`/app/inventory/parts/${part.id}`}>
                          {part.sku}
                        </Link>
                      </td>
                      <td>{part.name}</td>
                      <td>{part.unit}</td>
                      <td>{part.allowFractional ? "Có" : "Không"}</td>
                      <td>
                        {part.status === "ACTIVE"
                          ? "Đang sử dụng"
                          : "Ngừng sử dụng"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!state.data.items.length && <p>Không có phụ tùng phù hợp.</p>}
            <Pager page={page} total={state.data.total} onPage={setPage} />
          </>
        )}
      </PageStatus>
    </div>
  );
}

export function InventoryPartPage() {
  const { id } = useParams();
  const { profile } = useSession();
  const canManage = isManager(profile?.roles ?? []);
  const sessionGeneration = getSessionGeneration();
  const [revision, setRevision] = useState(0);
  const [stockPage, setStockPage] = useState(1);
  const key = `${id ?? ""}:${stockPage}:${revision}:session-${sessionGeneration}`;
  const [state, setState] = useState<{
    key: string;
    part: Part | null;
    stock: Page<Stock> | null;
    error: string;
  }>({
    key: "",
    part: null,
    stock: null,
    error: "",
  });
  useEffect(() => {
    let active = true;
    Promise.all([
      api.inventory<Part>(`/parts/${encodeURIComponent(id ?? "")}`),
      api.inventory<Page<Stock>>(
        `/stocks?page=${stockPage}&pageSize=20&partId=${encodeURIComponent(id ?? "")}`,
      ),
    ]).then(
      ([partResult, stockResult]) => {
        if (active)
          setState({ key, part: partResult, stock: stockResult, error: "" });
      },
      (cause: unknown) => {
        if (active)
          setState({ key, part: null, stock: null, error: message(cause) });
      },
    );
    return () => {
      active = false;
    };
  }, [id, key, stockPage]);
  const current = state.key === key;
  const part = current ? state.part : null;
  const stock = current ? state.stock : null;
  const loading = !current;
  const error = current ? state.error : "";
  return (
    <div className="m2-page">
      <Link to="/app/inventory/parts">← Danh mục phụ tùng</Link>
      {loading ? (
        <p role="status">Đang tải phụ tùng…</p>
      ) : error ? (
        <p role="alert" className="m1-error">
          {error}
        </p>
      ) : (
        part && (
          <>
            <h1>{part.name}</h1>
            <p>
              {part.sku} · Đơn vị: {part.unit} ·{" "}
              {part.status === "ACTIVE" ? "Đang sử dụng" : "Ngừng sử dụng"}
            </p>
            <section className="m1-card m1-section-card">
              <div className="m1-section-body">
                <h2>Thông tin phụ tùng</h2>
                <p>{part.description || "Chưa có mô tả bổ sung."}</p>
                <p>
                  Cho phép số lượng lẻ: {part.allowFractional ? "Có" : "Không"}
                </p>
                {!canManage && (
                  <p>
                    Quản lý dịch vụ có quyền tra cứu. Liên hệ nhân viên kho để
                    nhập, xuất, nhận trả hoặc điều chỉnh tồn.
                  </p>
                )}
              </div>
            </section>
            <h2>Tồn theo kho</h2>
            {stock?.items.map((row) => (
              <section
                className="m1-card m1-section-card"
                key={`${row.warehouseId}:${row.partId}`}
              >
                <div className="m1-section-body">
                  <strong>{row.warehouse.name}</strong>
                  <p>
                    Khả dụng: {quantityText(row.quantity)} {part.unit} · Cách
                    ly: {quantityText(row.quantityQuarantined)} · Mức tối thiểu:{" "}
                    {quantityText(row.minQuantity)}
                  </p>
                  {row.isLowStock && (
                    <p role="status">
                      Thiếu {quantityText(row.shortageQuantity)} {part.unit} so
                      với mức tối thiểu.
                    </p>
                  )}
                  {canManage && (
                    <MinimumQuantityForm
                      key={`${row.warehouseId}:${row.partId}:${quantityText(row.minQuantity)}`}
                      warehouseId={row.warehouseId}
                      partId={row.partId}
                      initial={quantityEntry(row.minQuantity)}
                      onSaved={() => setRevision((value) => value + 1)}
                    />
                  )}
                </div>
              </section>
            ))}
            {!stock?.items.length && <p>Chưa có tồn kho cho phụ tùng này.</p>}
            {stock && (
              <Pager
                page={stockPage}
                total={stock.total}
                onPage={setStockPage}
              />
            )}
          </>
        )
      )}
    </div>
  );
}

function MinimumQuantityForm({
  warehouseId,
  partId,
  initial,
  onSaved,
}: {
  warehouseId: string;
  partId: string;
  initial: string;
  onSaved: () => void;
}) {
  const sessionGeneration = getSessionGeneration();
  const [value, setValue] = useState(initial);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="m2-editor"
      onSubmit={async (event) => {
        event.preventDefault();
        if (getSessionGeneration() !== sessionGeneration) return;
        setBusy(true);
        setError("");
        try {
          await api.inventory(`/warehouses/${warehouseId}/stocks/${partId}`, {
            method: "PUT",
            body: { minQuantity: value.trim().replace(",", ".") },
          });
          if (getSessionGeneration() !== sessionGeneration) return;
          onSaved();
        } catch (cause) {
          if (getSessionGeneration() !== sessionGeneration) return;
          setError(message(cause));
          if (cause instanceof ApiError && cause.status === 409) onSaved();
        } finally {
          setBusy(false);
        }
      }}
    >
      <label>
        Mức tồn tối thiểu
        <input
          required
          inputMode="decimal"
          pattern="[0-9]+([.,][0-9]{1,2})?"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
      </label>
      <button disabled={busy}>
        {busy ? "Đang lưu…" : "Cập nhật cảnh báo"}
      </button>
      {error && (
        <p role="alert" className="m1-error">
          {error}
        </p>
      )}
    </form>
  );
}

export function InventoryWarehousesPage() {
  const { profile } = useSession();
  const canManage = isManager(profile?.roles ?? []);
  const [revision, setRevision] = useState(0);
  const [showCreate, setShowCreate] = useState(false);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState("");
  const [stockPage, setStockPage] = useState(1);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    branchId: "",
    code: "",
    name: "",
    address: "",
  });
  const state = usePage<Warehouse>(
    `/warehouses?page=${page}&pageSize=${pageSize}`,
    revision,
  );
  const stocks = usePage<Stock>(
    `/stocks?page=${stockPage}&pageSize=20${selected ? `&warehouseId=${encodeURIComponent(selected)}` : ""}`,
    revision,
  );
  const branches = usePage<Branch>("/branches?page=1&pageSize=100", revision);

  async function create(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.inventory("/warehouses", {
        method: "POST",
        body: { ...form, address: form.address || undefined },
      });
      setShowCreate(false);
      setForm({ branchId: "", code: "", name: "", address: "" });
      setRevision((value) => value + 1);
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="m2-page">
      <h1>Kho và tồn kho</h1>
      <p>
        Kiểm tra tồn khả dụng, lượng cách ly và phụ tùng cần bổ sung trước khi
        điều phối công việc.
      </p>
      {canManage && (
        <button onClick={() => setShowCreate((value) => !value)}>
          Thêm kho
        </button>
      )}
      {canManage && showCreate && (
        <form className="m2-editor" onSubmit={(event) => void create(event)}>
          {branches.loading ? (
            <p role="status">Đang tải chi nhánh…</p>
          ) : branches.error ? (
            <p role="alert" className="m1-error">
              {branches.error}
            </p>
          ) : (
            <label>
              Chi nhánh
              <select
                required
                value={form.branchId}
                onChange={(event) =>
                  setForm({ ...form, branchId: event.target.value })
                }
              >
                <option value="">Chọn chi nhánh</option>
                {branches.data?.items
                  .filter((branch) => branch.status === "ACTIVE")
                  .map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.code} · {branch.name}
                    </option>
                  ))}
              </select>
            </label>
          )}
          <label>
            Mã kho
            <input
              required
              maxLength={50}
              value={form.code}
              onChange={(event) =>
                setForm({ ...form, code: event.target.value })
              }
            />
          </label>
          <label>
            Tên kho
            <input
              required
              maxLength={150}
              value={form.name}
              onChange={(event) =>
                setForm({ ...form, name: event.target.value })
              }
            />
          </label>
          <label>
            Địa chỉ
            <input
              maxLength={4000}
              value={form.address}
              onChange={(event) =>
                setForm({ ...form, address: event.target.value })
              }
            />
          </label>
          <button disabled={busy || branches.loading}>
            {busy ? "Đang tạo…" : "Lưu kho"}
          </button>
        </form>
      )}
      {error && (
        <p role="alert" className="m1-error">
          {error}
        </p>
      )}
      <PageStatus loading={state.loading} error={state.error}>
        {state.data && (
          <>
            <div className="m2-inventory-table">
              <table>
                <thead>
                  <tr>
                    <th>Mã kho</th>
                    <th>Kho</th>
                    <th>Chi nhánh</th>
                    <th>Trạng thái</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {state.data.items.map((warehouse) => (
                    <tr key={warehouse.id}>
                      <td>{warehouse.code}</td>
                      <td>{warehouse.name}</td>
                      <td>
                        {displayName("branch", {
                          name: warehouse.branchName,
                          code: warehouse.branchCode,
                        })}
                      </td>
                      <td>
                        {warehouse.status === "ACTIVE"
                          ? "Đang hoạt động"
                          : "Ngừng hoạt động"}
                      </td>
                      <td>
                        <button
                          onClick={() => {
                            setSelected(warehouse.id);
                            setStockPage(1);
                          }}
                        >
                          Xem tồn
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager page={page} total={state.data.total} onPage={setPage} />
          </>
        )}
      </PageStatus>
      <div className="registration-actions">
        <h2>Tồn kho {selected ? "đã lọc theo kho" : "toàn bộ kho"}</h2>
        {selected && (
          <button
            onClick={() => {
              setSelected("");
              setStockPage(1);
            }}
          >
            Bỏ lọc kho
          </button>
        )}
      </div>
      <PageStatus loading={stocks.loading} error={stocks.error}>
        {stocks.data && (
          <>
            {stocks.data.items.some((row) => row.isLowStock) && (
              <p role="status">Có phụ tùng dưới ngưỡng tồn tối thiểu.</p>
            )}
            <div className="m2-inventory-table">
              <table>
                <thead>
                  <tr>
                    <th>Kho</th>
                    <th>SKU / Phụ tùng</th>
                    <th>Khả dụng</th>
                    <th>Cách ly</th>
                    <th>Tối thiểu</th>
                    <th>Cảnh báo</th>
                  </tr>
                </thead>
                <tbody>
                  {stocks.data.items.map((row) => (
                    <tr key={`${row.warehouseId}:${row.partId}`}>
                      <td>{row.warehouse.name}</td>
                      <td>
                        <Link to={`/app/inventory/parts/${row.partId}`}>
                          {row.part.sku} · {row.part.name}
                        </Link>
                      </td>
                      <td>
                        {quantityText(row.quantity)} {row.part.unit}
                      </td>
                      <td>
                        {quantityText(row.quantityQuarantined)} {row.part.unit}
                      </td>
                      <td>{quantityText(row.minQuantity)}</td>
                      <td>
                        {row.isLowStock
                          ? `Thiếu ${quantityText(row.shortageQuantity)}`
                          : "Đủ"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!stocks.data.items.length && <p>Chưa có số tồn phù hợp.</p>}
            <Pager
              page={stockPage}
              total={stocks.data.total}
              onPage={setStockPage}
            />
          </>
        )}
      </PageStatus>
    </div>
  );
}

export function InventoryTransactionsPage({
  initialWorkOrderId = "",
}: { initialWorkOrderId?: string } = {}) {
  const { profile } = useSession();
  const canManage = isManager(profile?.roles ?? []);
  const canIssue = canManage;
  const [revision, setRevision] = useState(0);
  const [page, setPage] = useState(1);
  const [type, setType] = useState("");
  const [formMode, setFormMode] = useState<
    "RECEIVE" | "ADJUST" | "ISSUE" | "RETURN"
  >("RECEIVE");
  const sessionGeneration = getSessionGeneration();
  const mutationScope = JSON.stringify([profile?.tenantId, profile?.id]);
  const mutation = useMemo(
    () => new StockMutation(mutationScope, sessionGeneration),
    [mutationScope, sessionGeneration],
  );
  const pending = mutation.pending;
  const [options, setOptions] = useState<{
    generation: number;
    parts: Part[];
    warehouses: Warehouse[];
    workOrders: WorkOrderOption[];
  }>({
    generation: -1,
    parts: [],
    warehouses: [],
    workOrders: [],
  });
  const parts = options.generation === sessionGeneration ? options.parts : [];
  const warehouses =
    options.generation === sessionGeneration ? options.warehouses : [];
  const workOrders =
    options.generation === sessionGeneration ? options.workOrders : [];
  const [workOrderId, setWorkOrderId] = useState(initialWorkOrderId);
  const [usageState, setUsageState] = useState<{
    workOrderId: string;
    generation: number;
    items: Usage[];
    error: string;
  }>({
    workOrderId: "",
    generation: -1,
    items: [],
    error: "",
  });
  const usages =
    usageState.workOrderId === workOrderId &&
    usageState.generation === sessionGeneration
      ? usageState.items
      : [];
  const [form, setForm] = useState({
    warehouseId: "",
    partId: "",
    quantity: "",
    note: "",
    documentReference: "",
    direction: "ADJUST_IN",
    reasonCode: "COUNT_VARIANCE",
    relatedTransactionId: "",
    condition: "GOOD",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<{
    generation: number;
    message: string;
  } | null>(null);
  const formLocked = busy || Boolean(pending) || Boolean(mutation.storageError);
  const correctionSourceKey = `${form.warehouseId}:${form.partId}:${form.direction}:session-${sessionGeneration}`;
  const [correctionSource, setCorrectionSource] = useState<{
    key: string;
    rows: LedgerRow[];
    error: string;
  }>({
    key: "",
    rows: [],
    error: "",
  });
  const correctionSourceLoading = correctionSourceKey !== correctionSource.key;
  const correctionSources = correctionSourceLoading
    ? []
    : correctionSource.rows;
  const ledger = usePage<LedgerRow>(
    `/stock-transactions?page=${page}&pageSize=${pageSize}${type ? `&type=${type}` : ""}`,
    revision,
  );
  const operations = usePage<Record<string, unknown>>(
    `/inventory-operations?page=1&pageSize=100&reservationPending=true${workOrderId ? `&workOrderId=${encodeURIComponent(workOrderId)}` : ""}`,
    revision,
  );
  const operationRows = operations.data?.items ?? [];
  const unresolvedSelectedWorkOrder = Boolean(
    formMode === "ISSUE" &&
    workOrderId &&
    (operations.loading ||
      Boolean(operations.error) ||
      operationRows.some((row) => row.workOrderId === workOrderId)),
  );

  useEffect(() => {
    let active = true;
    Promise.all([
      api.inventory<Page<Part>>("/parts?page=1&pageSize=100&status=ACTIVE"),
      api.inventory<Page<Warehouse>>(
        "/warehouses?page=1&pageSize=100&status=ACTIVE",
      ),
      api.workorders<Page<WorkOrderOption>>("/work-orders?page=1&pageSize=100"),
    ]).then(
      ([partPage, warehousePage, workOrderPage]) => {
        if (active)
          setOptions({
            generation: sessionGeneration,
            parts: partPage.items,
            warehouses: warehousePage.items,
            workOrders: workOrderPage.items,
          });
      },
      (cause: unknown) => {
        if (active) setError(message(cause));
      },
    );
    return () => {
      active = false;
    };
  }, [revision, sessionGeneration]);

  useEffect(() => {
    if (
      formMode !== "ADJUST" ||
      form.reasonCode !== "CORRECTION" ||
      !form.warehouseId ||
      !form.partId
    )
      return;
    let active = true;
    const query = new URLSearchParams({
      page: "1",
      pageSize: "100",
      warehouseId: form.warehouseId,
      partId: form.partId,
    });
    api.inventory<Page<LedgerRow>>(`/stock-transactions?${query}`).then(
      (result) => {
        if (active)
          setCorrectionSource({
            key: correctionSourceKey,
            rows: result.items,
            error: "",
          });
      },
      (cause: unknown) => {
        if (active)
          setCorrectionSource({
            key: correctionSourceKey,
            rows: [],
            error: message(cause),
          });
      },
    );
    return () => {
      active = false;
    };
  }, [
    formMode,
    form.reasonCode,
    form.warehouseId,
    form.partId,
    correctionSourceKey,
  ]);

  async function loadUsages() {
    const requestedWorkOrderId = workOrderId;
    const operationGeneration = getSessionGeneration();
    if (!requestedWorkOrderId) return;
    setBusy(true);
    setError("");
    try {
      const rows = await api.inventory<Usage[]>(
        `/work-orders/${encodeURIComponent(requestedWorkOrderId)}/parts`,
      );
      if (operationGeneration === getSessionGeneration())
        setUsageState({
          workOrderId: requestedWorkOrderId,
          generation: operationGeneration,
          items: rows,
          error: "",
        });
    } catch (cause) {
      if (operationGeneration === getSessionGeneration())
        setUsageState({
          workOrderId: requestedWorkOrderId,
          generation: operationGeneration,
          items: [],
          error: message(cause),
        });
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: FormEvent, returnUsageId?: string) {
    event.preventDefault();
    setError("");
    if (formLocked) return;
    const quantity = quantityInput(
      form.quantity,
      formMode === "RETURN" ||
        parts.find((part) => part.id === form.partId)?.allowFractional !==
          false,
    );
    if (!quantity) {
      setError(
        "Nhập số lượng lớn hơn 0, tối đa 2 số lẻ. Phụ tùng đếm nguyên đơn vị không được nhập số lẻ. Ví dụ: 2 hoặc 2,5.",
      );
      return;
    }
    if (
      formMode === "RECEIVE" &&
      !form.documentReference.trim() &&
      !form.note.trim()
    ) {
      setError("Nhập số chứng từ hoặc ghi chú giải thích cho phiếu nhập.");
      return;
    }
    if (
      formMode === "ADJUST" &&
      form.reasonCode === "CORRECTION" &&
      !form.relatedTransactionId.trim()
    ) {
      setError("Chọn giao dịch gốc để đối chiếu điều chỉnh.");
      return;
    }
    let request: StockRequest;
    if (formMode === "RECEIVE") {
      request = {
        mode: formMode,
        path: "/stock-transactions/receive",
        body: {
          warehouseId: form.warehouseId,
          partId: form.partId,
          quantity,
          ...(form.documentReference.trim()
            ? { documentReference: form.documentReference.trim() }
            : {}),
          ...(form.note.trim() ? { note: form.note.trim() } : {}),
        },
      };
    } else if (formMode === "ADJUST") {
      request = {
        mode: formMode,
        path: "/stock-transactions/adjust",
        body: {
          warehouseId: form.warehouseId,
          partId: form.partId,
          quantity,
          direction: form.direction,
          note: form.note.trim(),
          reasonCode: form.reasonCode,
          ...(form.reasonCode === "CORRECTION"
            ? { relatedTransactionId: form.relatedTransactionId }
            : {}),
        },
      };
    } else if (formMode === "ISSUE") {
      request = {
        mode: formMode,
        path: `/work-orders/${encodeURIComponent(workOrderId)}/parts`,
        body: {
          warehouseId: form.warehouseId,
          partId: form.partId,
          quantity,
          ...(form.note ? { note: form.note } : {}),
        },
      };
    } else {
      request = {
        mode: formMode,
        path: `/work-order-parts/${encodeURIComponent(returnUsageId ?? "")}/return`,
        body: {
          quantity,
          note: form.note.trim(),
          condition: form.condition,
        },
      };
    }
    await sendStock(request);
  }

  async function sendStock(request?: StockRequest) {
    const operationGeneration = getSessionGeneration();
    const mode = request?.mode ?? mutation.pending?.mode;
    setBusy(true);
    setError("");
    setNotice(null);
    try {
      await mutation.execute(request);
      if (getSessionGeneration() !== operationGeneration) return;
      setNotice({
        generation: operationGeneration,
        message: "Đã ghi nhận giao dịch kho.",
      });
      setForm((value) => ({
        ...value,
        quantity: "",
        note: "",
        documentReference: "",
        relatedTransactionId: "",
      }));
      setRevision((value) => value + 1);
      if (mode === "RETURN") await loadUsages();
    } catch (cause) {
      if (getSessionGeneration() !== operationGeneration) return;
      setError(message(cause));
      setRevision((value) => value + 1);
    } finally {
      setBusy(false);
    }
  }

  async function recover(key: string, kind: "retry" | "abort") {
    const operationGeneration = getSessionGeneration();
    const matchesPending = mutation.pending?.key === key;
    setBusy(true);
    setError("");
    setNotice(null);
    try {
      await mutation.recover(key, kind);
      if (getSessionGeneration() !== operationGeneration) return;
      setNotice({
        generation: operationGeneration,
        message:
          kind === "abort"
            ? "Đã hủy giao dịch chưa ghi tồn. Kiểm tra trạng thái đối soát bên dưới."
            : "Đã xử lý giao dịch xuất kho. Kiểm tra lịch sử và trạng thái đối soát bên dưới.",
      });
      if (matchesPending && kind === "retry")
        setForm((value) => ({
          ...value,
          quantity: "",
          note: "",
          documentReference: "",
          relatedTransactionId: "",
        }));
      setRevision((value) => value + 1);
      if (workOrderId) await loadUsages();
    } catch (cause) {
      if (getSessionGeneration() !== operationGeneration) return;
      setError(message(cause));
      setRevision((value) => value + 1);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="m2-page">
      <h1>Giao dịch kho</h1>
      <p>
        Chọn đúng kho, phụ tùng và công việc trước khi ghi nhận. Số lượng có đơn
        vị đi kèm; nhập 2 cho hai đơn vị hoặc 2,5 cho hai đơn vị rưỡi nếu phụ
        tùng cho phép số lẻ.
      </p>
      {error && (
        <p role="alert" className="m1-error">
          {error}
        </p>
      )}
      {notice?.generation === sessionGeneration && (
        <p role="status">{notice.message}</p>
      )}
      {mutation.storageError && (
        <p role="alert" className="m1-error">
          {mutation.storageError}
        </p>
      )}
      {canManage && pending && (
        <section
          className="m1-card m1-section-card"
          aria-label="Giao dịch chưa xác nhận"
        >
          <p role="status">
            Giao dịch {pending.mode} chưa xác nhận kết quả. Thử lại giao dịch đã
            lưu trước khi tạo giao dịch khác.
          </p>
          <p>
            Số lượng: {quantityText(pending.body.quantity)} ·{" "}
            {pending.body.note || pending.body.documentReference}
          </p>
          <button disabled={busy} onClick={() => void sendStock()}>
            Thử lại giao dịch đã lưu
          </button>
        </section>
      )}
      <fieldset disabled={formLocked} className="inventory-mutation-fields">
        {canManage && (
          <label>
            Thao tác
            <select
              value={formMode}
              onChange={(event) => {
                setFormMode(event.target.value as typeof formMode);
                setError("");
              }}
            >
              <option value="RECEIVE">Nhập kho</option>
              <option value="ADJUST">Điều chỉnh</option>
              {canIssue && (
                <>
                  <option value="ISSUE">Xuất cho Work Order</option>
                  <option value="RETURN">Trả từ Work Order</option>
                </>
              )}
            </select>
          </label>
        )}
        {canManage &&
          formMode !== "RETURN" &&
          (formMode !== "ISSUE" || canIssue) && (
            <form
              className="m2-editor"
              onSubmit={(event) => void submit(event)}
            >
              {formMode === "ISSUE" && (
                <label>
                  Work Order
                  <select
                    required
                    value={workOrderId}
                    onChange={(event) => setWorkOrderId(event.target.value)}
                  >
                    <option value="">Chọn Work Order</option>
                    {workOrders
                      .filter(
                        (row) =>
                          !["COMPLETED", "CANCELLED"].includes(row.status),
                      )
                      .map((row) => (
                        <option key={row.id} value={row.id}>
                          {row.workOrderNo} · {row.status}
                        </option>
                      ))}
                  </select>
                </label>
              )}
              <label>
                Kho
                <select
                  required
                  value={form.warehouseId}
                  onChange={(event) =>
                    setForm({ ...form, warehouseId: event.target.value })
                  }
                >
                  <option value="">Chọn kho</option>
                  {warehouses.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.code} · {row.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Phụ tùng
                <select
                  required
                  value={form.partId}
                  onChange={(event) =>
                    setForm({ ...form, partId: event.target.value })
                  }
                >
                  <option value="">Chọn phụ tùng</option>
                  {parts.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.sku} · {row.name} ({row.unit})
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Số lượng
                <input
                  required
                  inputMode="decimal"
                  pattern="[0-9]+([.,][0-9]{1,2})?"
                  value={form.quantity}
                  onChange={(event) =>
                    setForm({ ...form, quantity: event.target.value })
                  }
                />
              </label>
              {formMode === "RECEIVE" && (
                <label>
                  Số chứng từ
                  <input
                    maxLength={150}
                    value={form.documentReference}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        documentReference: event.target.value,
                      })
                    }
                  />
                </label>
              )}
              {formMode === "ADJUST" && (
                <>
                  <label>
                    Hướng
                    <select
                      value={form.direction}
                      onChange={(event) =>
                        setForm({ ...form, direction: event.target.value })
                      }
                    >
                      <option value="ADJUST_IN">Tăng tồn</option>
                      <option value="ADJUST_OUT">Giảm tồn</option>
                    </select>
                  </label>
                  <label>
                    Lý do
                    <select
                      value={form.reasonCode}
                      onChange={(event) =>
                        setForm({ ...form, reasonCode: event.target.value })
                      }
                    >
                      {[
                        "COUNT_VARIANCE",
                        "DAMAGE",
                        "LOSS",
                        "CORRECTION",
                        "OTHER",
                      ].map((value) => (
                        <option key={value} value={value}>
                          {stockLabels[value] ?? value}
                        </option>
                      ))}
                    </select>
                  </label>
                  {form.reasonCode === "CORRECTION" && (
                    <>
                      {correctionSourceLoading ? (
                        <p role="status">Đang tải giao dịch gốc…</p>
                      ) : correctionSource.error ? (
                        <p role="alert" className="m1-error">
                          {correctionSource.error}
                        </p>
                      ) : (
                        <label>
                          Giao dịch gốc cần đối chiếu
                          <select
                            required
                            value={form.relatedTransactionId}
                            onChange={(event) =>
                              setForm({
                                ...form,
                                relatedTransactionId: event.target.value,
                              })
                            }
                          >
                            <option value="">Chọn giao dịch gốc</option>
                            {correctionSources
                              .filter((row) =>
                                form.direction === "ADJUST_IN"
                                  ? row.type === "ADJUST_OUT" &&
                                    row.reasonCode !== "CORRECTION"
                                  : ["RECEIVE", "ADJUST_IN"].includes(
                                      row.type,
                                    ) && row.reasonCode !== "CORRECTION",
                              )
                              .map((row) => (
                                <option key={row.id} value={row.id}>
                                  {date(row.createdAt)} ·{" "}
                                  {stockLabels[row.type] ?? row.type} ·{" "}
                                  {quantityText(row.quantity)} · {row.id}
                                </option>
                              ))}
                          </select>
                        </label>
                      )}
                    </>
                  )}
                </>
              )}
              <label>
                Ghi chú
                <input
                  required={
                    formMode === "ADJUST" ||
                    (formMode === "RECEIVE" && !form.documentReference.trim())
                  }
                  maxLength={2000}
                  value={form.note}
                  onChange={(event) =>
                    setForm({ ...form, note: event.target.value })
                  }
                />
              </label>
              <button
                disabled={
                  busy ||
                  (formMode === "ISSUE" &&
                    (!workOrderId || unresolvedSelectedWorkOrder))
                }
              >
                {busy ? "Đang ghi nhận…" : "Ghi nhận giao dịch"}
              </button>
              {unresolvedSelectedWorkOrder && (
                <p role="status">
                  Công việc còn giao dịch chờ xác định kết quả hoặc chưa tải
                  được trạng thái. Kiểm tra mục đối soát trước khi xuất thêm.
                </p>
              )}
            </form>
          )}
        {formMode === "RETURN" && canIssue && (
          <section className="m1-card m1-section-card">
            <div className="m1-section-body">
              <form
                className="m2-editor"
                onSubmit={(event) => {
                  event.preventDefault();
                  void loadUsages();
                }}
              >
                <label>
                  Work Order
                  <select
                    required
                    value={workOrderId}
                    onChange={(event) => setWorkOrderId(event.target.value)}
                  >
                    <option value="">Chọn Work Order</option>
                    {workOrders.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.workOrderNo} · {row.status}
                      </option>
                    ))}
                  </select>
                </label>
                <button disabled={busy}>Tải phụ tùng đã xuất</button>
              </form>
              {usageState.error &&
                usageState.workOrderId === workOrderId &&
                usageState.generation === sessionGeneration && (
                  <p role="alert" className="m1-error">
                    {usageState.error}
                  </p>
                )}
              {usages.map((usage) => (
                <div key={usage.id} className="m2-linked-list">
                  <div>
                    <strong>
                      {displayName("part", null, usage.partSnapshot)}
                    </strong>
                    <p>
                      Đã xuất {quantityText(usage.quantityIssued)} · Đã trả{" "}
                      {quantityText(usage.quantityReturned)} · Còn đối soát{" "}
                      {quantityText(usage.quantityOutstanding)} · Đã xác nhận
                      dùng {quantityText(usage.quantityConfirmedUsed)}
                    </p>
                    <form
                      className="m2-editor"
                      onSubmit={(event) => void submit(event, usage.id)}
                    >
                      <label>
                        Số lượng trả
                        <input
                          required
                          inputMode="decimal"
                          pattern="[0-9]+([.,][0-9]{1,2})?"
                          value={form.quantity}
                          onChange={(event) =>
                            setForm({ ...form, quantity: event.target.value })
                          }
                        />
                      </label>
                      <label>
                        Tình trạng
                        <select
                          value={form.condition}
                          onChange={(event) =>
                            setForm({ ...form, condition: event.target.value })
                          }
                        >
                          <option value="GOOD">Tốt</option>
                          <option value="DAMAGED">Hỏng</option>
                          <option value="PENDING_INSPECTION">
                            Chờ kiểm tra
                          </option>
                        </select>
                      </label>
                      <label>
                        Ghi chú
                        <input
                          required
                          maxLength={2000}
                          value={form.note}
                          onChange={(event) =>
                            setForm({ ...form, note: event.target.value })
                          }
                        />
                      </label>
                      <button
                        disabled={busy || isZero(usage.quantityOutstanding)}
                      >
                        Ghi nhận trả
                      </button>
                    </form>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </fieldset>
      <section className="m1-card m1-section-card">
        <div className="m1-section-header">
          <h2>Lịch sử thẻ kho</h2>
        </div>
        <div className="m1-section-body">
          <label>
            Loại giao dịch
            <select
              value={type}
              onChange={(event) => {
                setType(event.target.value);
                setPage(1);
              }}
            >
              <option value="">Tất cả</option>
              {[
                "RECEIVE",
                "ISSUE",
                "RETURN",
                "ADJUST_IN",
                "ADJUST_OUT",
                "RELEASE",
                "SCRAP",
              ].map((value) => (
                <option key={value} value={value}>
                  {stockLabels[value] ?? value}
                </option>
              ))}
            </select>
          </label>
          <PageStatus loading={ledger.loading} error={ledger.error}>
            {ledger.data && (
              <>
                <div className="m2-inventory-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Thời điểm</th>
                        <th>Loại</th>
                        <th>Số lượng</th>
                        <th>Kho</th>
                        <th>Phụ tùng</th>
                        <th>Tham chiếu</th>
                        <th>ID giao dịch</th>
                        <th>Ghi chú</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ledger.data.items.map((row) => (
                        <tr key={row.id}>
                          <td>{date(row.createdAt)}</td>
                          <td>{stockLabels[row.type] ?? row.type}</td>
                          <td>{quantityText(row.quantity)}</td>
                          <td>
                            {displayName(
                              "warehouse",
                              row.warehouse,
                              row.warehouseSnapshot,
                            )}
                          </td>
                          <td>
                            {displayName("part", row.part, row.partSnapshot)}
                          </td>
                          <td>
                            {row.referenceId ? (
                              <details>
                                <summary>Hồ sơ tham chiếu</summary>
                                <code>{row.referenceId}</code>
                              </details>
                            ) : (
                              "Chưa có tham chiếu"
                            )}
                          </td>
                          <td>
                            <details>
                              <summary>Mã tra cứu</summary>
                              <code>{row.id}</code>
                            </details>
                          </td>
                          <td>{row.note ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!ledger.data.items.length && <p>Chưa có giao dịch phù hợp.</p>}
                <Pager page={page} total={ledger.data.total} onPage={setPage} />
              </>
            )}
          </PageStatus>
        </div>
      </section>
      <section className="m1-card m1-section-card">
        <div className="m1-section-header">
          <h2>Xuất kho chờ đối soát</h2>
        </div>
        <div className="m1-section-body">
          <PageStatus loading={operations.loading} error={operations.error}>
            {operations.data &&
              (operations.data.items as Record<string, unknown>[]).map(
                (operation) => {
                  const recovery =
                    operation.recovery && typeof operation.recovery === "object"
                      ? (operation.recovery as Record<string, unknown>)
                      : null;
                  const nextActions = Array.isArray(recovery?.nextActions)
                    ? recovery.nextActions.filter(
                        (action): action is string =>
                          typeof action === "string",
                      )
                    : [];
                  const key =
                    typeof operation.key === "string" ? operation.key : "";
                  return (
                    <div key={key} className="m2-linked-list">
                      <p>
                        Giao dịch xuất kho ·{" "}
                        {stockLabels[String(operation.state)] ??
                          "Cần kiểm tra kết quả"}{" "}
                        ·{" "}
                        {stockLabels[
                          String(recovery?.synchronization ?? "PENDING")
                        ] ?? "Chờ đối soát"}
                      </p>
                      <details>
                        <summary>Mã tra cứu hỗ trợ</summary>
                        <code>{key}</code>
                      </details>
                      {canIssue &&
                        key &&
                        nextActions.includes("RETRY_SAME_OPERATION") && (
                          <button
                            disabled={busy}
                            onClick={() => void recover(key, "retry")}
                          >
                            Thử lại cùng thao tác
                          </button>
                        )}
                      {canIssue &&
                        key &&
                        nextActions.includes("RETRY_SETTLEMENT") && (
                          <button
                            disabled={busy}
                            onClick={() => void recover(key, "retry")}
                          >
                            Đồng bộ hoàn tất
                          </button>
                        )}
                      {canIssue &&
                        key &&
                        nextActions.includes("ABORT_BEFORE_COMMIT") && (
                          <button
                            disabled={busy}
                            onClick={() => void recover(key, "abort")}
                          >
                            Hủy giao dịch chưa ghi tồn
                          </button>
                        )}
                    </div>
                  );
                },
              )}
          </PageStatus>
        </div>
      </section>
    </div>
  );
}
