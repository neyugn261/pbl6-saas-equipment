import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Plus, RefreshCw } from "lucide-react";
import { useSession } from "../../auth/session";
import type { Page } from "../../types/domain";
import { PriorityBadge } from "../../components/Badges";
import {
  Badge,
  DataState,
  EmptyState,
  PageHeading,
  RelatedName,
} from "./WorkspaceUI";
import {
  asRow,
  formatDate,
  useWorkspaceData,
  value,
  type Row,
} from "./workspace-data";
import {
  recordAge,
  requestResponsibility,
  serviceLabels,
  workOrderNextStep,
} from "./service-detail-data";
import {
  decisionGroups,
  decisionQueues,
  queuePath,
  queueListPath,
  queueRecordPath,
  type DecisionQueue,
} from "./decision-queues";
import RequestCoveragePreview from "./RequestCoveragePreview";
import RequestFollowUpQueue from "./RequestFollowUpQueue";

function AcceptedRequestOrders({
  requestId,
  revision,
}: {
  requestId: string;
  revision: number;
}) {
  const [local, refresh] = useState(0);
  const data = useWorkspaceData<Page<Row>>(
    "workorders",
    `/work-orders?${new URLSearchParams({ serviceRequestId: requestId, status: "CREATED,ASSIGNED,ACCEPTED,TRAVELLING,IN_PROGRESS,ON_HOLD", page: "1", pageSize: "5" })}`,
    revision + local,
  );
  return (
    <div className="workshop-next">
      <h3>Kiểm tra lệnh đang mở</h3>
      <DataState {...data} retry={() => refresh((v) => v + 1)}>
        {data.data?.items.length ? (
          <>
            <p>
              Đã tìm thấy lệnh đang mở. Kiểm tra việc đồng bộ yêu cầu trước khi
              tạo thêm.
            </p>
            {data.data.items.map((row) => (
              <Link
                key={String(row.id)}
                className="sd-related-link"
                to={`/app/work-orders/${row.id}`}
              >
                {value(row.workOrderNo)} <Badge status={row.status} />
              </Link>
            ))}
          </>
        ) : (
          <p>
            Chưa tìm thấy lệnh đang mở tại lần đọc này. Lệnh vừa tạo có thể đang
            chờ đồng bộ; mở hồ sơ để kiểm tra lệnh liên quan và lịch sử trước
            khi tạo mới.
          </p>
        )}
      </DataState>
    </div>
  );
}
function MaintenanceAttention({ revision }: { revision: number }) {
  const data = useWorkspaceData<Row>(
    "maintenance",
    "/maintenance-summary",
    revision,
  );
  return (
    <section className="workshop-next" aria-label="Bảo trì cần chú ý">
      <h3>Bảo trì cần chú ý</h3>
      {data.error ? (
        <p>Chưa tải được tổng hợp bảo trì.</p>
      ) : (
        <p>
          {data.loading ? (
            "Đang tải…"
          ) : (
            <>
              Công việc mở quá hạn:{" "}
              {value(data.data?.overdueOpenTaskCount, "—")} · Kế hoạch đến hạn
              chưa tạo công việc:{" "}
              {value(data.data?.duePlansAwaitingScheduler, "—")}
            </>
          )}
        </p>
      )}
      <Link to="/app/maintenance">Mở kế hoạch và công việc bảo trì →</Link>
    </section>
  );
}
export function QueueContents({
  queue,
  sort,
  revision,
  refresh,
}: {
  queue: DecisionQueue;
  sort: string;
  revision: number;
  refresh: () => void;
}) {
  const [selected, select] = useState("");
  const state = useWorkspaceData<Page<Row>>(
    queue.area,
    queuePath(queue, sort),
    revision,
  );
  const rows = state.data?.items ?? [],
    row = rows.find((item) => item.id === selected) ?? rows[0];
  const snapshot = asRow(row?.snapshot);
  const request = queue.kind === "request";
  const code = (item: Row) =>
    value(
      item.requestNo ?? item.workOrderNo ?? item.handoverNo ?? item.taskNo,
      "Hồ sơ dịch vụ",
    );
  const title = (item: Row) =>
    value(
      item.title ?? item.name ?? asRow(item.snapshot).name,
      "Hồ sơ thiết bị / dịch vụ",
    );
  const who = request
    ? requestResponsibility(row?.status)[0]
    : queue.kind === "handover"
      ? "Quản trị khách hàng"
      : queue.kind === "task"
        ? "Bộ phận dịch vụ"
        : row?.status === "CREATED"
          ? "Điều phối viên"
          : "Đội ngũ thực hiện";
  return (
    <div className="workshop-decision-layout">
      <section
        className="ws-card workshop-decision-queue"
        aria-label={queue.name}
      >
        <div className="ws-card-header">
          <div>
            <h2>{queue.name}</h2>
            <p>
              {state.loading
                ? "Đang tải…"
                : state.error
                  ? "Chưa có số liệu"
                  : `Đang xem ${rows.length} trong ${state.data?.total ?? "—"} hồ sơ`}
            </p>
          </div>
        </div>
        <DataState {...state} retry={refresh}>
          {rows.length ? (
            <div className="workshop-queue-items">
              {rows.map((item) => (
                <button
                  key={String(item.id)}
                  type="button"
                  className="workshop-queue-item"
                  aria-pressed={row?.id === item.id}
                  onClick={() => select(String(item.id))}
                >
                  <span className="workshop-code">{code(item)}</span>
                  <strong>{title(item)}</strong>
                  <span>
                    <Badge
                      status={item.status}
                      label={
                        request && item.status === "ACCEPTED"
                          ? "Đã tiếp nhận"
                          : undefined
                      }
                    />
                    {Boolean(item.priority) && (
                      <PriorityBadge priority={String(item.priority)} />
                    )}
                  </span>
                  {item.resolutionResult === "UNRESOLVED" && (
                    <small className="workshop-outcome-warning">Cần xem lại: lần xử lý trước chưa giải quyết được sự cố.</small>
                  )}
                  <small>
                    {recordAge(item.createdAt)} · Cập nhật{" "}
                    {formatDate(item.updatedAt ?? item.createdAt, true)}
                  </small>
                </button>
              ))}
            </div>
          ) : (
            <EmptyState
              title="Chưa có hồ sơ phù hợp"
              description="Chọn nhóm khác để tiếp tục công việc. Đây là kết quả theo bộ lọc hiện tại."
            />
          )}
        </DataState>
        <div className="workshop-queue-footer">
          <Link className="ws-text-link" to={queueListPath(queue, sort)}>
            Xem danh sách đầy đủ <ArrowRight size={14} />
          </Link>
        </div>
      </section>
      <section
        className="ws-card workshop-reading"
        aria-label="Thông tin hồ sơ đang chọn"
        aria-live="polite"
      >
        {state.loading || state.error ? (
          <DataState {...state} retry={refresh}>
            {null}
          </DataState>
        ) : row ? (
          <>
            <div className="workshop-reading-head">
              <span className="workshop-code">{code(row)}</span>
              <Badge
                status={row.status}
                label={
                  request && row.status === "ACCEPTED"
                    ? "Đã tiếp nhận"
                    : undefined
                }
              />
            </div>
            <h2>{title(row)}</h2>
            <p className="workshop-customer">
              <RelatedName
                area="organization"
                path={row.customerId ? `/customers/${row.customerId}` : null}
                initial={row.customerName ?? snapshot.customerName}
                fallback="Khách hàng: xem hồ sơ nguồn"
              />
            </p>
            <dl className="sd-facts workshop-reading-facts">
              <div>
                <dt>Thiết bị</dt>
                <dd>
                  <RelatedName
                    area="assetM2"
                    path={
                      row.equipmentId ? `/equipment/${row.equipmentId}` : null
                    }
                    initial={row.equipmentName ?? snapshot.assetCode}
                    fallback="Xem thiết bị trong hồ sơ"
                  />
                </dd>
              </div>
              <div>
                <dt>Bên cần phối hợp / hành động</dt>
                <dd>{who}</dd>
              </div>
              <div>
                <dt>Thời gian theo dõi</dt>
                <dd>
                  {recordAge(row.createdAt)}
                  <small>
                    Cập nhật {formatDate(row.updatedAt ?? row.createdAt, true)}.
                    Tuổi hồ sơ không phải thời gian ở trạng thái hiện tại hoặc
                    cam kết SLA.
                  </small>
                </dd>
              </div>
              <div>
                <dt>
                  {queue.kind === "handover"
                    ? "Hạn xác nhận"
                    : "Lịch / thời điểm ghi nhận"}
                </dt>
                <dd>
                  {formatDate(
                    row.expiresAt ??
                      row.scheduledStart ??
                      row.scheduledDate ??
                      row.createdAt,
                    true,
                  )}
                </dd>
              </div>
            </dl>
            <h3>Thông tin đã ghi nhận</h3>
            <p className="workshop-description">
              {value(
                row.description ?? snapshot.notes,
                "Mở hồ sơ nguồn để xem mô tả, trao đổi và bằng chứng đầy đủ.",
              )}
            </p>
            {request && (
              <RequestCoveragePreview
                key={String(row.id)}
                requestId={String(row.id)}
              />
            )}
            {row.status === "ACCEPTED" && request && (
              <AcceptedRequestOrders
                key={String(row.id)}
                requestId={String(row.id)}
                revision={revision}
              />
            )}
            {Boolean(row.resolutionResult) && (
              <div className="workshop-outcome-warning">
                <strong>
                  Kết quả:{" "}
                  {serviceLabels[String(row.resolutionResult)] ??
                    value(row.resolutionResult)}
                </strong>
                <p>
                  {value(
                    row.resolutionSummary,
                    "Xem báo cáo và phần còn lại trước khi xác nhận.",
                  )}
                </p>
              </div>
            )}
            <div className="workshop-next">
              <span className="ws-eyebrow">BƯỚC TIẾP THEO</span>
              <h3>
                {request
                  ? requestResponsibility(row.status)[1]
                  : queue.kind === "order"
                    ? workOrderNextStep(row)[0]
                    : "Kiểm tra hồ sơ và phản hồi liên quan"}
              </h3>
              <p>{queue.guidance}</p>
            </div>
            <Link className="ws-button" to={queueRecordPath(queue, row)}>
              Mở hồ sơ và xử lý <ArrowRight size={15} />
            </Link>
          </>
        ) : (
          <EmptyState
            title="Chọn nhóm có hồ sơ cần theo dõi"
            description="Thông tin và bước tiếp theo sẽ xuất hiện tại đây."
          />
        )}
      </section>
    </div>
  );
}
export default function ServiceDecisionDesk() {
  const { profile } = useSession();
  const [groupKey, setGroup] = useState("mine"),
    [queueKey, setQueue] = useState("review"),
    [sort, setSort] = useState("createdAt"),
    [revision, setRevision] = useState(0);
  const options = decisionQueues.filter((item) => item.group === groupKey),
    queue = options.find((item) => item.key === queueKey) ?? options[0];
  const refresh = () => setRevision((v) => v + 1);
  return (
    <div className="ws-page workshop-desk">
      <RequestFollowUpQueue />
      <PageHeading
        eyebrow="BÀN ĐIỀU HÀNH DỊCH VỤ"
        title="Việc cần quyết định."
        description={`Chào ${profile?.fullName ?? "bạn"}. Theo dõi ai cần hành động, việc đang chờ và kết quả cần xem lại.`}
        actions={
          <>
            <button
              className="ws-button ws-button--secondary"
              onClick={refresh}
            >
              <RefreshCw size={15} />
              Cập nhật
            </button>
            <Link className="ws-button" to="/app/service-requests/new">
              <Plus size={16} />
              Tạo yêu cầu dịch vụ
            </Link>
          </>
        }
      />
      <div
        className="workshop-signals workshop-signals--categories"
        role="group"
        aria-label="Nhóm trách nhiệm"
      >
        {decisionGroups.map((group) => (
          <button
            key={group.key}
            type="button"
            aria-pressed={groupKey === group.key}
            onClick={() => {
              setGroup(group.key);
              setQueue(
                decisionQueues.find((queue) => queue.group === group.key)!.key,
              );
            }}
          >
            <strong>{group.name}</strong>
            <small>{group.hint}</small>
          </button>
        ))}
      </div>
      <div className="workshop-desk-toolbar">
        <label>
          Việc đang theo dõi
          <select
            value={queue.key}
            onChange={(event) => setQueue(event.target.value)}
          >
            {options.map((item) => (
              <option key={item.key} value={item.key}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        {["request", "order"].includes(queue.kind) && (
          <label>
            Thứ tự xem
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value)}
            >
              <option value="createdAt">Hồ sơ cũ trước</option>
              <option value="-priority">Ưu tiên cao trước</option>
              <option value="-createdAt">Hồ sơ mới trước</option>
            </select>
          </label>
        )}
      </div>
      <QueueContents
        key={`${queue.key}:${sort}`}
        queue={queue}
        sort={sort}
        revision={revision}
        refresh={refresh}
      />
      <MaintenanceAttention revision={revision} />
      <section className="workshop-desk-links" aria-label="Tra cứu nhanh">
        <Link to="/app/equipment">
          <strong>Hồ sơ từng thiết bị</strong>
          <span>
            Nhận dạng, bảo hành, lịch sử & phụ tùng <ArrowRight size={15} />
          </span>
        </Link>
        <Link to="/app/maintenance">
          <strong>Bảo trì định kỳ</strong>
          <span>
            Kế hoạch & công việc <ArrowRight size={15} />
          </span>
        </Link>
        <Link to="/app/reports">
          <strong>Khối lượng dịch vụ</strong>
          <span>
            Số liệu công việc đã ghi nhận <ArrowRight size={15} />
          </span>
        </Link>
      </section>
    </div>
  );
}
