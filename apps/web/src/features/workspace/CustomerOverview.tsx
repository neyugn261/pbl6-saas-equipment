import { Link } from "react-router-dom";
import { useState } from "react";
import { useDirectory } from "../../routes/registration-data";
import { DirectoryPicker } from "../../routes/registration-shared";
import type { Page, EquipmentRecord } from "../../types/domain";
import "./management.css";

const openStatuses =
  "NEW,REVIEWING,AWAITING_INFO,AWAITING_CUSTOMER_APPROVAL,ACCEPTED,PROCESSING,COST_REJECTED";
export default function CustomerOverview({
  customerId,
}: {
  customerId: string;
}) {
  const equipment = useDirectory<
    Page<EquipmentRecord> & { summary?: { inWarranty: number } }
  >("assetM2", `/equipment?customerId=${customerId}&pageSize=1`);
  const requests = useDirectory<Page<unknown>>(
    "requestsLive",
    `/service-requests?customerId=${customerId}&pageSize=1&status=${openStatuses}`,
  );
  const metrics = [
    {
      label: "Thiết bị đã ghi nhận",
      value: equipment.value?.total,
      error: equipment.error,
    },
    {
      label: "Máy còn bảo hành",
      value: equipment.value?.summary?.inWarranty,
      error: equipment.error,
    },
    {
      label: "Yêu cầu đang mở",
      value: requests.value?.total,
      error: requests.error,
    },
  ];
  return (
    <section aria-label="Tổng quan khách hàng">
      <div className="management-metrics">
        {metrics.map((metric) => (
          <div key={metric.label}>
            <span>{metric.label}</span>
            <strong>
              {metric.value == null
                ? "—"
                : metric.value.toLocaleString("vi-VN")}
            </strong>
            <small>
              {metric.error
                ? "Chưa tải được số liệu"
                : metric.value == null
                  ? "Đang tải dữ liệu"
                  : "Toàn bộ hồ sơ được phép xem"}
            </small>
          </div>
        ))}
        <div>
          <span>Chi phí dịch vụ lũy kế</span>
          <strong>—</strong>
          <small>Chưa có số liệu chi phí dịch vụ tổng hợp.</small>
        </div>
      </div>
      {(equipment.error || requests.error) && (
        <p role="alert">
          Một số số liệu chưa tải được; dấu — không có nghĩa là không phát sinh.
        </p>
      )}
      <p>
        <Link to={`/app/equipment?customerId=${customerId}`}>
          Tra cứu toàn bộ thiết bị
        </Link>{" "}
        ·{" "}
        <Link to={`/app/service-requests?customerId=${customerId}`}>
          Yêu cầu dịch vụ
        </Link>{" "}
        ·{" "}
        <Link to={`/app/work-orders?view=list&customerId=${customerId}`}>
          Lệnh công việc
        </Link>
      </p>
    </section>
  );
}

export function CustomerMaintenance({ customerId }: { customerId: string }) {
  const [equipmentId, setEquipmentId] = useState("");
  const plans = useDirectory<
    Page<{ id: string; name: string; status: string; nextDueDate: string }>
  >(
    "maintenance",
    equipmentId
      ? `/maintenance-plans?equipmentId=${equipmentId}&pageSize=100`
      : null,
  );
  return (
    <section className="m1-card">
      <h2>Kế hoạch bảo trì</h2>
      <p>Chọn máy của khách hàng để xem kế hoạch và kỳ đến hạn.</p>
      <DirectoryPicker
        label="Thiết bị của khách hàng"
        area="assetM2"
        path={`/equipment?customerId=${customerId}`}
        selected={equipmentId}
        onChange={setEquipmentId}
      />
      {plans.loading && <p role="status">Đang tải kế hoạch…</p>}
      {plans.error && <p role="alert">{plans.error}</p>}
      {plans.value && (
        <>
          <ul className="m2-linked-list">
            {plans.value.items.map((plan) => (
              <li key={plan.id}>
                <Link to={`/app/maintenance/${plan.id}`}>{plan.name}</Link>
                <span>
                  Kỳ tiếp: {plan.nextDueDate} · {plan.status}
                </span>
              </li>
            ))}
          </ul>
          {!plans.value.items.length && (
            <p>Thiết bị chưa có kế hoạch bảo trì.</p>
          )}
          <Link to={`/app/maintenance?equipmentId=${equipmentId}`}>
            Mở đầy đủ kế hoạch và công việc bảo trì
          </Link>
        </>
      )}
    </section>
  );
}
