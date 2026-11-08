import { useState } from "react";
import { Link } from "react-router-dom";
import type { Page } from "../../types/domain";
import { useSession } from "../../auth/session";
import { DataState, EmptyState, Pagination } from "./WorkspaceUI";
import { ServiceCard } from "./ServiceDetailUI";
import {
  asRow,
  formatDate,
  useWorkspaceData,
  value,
  type Row,
} from "./workspace-data";

type Source = {
  status: string;
  data: (Page<Row> & { legacyHistoryMayBeIncomplete?: boolean }) | null;
};
const dispositions: Record<string, string> = {
  RETURNED_TO_CUSTOMER: "Đã trả linh kiện cũ cho khách",
  RETAINED_FOR_REVIEW: "Giữ linh kiện cũ để kiểm tra",
  DISPOSED_WITH_CONSENT: "Hủy theo sự đồng ý của khách",
  NOT_APPLICABLE: "Không có linh kiện cũ cần xử lý",
};

export default function EquipmentPartsHistory({
  equipmentId,
}: {
  equipmentId: string;
}) {
  const { profile } = useSession();
  const [page, setPage] = useState(1),
    [revision, refresh] = useState(0);
  const state = useWorkspaceData<Source>(
    "assetM2",
    `/equipment/${equipmentId}/service-parts?page=${page}&pageSize=10`,
    revision,
  );
  const source = state.data;
  const sourceError =
    source && source.status !== "AVAILABLE"
      ? source.status === "RESTRICTED"
        ? "Bạn chưa có quyền xem lịch sử phụ tùng này."
        : "Nguồn lịch sử phụ tùng chưa phản hồi. Không thể kết luận thiết bị chưa từng thay phụ tùng."
      : undefined;
  const data = source?.status === "AVAILABLE" ? source.data : null;
  const customer = profile?.userType === "CUSTOMER";
  return (
    <ServiceCard
      title="Phụ tùng đã xác nhận sử dụng & điều chỉnh"
      description="Các xác nhận và lần sửa sai được ghi nhận cho riêng thiết bị này; không suy ra từ lượng đã xuất kho."
    >
      <DataState
        loading={state.loading}
        error={state.error ?? sourceError}
        retry={() => refresh((v) => v + 1)}
      >
        {data?.items.length ? (
          <ol className="sd-history">
            {data.items.map((item) => {
              const part = asRow(item.part);
              const correction =
                item.kind === "REVERSE" || Boolean(item.correctsConfirmationId);
              return (
                <li key={String(item.id)}>
                  <h3>{value(part.name, "Phụ tùng chưa có tên")}</h3>
                  <p>
                    {value(part.sku, "Chưa có mã")} ·{" "}
                    {correction
                      ? "Điều chỉnh xác nhận trước"
                      : "Xác nhận sử dụng"}
                  </p>
                  <strong>
                    {value(item.quantity)} {value(part.unit, "")} ·{" "}
                    {item.isReversed
                      ? "Xác nhận đã được đảo; không coi là lượng sử dụng hiện hành"
                      : correction
                        ? "Lưu trong lịch sử điều chỉnh"
                        : `Lượng còn hiệu lực: ${value(item.effectiveQuantity, "Chưa có số liệu")}`}
                  </strong>
                  <time>Ghi nhận lúc {formatDate(item.recordedAt, true)}</time>
                  <p>
                    Thời điểm ghi nhận xác nhận; không mặc định là thời điểm lắp
                    thực tế.
                  </p>
                  <p>Lý do: {value(item.reason, "Chưa công bố lý do")}</p>
                  <p>
                    {dispositions[String(item.removedPartDisposition)] ??
                      "Chưa có mô tả xử lý linh kiện cũ"}
                  </p>
                  {Boolean(item.removedPartNote) && (
                    <p>{value(item.removedPartNote)}</p>
                  )}
                  <p>
                    {!customer && item.workOrderId ? (
                      <Link to={`/app/work-orders/${item.workOrderId}`}>
                        Công việc {value(item.workOrderNo, "liên quan")}
                      </Link>
                    ) : (
                      <>
                        Công việc:{" "}
                        {value(item.workOrderNo, "Chưa có mã công bố")}
                      </>
                    )}
                  </p>
                </li>
              );
            })}
          </ol>
        ) : (
          <EmptyState
            title="Chưa có xác nhận sử dụng được công bố"
            description="Thông tin xuất kho hoặc công việc hoàn tất chưa tự chứng minh linh kiện đã được thay."
          />
        )}
        {data?.legacyHistoryMayBeIncomplete && (
          <p className="sd-muted">
            Lịch sử trước thời điểm triển khai có thể chưa đầy đủ.
          </p>
        )}
        {data && (
          <Pagination
            page={page}
            pageSize={10}
            total={data.total}
            onChange={setPage}
          />
        )}
      </DataState>
      <div className="workshop-next">
        <h3>Chi phí và bảo hành của phụ tùng</h3>
        <p>
          Giá và phạm vi tính cho khách phải đối chiếu dự toán đã được chấp
          thuận. Chưa có giá không có nghĩa miễn phí; thay phụ tùng không tự gia
          hạn bảo hành thiết bị.
        </p>
      </div>
    </ServiceCard>
  );
}
