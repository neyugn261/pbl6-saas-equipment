import { useEffect, useState } from "react";
import { api } from "../../api/client";
import { getSessionGeneration } from "../../auth/session";
import { priceText } from "./prices";

type Recommendation = {
  state: string;
  estimateRevision?: number;
  currency?: string;
  partTotals?: {
    partId: string;
    hasApprovedCatalogueLine: boolean;
    sku: string;
    unit: string;
    quantityApproved: string;
    quantityOpenToFulfill: string;
    quantityPendingIssue: string;
    quantityIssued: string;
    quantityReturned: string;
    quantityConfirmedUsed: string;
    quantityUnreconciled: string;
  }[];
  lines: {
    lineId: string;
    description: string;
    quantity: string;
    unitPrice: string;
    part: { name: string; sku: string; unit: string; status: string } | null;
  }[];
};
export function RecommendedParts({ workOrderId }: { workOrderId: string }) {
  const generation = getSessionGeneration();
  const [revision, setRevision] = useState(0),
    [state, setState] = useState<{
      key: string;
      data?: Recommendation;
      error?: string;
    }>({ key: "" });
  const key = `${workOrderId}:${generation}:${revision}`;
  useEffect(() => {
    let active = true;
    api
      .inventory<Recommendation>(
        `/work-orders/${workOrderId}/recommended-parts`,
      )
      .then(
        (data) => {
          if (active) setState({ key, data });
        },
        () => {
          if (active)
            setState({
              key,
              error:
                "Chưa tải được phụ tùng theo báo giá. Các phiếu cấp hiện có vẫn được giữ nguyên.",
            });
        },
      );
    return () => {
      active = false;
    };
  }, [workOrderId, key]);
  const data = state.key === key ? state.data : undefined;
  return (
    <section className="m1-card m1-section-card">
      <div className="m1-section-body">
        <h2>Phụ tùng theo báo giá đã duyệt</h2>
        <p>
          Danh sách tham khảo để lập phiếu xin. Việc duyệt báo giá chưa giữ tồn
          hoặc xuất hàng.
        </p>
        <button onClick={() => setRevision((v) => v + 1)}>
          Tải lại danh sách
        </button>
        {state.key !== key ? (
          <p role="status">Đang tải…</p>
        ) : state.error ? (
          <p role="alert">{state.error}</p>
        ) : !data?.lines.length ? (
          <p>
            {data?.state === "WITHDRAWN"
              ? "Phạm vi phụ tùng trước đây đã được rút lại. Kiểm tra báo giá mới trước khi lập phiếu."
              : data?.state === "APPROVED"
                ? "Báo giá đã duyệt không có dòng phụ tùng liên kết danh mục."
                : "Chưa có dữ liệu phụ tùng đã duyệt được đồng bộ. Kiểm tra hồ sơ báo giá; không suy ra rằng ca này không cần vật tư."}
          </p>
        ) : (
          <>
            <p>Phiên bản báo giá: {data.estimateRevision}</p>
            <div className="m2-inventory-table">
              <table>
                <thead>
                  <tr>
                    <th>Phụ tùng / phạm vi duyệt</th>
                    <th>Số lượng</th>
                    <th>Đơn giá đã duyệt</th>
                  </tr>
                </thead>
                <tbody>
                  {data.lines.map((line) => (
                    <tr key={line.lineId}>
                      <td>
                        {line.part?.sku} · {line.description}
                        {line.part?.status !== "ACTIVE" && (
                          <small> Cần kho kiểm tra khả năng cấp</small>
                        )}
                      </td>
                      <td>
                        {line.quantity} {line.part?.unit}
                      </td>
                      <td>{priceText(line.unitPrice, data.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p>
              Đối chiếu các phiếu xin hiện có ở bên dưới trước khi tạo phiếu mới
              để tránh xin trùng.
            </p>
          </>
        )}
            {data?.state === "APPROVED" && !!data.partTotals?.length && (
              <>
                <h3>Đối chiếu vật tư trên lệnh này</h3>
                <div className="m2-inventory-table">
                  <table>
                    <thead>
                      <tr>
                        <th>SKU</th>
                        <th>Đã duyệt</th>
                        <th>Phiếu còn chờ cấp</th>
                        <th>Giao dịch đang xử lý</th>
                        <th>Đã xuất</th>
                        <th>Đã trả</th>
                        <th>Xác nhận dùng</th>
                        <th>Chưa đối soát</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.partTotals.map((part) => (
                        <tr key={part.partId}>
                          <td>{part.sku}{!part.hasApprovedCatalogueLine && <small> Chưa có dòng danh mục trong snapshot; cần đối chiếu phạm vi.</small>}</td>
                          <td>{part.quantityApproved}</td>
                          <td>{part.quantityOpenToFulfill}</td>
                          <td>{part.quantityPendingIssue}</td>
                          <td>{part.quantityIssued}</td>
                          <td>{part.quantityReturned}</td>
                          <td>{part.quantityConfirmedUsed}</td>
                          <td>{part.quantityUnreconciled}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p>
                  Số lượng tổng hợp theo phụ tùng trên WO hiện tại, chưa tự quy
                  đổi thành hạn mức xuất hoặc chi phí khách phải trả.
                </p>
              </>
            )}
      </div>
    </section>
  );
}
