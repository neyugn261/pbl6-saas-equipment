import {
  formatServiceMoney,
  serviceLabels,
} from "../features/workspace/service-detail-data";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, ApiError } from "../api/client";
import { getSessionGeneration, useSession } from "../auth/session";

type Item = {
  itemType: string;
  description: string;
  quantity: string;
  unitPrice: string;
  amount?: string;
};
type Estimate = {
  id: string;
  revisionNo: number;
  status: string;
  currency: string;
  totalAmount: string;
  validUntil?: string | null;
  notes?: string | null;
  items: Item[];
};
const blankItem = (): Item => ({
  itemType: "LABOR",
  description: "",
  quantity: "1",
  unitPrice: "0",
});
const message = (error: unknown) =>
  error instanceof ApiError
    ? `${error.status} · ${error.message}`
    : error instanceof Error
      ? error.message
      : String(error);

export default function EstimatePanel({
  requestId,
  allowedActions,
  onChange,
}: {
  requestId: string;
  allowedActions: string[];
  onChange: () => void;
}) {
  const { profile } = useSession();
  const sessionGeneration = getSessionGeneration();
  const customer = profile?.roles.includes("CUSTOMER_ADMIN");
  const manager = profile?.roles.includes("SERVICE_MANAGER");
  const [estimateState, setEstimateState] = useState<{
    key: string;
    items: Estimate[];
    error: string;
  }>({
    key: "",
    items: [],
    error: "",
  });
  const [selected, setSelected] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [pending, setPending] = useState<{
    path: string;
    method: string;
    label: string;
  } | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const actionLock = useRef(false);
  const [uncertain, setUncertain] = useState(false);
  function confirmAction(path: string, method: string, label: string) {
    setPending({ path, method, label });
    dialog.current?.showModal();
  }
  const [items, setItems] = useState<Item[]>([blankItem()]);
  const [validUntil, setValidUntil] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const queryKey = `${requestId}:session-${sessionGeneration}`;
  const loading = estimateState.key !== queryKey;
  const estimates = loading ? [] : estimateState.items;
  async function reload() {
    if (getSessionGeneration() !== sessionGeneration) return;
    const rows = await api.requestsLive<Estimate[]>(
      `/service-requests/${requestId}/estimates`,
    );
    if (getSessionGeneration() !== sessionGeneration) return;
    setEstimateState({ key: queryKey, items: rows, error: "" });
    onChange();
  }
  useEffect(() => {
    let active = true;
    api
      .requestsLive<Estimate[]>(`/service-requests/${requestId}/estimates`)
      .then(
        (rows) => {
          if (active)
            setEstimateState({ key: queryKey, items: rows, error: "" });
        },
        (cause) => {
          if (active)
            setEstimateState({
              key: queryKey,
              items: [],
              error: message(cause),
            });
        },
      );
    return () => {
      active = false;
    };
  }, [queryKey, requestId]);
  function edit(estimate: Estimate) {
    setCreateOpen(true);
    setSelected(estimate.id);
    setItems(
      estimate.items.map(({ itemType, description, quantity, unitPrice }) => ({
        itemType,
        description,
        quantity,
        unitPrice,
      })),
    );
    setValidUntil(estimate.validUntil?.slice(0, 10) ?? "");
    setNotes(estimate.notes ?? "");
  }
  async function act(path: string, method = "POST", body?: unknown) {
    if (
      getSessionGeneration() !== sessionGeneration ||
      actionLock.current ||
      uncertain
    )
      return;
    actionLock.current = true;
    setBusy(true);
    setError("");
    try {
      await api.requestsLive(path, { method, body });
      if (getSessionGeneration() !== sessionGeneration) return;
      await reload();
      setSelected(null);
      setCreateOpen(false);
      dialog.current?.close();
      setPending(null);
    } catch (cause) {
      if (getSessionGeneration() !== sessionGeneration) return;
      const unknown =
        !(cause instanceof ApiError) ||
        [401, 408].includes(cause.status) ||
        cause.status >= 500;
      setUncertain(unknown);
      setError(
        unknown
          ? "Chưa xác định thay đổi đã được ghi nhận hay chưa. Đã khóa gửi lại; hãy kiểm tra các phiên bản dự toán trước khi thực hiện tiếp."
          : message(cause),
      );
      if (cause instanceof ApiError && cause.status === 409) {
        try {
          await reload();
        } catch (refreshError) {
          setError(
            `${message(cause)} Làm mới dữ liệu cũng thất bại: ${message(refreshError)}`,
          );
        }
      }
    } finally {
      actionLock.current = false;
      if (getSessionGeneration() === sessionGeneration) setBusy(false);
    }
  }
  function save(event: FormEvent) {
    event.preventDefault();
    const body = {
      currency: "VND",
      ...(validUntil ? { validUntil } : {}),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
      items: items.map((item) => ({
        ...item,
        description: item.description.trim(),
      })),
    };
    void act(
      selected
        ? `/service-requests/estimates/${selected}`
        : `/service-requests/${requestId}/estimates`,
      selected ? "PUT" : "POST",
      body,
    );
  }
  return (
    <section className="m1-card m1-section-card">
      <div className="m1-section-header">
        <h2>Dự toán chi phí</h2>
      </div>
      <div className="m1-section-body">
        {loading ? <p role="status">Đang tải…</p> : null}
        {!loading && estimateState.error && (
          <p role="alert" className="m1-error">
            {estimateState.error}
          </p>
        )}
        {error ? (
          <p role="alert" className="m1-error">
            {error}
          </p>
        ) : null}
        {!loading && !estimateState.error && estimates.length === 0 ? (
          <div className="ws-empty">
            <h3>Chưa lập dự toán</h3>
            <p>
              Lập dự toán khi cần khách hàng xác nhận chi phí trước khi thực
              hiện. Đây không phải hóa đơn hay yêu cầu thanh toán.
            </p>
          </div>
        ) : null}
        {manager &&
          allowedActions.includes("create-estimate") &&
          !createOpen &&
          !selected && (
            <button
              className="ws-button"
              disabled={busy || uncertain}
              onClick={() => {
                setItems([blankItem()]);
                setNotes("");
                setValidUntil("");
                setCreateOpen(true);
              }}
            >
              + Lập dự toán chi phí
            </button>
          )}
        {uncertain && (
          <button
            type="button"
            disabled={busy || uncertain}
            onClick={() => {
              void reload().catch((cause) => setError(message(cause)));
            }}
          >
            Kiểm tra phiên bản đã lưu
          </button>
        )}
        {estimates.map((estimate) => (
          <div className="m2-estimate" key={estimate.id}>
            <div className="sd-estimate-heading">
              <strong>Dự toán · Phiên bản {estimate.revisionNo}</strong>
              <span>{serviceLabels[estimate.status] ?? estimate.status}</span>
            </div>
            <p className="sd-estimate-total">
              {formatServiceMoney(estimate.totalAmount, estimate.currency)}
            </p>
            <p>
              Hiệu lực đến:{" "}
              {estimate.validUntil
                ?.slice(0, 10)
                .split("-")
                .reverse()
                .join("/") ?? "Không giới hạn"}
            </p>
            {estimate.notes ? <p>Điều khoản: {estimate.notes}</p> : null}
            <div className="ws-table-wrap">
              <table className="ws-table">
                <thead>
                  <tr>
                    <th>Hạng mục</th>
                    <th>Số lượng</th>
                    <th>Đơn giá</th>
                    <th>Thành tiền</th>
                  </tr>
                </thead>
                <tbody>
                  {estimate.items.map((item, index) => (
                    <tr key={index}>
                      <td data-label="Hạng mục">
                        <strong>{item.description}</strong>
                        <small>
                          {serviceLabels[item.itemType] ?? item.itemType}
                        </small>
                      </td>
                      <td data-label="Số lượng">{item.quantity}</td>
                      <td data-label="Đơn giá">
                        {formatServiceMoney(item.unitPrice, estimate.currency)}
                      </td>
                      <td data-label="Thành tiền">
                        {item.amount == null
                          ? "Chưa tính"
                          : formatServiceMoney(item.amount, estimate.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="m1-actions">
              {manager &&
              estimate.status === "DRAFT" &&
              allowedActions.includes("edit-estimate") ? (
                <button
                  disabled={busy || uncertain}
                  onClick={() => edit(estimate)}
                >
                  Sửa
                </button>
              ) : null}
              {manager &&
              estimate.status === "DRAFT" &&
              allowedActions.includes("send-estimate") ? (
                <button
                  disabled={busy || uncertain}
                  onClick={() =>
                    confirmAction(
                      `/service-requests/estimates/${estimate.id}/send`,
                      "POST",
                      "Gửi dự toán cho khách hàng",
                    )
                  }
                >
                  Gửi khách hàng
                </button>
              ) : null}
              {manager &&
              estimate.status === "DRAFT" &&
              allowedActions.includes("delete-estimate") ? (
                <button
                  disabled={busy || uncertain}
                  onClick={() =>
                    confirmAction(
                      `/service-requests/estimates/${estimate.id}`,
                      "DELETE",
                      "Xóa bản dự toán nháp",
                    )
                  }
                >
                  Xóa bản nháp
                </button>
              ) : null}
              {manager &&
              estimate.status === "SENT" &&
              allowedActions.includes("revise-estimate") ? (
                <button
                  disabled={busy || uncertain}
                  onClick={() =>
                    confirmAction(
                      `/service-requests/estimates/${estimate.id}/revise`,
                      "POST",
                      "Tạo phiên bản sửa đổi",
                    )
                  }
                >
                  Tạo bản sửa
                </button>
              ) : null}
              {customer &&
              estimate.status === "SENT" &&
              allowedActions.includes("approve-estimate") ? (
                <button
                  disabled={busy || uncertain}
                  onClick={() =>
                    void act(
                      `/service-requests/estimates/${estimate.id}/approve`,
                    )
                  }
                >
                  Chấp nhận
                </button>
              ) : null}
              {customer &&
              estimate.status === "SENT" &&
              allowedActions.includes("reject-estimate") ? (
                <button
                  disabled={busy || uncertain}
                  onClick={() => {
                    const reason = window.prompt(
                      "Lý do từ chối (có thể bỏ trống)",
                    );
                    if (reason !== null)
                      void act(
                        `/service-requests/estimates/${estimate.id}/reject`,
                        "POST",
                        reason.trim() ? { reason: reason.trim() } : undefined,
                      );
                  }}
                >
                  Từ chối
                </button>
              ) : null}
            </div>
          </div>
        ))}
        {manager &&
        (createOpen || selected) &&
        ((selected && allowedActions.includes("edit-estimate")) ||
          (!selected && allowedActions.includes("create-estimate"))) ? (
          <form className="m2-editor" onSubmit={save}>
            <h3>{selected ? "Sửa bản nháp" : "Lập dự toán"}</h3>
            <label>
              Hiệu lực đến{" "}
              <input
                type="date"
                value={validUntil}
                onChange={(event) => setValidUntil(event.target.value)}
              />
            </label>
            <label>
              Điều khoản hiển thị cho khách{" "}
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </label>
            {items.map((item, index) => (
              <fieldset key={index}>
                <legend>Hạng mục {index + 1}</legend>
                <label>
                  Nhóm chi phí
                  <select
                    value={item.itemType}
                    onChange={(event) =>
                      setItems(
                        items.map((row, i) =>
                          i === index
                            ? { ...row, itemType: event.target.value }
                            : row,
                        ),
                      )
                    }
                  >
                    <option value="LABOR">Nhân công</option>
                    <option value="PART">Phụ tùng</option>
                    <option value="TRAVEL">Di chuyển</option>
                    <option value="OTHER">Khác</option>
                  </select>
                </label>
                <label>
                  Mô tả hạng mục
                  <input
                    required
                    maxLength={255}
                    placeholder="Ví dụ: Kiểm tra và hiệu chỉnh"
                    value={item.description}
                    onChange={(event) =>
                      setItems(
                        items.map((row, i) =>
                          i === index
                            ? { ...row, description: event.target.value }
                            : row,
                        ),
                      )
                    }
                  />
                </label>
                <label>
                  Số lượng
                  <input
                    required
                    type="number"
                    min="0.01"
                    step="0.01"
                    aria-label="Số lượng"
                    value={item.quantity}
                    onChange={(event) =>
                      setItems(
                        items.map((row, i) =>
                          i === index
                            ? { ...row, quantity: event.target.value }
                            : row,
                        ),
                      )
                    }
                  />
                </label>
                <label>
                  Đơn giá (VND)
                  <input
                    required
                    type="number"
                    min="0"
                    step="0.01"
                    aria-label="Đơn giá"
                    value={item.unitPrice}
                    onChange={(event) =>
                      setItems(
                        items.map((row, i) =>
                          i === index
                            ? { ...row, unitPrice: event.target.value }
                            : row,
                        ),
                      )
                    }
                  />
                </label>
                <button
                  type="button"
                  disabled={items.length === 1}
                  onClick={() => setItems(items.filter((_, i) => i !== index))}
                >
                  Bỏ
                </button>
              </fieldset>
            ))}
            <button
              type="button"
              onClick={() => setItems([...items, blankItem()])}
            >
              Thêm hạng mục
            </button>
            <button disabled={busy || uncertain}>
              {busy ? "Đang lưu…" : "Lưu bản nháp"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setSelected(null);
                setCreateOpen(false);
              }}
            >
              Đóng biểu mẫu
            </button>
            <p>Tổng tiền do server tính và trả về sau khi lưu.</p>
          </form>
        ) : null}
        <dialog
          ref={dialog}
          aria-labelledby="estimate-action-title"
          onCancel={(e) => {
            if (busy) e.preventDefault();
            else setPending(null);
          }}
        >
          <form
            className="m1-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (pending) void act(pending.path, pending.method);
            }}
          >
            <h2 id="estimate-action-title">{pending?.label}</h2>
            <p>
              {pending?.method === "DELETE"
                ? "Bản nháp này sẽ được xóa. Kiểm tra đúng phiên bản trước khi xác nhận."
                : "Kiểm tra nội dung, tổng tiền và thời hạn hiệu lực. Thao tác sẽ được ghi nhận trên hồ sơ yêu cầu."}
            </p>
            {error && <p role="alert">{error}</p>}
            <div className="m1-actions">
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  dialog.current?.close();
                  setPending(null);
                }}
              >
                Quay lại
              </button>
              <button disabled={busy || uncertain}>
                {busy ? "Đang xử lý…" : "Xác nhận"}
              </button>
            </div>
          </form>
        </dialog>
      </div>
    </section>
  );
}
