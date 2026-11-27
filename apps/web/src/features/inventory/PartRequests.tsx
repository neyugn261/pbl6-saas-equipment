import { useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ApiError, api } from "../../api/client";
import { getSessionGeneration, useSession } from "../../auth/session";
import { StatusBadge } from "../../components/Badges";
import { PageTitle } from "../../components/PageTitle";
import { recordLabel, technicianName } from "../../display-names";
import type { Page } from "../../types/domain";
import { ServiceCard, ServiceFacts, ServiceNotice } from "../workspace/ServiceDetailUI";
import { DataState, EmptyState, PageHeading, Pagination } from "../workspace/WorkspaceUI";
import { formatDate, useWorkspaceData } from "../workspace/workspace-data";
import { quantityInput, quantityText } from "../workspace/ui-values";
import { StockMutation, type StockRequest } from "./stock-mutation";
import "./inventory-parts.css";
import "./part-requests.css";

const queue = "/app/inventory/requests";
const eligible = ["ACCEPTED", "TRAVELLING", "IN_PROGRESS", "ON_HOLD"];
const labels: Record<string, string> = {
  OPEN: "Đang mở",
  CLOSED: "Đã đóng",
  CANCELLED: "Đã hủy",
  REJECTED: "Đã từ chối",
  NOT_ISSUED: "Chưa cấp",
  PARTIALLY_ISSUED: "Đã cấp một phần",
  FULLY_ISSUED: "Đã cấp đủ",
  NOT_RECEIVED: "Chưa nhận",
  PARTIALLY_RECEIVED: "Đã nhận một phần",
  RECEIVED: "Đã nhận đủ",
  FULLY_RECEIVED: "Đã nhận đủ",
  CREATE: "Tạo phiếu",
  REJECT: "Từ chối",
  CLOSE: "Đóng phiếu",
  CANCEL: "Hủy phiếu",
  ISSUE_PREPARED: "Chuẩn bị cấp",
  ISSUE_COMMITTED: "Đã cấp",
  ISSUE_ABORTED: "Đã hủy lần cấp",
  ISSUE_SETTLED: "Đã đối soát",
  RESERVATION_SETTLED: "Đã đối soát",
  RECEIPT: "Ghi nhận thực nhận",
};
const decisions = {
  reject: "Từ chối phiếu",
  close: "Đóng phần còn lại",
  cancel: "Hủy phiếu",
};
const receiptConditions: Record<string, string> = {
  GOOD: "Hàng tốt",
  DAMAGED: "Hàng hỏng",
  PENDING_INSPECTION: "Cần kiểm tra",
};
function RequestStatus({ status }: { status: string }) {
  return <StatusBadge status={status === "OPEN" ? "REVIEWING" : status} label={labels[status] ?? status} />;
}
type PartInfo = {
  sku: string;
  name: string;
  unit: string;
  allowFractional: boolean;
};
type Part = PartInfo & { id: string };
type Warehouse = { id: string; code: string; name: string };
type Order = {
  id: string;
  workOrderNo: string;
  status: string;
  currentTechnicianName?: string;
  currentTechnicianEmployeeCode?: string;
  currentAssignment?: { status: string; technicianUserId: string };
};
type Summary = {
  id: string;
  requestNo: string;
  branchId: string;
  workOrderId: string;
  workOrderNo?: string;
  status: string;
  reason: string;
  closingReason?: string;
  version: number;
  createdAt: string;
  allowedActions?: string[];
};
type IssueLine = {
  id: string;
  partSnapshot: PartInfo;
  quantityRequested: string;
  quantityIssued: string;
  quantityPendingIssue: string;
  quantityAvailableToFulfill: string;
  quantityClosedWithoutIssue: string;
};
type Issue = Summary & {
  lines: IssueLine[];
  fulfillmentStatus: string;
  pendingRecovery: boolean;
};
type Receipt = Summary & {
  receiptStatus: string;
  quantityRequested: string;
  quantityReceived: string;
  quantityPendingReceipt: string;
  quantityReceivableNow: string;
  quantityClosedWithoutReceipt: string;
  usageQuantityUnreconciled: string;
  usage: {
    partSnapshot: PartInfo | null;
    warehouseSnapshot: Omit<Warehouse, "id"> | null;
  };
};
type HistoryEntry = {
  id: string;
  action: string;
  reason?: string;
  createdAt: string;
  after?: {
    quantity?: string;
    reason?: string;
    closingReason?: string;
    condition?: string;
    note?: string;
    handoverReference?: string;
  };
};

function useMutation(reload: () => void) {
  const { profile } = useSession();
  const generation = getSessionGeneration();
  const scope = JSON.stringify([profile?.tenantId, profile?.id]);
  const mutation = useMemo(
    () => new StockMutation(scope, generation, "requests"),
    [scope, generation],
  );
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{
    error?: string;
    success?: string;
  }>({});
  async function run(action: () => Promise<unknown>) {
    if (lock.current || generation !== getSessionGeneration()) return;
    lock.current = true;
    setBusy(true);
    setFeedback({});
    try {
      await action();
      if (generation === getSessionGeneration())
        setFeedback({ success: "Đã ghi nhận thao tác." });
    } catch (error) {
      if (generation !== getSessionGeneration()) return;
      let message =
        "Chưa xác nhận được kết quả. Kiểm tra dữ liệu mới nhất trước khi tiếp tục.";
      if (error instanceof ApiError && error.status < 500)
        message = error.message;
      if (error instanceof ApiError && error.status === 403)
        message = "Tài khoản hiện tại không có quyền thực hiện thao tác.";
      if (error instanceof ApiError && error.status === 404)
        message = "Không tìm thấy dữ liệu trong phạm vi tài khoản.";
      if (
        error instanceof ApiError &&
        error.code === "CUSTODIAN_NOT_CURRENT_TECHNICIAN"
      )
        message =
          "Kỹ thuật viên nhận hàng đã thay đổi. Kiểm tra lại người nhận trước khi cấp.";
      if (
        error instanceof ApiError &&
        error.code === "REQUEST_VERSION_CONFLICT"
      )
        message = "Phiếu đã thay đổi. Kiểm tra số lượng mới trước khi gửi lại.";
      setFeedback({ error: message });
    } finally {
      lock.current = false;
      if (generation === getSessionGeneration()) {
        setBusy(false);
        reload();
      }
    }
  }
  return {
    mutation,
    feedback,
    busy,
    run,
    blocked: busy || Boolean(mutation.pending || mutation.storageError),
  };
}

function MutationStatus({ state }: { state: ReturnType<typeof useMutation> }) {
  return (
    <>
      {state.mutation.storageError && (
        <p role="alert">{state.mutation.storageError}</p>
      )}
      {state.feedback.error && (
        <p role="alert" className="m1-error">
          {state.feedback.error}
        </p>
      )}
      {state.feedback.success && <p role="status">{state.feedback.success}</p>}
      {state.mutation.pending && (
        <p role="status">
          Đang chờ xác nhận thao tác{" "}
          {(
            {
              REQUEST_PARTS: "xin cấp",
              FULFILL: "cấp phụ tùng",
              RECEIPT: "nhận trả kho",
            } as Record<string, string>
          )[state.mutation.pending.mode] ?? "kho"}
          .
          {state.mutation.pending.label && (
            <> {state.mutation.pending.label}.</>
          )}{" "}
          <button
            type="button"
            disabled={state.busy}
            onClick={() => void state.run(() => state.mutation.execute())}
          >
            Thử lại thao tác đã lưu
          </button>
        </p>
      )}
    </>
  );
}

export function PartRequestQueue() {
  const [query, setQuery] = useSearchParams();
  const kind =
    query.get("kind") === "return" ? "return-requests" : "part-requests";
  const workOrderId = query.get("workOrderId");
  const statuses = [
    "OPEN",
    "CLOSED",
    "CANCELLED",
    ...(kind === "part-requests" ? ["REJECTED"] : []),
  ];
  const selectedStatus = query.get("status");
  const status =
    selectedStatus !== null &&
    (selectedStatus === "" || statuses.includes(selectedStatus))
      ? selectedStatus
      : "OPEN";
  const requestedPage = Number(query.get("page"));
  const page =
    Number.isSafeInteger(requestedPage) && requestedPage > 0
      ? requestedPage
      : 1;
  const [revision, setRevision] = useState(0);
  const reload = () => setRevision((v) => v + 1);
  const filter = new URLSearchParams({ page: String(page), pageSize: "20" });
  if (status) filter.set("status", status);
  if (workOrderId) filter.set("workOrderId", workOrderId);
  const state = useWorkspaceData<Page<Issue | Receipt>>(
    "inventory",
    "/" + kind + "?" + filter,
    revision,
  );
  const order = useWorkspaceData<Order>(
    "workorders",
    workOrderId ? "/work-orders/" + encodeURIComponent(workOrderId) : null,
  );
  function update(values: Record<string, string>) {
    const next = new URLSearchParams(query);
    for (const [key, value] of Object.entries(values)) next.set(key, value);
    setQuery(next);
  }
  return (
    <div className="m2-page inventory-page part-request-page">
      <PageHeading title="Phiếu phụ tùng" description="Theo dõi phiếu xin cấp và đề nghị trả kho theo lệnh công việc." />
      <section className="m1-card inventory-card" aria-label="Danh sách phiếu">
      <div className="ws-toolbar inventory-toolbar part-request-toolbar">
        <label className="ws-label">
          Loại phiếu
          <select
            value={kind}
            onChange={(e) =>
              update({
                kind: e.target.value === "return-requests" ? "return" : "issue",
                status: "OPEN",
                page: "1",
              })
            }
          >
            <option value="part-requests">Xin cấp phụ tùng</option>
            <option value="return-requests">Đề nghị trả kho</option>
          </select>
        </label>
        <label className="ws-label">
          Trạng thái
          <select
            value={status}
            onChange={(e) => update({ status: e.target.value, page: "1" })}
          >
            <option value="">Tất cả</option>
            {statuses.map((key) => (
              <option key={key} value={key}>
                {labels[key]}
              </option>
            ))}
          </select>
        </label>
        <CatalogSelect<Order>
          key={workOrderId ?? "all"}
          area="workorders"
          path="/work-orders?sort=-createdAt"
          label="Lọc theo lệnh công việc"
          selectedItem={order.data}
          describe={(item) => item.workOrderNo}
          onChange={(item) =>
            update({ workOrderId: item?.id ?? "", page: "1" })
          }
        />
        <button type="button" className="ws-button ws-button--secondary" onClick={reload}>
          Làm mới
        </button>
      </div>
      {workOrderId && (
        <p className="part-request-filter-note">
          Lệnh {order.data?.workOrderNo ?? "đã chọn"} ·{" "}
          <Link to={queue}>Bỏ lọc theo lệnh</Link>
        </p>
      )}
      <DataState {...state} retry={reload}>
        {state.data?.items.length ? (
          <div className="ws-table-wrap">
            <table className="ws-table">
              <thead><tr><th>Mã phiếu</th><th>Lệnh công việc</th><th>Lý do</th><th>Tiến độ</th><th>Trạng thái</th><th>Ngày tạo</th></tr></thead>
              <tbody>
                {state.data.items.map((item) => {
                  const progress = "lines" in item ? item.fulfillmentStatus : item.receiptStatus;
                  return (
                    <tr key={item.id}>
                      <td data-label="Mã phiếu"><Link className="ws-text-link" to={queue + "/" + kind + "/" + item.id + "?" + query}>{item.requestNo}</Link></td>
                      <td data-label="Lệnh công việc">{item.workOrderNo || "—"}</td>
                      <td data-label="Lý do" className="part-request-queue-reason">{item.reason}</td>
                      <td data-label="Tiến độ">{labels[progress] ?? progress}</td>
                      <td data-label="Trạng thái"><RequestStatus status={item.status} /></td>
                      <td data-label="Ngày tạo">{formatDate(item.createdAt, true)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="Không có phiếu phù hợp" description="Chọn loại phiếu hoặc trạng thái khác để xem kết quả." />
        )}
        <Pagination page={page} total={state.data?.total} onChange={(v) => update({ page: String(v) })} />
      </DataState>
      </section>
    </div>
  );
}

function CatalogSelect<T extends { id: string }>({
  area = "inventory",
  path,
  label,
  describe,
  onChange,
  selectedItem,
}: {
  area?: "workorders" | "inventory";
  path: string;
  label: string;
  describe: (item: T) => string;
  onChange: (item?: T) => void;
  selectedItem?: T;
}) {
  const [page, setPage] = useState(1);
  const [choice, setSelected] = useState<T>();
  const selected = selectedItem ?? choice;
  const [revision, setRevision] = useState(0);
  const state = useWorkspaceData<Page<T>>(
    area,
    path + "&page=" + page + "&pageSize=20",
    revision,
  );
  const items = state.data?.items ?? [];
  const options =
    selected && !items.some((item) => item.id === selected.id)
      ? [selected, ...items]
      : items;
  return (
    <div>
      <DataState {...state} retry={() => setRevision((v) => v + 1)}>
        <label>
          {label}
          <select
            required
            value={selected?.id ?? ""}
            onChange={(e) => {
              const item = options.find(
                (option) => option.id === e.target.value,
              );
              setSelected(item);
              onChange(item);
            }}
          >
            <option value="">
              {area === "workorders"
                ? "Tất cả lệnh"
                : options.length
                  ? "Chọn một mục"
                  : "Không có dữ liệu phù hợp"}
            </option>
            {options.map((item) => (
              <option key={item.id} value={item.id}>
                {describe(item)}
              </option>
            ))}
          </select>
        </label>
        {((state.data?.total ?? 0) > 20 || page > 1) && (
          <Pagination
            page={page}
            total={state.data?.total}
            onChange={setPage}
          />
        )}
      </DataState>
    </div>
  );
}

function History({ path, revision }: { path: string; revision: number }) {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [retry, setRetry] = useState(0);
  const state = useWorkspaceData<Page<HistoryEntry>>(
    "inventory",
    open ? path + "/history?page=" + page + "&pageSize=20" : null,
    revision + retry,
  );
  return (
    <details className="part-request-history" onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>Lịch sử phiếu</summary>
      {open && (
        <div className="part-request-history__body">
          <DataState {...state} retry={() => setRetry((v) => v + 1)}>
            {state.data?.items.length ? (
              <ol className="part-request-history__events">
                {state.data.items.map((entry) => {
                  const details = entry.after;
                  const reason = entry.reason || details?.closingReason || (entry.action !== "CREATE" ? details?.reason : undefined);
                  const condition = details?.condition && receiptConditions[details.condition];
                  const movement = [
                    details?.quantity ? `Số lượng ${quantityText(details.quantity)}` : null,
                    condition,
                    details?.handoverReference ? `Biên nhận ${details.handoverReference}` : null,
                  ].filter(Boolean).join(" · ");
                  return (
                    <li key={entry.id}>
                      <div className="part-request-history__event-heading">
                        <strong>{labels[entry.action] ?? "Cập nhật phiếu"}</strong>
                        <time dateTime={entry.createdAt}>{formatDate(entry.createdAt, true)}</time>
                      </div>
                      {movement && <p>{movement}</p>}
                      {(reason || details?.note) && <p>{reason || details?.note}</p>}
                    </li>
                  );
                })}
              </ol>
            ) : (
              <p>Chưa có lịch sử.</p>
            )}
            {((state.data?.total ?? 0) > 20 || page > 1) && (
              <Pagination page={page} total={state.data?.total} onChange={setPage} />
            )}
          </DataState>
        </div>
      )}
    </details>
  );
}

function MovementForm({
  item,
  line,
  order,
  submit,
}: (
  | { item: Issue; line: IssueLine; order: Order }
  | { item: Receipt; line?: never; order?: never }
) & { submit: (request: StockRequest) => void }) {
  const [warehouse, setWarehouse] = useState<Warehouse>();
  const [error, setError] = useState("");
  const issuing = "lines" in item;
  const part = issuing ? line?.partSnapshot : item.usage.partSnapshot;
  const limit = issuing
    ? line?.quantityAvailableToFulfill
    : item.quantityReceivableNow;
  const assignment = order?.currentAssignment;
  if (
    issuing &&
    (!order ||
      assignment?.status !== "ACCEPTED" ||
      !eligible.includes(order.status))
  )
    return (
      <p>
        Lệnh cần có kỹ thuật viên đã nhận việc và đang ở trạng thái được cấp phụ
        tùng.
      </p>
    );
  function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const quantity = quantityInput(
      String(data.get("quantity")),
      part?.allowFractional,
    );
    const note = String(data.get("note")).trim();
    if (!quantity || !limit || Number(quantity) > Number(limit) || !note) {
      setError("Nhập số lượng trong giới hạn và điền thông tin xác nhận.");
      return;
    }
    setError("");
    const body = { expectedVersion: item.version, quantity };
    if (issuing && line && warehouse && assignment) {
      submit({
        mode: "FULFILL",
        label: item.requestNo,
        path: "/part-requests/" + item.id + "/fulfillments",
        body: {
          ...body,
          lineId: line.id,
          warehouseId: warehouse.id,
          custodianUserId: assignment.technicianUserId,
          handoverReference: note,
        },
      });
    } else if (!issuing) {
      submit({
        mode: "RECEIPT",
        label: item.requestNo,
        path: "/return-requests/" + item.id + "/receipts",
        body: { ...body, condition: String(data.get("condition")), note },
      });
    }
  }
  return (
    <form className="ws-form-grid part-request-movement-form" onSubmit={send}>
      {issuing && (
        <>
          <p className="ws-full part-request-recipient">
            Người nhận{" "}
            <strong>
              {technicianName(
                order?.currentTechnicianName,
                order?.currentTechnicianEmployeeCode,
              )}
            </strong>
          </p>
          <CatalogSelect<Warehouse>
            path={"/warehouses?status=ACTIVE&branchId=" + item.branchId}
            label="Kho cấp"
            onChange={setWarehouse}
            describe={(w) => recordLabel(w.code, w.name, "Kho chưa có tên")}
          />
        </>
      )}
      <label className="ws-label">
        {issuing ? "Số lượng cấp" : "Số lượng thực nhận"}
        <input name="quantity" inputMode="decimal" required />
      </label>
      {!issuing && (
        <label className="ws-label">
          Tình trạng
          <select name="condition" required defaultValue="">
            <option value="" disabled>
              Chọn tình trạng
            </option>
            <option value="GOOD">Hàng tốt</option>
            <option value="DAMAGED">Hàng hỏng, đưa vào cách ly</option>
            <option value="PENDING_INSPECTION">
              Cần kiểm tra, đưa vào cách ly
            </option>
          </select>
        </label>
      )}
      <label className="ws-label ws-full">
        {issuing ? "Mã biên nhận đã ký" : "Ghi chú"}
        <input name="note" required maxLength={issuing ? 150 : 2000} />
      </label>
      {error && <p role="alert" className="m1-error ws-full">{error}</p>}
      <div className="ws-actions ws-full">
        <button type="submit" className="ws-button" disabled={issuing && !warehouse}>
          {issuing ? "Ghi nhận cấp" : "Ghi nhận thực nhận"}
        </button>
      </div>
    </form>
  );
}

export function PartRequestDetail() {
  const { kind, id } = useParams();
  return (
    <RequestDetail
      key={kind + ":" + id + ":" + getSessionGeneration()}
      kind={kind}
      id={id}
    />
  );
}

function RequestDetail({ kind, id }: { kind?: string; id?: string }) {
  const { profile } = useSession();
  const [query] = useSearchParams();
  const queueQuery = query.toString();
  const [revision, setRevision] = useState(0);
  const [decision, setDecision] = useState<keyof typeof decisions>();
  const [lineId, setLineId] = useState<string>();
  const reload = () => setRevision((v) => v + 1);
  const path =
    id && (kind === "part-requests" || kind === "return-requests")
      ? "/" + kind + "/" + encodeURIComponent(id)
      : null;
  const state = useWorkspaceData<Issue | Receipt>("inventory", path, revision);
  const item = state.data;
  const order = useWorkspaceData<Order>(
    "workorders",
    item ? "/work-orders/" + encodeURIComponent(item.workOrderId) : null,
    revision,
  );
  const operation = useMutation(reload);
  const submit = (request: StockRequest) =>
    void operation.run(() => operation.mutation.execute(request));
  if (!path)
    return (
      <p role="alert">
        Loại phiếu không hợp lệ. <Link to={queue}>Về hàng chờ</Link>
      </p>
    );
  const decisionActions = (Object.keys(decisions) as (keyof typeof decisions)[])
    .filter((action) => item?.allowedActions?.includes(action));
  const progress = item && ("lines" in item ? item.fulfillmentStatus : item.receiptStatus);

  return (
    <div className="m2-page inventory-page part-request-page part-request-record">
      <header className="ws-heading page-title-header">
        <PageTitle
          title={[kind === "part-requests" ? "Phiếu xin cấp" : "Đề nghị trả kho", item?.requestNo].filter(Boolean).join(" ")}
          back={{ to: queue + (queueQuery ? `?${queueQuery}` : ""), label: "Về hàng chờ phiếu phụ tùng" }}
        />
        <div className="page-title-actions">
          <button type="button" className="ws-button ws-button--secondary" disabled={operation.busy} onClick={reload}>
            Làm mới phiếu
          </button>
        </div>
      </header>
      <MutationStatus state={operation} />
      <DataState {...state} retry={reload}>
        {item && (
          <>
            <ServiceCard title="Thông tin phiếu" actions={<RequestStatus status={item.status} />}>
              <div className="part-request-summary-facts">
                <ServiceFacts items={[
                  { label: "Lệnh công việc", value: item.workOrderNo ?? order.data?.workOrderNo ?? "—" },
                  { label: "Ngày tạo", value: formatDate(item.createdAt, true) },
                  ...(progress ? [{ label: "Tiến độ", value: labels[progress] ?? progress }] : []),
                  { label: "Lý do", value: item.reason },
                  ...(item.closingReason ? [{ label: "Lý do đóng phiếu", value: labels[item.closingReason] ?? item.closingReason }] : []),
                ]} />
              </div>
              <History path={path} revision={revision} />
            </ServiceCard>
            <ServiceCard title={"lines" in item ? "Phụ tùng xin cấp" : "Phụ tùng trả kho"}>
              <fieldset disabled={operation.blocked} className="part-request-actions part-request-detail-actions" aria-label="Xử lý phiếu">
                {"lines" in item ? (
                  <>
                    {item.pendingRecovery && (
                      <ServiceNotice title="Có lần cấp cần đối soát">
                        {profile?.roles.includes("INVENTORY_STAFF") ? (
                          <Link className="ws-text-link" to={`/app/inventory/transactions?workOrderId=${item.workOrderId}`}>Mở giao dịch kho</Link>
                        ) : (
                          "Phối hợp với nhân viên kho để xử lý."
                        )}
                      </ServiceNotice>
                    )}
                    <ul className="part-request-detail-lines">
                      {item.lines.map((line) => {
                        const canFulfill = item.allowedActions?.includes("fulfill") && Number(line.quantityAvailableToFulfill) > 0;
                        const expanded = lineId === line.id;
                        return (
                          <li key={line.id}>
                            <div className="part-request-line-heading">
                              <div>
                                <h3>{line.partSnapshot.name || "Phụ tùng chưa có tên"}</h3>
                                <p>{[line.partSnapshot.sku, line.partSnapshot.unit].filter(Boolean).join(" · ")}</p>
                              </div>
                              {canFulfill && (
                                <button type="button" className="ws-button ws-button--secondary" aria-expanded={expanded}
                                  onClick={() => setLineId(expanded ? undefined : line.id)}>
                                  {expanded ? "Ẩn biểu mẫu cấp" : "Cấp phụ tùng"}
                                </button>
                              )}
                            </div>
                            <div className="part-request-amounts">
                              <ServiceFacts items={[
                                { label: "Đề nghị", value: quantityText(line.quantityRequested) },
                                { label: "Đã cấp", value: quantityText(line.quantityIssued) },
                                { label: "Có thể cấp", value: quantityText(line.quantityAvailableToFulfill) },
                                { label: "Đang đối soát", value: quantityText(line.quantityPendingIssue) },
                                { label: "Đã đóng chưa cấp", value: quantityText(line.quantityClosedWithoutIssue) },
                              ]} />
                            </div>
                            {canFulfill && expanded && (
                              <DataState {...order} retry={reload}>
                                {order.data && (
                                  <MovementForm key={item.version + ":" + line.id} item={item} line={line} order={order.data} submit={submit} />
                                )}
                              </DataState>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </>
                ) : (
                  <div className="part-request-return">
                    <div className="part-request-line-heading">
                      <div>
                        <h3>{item.usage.partSnapshot?.name || "Phụ tùng chưa có tên"}</h3>
                        {item.usage.partSnapshot && <p>{[item.usage.partSnapshot.sku, item.usage.partSnapshot.unit].filter(Boolean).join(" · ")}</p>}
                      </div>
                      <div className="part-request-origin">
                        <span>Kho xuất gốc</span>
                        <strong>{recordLabel(item.usage.warehouseSnapshot?.code, item.usage.warehouseSnapshot?.name, "Kho chưa có tên")}</strong>
                      </div>
                    </div>
                    <div className="part-request-amounts">
                      <ServiceFacts items={[
                        { label: "Đề nghị trả", value: quantityText(item.quantityRequested) },
                        { label: "Đã nhận", value: quantityText(item.quantityReceived) },
                        { label: "Có thể nhận", value: quantityText(item.quantityReceivableNow) },
                        { label: "Đang chờ", value: quantityText(item.quantityPendingReceipt) },
                        { label: "Đã đóng chưa nhận", value: quantityText(item.quantityClosedWithoutReceipt) },
                        { label: "Còn phải đối soát", value: quantityText(item.usageQuantityUnreconciled) },
                      ]} />
                    </div>
                    {item.allowedActions?.includes("receive") && (
                      <MovementForm key={item.version} item={item} submit={submit} />
                    )}
                  </div>
                )}
                {decisionActions.length > 0 && (
                  <div className="ws-actions part-request-decision-actions">
                    {decisionActions.map((action) => (
                      <button type="button" className="ws-button ws-button--secondary" key={action}
                        aria-expanded={decision === action}
                        onClick={() => setDecision(decision === action ? undefined : action)}>
                        {decisions[action]}
                      </button>
                    ))}
                  </div>
                )}
                {decision && decisionActions.includes(decision) && (
                  <form
                    key={item.version + ":" + decision}
                    className="ws-form-grid part-request-decision-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const reason = String(new FormData(event.currentTarget).get("reason")).trim();
                      if (!reason) {
                        event.currentTarget.querySelector("textarea")?.focus();
                        return;
                      }
                      void operation.run(async () => {
                        await api.inventory(path + "/" + decision, {
                          method: "POST",
                          body: { expectedVersion: item.version, reason },
                        });
                        setDecision(undefined);
                      });
                    }}
                  >
                    <label className="ws-label ws-full">
                      Lý do
                      <textarea name="reason" required maxLength={2000} />
                    </label>
                    <div className="ws-actions ws-full">
                      <button type="submit" className="ws-button">Xác nhận {decisions[decision].toLowerCase()}</button>
                    </div>
                  </form>
                )}
              </fieldset>
            </ServiceCard>
          </>
        )}
      </DataState>
    </div>
  );
}

export function WorkOrderPartRequests({
  workOrderId,
  workOrderNo,
  status,
}: {
  workOrderId: string;
  workOrderNo: string;
  status: unknown;
}) {
  const [revision, setRevision] = useState(0);
  const [lines, setLines] = useState<
    { key: number; part?: Part; input: string }[]
  >([{ key: 0, input: "" }]);
  const nextKey = useRef(1);
  const [error, setError] = useState("");
  const reload = () => setRevision((v) => v + 1);
  const operation = useMutation(reload);
  const requestable = eligible.some((value) => value === status);
  const filter = "?workOrderId=" + workOrderId + "&status=";
  const recent = useWorkspaceData<Page<Issue>>(
    "inventory",
    "/part-requests?workOrderId=" + workOrderId + "&pageSize=5",
    revision,
  );
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const reason = String(new FormData(form).get("reason")).trim();
    const payload = lines.map(({ part, input }) => ({
      partId: part?.id,
      quantity: quantityInput(input, part?.allowFractional),
    }));
    if (
      !requestable ||
      !reason ||
      payload.some((line) => !line.partId || !line.quantity) ||
      new Set(payload.map((line) => line.partId)).size !== payload.length
    ) {
      setError("Nhập lý do, số lượng hợp lệ và chọn mỗi phụ tùng một lần.");
      return;
    }
    setError("");
    void operation.run(async () => {
      await operation.mutation.execute({
        mode: "REQUEST_PARTS",
        label: workOrderNo,
        path: "/work-orders/" + workOrderId + "/part-requests",
        body: { reason, lines: payload },
      });
      form.reset();
      setLines([{ key: nextKey.current++, input: "" }]);
    });
  }
  return (
    <section className="m1-card m1-section-card part-request-page part-request-workorder">
      <div className="part-request-section-header">
        <div>
          <h2>Phiếu phụ tùng của công việc</h2>
          <p>Theo dõi yêu cầu cấp phụ tùng cho lệnh {workOrderNo}.</p>
        </div>
        <Link to={queue + filter}>Xem tất cả phiếu</Link>
      </div>
      <DataState {...recent} retry={reload}>
        {recent.data?.items.length ? (
          <ul className="part-request-list part-request-workorder-list">
            {recent.data.items.map((item) => (
              <li key={item.id}>
                <div className="part-request-row-header">
                  <Link to={queue + "/part-requests/" + item.id + filter}>
                    {item.requestNo}
                  </Link>
                  <span className="part-request-badge">{labels[item.fulfillmentStatus]}</span>
                </div>
                <p className="part-request-row-meta">{formatDate(item.createdAt, true)}</p>
                <p className="part-request-row-reason">{item.reason}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="part-request-workorder-empty">Chưa có phiếu xin cấp.</p>
        )}
      </DataState>
      <MutationStatus state={operation} />
      {requestable && (
        <details className="part-request-create">
          <summary>Lập phiếu xin cấp</summary>
          <form className="part-request-create-form" onSubmit={save}>
            <fieldset
              disabled={operation.blocked}
              className="part-request-actions part-request-create-actions"
            >
              <legend>Phụ tùng cần cấp</legend>
              <p>
                Kho ghi nhận xuất khi cấp hàng. Việc lập phiếu chưa làm đổi số
                lượng tồn.
              </p>
              {lines.map((line, index) => (
                <div className="part-request-fields part-request-create-line" key={line.key}>
                  <CatalogSelect<Part>
                    path="/parts?status=ACTIVE"
                    label={"Phụ tùng " + (index + 1)}
                    onChange={(part) =>
                      setLines((current) =>
                        current.map((entry) =>
                          entry.key === line.key ? { ...entry, part } : entry,
                        ),
                      )
                    }
                    describe={(part) =>
                      recordLabel(part.sku, part.name, "Phụ tùng chưa có tên") +
                      " · " +
                      part.unit
                    }
                  />
                  <label>
                    Số lượng
                    <input
                      required
                      inputMode="decimal"
                      value={line.input}
                      onChange={(event) => {
                        const input = event.target.value;
                        setLines((current) =>
                          current.map((entry) =>
                            entry.key === line.key
                              ? { ...entry, input }
                              : entry,
                          ),
                        );
                      }}
                    />
                  </label>
                  {lines.length > 1 && (
                    <button
                      type="button"
                      onClick={() =>
                        setLines((current) =>
                          current.filter((entry) => entry.key !== line.key),
                        )
                      }
                    >
                      Bỏ dòng
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                disabled={lines.length >= 50}
                onClick={() => {
                  const key = nextKey.current++;
                  setLines((current) => [...current, { key, input: "" }]);
                }}
              >
                Thêm phụ tùng
              </button>
              <label>
                Lý do
                <textarea name="reason" required maxLength={2000} />
              </label>
              {error && <p role="alert">{error}</p>}
              <button type="submit" className="part-request-primary">Gửi phiếu xin cấp</button>
            </fieldset>
          </form>
        </details>
      )}
    </section>
  );
}
