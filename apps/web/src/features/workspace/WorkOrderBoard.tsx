import { Link } from "react-router-dom";
import { ArrowRight, CalendarDays, UserRound } from "lucide-react";
import type { Page } from "../../types/domain";
import { PriorityBadge } from "../../components/Badges";
import {
  Badge,
  DataState,
  EmptyState,
  RelatedName,
  EquipmentIdentity,
} from "./WorkspaceUI";
import {
  asRow,
  formatDate,
  useWorkspaceData,
  value,
  type Row,
} from "./workspace-data";
import { workOrderNextStep, recordAge } from "./service-detail-data";

const lanes = [
  { title: "Chờ phân công", status: "CREATED" },
  { title: "Chờ nhận việc", status: "ASSIGNED" },
  { title: "Đang thực hiện", status: "ACCEPTED,TRAVELLING,IN_PROGRESS" },
  { title: "Tạm dừng", status: "ON_HOLD" },
];

function WorkOrderLane({
  title,
  status,
  filters,
  revision,
  refresh,
}: {
  title: string;
  status: string;
  filters: URLSearchParams;
  revision: number;
  refresh: () => void;
}) {
  const params = new URLSearchParams({ page: "1", pageSize: "4", status });
  for (const key of [
    "q",
    "priority",
    "type",
    "technicianId",
    "customerId",
    "equipmentId",
    "scheduledFrom",
    "scheduledTo",
    "sort",
  ])
    if (filters.get(key)) params.set(key, filters.get(key)!);
  const state = useWorkspaceData<Page<Row>>(
    "workorders",
    `/work-orders?${params}`,
    revision,
  );
  const listParams = new URLSearchParams(params);
  listParams.delete("page");
  listParams.delete("pageSize");
  listParams.set("view", "list");
  return (
    <section className="workshop-board-lane" aria-label={title}>
      <header>
        <h2>{title}</h2>
        <span className="workshop-code" aria-label="Tổng số công việc">
          {state.loading ? "…" : state.error ? "—" : (state.data?.total ?? "—")}
        </span>
      </header>
      <DataState {...state} retry={refresh}>
        {state.data?.items.length ? (
          state.data.items.map((row) => (
            <article className="workshop-job" key={String(row.id)}>
              <div className="workshop-job-top">
                <span className="workshop-code">{value(row.workOrderNo)}</span>
                <PriorityBadge priority={String(row.priority ?? "NORMAL")} />
              </div>
              <h3>
                <Link to={`/app/work-orders/${row.id}`}>
                  {value(row.title, "Công việc dịch vụ")}
                </Link>
              </h3>
              <div className="workshop-job-equipment">
                <EquipmentIdentity equipmentId={row.equipmentId} />
              </div>
              <p className="workshop-job-customer">
                <RelatedName
                  area="organization"
                  path={row.customerId ? `/customers/${row.customerId}` : null}
                  initial={row.customerName}
                  fallback="Xem khách hàng trong hồ sơ"
                />
              </p>
              <p className="workshop-job-customer">
                Địa điểm công việc:{" "}
                <RelatedName
                  area="organization"
                  path={
                    row.customerSiteId ? `/sites/${row.customerSiteId}` : null
                  }
                  fallback="Chưa tải được địa điểm của lệnh"
                />
              </p>
              <p className="workshop-job-customer">
                {recordAge(row.createdAt)}
              </p>
              <div className="workshop-job-line">
                <CalendarDays size={14} aria-hidden="true" />
                <span>
                  {row.scheduledStart
                    ? formatDate(row.scheduledStart, true)
                    : "Chưa có lịch dự kiến"}
                </span>
              </div>
              <div className="workshop-job-line">
                <UserRound size={14} aria-hidden="true" />
                <span>
                  {row.currentTechnicianId ? (
                    <RelatedName
                      area="workorders"
                      path={`/technicians/${row.currentTechnicianId}`}
                      initial={
                        row.currentTechnicianName ??
                        asRow(row.currentAssignment).technicianName
                      }
                    />
                  ) : ["COMPLETED", "CANCELLED"].includes(
                      String(row.status),
                    ) ? (
                    "Xem lịch sử phân công"
                  ) : (
                    "Chưa phân công"
                  )}
                </span>
              </div>
              <Badge status={row.status} />
              <footer>
                <span>{workOrderNextStep(row)[0]}</span>
                <Link
                  to={`/app/work-orders/${row.id}`}
                  aria-label={`Xem ${value(row.workOrderNo, "công việc")}`}
                >
                  <ArrowRight size={17} />
                </Link>
              </footer>
            </article>
          ))
        ) : (
          <EmptyState
            title="Chưa có công việc"
            description="Không có bản ghi phù hợp với nhóm và bộ lọc hiện tại."
          />
        )}
      </DataState>
      <Link
        className="workshop-lane-more"
        to={`/app/work-orders?${listParams}`}
      >
        Xem danh sách đầy đủ <ArrowRight size={14} />
      </Link>
    </section>
  );
}

export default function WorkOrderBoard({
  filters,
  revision,
  refresh,
}: {
  filters: URLSearchParams;
  revision: number;
  refresh: () => void;
}) {
  const status = filters.get("status");
  const visible = status
    ? [{ title: "Kết quả theo bộ lọc trạng thái", status }]
    : lanes;
  return (
    <div className="workshop-board-area">
      <p className="workshop-board-caption">
        Mỗi nhóm hiển thị tối đa 4 công việc; số ở đầu nhóm là tổng theo bộ lọc.
        Công việc hoàn tất và đã hủy có trong danh sách đầy đủ.
      </p>
      <div
        className={`workshop-board ${visible.length === 1 ? "workshop-board--single" : ""}`}
      >
        {visible.map((lane) => (
          <WorkOrderLane
            key={lane.status}
            {...lane}
            filters={filters}
            revision={revision}
            refresh={refresh}
          />
        ))}
      </div>
    </div>
  );
}
