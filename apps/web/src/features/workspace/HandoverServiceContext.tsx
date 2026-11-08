import { useState } from "react";
import { Link } from "react-router-dom";
import { DataState } from "./WorkspaceUI";
import { ServiceCard } from "./ServiceDetailUI";
import {
  asRow,
  formatDate,
  useWorkspaceData,
  value,
  type Row,
} from "./workspace-data";
export default function HandoverServiceContext({
  equipmentId,
  customer,
}: {
  equipmentId: string;
  customer: boolean;
}) {
  const [revision, refresh] = useState(0);
  const data = useWorkspaceData<Row>(
    "assetM2",
    `/equipment/${equipmentId}/dossier`,
    revision,
  );
  const warranties = Array.isArray(data.data?.warranties)
    ? (data.data.warranties as Row[])
    : [];
  const maintenance = asRow(data.data?.maintenance),
    detail = asRow(maintenance.data);
  return (
    <ServiceCard
      title="Bảo hành & bảo trì tham chiếu"
      description="Thông tin tại thời điểm tra cứu; phân biệt với nội dung biên bản đã gửi khách xác nhận."
    >
      <DataState {...data} retry={() => refresh((v) => v + 1)}>
        {warranties.length ? (
          warranties.map((row) => (
            <p key={String(row.id)}>
              <strong>
                Hiệu lực bảo hành: {formatDate(row.startDate)} –{" "}
                {formatDate(row.endDate)}
              </strong>
              <br />
              {value(row.terms, "Xem điều khoản trong hồ sơ thiết bị.")}
            </p>
          ))
        ) : (
          <p>Chưa có thời hạn bảo hành được ghi nhận trong hồ sơ hiện tại.</p>
        )}
        <p>
          Kỳ bảo trì kế tiếp:{" "}
          {maintenance.status === "AVAILABLE"
            ? formatDate(asRow(detail.nextDue).date)
            : "Chưa tải được hoặc không thuộc phạm vi được xem"}
        </p>
      </DataState>
      <p>
        Ngày khách xác nhận bàn giao không tự thay đổi ngày hiệu lực bảo hành đã
        ghi nhận. Đối chiếu ngày giao, thời hạn và điều khoản trước khi chấp
        thuận.
      </p>
      <Link to={`${customer ? "/portal" : "/app"}/equipment/${equipmentId}`}>
        Xem hồ sơ và chính sách dịch vụ →
      </Link>
    </ServiceCard>
  );
}
