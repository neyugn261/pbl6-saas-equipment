import { useState, type FormEvent } from "react";
import { api, ApiError } from "../../api/client";
import { priceText } from "./prices";

export type Prices = {
  standardPrice: string | null;
  costPrice?: string | null;
  currency: string;
  pricingVersion: number;
};
export function PartPricing({
  part,
  canManage,
  onSaved,
}: {
  part: Prices & { id: string };
  canManage: boolean;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [standardPrice, setStandard] = useState(part.standardPrice ?? ""),
    [costPrice, setCost] = useState(part.costPrice ?? "");
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.inventory(`/parts/${part.id}/pricing`, {
        method: "PUT",
        body: {
          expectedVersion: part.pricingVersion,
          standardPrice: standardPrice || null,
          costPrice: costPrice || null,
        },
      });
      setEditing(false);
      onSaved();
    } catch (cause) {
      setError(
        cause instanceof ApiError && cause.status === 409
          ? "Giá đã được cập nhật hoặc lần lưu trước đã thành công. Tải lại để đối chiếu trước khi lưu tiếp."
          : "Chưa xác định được kết quả lưu. Tải lại để kiểm tra giá trước khi gửi tiếp.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="m1-card m1-section-card">
      <div className="m1-section-body">
        <h2>Đơn giá tham khảo</h2>
        <p>
          Giá niêm yết:{" "}
          <strong>{priceText(part.standardPrice, part.currency)}</strong>
        </p>
        {canManage && (
          <p>
            Giá vốn nội bộ:{" "}
            <strong>{priceText(part.costPrice, part.currency)}</strong>
          </p>
        )}
        <p>
          Đơn giá theo đơn vị tính của phụ tùng. Giá mới áp dụng cho lần lập báo
          giá tiếp theo; nội dung khách đã duyệt được giữ nguyên.
        </p>
        {canManage && (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setEditing(!editing);
              setStandard(part.standardPrice ?? "");
              setCost(part.costPrice ?? "");
            }}
          >
            Cập nhật đơn giá
          </button>
        )}
        {editing && (
          <form className="m2-editor" onSubmit={(event) => void save(event)}>
            <label>
              Giá niêm yết (VND)
              <input
                inputMode="decimal"
                pattern="(0|[1-9][0-9]{0,11})(\.[0-9]{1,2})?"
                value={standardPrice}
                onChange={(e) => setStandard(e.target.value)}
              />
            </label>
            <label>
              Giá vốn nội bộ (VND)
              <input
                inputMode="decimal"
                pattern="(0|[1-9][0-9]{0,11})(\.[0-9]{1,2})?"
                value={costPrice}
                onChange={(e) => setCost(e.target.value)}
              />
            </label>
            <p>
              Để trống nếu chưa xác định giá. Nhập 0 chỉ khi muốn đặt giá bằng
              0.
            </p>
            <button disabled={busy}>{busy ? "Đang lưu…" : "Lưu giá"}</button>
            <button type="button" disabled={busy} onClick={onSaved}>
              Tải lại giá
            </button>
          </form>
        )}
        {error && <p role="alert">{error}</p>}
      </div>
    </section>
  );
}
