import { useState, type FormEvent } from "react";
import { api, ApiError } from "../../api/client";
import { ServiceCard, ServiceFacts } from "../workspace/ServiceDetailUI";
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
    <ServiceCard title="Đơn giá tham khảo" actions={
      canManage && (
          <button
            type="button"
            className="ws-button ws-button--secondary"
            aria-expanded={editing}
            disabled={busy}
            onClick={() => {
              setEditing(!editing);
              setError("");
              setStandard(part.standardPrice ?? "");
              setCost(part.costPrice ?? "");
            }}
          >
            {editing ? "Hủy chỉnh sửa" : "Cập nhật đơn giá"}
          </button>
      )
    }>
      <ServiceFacts items={[
        { label: "Giá niêm yết", value: priceText(part.standardPrice, part.currency) },
        ...(canManage ? [{ label: "Giá vốn nội bộ", value: priceText(part.costPrice, part.currency) }] : []),
      ]} />
      {editing && (
        <form className="inventory-pricing-form" onSubmit={(event) => void save(event)}>
          <fieldset className="ws-form-grid" disabled={busy}>
            <label className="ws-label">
              Giá niêm yết (VND)
              <input
                inputMode="decimal"
                pattern="(0|[1-9][0-9]{0,11})(\.[0-9]{1,2})?"
                value={standardPrice}
                onChange={(e) => setStandard(e.target.value)}
              />
            </label>
            <label className="ws-label">
              Giá vốn nội bộ (VND)
              <input
                inputMode="decimal"
                pattern="(0|[1-9][0-9]{0,11})(\.[0-9]{1,2})?"
                value={costPrice}
                onChange={(e) => setCost(e.target.value)}
              />
            </label>
            {error && <p className="ws-full m1-error" role="alert">{error}</p>}
            <div className="ws-full ws-actions">
              <button type="button" className="ws-button ws-button--secondary" disabled={busy} onClick={onSaved}>
                Tải lại giá
              </button>
              <button type="submit" className="ws-button" disabled={busy}>{busy ? "Đang lưu…" : "Lưu giá"}</button>
            </div>
          </fieldset>
        </form>
      )}
    </ServiceCard>
  );
}
