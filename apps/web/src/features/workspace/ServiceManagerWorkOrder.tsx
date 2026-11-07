import { serviceLabels, workOrderNextStep } from "./service-detail-data";
import { useRef, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { CalendarDays, CircleAlert, UserRound, Wrench } from "lucide-react";
import { api, ApiError } from "../../api/client";
import { getSessionGeneration, useSession } from "../../auth/session";
import { technicianName } from "../../display-names";
import type { Page } from "../../types/domain";
import { WorkOrderChecklist } from "../../routes/ModelPolicyPanels";
import { AttachmentsPanel } from "../attachments/AttachmentsPanel";
import { Badge, DataState, EmptyState, RelatedName } from "./WorkspaceUI";
import {
  asRow,
  formatDate,
  useWorkspaceData,
  value,
  type Row,
} from "./workspace-data";
import {
  BusinessValues,
  RefreshButton,
  ServiceCard,
  ServiceFacts,
  ServiceHeader,
  ServiceLink,
  ServiceNotice,
  ServiceProgress,
  ServiceSections,
} from "./ServiceDetailUI";

type Source = { status: string; data: Row | null };
function Slice({
  source,
  children,
  empty,
}: {
  source: unknown;
  children: (data: unknown) => React.ReactNode;
  empty: string;
}) {
  const section = asRow(source);
  if (
    section.status === "NOT_FOUND" ||
    (section.status === "AVAILABLE" && section.data == null)
  )
    return (
      <EmptyState
        title={empty}
        description="Thông tin sẽ xuất hiện khi có phát sinh được ghi nhận."
      />
    );
  if (section.status !== "AVAILABLE")
    return (
      <ServiceNotice title="Chưa tải được mục này">
        <p>
          {section.status === "RESTRICTED"
            ? "Tài khoản chưa có quyền xem thông tin này."
            : "Nguồn dữ liệu chưa phản hồi. Các thông tin còn lại vẫn có thể xem; dùng Làm mới để thử lại."}
        </p>
      </ServiceNotice>
    );
  return children(section.data);
}
function OrderHistory({ items }: { items: Row[] }) {
  const { profile } = useSession();
  return items.length ? (
    <ol className="sd-history">
      {items.map((item, i) => (
        <li key={value(item.id, String(i))}>
          <strong>
            {serviceLabels[String(item.eventType)] ??
              value(
                item.eventLabel,
                item.newStatus === "CREATED"
                  ? "Tạo lệnh công việc"
                  : item.newStatus
                    ? "Cập nhật trạng thái công việc"
                    : "Cập nhật công việc",
              )}
          </strong>
          {Boolean(item.oldStatus) && (
            <>
              <Badge status={item.oldStatus} /> →{" "}
            </>
          )}
          {Boolean(item.newStatus) && <Badge status={item.newStatus} />}
          <time>
            {formatDate(
              item.occurredAt ?? item.changedAt ?? item.createdAt,
              true,
            )}
          </time>
          <p>
            {value(
              item.actorName ??
                item.changedByName ??
                (String(item.changedBy ?? item.actorId).toLowerCase() ===
                profile?.id?.toLowerCase()
                  ? profile.fullName
                  : null),
              "Nhân viên chưa có tên hiển thị",
            )}
          </p>
          {Boolean(item.reason ?? item.note) && (
            <p>{value(item.reason ?? item.note)}</p>
          )}
        </li>
      ))}
    </ol>
  ) : (
    <EmptyState
      title="Chưa có hoạt động"
      description="Lịch sử sẽ ghi lại các thay đổi của công việc."
    />
  );
}
function localInput(input: unknown) {
  if (!input) return "";
  const parsed = new Date(String(input));
  if (Number.isNaN(parsed.getTime())) return "";
  const p = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(parsed);
  return p.replace(" ", "T");
}
function UsageLedger({ item }: { item: Row }) {
  const snapshot = asRow(item.partSnapshot);
  const warehouse = asRow(item.warehouseSnapshot);
  const returns = Array.isArray(item.returns) ? (item.returns as Row[]) : [];
  const confirmations = Array.isArray(item.confirmations)
    ? (item.confirmations as Row[])
    : [];
  return (
    <details className="sd-usage-ledger">
      <summary>
        {value(snapshot.name, "Phụ tùng chưa có tên")} ·{" "}
        {value(warehouse.name, "Kho chưa có tên")}
      </summary>
      <ServiceFacts
        items={[
          { label: "Mã phụ tùng", value: value(snapshot.sku) },
          { label: "Đơn vị tính", value: value(snapshot.unit) },
          { label: "Xuất lúc", value: formatDate(item.createdAt, true) },
          {
            label: "Chứng từ / ghi chú",
            value: value(item.documentReference ?? item.note, "Chưa ghi nhận"),
          },
        ]}
      />
      <h3>Các lần trả kho</h3>
      {returns.length ? (
        <ol className="sd-history">
          {returns.map((entry, i) => (
            <li key={value(entry.id, String(i))}>
              <strong>
                Trả {value(entry.quantity)} {value(snapshot.unit, "")}
              </strong>
              <time>{formatDate(entry.createdAt, true)}</time>
              <p>
                {entry.condition === "GOOD"
                  ? "Hàng tốt"
                  : entry.condition === "DAMAGED"
                    ? "Hàng hỏng / cần cách ly"
                    : "Chưa ghi nhận tình trạng"}
              </p>
              {Boolean(entry.note) && <p>{value(entry.note)}</p>}
            </li>
          ))}
        </ol>
      ) : (
        <p>Chưa ghi nhận lần trả kho.</p>
      )}
      <h3>Các lần xác nhận sử dụng</h3>
      {confirmations.length ? (
        <ol className="sd-history">
          {confirmations.map((entry, i) => (
            <li key={value(entry.id, String(i))}>
              <strong>
                Xác nhận {value(entry.quantity)} {value(snapshot.unit, "")}
              </strong>
              <time>{formatDate(entry.createdAt, true)}</time>
              {Boolean(entry.note) && <p>{value(entry.note)}</p>}
            </li>
          ))}
        </ol>
      ) : (
        <p>
          Chưa có xác nhận sử dụng. Không suy ra đã sử dụng từ lượng đã xuất.
        </p>
      )}
    </details>
  );
}
export function ManagerOrderActions({
  order,
  id,
  refresh,
}: {
  order: Row;
  id: string;
  refresh: () => void;
}) {
  const allowed = Array.isArray(order.allowedActions)
    ? (order.allowedActions as string[])
    : [];
  const [panel, setPanel] = useState("assign");
  const [technicianId, setTechnicianId] = useState("");
  const [start, setStart] = useState(localInput(order.scheduledStart));
  const [end, setEnd] = useState(localInput(order.scheduledEnd));
  const [reason, setReason] = useState("");
  const [cancelRequest, setCancelRequest] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const lock = useRef(false);
  const generation = getSessionGeneration();
  const [techPage, setTechPage] = useState(1);
  const techs = useWorkspaceData<Page<Row>>(
    "workorders",
    allowed.includes("assign")
      ? `/technicians?page=${techPage}&pageSize=20`
      : null,
  );
  const options = [
    {
      key: "assign",
      label: order.currentTechnicianId
        ? "Phân công lại"
        : "Phân công kỹ thuật viên",
    },
    { key: "update", label: "Điều chỉnh lịch" },
    { key: "cancel", label: "Hủy công việc" },
  ].filter((item) => allowed.includes(item.key));
  const current = options.some((item) => item.key === panel)
    ? panel
    : options[0]?.key;
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (
      lock.current ||
      uncertain ||
      getSessionGeneration() !== generation ||
      !current ||
      !allowed.includes(current)
    )
      return;
    if (current === "assign" && !technicianId) {
      setFeedback("Chọn kỹ thuật viên trước khi phân công.");
      return;
    }
    if (
      current === "update" &&
      (!start || !end || new Date(end) <= new Date(start))
    ) {
      setFeedback("Nhập đủ khung giờ, giờ kết thúc phải sau giờ bắt đầu.");
      return;
    }
    if (current === "cancel" && !reason.trim()) {
      setFeedback("Cần nêu lý do hủy để lưu vào lịch sử.");
      return;
    }
    lock.current = true;
    setBusy(true);
    setFeedback("");
    try {
      await api.workorders(
        `/work-orders/${id}${current === "update" ? "" : `/${current}`}`,
        {
          method: current === "update" ? "PATCH" : "POST",
          body:
            current === "assign"
              ? { technicianId }
              : current === "update"
                ? {
                    scheduledStart: new Date(start + "+07:00").toISOString(),
                    scheduledEnd: new Date(end + "+07:00").toISOString(),
                  }
                : {
                    reason: reason.trim(),
                    cancelServiceRequest: cancelRequest,
                  },
        },
      );
      if (getSessionGeneration() !== generation) return;
      setFeedback("Đã lưu thay đổi. Đang cập nhật hồ sơ.");
      refresh();
    } catch (cause) {
      if (getSessionGeneration() !== generation) return;
      const unknown =
        !(cause instanceof ApiError) ||
        [401, 408].includes(cause.status) ||
        cause.status >= 500;
      if (unknown) {
        setUncertain(true);
        setFeedback(
          "Chưa xác định thao tác đã được ghi nhận hay chưa. Đã khóa gửi lại; hãy làm mới và kiểm tra lịch sử trước khi thao tác tiếp.",
        );
      } else
        setFeedback(
          cause instanceof ApiError && cause.status === 409
            ? "Hồ sơ vừa thay đổi. Làm mới để kiểm tra trước khi thao tác tiếp."
            : cause instanceof ApiError && cause.status === 403
              ? "Tài khoản không có quyền thực hiện thao tác này."
              : cause instanceof Error
                ? cause.message
                : "Không thể lưu thay đổi.",
        );
    } finally {
      lock.current = false;
      if (getSessionGeneration() === generation) setBusy(false);
    }
  }
  if (!options.length)
    return (
      <ServiceNotice title="Hồ sơ chỉ đọc ở trạng thái hiện tại">
        <p>
          Các thao tác hiển thị theo trạng thái và quyền do hệ thống xác nhận.
        </p>
      </ServiceNotice>
    );
  return (
    <ServiceCard
      title="Điều phối công việc"
      description="Chọn một thao tác để mở biểu mẫu phù hợp."
    >
      <div className="sd-action-picker">
        {options.map((option) => (
          <button
            type="button"
            key={option.key}
            aria-pressed={current === option.key}
            disabled={busy}
            onClick={() => {
              setPanel(option.key);
              setFeedback("");
            }}
          >
            {option.label}
          </button>
        ))}
      </div>
      <form className="sd-action-panel" onSubmit={submit}>
        <fieldset disabled={busy || uncertain} className="sd-action-fields">
          {current === "assign" && (
            <>
              <h3>
                {order.currentTechnicianId
                  ? "Chọn người thay thế"
                  : "Chọn kỹ thuật viên"}
              </h3>
              <p>
                Trạng thái sẵn sàng hỗ trợ điều phối; không bảo đảm lịch trống.
                Kiểm tra hồ sơ trước khi phân công.
              </p>
              <label>
                Kỹ thuật viên
                <select
                  required
                  value={technicianId}
                  onChange={(e) => setTechnicianId(e.target.value)}
                >
                  <option value="">Chọn người thực hiện</option>
                  {techs.data?.items
                    .filter((row) =>
                      ["AVAILABLE", "BUSY"].includes(String(row.status)),
                    )
                    .map((row) => (
                      <option key={String(row.id)} value={String(row.id)}>
                        {technicianName(row.fullName, row.employeeCode)} ·{" "}
                        {row.status === "AVAILABLE" ? "Sẵn sàng" : "Đang bận"}
                      </option>
                    ))}
                </select>
              </label>
              {techs.loading && <p role="status">Đang tải kỹ thuật viên…</p>}
              {techs.error && <p role="alert">{techs.error}</p>}
              {techs.data &&
                !techs.data.items.some((row) =>
                  ["AVAILABLE", "BUSY"].includes(String(row.status)),
                ) && (
                  <p>
                    Trang này chưa có kỹ thuật viên có thể phân công. Xem trang
                    tiếp theo hoặc kiểm tra danh sách đội ngũ.
                  </p>
                )}
              {techs.data && techs.data.total > 20 && (
                <div className="ws-actions">
                  <button
                    type="button"
                    disabled={techPage === 1}
                    onClick={() => setTechPage((p) => p - 1)}
                  >
                    Trang trước
                  </button>
                  <span>Trang {techPage}</span>
                  <button
                    type="button"
                    disabled={techPage * 20 >= techs.data.total}
                    onClick={() => setTechPage((p) => p + 1)}
                  >
                    Trang sau
                  </button>
                </div>
              )}
              <ServiceLink to="/app/technicians">
                Xem đội ngũ kỹ thuật
              </ServiceLink>
            </>
          )}
          {current === "update" && (
            <>
              <h3>Lịch thực hiện dự kiến</h3>
              <p>
                Nhập giờ Việt Nam (UTC+7). Khung giờ này chưa phải lịch hẹn được
                khách hàng xác nhận.
              </p>
              <div className="m2-editor">
                <label>
                  Bắt đầu dự kiến
                  <input
                    required
                    type="datetime-local"
                    value={start}
                    onChange={(e) => setStart(e.target.value)}
                  />
                </label>
                <label>
                  Kết thúc dự kiến
                  <input
                    required
                    type="datetime-local"
                    value={end}
                    onChange={(e) => setEnd(e.target.value)}
                  />
                </label>
              </div>
            </>
          )}
          {current === "cancel" && (
            <>
              <h3>Hủy lệnh công việc</h3>
              <p>
                Lệnh đã hủy không tiếp tục thực hiện. Lý do được ghi lại để đối
                soát.
              </p>
              <label>
                Lý do hủy
                <textarea
                  required
                  maxLength={2000}
                  rows={3}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
              {Boolean(order.serviceRequestId) && (
                <label className="sd-check">
                  <input
                    type="checkbox"
                    checked={cancelRequest}
                    onChange={(e) => setCancelRequest(e.target.checked)}
                  />
                  Đồng thời hủy yêu cầu dịch vụ liên quan
                </label>
              )}
              <p>
                {cancelRequest
                  ? "Khách hàng sẽ không tiếp tục được xử lý trên yêu cầu này. Chỉ chọn khi đã thống nhất dừng toàn bộ yêu cầu."
                  : "Yêu cầu dịch vụ được giữ lại; kiểm tra trạng thái của yêu cầu sau khi hủy lệnh."}
              </p>
            </>
          )}
          <button
            className={current === "cancel" ? "sd-danger" : "ws-button"}
            type="submit"
            disabled={
              busy ||
              uncertain ||
              (current === "assign" && (!technicianId || techs.loading))
            }
          >
            {busy
              ? "Đang lưu…"
              : current === "assign"
                ? "Xác nhận phân công"
                : current === "update"
                  ? "Lưu lịch dự kiến"
                  : "Xác nhận hủy lệnh"}
          </button>
        </fieldset>
      </form>
      {feedback && (
        <p role="status" className="sd-feedback">
          {feedback}
        </p>
      )}
      {uncertain && <RefreshButton refresh={refresh} />}
    </ServiceCard>
  );
}
export default function ServiceManagerWorkOrder() {
  const { id = "" } = useParams();
  const [revision, setRevision] = useState(0);
  const refresh = () => setRevision((v) => v + 1);
  const order = useWorkspaceData<Row>(
    "workorders",
    `/work-orders/${id}`,
    revision,
  );
  const row = order.data;
  const detail = useWorkspaceData<Source>(
    "assetM2",
    row?.equipmentId ? `/equipment/${row.equipmentId}/work-orders/${id}` : null,
    revision,
  );
  const equipment = useWorkspaceData<Row>(
    "assetM2",
    row?.equipmentId ? `/equipment/${row.equipmentId}` : null,
    revision,
  );
  const parts = useWorkspaceData<Row[]>(
    "inventory",
    row ? `/work-orders/${id}/parts` : null,
    revision,
  );
  const next = workOrderNextStep(row ?? {});
  const composed = asRow(detail.data?.data);
  const customerId = row?.customerId ?? equipment.data?.customerId;
  return (
    <div className="sd-page m2-page">
      <ServiceHeader
        back="/app/work-orders"
        backLabel="Lệnh công việc"
        code={value(row?.workOrderNo, "HỒ SƠ CÔNG VIỆC")}
        title={value(row?.title, "Chi tiết lệnh công việc")}
        description="Theo dõi quá trình thực hiện, điều phối kỹ thuật viên và kiểm tra kết quả dịch vụ."
        status={row?.status}
        actions={<RefreshButton refresh={refresh} busy={order.loading} />}
      />
      <DataState loading={order.loading} error={order.error} retry={refresh}>
        {row && (
          <>
            <div className="sd-summary">
              <div>
                <small>
                  <Wrench size={13} /> Loại dịch vụ
                </small>
                <strong>
                  {serviceLabels[String(row.type)] ?? value(row.type)}
                </strong>
              </div>
              <div>
                <small>
                  <CircleAlert size={13} /> Mức ưu tiên
                </small>
                <strong className="sd-priority">
                  {serviceLabels[String(row.priority)] ?? value(row.priority)}
                </strong>
              </div>
              <div>
                <small>
                  <UserRound size={13} /> Kỹ thuật viên phụ trách
                </small>
                <strong>
                  {row.currentTechnicianId ? (
                    <Link to={`/app/technicians/${row.currentTechnicianId}`}>
                      {technicianName(
                        row.currentTechnicianName,
                        row.currentTechnicianEmployeeCode,
                      )}
                    </Link>
                  ) : (
                    "Chưa phân công"
                  )}
                </strong>
              </div>
              <div>
                <small>
                  <CalendarDays size={13} /> Bắt đầu dự kiến
                </small>
                <strong>
                  {row.scheduledStart
                    ? formatDate(row.scheduledStart, true)
                    : "Chưa lên lịch"}
                </strong>
              </div>
            </div>
            {row.status !== "CANCELLED" && (
              <ServiceProgress status={row.status} />
            )}
            <ServiceNotice title={next[0]}>
              <p>{next[1]}</p>
            </ServiceNotice>
            <ServiceSections
              items={[
                {
                  key: "overview",
                  label: "Tổng quan",
                  content: (
                    <div className="sd-columns">
                      <div className="sd-stack">
                        <ServiceCard title="Nội dung công việc">
                          <p className="sd-prose">
                            {value(
                              row.description,
                              "Chưa có mô tả chi tiết. Xem yêu cầu dịch vụ để kiểm tra thông tin sự cố.",
                            )}
                          </p>
                          <ServiceFacts
                            items={[
                              {
                                label: "Bắt đầu dự kiến",
                                value: row.scheduledStart
                                  ? formatDate(row.scheduledStart, true)
                                  : "Chưa lên lịch",
                              },
                              {
                                label: "Kết thúc dự kiến",
                                value: row.scheduledEnd
                                  ? formatDate(row.scheduledEnd, true)
                                  : "Chưa lên lịch",
                              },
                              {
                                label: "Tạo lúc",
                                value: formatDate(row.createdAt, true),
                              },
                              {
                                label: "Cập nhật gần nhất",
                                value: formatDate(row.updatedAt, true),
                              },
                            ]}
                          />
                          <p className="sd-muted">
                            Lịch dự kiến chưa phải lịch hẹn đã được khách hàng
                            xác nhận.
                          </p>
                        </ServiceCard>
                        <ManagerOrderActions
                          key={`${id}:${revision}`}
                          order={row}
                          id={id}
                          refresh={refresh}
                        />
                      </div>
                      <aside className="sd-stack">
                        <ServiceCard title="Thiết bị & khách hàng">
                          <DataState
                            loading={equipment.loading}
                            error={equipment.error}
                            retry={refresh}
                          >
                            <ServiceFacts
                              items={[
                                {
                                  label: "Thiết bị",
                                  value: (
                                    <Link
                                      to={`/app/equipment/${row.equipmentId}`}
                                    >
                                      {value(
                                        equipment.data?.displayName,
                                        value(
                                          equipment.data?.assetCode,
                                          "Mở hồ sơ thiết bị",
                                        ),
                                      )}
                                    </Link>
                                  ),
                                },
                                {
                                  label: "Mã tài sản",
                                  value: value(equipment.data?.assetCode),
                                },
                                {
                                  label: "Số serial",
                                  value: value(equipment.data?.serialNumber),
                                },
                                {
                                  label: "Khách hàng",
                                  value: (
                                    <RelatedName
                                      area="organization"
                                      path={
                                        customerId
                                          ? `/customers/${customerId}`
                                          : null
                                      }
                                      to={
                                        customerId
                                          ? `/app/customers/${customerId}`
                                          : undefined
                                      }
                                      fallback="Chưa tải được tên khách hàng"
                                    />
                                  ),
                                },
                                {
                                  label: "Địa điểm",
                                  value: (
                                    <RelatedName
                                      area="organization"
                                      path={
                                        equipment.data?.customerSiteId
                                          ? `/sites/${equipment.data.customerSiteId}`
                                          : null
                                      }
                                      fallback="Chưa tải được địa điểm"
                                    />
                                  ),
                                },
                              ]}
                            />
                          </DataState>
                        </ServiceCard>
                        <ServiceCard title="Hồ sơ liên quan">
                          {Boolean(row.serviceRequestId) && (
                            <ServiceLink
                              to={`/app/service-requests/${row.serviceRequestId}`}
                            >
                              Yêu cầu dịch vụ gốc
                            </ServiceLink>
                          )}
                          {Boolean(row.maintenanceTaskId) && (
                            <ServiceLink
                              to={`/app/maintenance/${row.maintenanceTaskId}?kind=task`}
                            >
                              Công việc bảo trì gốc
                            </ServiceLink>
                          )}
                          <ServiceLink
                            to={`/app/equipment/${row.equipmentId}/timeline`}
                          >
                            Toàn bộ lịch sử thiết bị
                          </ServiceLink>
                        </ServiceCard>
                      </aside>
                    </div>
                  ),
                },
                {
                  key: "execution",
                  label: "Thực hiện & checklist",
                  content: (
                    <div className="sd-stack">
                      <WorkOrderChecklist key={id} id={id} changed={refresh} />
                      <ServiceCard title="Nhật ký thực hiện">
                        <DataState
                          loading={detail.loading}
                          error={detail.error}
                          retry={refresh}
                        >
                          <Slice source={composed.logs} empty="Chưa có nhật ký">
                            {(data) => (
                              <OrderHistory
                                items={
                                  Array.isArray(data) ? (data as Row[]) : []
                                }
                              />
                            )}
                          </Slice>
                        </DataState>
                      </ServiceCard>
                    </div>
                  ),
                },
                {
                  key: "parts",
                  label: "Phụ tùng",
                  content: (
                    <ServiceCard
                      title="Phụ tùng của công việc"
                      description="Phân biệt lượng xuất, lượng trả, xác nhận sử dụng và lượng cần đối soát."
                    >
                      <DataState
                        loading={parts.loading}
                        error={parts.error}
                        retry={refresh}
                      >
                        {Array.isArray(parts.data) && parts.data.length ? (
                          <div className="ws-table-wrap">
                            <table className="ws-table">
                              <thead>
                                <tr>
                                  {[
                                    "Phụ tùng",
                                    "Đã xuất",
                                    "Đã trả",
                                    "Đã xác nhận dùng",
                                    "Chưa đối soát",
                                  ].map((label) => (
                                    <th key={label}>{label}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {parts.data.map((item) => (
                                  <tr key={String(item.id)}>
                                    <td data-label="Phụ tùng">
                                      <strong>
                                        {value(
                                          asRow(item.partSnapshot).name,
                                          "Phụ tùng chưa có tên",
                                        )}
                                      </strong>
                                      <small>
                                        {value(
                                          asRow(item.partSnapshot).sku,
                                          "",
                                        )}
                                      </small>
                                    </td>
                                    <td data-label="Đã xuất">
                                      {value(
                                        item.quantityIssued,
                                        "Chưa có số liệu",
                                      )}
                                    </td>
                                    <td data-label="Đã trả">
                                      {value(
                                        item.quantityReturned,
                                        "Chưa có số liệu",
                                      )}
                                    </td>
                                    <td data-label="Đã xác nhận dùng">
                                      {value(
                                        item.quantityConfirmedUsed,
                                        "Chưa có số liệu",
                                      )}
                                    </td>
                                    <td data-label="Chưa đối soát">
                                      {value(
                                        item.quantityUnreconciled,
                                        "Chưa có số liệu",
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <EmptyState
                            title="Chưa ghi nhận phụ tùng"
                            description="Các lần xuất và trả kho gắn với lệnh này sẽ xuất hiện tại đây."
                          />
                        )}
                        {Array.isArray(parts.data) &&
                          parts.data.map((item) => (
                            <UsageLedger key={String(item.id)} item={item} />
                          ))}
                      </DataState>
                      <p className="sd-muted">
                        Việc xuất/nhận trả và đối soát do người có quyền kho
                        hoặc kỹ thuật viên thực hiện. Chưa có thông tin chi phí
                        không đồng nghĩa phụ tùng miễn phí.
                      </p>
                    </ServiceCard>
                  ),
                },
                {
                  key: "report",
                  label: "Báo cáo dịch vụ",
                  content: (
                    <ServiceCard
                      title="Kết quả xử lý"
                      description="Báo cáo phản ánh kết quả kỹ thuật đã được nộp."
                    >
                      <DataState
                        loading={detail.loading}
                        error={detail.error}
                        retry={refresh}
                      >
                        <Slice
                          source={composed.report}
                          empty="Chưa có báo cáo dịch vụ"
                        >
                          {(data) => {
                            const report = asRow(data);
                            return (
                              <>
                                <ServiceFacts
                                  items={[
                                    {
                                      label: "Kết quả",
                                      value:
                                        serviceLabels[String(report.result)] ??
                                        value(report.result),
                                    },
                                    {
                                      label: "Ngày nộp",
                                      value: formatDate(
                                        report.submittedAt,
                                        true,
                                      ),
                                    },
                                  ]}
                                />
                                {[
                                  ["problemDescription", "Sự cố"],
                                  ["rootCause", "Nguyên nhân"],
                                  ["solution", "Giải pháp"],
                                  ["customerSummary", "Tóm tắt cho khách hàng"],
                                ].map(([key, label]) => (
                                  <div key={key}>
                                    <h3>{label}</h3>
                                    <p className="sd-prose">
                                      {value(report[key], "Chưa ghi nhận")}
                                    </p>
                                  </div>
                                ))}
                                <AttachmentsPanel
                                  kind="SERVICE_REPORT"
                                  workOrderId={id}
                                />
                              </>
                            );
                          }}
                        </Slice>
                      </DataState>
                    </ServiceCard>
                  ),
                },
                {
                  key: "history",
                  label: "Phân công & lịch sử",
                  content: (
                    <div className="sd-columns">
                      <ServiceCard title="Thay đổi trạng thái">
                        <DataState
                          loading={detail.loading}
                          error={detail.error}
                          retry={refresh}
                        >
                          <Slice
                            source={composed.history}
                            empty="Chưa có thay đổi trạng thái"
                          >
                            {(data) => (
                              <OrderHistory
                                items={
                                  Array.isArray(data) ? (data as Row[]) : []
                                }
                              />
                            )}
                          </Slice>
                        </DataState>
                      </ServiceCard>
                      <ServiceCard title="Lịch sử phân công">
                        <DataState
                          loading={detail.loading}
                          error={detail.error}
                          retry={refresh}
                        >
                          <Slice
                            source={composed.assignments}
                            empty="Chưa phân công"
                          >
                            {(data) =>
                              Array.isArray(data) && data.length ? (
                                <ol className="sd-history">
                                  {(data as Row[]).map((item) => (
                                    <li key={String(item.id)}>
                                      <Link
                                        to={`/app/technicians/${item.technicianId}`}
                                      >
                                        {technicianName(
                                          item.technicianName,
                                          item.technicianEmployeeCode,
                                        )}
                                      </Link>
                                      <p>
                                        {serviceLabels[String(item.status)] ?? (
                                          <Badge status={item.status} />
                                        )}
                                      </p>
                                      <ServiceFacts
                                        items={[
                                          {
                                            label: "Phân công lúc",
                                            value: formatDate(
                                              item.assignedAt,
                                              true,
                                            ),
                                          },
                                          {
                                            label: "Nhận việc lúc",
                                            value: formatDate(
                                              item.acceptedAt,
                                              true,
                                            ),
                                          },
                                          {
                                            label: "Gỡ phân công lúc",
                                            value: formatDate(
                                              item.unassignedAt,
                                              true,
                                            ),
                                          },
                                        ]}
                                      />
                                      {Boolean(item.reason) && (
                                        <BusinessValues data={item.reason} />
                                      )}
                                    </li>
                                  ))}
                                </ol>
                              ) : (
                                <EmptyState
                                  title="Chưa phân công"
                                  description="Chọn kỹ thuật viên trong mục Tổng quan để bắt đầu."
                                />
                              )
                            }
                          </Slice>
                        </DataState>
                      </ServiceCard>
                    </div>
                  ),
                },
                {
                  key: "files",
                  label: "Tài liệu & hình ảnh",
                  content: (
                    <ServiceCard
                      title="Tệp đính kèm công việc"
                      description="Ảnh hiện trường và tài liệu liên quan được lưu theo từng công việc."
                    >
                      <AttachmentsPanel kind="WORK_ORDER" workOrderId={id} />
                    </ServiceCard>
                  ),
                },
              ]}
            />
          </>
        )}
      </DataState>
    </div>
  );
}
