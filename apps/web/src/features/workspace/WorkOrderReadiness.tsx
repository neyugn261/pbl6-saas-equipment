import { Link } from "react-router-dom";
import { useState } from "react";
import { useSession } from "../../auth/session";
import { DataState } from "./WorkspaceUI";
import {
  formatDate,
  useWorkspaceData,
  value,
  type Row,
} from "./workspace-data";
import { isPositiveQuantity, serviceLabels } from "./service-detail-data";

export default function WorkOrderReadiness({
  order,
  equipment,
  parts,
  partsUnavailable,
  revision = 0,
}: {
  order: Row;
  equipment?: Row;
  parts?: Row[];
  partsUnavailable?: boolean;
  revision?: number;
}) {
  const { profile } = useSession();
  const [localVersion, refresh] = useState(0);
  const report = useWorkspaceData<Row | null>(
    "workorders",
    order.status === "COMPLETED"
      ? `/work-orders/${order.id}/service-report`
      : null,
    revision + localVersion,
  );
  const request = useWorkspaceData<Row>(
    "requestsLive",
    order.serviceRequestId
      ? `/service-requests/${order.serviceRequestId}`
      : null,
    revision + localVersion,
  );
  const unreconciled = parts?.filter((item) =>
    isPositiveQuantity(item.quantityUnreconciled),
  ).length;
  const condition =
    (
      {
        UNKNOWN: "Chưa xác nhận tình trạng",
        OPERATIONAL: "Đã xác nhận hoạt động",
        DEGRADED: "Đã xác nhận suy giảm",
        NOT_OPERATIONAL: "Đã xác nhận không hoạt động",
      } as Record<string, string>
    )[String(equipment?.operationalStatus)] ??
    "Chưa tải được tình trạng vận hành";
  const canRecover = profile?.roles.some((role) =>
    ["TENANT_ADMIN", "INVENTORY_STAFF"].includes(role),
  );
  return (
    <section
      className="workshop-readiness"
      aria-label="Kết quả và các bước còn cần kiểm tra"
    >
      <div>
        <small>Công việc kỹ thuật</small>
        <strong>
          {order.status === "COMPLETED"
            ? "Đã kết thúc công việc"
            : order.status === "CANCELLED"
              ? "Đã hủy lệnh"
              : "Đang theo dõi thực hiện"}
        </strong>
        <span>
          {order.completedAt
            ? formatDate(order.completedAt, true)
            : "Trạng thái lệnh không thay thế kết luận kỹ thuật."}
        </span>
      </div>
      <div>
        <small>Kết quả sửa chữa</small>
        <strong>
          {report.loading
            ? "Đang tải kết quả…"
            : report.error
              ? "Chưa tải được kết quả"
              : report.data?.result
                ? (serviceLabels[String(report.data.result)] ??
                  "Cần xem báo cáo")
                : "Chưa có kết quả được nộp"}
        </strong>
        <span>
          {value(
            report.data?.customerSummary ?? report.data?.customerNote,
            "Kết quả được ghi trong báo cáo dịch vụ.",
          )}
        </span>
      </div>
      <div>
        <small>Tình trạng vận hành của máy</small>
        <strong>{condition}</strong>
        <span>
          {equipment?.operationalStatusUpdatedAt
            ? `Xác nhận ${formatDate(equipment.operationalStatusUpdatedAt, true)}`
            : "Không tự suy ra từ việc hoàn tất lệnh."}
        </span>
      </div>
      <div>
        <small>Yêu cầu của khách hàng</small>
        <strong>
          {!order.serviceRequestId
            ? order.maintenanceTaskId
              ? "Nguồn bảo trì định kỳ"
              : "Không có yêu cầu dịch vụ liên kết"
            : request.loading
              ? "Đang tải…"
              : request.error
                ? "Chưa tải được xác nhận"
                : request.data?.status === "CLOSED"
                  ? "Yêu cầu đã được xác nhận khép lại"
                  : request.data?.status === "RESOLVED"
                    ? "Đang chờ xác nhận kết quả"
                    : request.data?.status === "ACCEPTED" ||
                        request.data?.status === "REVIEWING"
                      ? "Cần tiếp tục xem xét / xử lý"
                      : "Chưa có xác nhận khép yêu cầu"}
        </strong>
        {Boolean(order.serviceRequestId) && (
          <Link to={`/app/service-requests/${order.serviceRequestId}`}>
            Xem yêu cầu và lịch sử xác nhận →
          </Link>
        )}
      </div>
      <div className="workshop-readiness-wide">
        <small>Đối soát phụ tùng</small>
        <strong>
          {partsUnavailable || !parts
            ? "Chưa tải được thông tin đối soát"
            : unreconciled
              ? `${unreconciled} dòng phụ tùng còn lượng chưa đối soát`
              : "Không thấy lượng chưa đối soát trong dữ liệu vừa tải"}
        </strong>
        <span>
          Xuất kho, xác nhận sử dụng và trả kho được ghi riêng. Xác nhận dùng
          phụ tùng có thể được ghi sau khi nộp báo cáo; chưa có xác nhận không
          được coi là đã dùng.
        </span>
        {canRecover ? (
          <Link to={`/app/inventory/transactions?workOrderId=${order.id}`}>
            Mở giao dịch kho của công việc →
          </Link>
        ) : (
          <span>
            Cần phối hợp nhân viên kho khi giao dịch đang chờ đồng bộ hoặc chưa
            rõ kết quả.
          </span>
        )}
      </div>
      {(report.data?.result === "PARTIALLY_RESOLVED" ||
        report.data?.result === "UNRESOLVED") && (
        <p className="workshop-outcome-warning">
          {report.data.result === "PARTIALLY_RESOLVED"
            ? "Mới xử lý một phần. Đọc rõ phần còn lại và thống nhất bước tiếp theo trước khi xác nhận kết quả với khách."
            : "Chưa xử lý được sự cố. Công việc đã kết thúc nhưng yêu cầu còn cần được tiếp tục giải quyết."}
        </p>
      )}
      {(report.error || request.error) && (
        <DataState
          loading={false}
          error={report.error ?? request.error}
          retry={() => refresh((v) => v + 1)}
        >
          {null}
        </DataState>
      )}
    </section>
  );
}

export function WorkOrderLocation({ order }: { order: Row }) {
  const siteId =
    typeof order.customerSiteId === "string" ? order.customerSiteId : null;
  const site = useWorkspaceData<Row>(
    "organization",
    siteId ? `/sites/${siteId}` : null,
  );
  const locations = useWorkspaceData<Row[]>(
    "organization",
    siteId && order.locationId ? `/sites/${siteId}/locations` : null,
  );
  const location = locations.data?.find((item) => item.id === order.locationId);
  return (
    <>
      <p>
        <strong>Địa chỉ phục vụ theo địa điểm của lệnh</strong>
        <br />
        {site.error
          ? "Chưa tải được địa chỉ"
          : value(site.data?.address, "Chưa có địa chỉ được ghi nhận")}
      </p>
      <p>
        Vị trí cụ thể:{" "}
        {locations.error
          ? "Chưa tải được vị trí"
          : value(location?.name, "Chưa có tên vị trí của lệnh")}
      </p>
      <p className="sd-muted">
        Tên và địa chỉ được tra cứu hiện tại theo địa điểm đã lưu trong lệnh; hồ
        sơ này không tự chứng minh địa chỉ tại thời điểm lịch sử.
      </p>
    </>
  );
}
