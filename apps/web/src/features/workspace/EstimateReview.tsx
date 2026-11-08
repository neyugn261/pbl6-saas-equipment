import { formatServiceMoney } from "./service-detail-data";
import { quantityText } from "./ui-values";
export type EstimateView = {
  id: string;
  revisionNo: number;
  status: string;
  currency: string;
  totalAmount: string;
  validUntil?: string | null;
  notes?: string | null;
  items: {
    itemType: string;
    description: string;
    quantity: string;
    unitPrice: string;
    amount?: string;
  }[];
};
function Version({ row }: { row: EstimateView }) {
  return (
    <section>
      <h3>Phiên bản {row.revisionNo}</h3>
      <strong>{formatServiceMoney(row.totalAmount, row.currency)}</strong>
      <ul>
        {row.items.map((item, index) => (
          <li key={index}>
            {item.description} · {quantityText(item.quantity)} ×{" "}
            {formatServiceMoney(item.unitPrice, row.currency)}
          </li>
        ))}
      </ul>
      <p>{row.notes || "Chưa ghi điều khoản bổ sung."}</p>
    </section>
  );
}
export default function EstimateReview({
  estimate,
  previous,
  requestNo,
  equipmentSummary,
}: {
  estimate: EstimateView;
  previous?: EstimateView;
  requestNo?: string;
  equipmentSummary?: string;
}) {
  return (
    <div className="workshop-estimate-review">
      <p>
        <strong>
          {requestNo ?? "Yêu cầu đang xem"} · Dự toán phiên bản{" "}
          {estimate.revisionNo}
        </strong>
      </p>
      <p>
        Thiết bị:{" "}
        {equipmentSummary || "Xem nhận dạng thiết bị tại đầu hồ sơ yêu cầu."}
      </p>
      <div className="workshop-compare">
        {previous && <Version row={previous} />}
        <Version row={estimate} />
      </div>
      <p>
        Hiệu lực đến:{" "}
        {estimate.validUntil
          ? estimate.validUntil.slice(0, 10).split("-").reverse().join("/")
          : "Chưa giới hạn thời hạn"}
        . Chấp thuận áp dụng cho hạng mục và điều khoản của đúng phiên bản này.
        Phát sinh ngoài phạm vi cần được thống nhất riêng.
      </p>
    </div>
  );
}
