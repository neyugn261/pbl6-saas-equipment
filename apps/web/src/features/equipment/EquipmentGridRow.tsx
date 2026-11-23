import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { StatusBadge } from "../../components/Badges";
import type { EquipmentRecord } from "../../types/domain";
import { equipmentLifecycleLabel } from "../workspace/service-detail-data";

export default function EquipmentGridRow({
  item,
  portal,
  canManage,
  columns,
  selected,
  onSelect,
  operationalLabels,
}: {
  item: EquipmentRecord;
  portal: boolean;
  canManage: boolean;
  columns: string[];
  selected: boolean;
  onSelect: (checked: boolean) => void;
  operationalLabels: Record<string, string>;
}) {
  const cells: Record<string, { label: string; content: ReactNode }> = {
    context: {
      label: "Khách hàng / vị trí",
      content: (
        <>
          <strong>
            {item.customerDisplay
              ? `${item.customerDisplay.code ? `${item.customerDisplay.code} · ` : ""}${item.customerDisplay.name}`
              : "Tên khách hàng chưa sẵn sàng"}
          </strong>
          <span>
            {item.siteDisplay
              ? `${item.siteDisplay.code ? `${item.siteDisplay.code} · ` : ""}${item.siteDisplay.name}`
              : "Tên cơ sở chưa sẵn sàng"}
          </span>
          {item.siteDisplay?.address && (
            <small>{item.siteDisplay.address}</small>
          )}
          {item.locationDisplay && (
            <span>
              Vị trí:{" "}
              {item.locationDisplay.code
                ? `${item.locationDisplay.code} · `
                : ""}
              {item.locationDisplay.name}
            </span>
          )}
        </>
      ),
    },
    serial: { label: "Số sê-ri", content: item.serialNumber },
    dates: {
      label: "Mua / bàn giao / lắp đặt",
      content: (
        <>
          <span>
            <b>Mua</b>
            {item.purchaseDate || "Chưa ghi nhận"}
          </span>
          <span>
            <b>Bàn giao</b>
            {item.handoverDate || "Chưa ghi nhận"}
          </span>
          <span>
            <b>Lắp đặt</b>
            {item.installationDate || "Chưa ghi nhận"}
          </span>
        </>
      ),
    },
    warranty: {
      label: "Hiệu lực bảo hành",
      content: item.warranty?.result ? (
        <div className="equipment-warranty-cell">
          <StatusBadge status={item.warranty.result} />
          {item.warranty.endDate && <small>Đến {item.warranty.endDate}</small>}
        </div>
      ) : (
        "Chưa có dữ liệu"
      ),
    },
    status: {
      label: "Tình trạng",
      content: (
        <div className="equipment-status-cell">
          <StatusBadge
            status={item.status}
            label={equipmentLifecycleLabel(item.status)}
          />
          <small>
            {operationalLabels[item.operationalStatus || "UNKNOWN"]}
          </small>
        </div>
      ),
    },
  };
  const registrationLabels: Record<string, string> = {
    COMPLETED: "Đã hoàn tất",
    PENDING_MAINTENANCE: "Chờ bảo trì",
    PENDING_CUSTOMER_CONFIRMATION: "Chờ khách xác nhận",
    DRAFT: "Tiếp tục hồ sơ",
  };
  return (
    <tr>
      <td>
        <input
          type="checkbox"
          aria-label={`Chọn ${item.assetCode}`}
          checked={selected}
          onChange={(event) => onSelect(event.target.checked)}
        />
      </td>
      <td className="equipment-grid__identity">
        <Link to={`${portal ? "/portal" : "/app"}/equipment/${item.id}`}>
          {item.assetCode}
        </Link>
        <strong>
          {item.displayName || item.model?.name || "Thiết bị chưa có tên"}
        </strong>
        <small>
          {[item.model?.manufacturer, item.model?.modelCode]
            .filter(Boolean)
            .join(" · ") ||
            item.model?.name ||
            "Chưa có thông tin model"}
        </small>
        <Link
          className="ws-button ws-button--secondary equipment-grid__detail"
          aria-label={`Xem chi tiết thiết bị ${item.assetCode}`}
          to={`${portal ? "/portal" : "/app"}/equipment/${item.id}`}
        >
          Xem chi tiết
        </Link>
      </td>
      {columns
        .filter((key) => cells[key])
        .map((key) => (
          <td
            key={key}
            data-label={cells[key].label}
            className={
              key === "context"
                ? "equipment-context-cell"
                : key === "dates"
                  ? "equipment-dates-cell"
                  : undefined
            }
          >
            {cells[key].content}
          </td>
        ))}
      {canManage && (
        <td data-label="Hồ sơ dịch vụ">
          <Link
            to={
              item.registrationId
                ? `/app/equipment-registrations/${item.registrationId}`
                : `/app/equipment-registrations/new?equipmentId=${item.id}`
            }
          >
            {registrationLabels[item.registrationStatus || ""] ||
              "Hoàn thiện bàn giao"}
          </Link>
        </td>
      )}
    </tr>
  );
}
