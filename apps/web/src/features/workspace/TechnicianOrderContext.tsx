import { Link } from "react-router-dom";
import { useState } from "react";
import { DataState, RelatedName } from "./WorkspaceUI";
import { ServiceCard } from "./ServiceDetailUI";
import { useWorkspaceData, value, type Row } from "./workspace-data";
import WorkOrderReadiness from "./WorkOrderReadiness";

export default function TechnicianOrderContext({
  order,
  revision,
}: {
  order: Row;
  revision: number;
}) {
  const [local, refresh] = useState(0);
  const equipment = useWorkspaceData<Row>(
    "assetM2",
    order.equipmentId ? `/equipment/${order.equipmentId}` : null,
    revision + local,
  );
  const parts = useWorkspaceData<Row[]>(
    "inventory",
    `/work-orders/${order.id}/parts`,
    revision + local,
  );
  return (
    <>
      <ServiceCard
        title="Thiết bị cần phục vụ"
        description="Đối chiếu mã máy và serial tại hiện trường trước khi thực hiện."
      >
        <DataState {...equipment} retry={() => refresh((value) => value + 1)}>
          <h2>{value(equipment.data?.displayName, "Chưa có tên thiết bị")}</h2>
          <p>
            Mã máy: {value(equipment.data?.assetCode)} · Serial:{" "}
            {value(equipment.data?.serialNumber)}
          </p>
          {Boolean(order.equipmentId) && (
            <Link
              className="sd-related-link"
              to={`/app/equipment/${order.equipmentId}`}
            >
              Đọc hồ sơ, bảo hành và các lần sửa trước →
            </Link>
          )}
          {Boolean(
            order.customerSiteId &&
            equipment.data?.customerSiteId &&
            equipment.data.customerSiteId !== order.customerSiteId,
          ) && (
            <p>
              Thiết bị hiện ở địa điểm khác với lệnh:{" "}
              <RelatedName
                area="organization"
                path={`/sites/${equipment.data?.customerSiteId}`}
                fallback="Chưa tải được tên địa điểm hiện tại"
              />
              . Kiểm tra lại với điều phối trước khi di chuyển.
            </p>
          )}
          {!order.customerSiteId && (
            <p>
              Lệnh chưa ghi nhận địa điểm phục vụ. Xác minh với điều phối trước
              khi di chuyển; không tự lấy địa điểm hiện tại của máy thay cho
              lệnh.
            </p>
          )}
        </DataState>
      </ServiceCard>
      <WorkOrderReadiness
        order={order}
        equipment={equipment.data}
        parts={parts.data}
        partsUnavailable={Boolean(parts.error)}
        revision={revision}
      />
    </>
  );
}
