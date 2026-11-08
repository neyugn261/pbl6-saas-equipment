import { Link } from "react-router-dom";
import { useState } from "react";
import type { Page } from "../../types/domain";
import { DataState, EmptyState } from "./WorkspaceUI";
import {
  formatDate,
  useWorkspaceData,
  value,
  type Row,
} from "./workspace-data";

export default function TechnicianSchedule({
  technicianId,
  excludeOrderId,
}: {
  technicianId: string;
  excludeOrderId?: string;
}) {
  const params = new URLSearchParams({
    technicianId,
    status: "ASSIGNED,ACCEPTED,TRAVELLING,IN_PROGRESS,ON_HOLD",
    page: "1",
    pageSize: "5",
    sort: "scheduledStart",
  });
  const [revision, refresh] = useState(0);
  const state = useWorkspaceData<Page<Row>>(
    "workorders",
    `/work-orders?${params}`,
    revision,
  );
  const rows =
    state.data?.items.filter((row) => row.id !== excludeOrderId) ?? [];
  return (
    <div className="workshop-next">
      <h3>Công việc đang được giao cho người đã chọn</h3>
      <DataState {...state} retry={() => refresh((v) => v + 1)}>
        {rows.length ? (
          <ul className="workshop-schedule-list">
            {rows.map((row) => (
              <li key={String(row.id)}>
                <Link to={`/app/work-orders/${row.id}`}>
                  {value(row.workOrderNo)} · {value(row.title)}
                </Link>
                <span>
                  {formatDate(row.scheduledStart, true)} –{" "}
                  {formatDate(row.scheduledEnd, true)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            title="Không có công việc khác trong phần dữ liệu đang xem"
            description="Chưa đủ để khẳng định người này rảnh trong khung giờ dự kiến."
          />
        )}
      </DataState>
      <p>
        Hiển thị tối đa 5 lệnh đang được giao; cần kiểm tra toàn bộ trước khi
        xác nhận lịch. Hệ thống chưa tự chặn lịch trùng.
      </p>
      <Link
        to={`/app/work-orders?view=list&technicianId=${encodeURIComponent(technicianId)}&status=ASSIGNED,ACCEPTED,TRAVELLING,IN_PROGRESS,ON_HOLD&sort=scheduledStart`}
      >
        Xem toàn bộ công việc của kỹ thuật viên →
      </Link>
    </div>
  );
}
