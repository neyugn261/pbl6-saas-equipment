import { useState } from "react";
import { Link } from "react-router-dom";
import { useSession } from "../../auth/session";
import { DataState } from "./WorkspaceUI";
import { ServiceCard } from "./ServiceDetailUI";
import { formatServiceMoney, serviceLabels } from "./service-detail-data";
import { useWorkspaceData, value, type Row } from "./workspace-data";
type RequestResult = {
  id: string;
  equipmentId: string;
  resolutionResult?: string | null;
  resolutionSummary?: string | null;
};
export default function RequestCloseoutSummary({
  request,
}: {
  request: RequestResult;
}) {
  const { profile } = useSession();
  const [revision, refresh] = useState(0);
  const data = useWorkspaceData<Row[]>(
    "requestsLive",
    `/service-requests/${request.id}/estimates`,
    revision,
  );
  const approved = Array.isArray(data.data)
    ? data.data.filter((row) => row.status === "APPROVED")
    : [];
  const base = profile?.userType === "CUSTOMER" ? "/portal" : "/app";
  return (
    <ServiceCard
      title="Đối chiếu trước khi xác nhận kết quả"
      description="Đọc phạm vi đã chấp thuận, kết quả thực hiện và các thông tin còn cần làm rõ."
    >
      <div className="workshop-closeout">
        <section>
          <h3>Phạm vi chi phí đã chấp thuận</h3>
          <DataState {...data} retry={() => refresh((v) => v + 1)}>
            {approved.length ? (
              approved.map((row) => (
                <div key={String(row.id)}>
                  <strong>
                    Phiên bản {value(row.revisionNo)} ·{" "}
                    {formatServiceMoney(
                      row.totalAmount,
                      value(row.currency, "VND"),
                    )}
                  </strong>
                  <ul>
                    {Array.isArray(row.items) &&
                      row.items.map((item: Row, index: number) => (
                        <li key={index}>
                          {value(item.description)} · Số lượng{" "}
                          {value(item.quantity)}
                        </li>
                      ))}
                  </ul>
                </div>
              ))
            ) : (
              <p>
                Không có dự toán được chấp thuận trong dữ liệu vừa tải. Kiểm tra
                quyết định bảo hành; không suy ra dịch vụ miễn phí từ việc chưa
                có dự toán.
              </p>
            )}
          </DataState>
        </section>
        <section>
          <h3>Kết quả đã công bố</h3>
          <strong>
            {serviceLabels[String(request.resolutionResult)] ??
              "Chưa có kết luận kỹ thuật được công bố"}
          </strong>
          <p>{value(request.resolutionSummary, "Chưa có tóm tắt kết quả.")}</p>
          {request.resolutionResult === "PARTIALLY_RESOLVED" && (
            <p className="workshop-outcome-warning">
              Mới xử lý một phần: cần làm rõ phần còn lại và phạm vi khách đồng
              ý trước khi khép yêu cầu.
            </p>
          )}
        </section>
        <section>
          <h3>Còn cần đối chiếu</h3>
          <p>
            Phụ tùng thực tế, phần việc chưa giải quyết và các phát sinh ngoài
            phạm vi đã duyệt cần được trao đổi rõ. Chi phí tham chiếu trong kho
            không phải giá đã được khách chấp thuận.
          </p>
          <Link to={`${base}/equipment/${request.equipmentId}`}>
            Xem hồ sơ máy và các xác nhận sử dụng phụ tùng →
          </Link>
        </section>
      </div>
    </ServiceCard>
  );
}
