import { useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../../api/client";
import { getSessionGeneration, useSession } from "../../auth/session";
import { DirectoryPicker } from "../../routes/registration-shared";
import type { Page } from "../../types/domain";
import "./management.css";

type Order = { id: string; workOrderNo: string; status: string };
const activeStatuses =
  "CREATED,ASSIGNED,ACCEPTED,TRAVELLING,IN_PROGRESS,ON_HOLD";

export default function QuickDispatch({
  requestId,
  branchId,
  onChanged,
}: {
  requestId: string;
  branchId: string;
  onChanged: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const lock = useRef(false);
  const generation = getSessionGeneration();
  const { profile } = useSession();
  const storageKey = `pbl6.registration.dispatch.${profile?.tenantId}.${profile?.id}.${requestId}`;
  const [technicianId, setTechnicianId] = useState("");
  const [start, setStart] = useState(""),
    [end, setEnd] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [uncertain, setUncertain] = useState(() => {
    try {
      return sessionStorage.getItem(storageKey) === "pending";
    } catch {
      return false;
    }
  });
  const [order, setOrder] = useState<Order | null>(null);
  async function reconcile() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await api.workorders<Page<Order>>(
        `/work-orders?branchId=${branchId}&serviceRequestId=${requestId}&pageSize=1&status=${activeStatuses}`,
      );
      if (generation !== getSessionGeneration()) return;
      if (result.items[0]) {
        setOrder(result.items[0]);
        setUncertain(false);
        sessionStorage.removeItem(storageKey);
        onChanged();
      } else
        setError(
          "Chưa tìm thấy lệnh đang mở. Tiếp tục đối soát trước khi gửi thêm thao tác; kết quả lần gửi trước có thể đang được xử lý.",
        );
    } catch (cause) {
      if (generation === getSessionGeneration())
        setError(
          cause instanceof Error ? cause.message : "Không kiểm tra được lệnh.",
        );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (lock.current || uncertain || order) return;
    if (
      Boolean(start) !== Boolean(end) ||
      (start &&
        (end <= start ||
          !Number.isFinite(new Date(start).getTime()) ||
          !Number.isFinite(new Date(end).getTime())))
    ) {
      setError(
        "Chọn đủ giờ bắt đầu và kết thúc; giờ kết thúc phải sau giờ bắt đầu.",
      );
      return;
    }
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      // Persist uncertainty before writing, including navigation/reload during POST.
      sessionStorage.setItem(storageKey, "pending");
      setUncertain(true);
      const result = await api.workorders<Order>(
        "/work-orders/quick-dispatch",
        {
          method: "POST",
          body: {
            serviceRequestId: requestId,
            technicianId,
            ...(start
              ? {
                  scheduledStart: new Date(start).toISOString(),
                  scheduledEnd: new Date(end).toISOString(),
                }
              : {}),
          },
        },
      );
      if (generation !== getSessionGeneration()) return;
      setOrder(result);
      setUncertain(false);
      sessionStorage.removeItem(storageKey);
      onChanged();
    } catch (cause) {
      if (generation !== getSessionGeneration()) return;
      if (
        cause instanceof ApiError &&
        cause.status >= 400 &&
        cause.status < 500 &&
        ![401, 408, 409].includes(cause.status)
      ) {
        setUncertain(false);
        sessionStorage.removeItem(storageKey);
      }
      setError(
        cause instanceof Error
          ? cause.message
          : "Chưa xác định kết quả điều phối. Kiểm tra lệnh liên quan.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      <button
        type="button"
        className="m1-button"
        onClick={() => dialog.current?.showModal()}
      >
        Điều phối nhanh
      </button>
      <dialog
        className="management-drawer"
        ref={dialog}
        aria-labelledby="quick-dispatch-title"
        onCancel={(event) => {
          if (busy) event.preventDefault();
        }}
      >
        <form onSubmit={submit} className="m1-form">
          <header className="management-heading">
            <div>
              <small>Yêu cầu đã tiếp nhận</small>
              <h2 id="quick-dispatch-title">Điều phối nhanh</h2>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => dialog.current?.close()}
            >
              Đóng
            </button>
          </header>
          <p>
            Tạo lệnh và phân công kỹ thuật viên trong cùng một lần xác nhận. Vật
            tư được yêu cầu và cấp trên lệnh sau khi tạo.
          </p>
          <fieldset disabled={busy || uncertain || !!order}>
            <DirectoryPicker
              label="Kỹ thuật viên cùng chi nhánh"
              area="workorders"
              path={`/technicians?branchId=${branchId}`}
              selected={technicianId}
              onChange={setTechnicianId}
            />
            <div className="management-fields">
              <label>
                Bắt đầu
                <input
                  type="datetime-local"
                  value={start}
                  onChange={(event) => setStart(event.target.value)}
                />
              </label>
              <label>
                Kết thúc
                <input
                  type="datetime-local"
                  value={end}
                  onChange={(event) => setEnd(event.target.value)}
                />
              </label>
            </div>
            <p>
              Giờ hiển thị theo múi giờ thiết bị. Trạng thái sẵn sàng chưa bảo
              đảm kỹ thuật viên trống toàn bộ khoảng hẹn.
            </p>
          </fieldset>
          {error && (
            <p role="alert" className="m1-error">
              {error}
            </p>
          )}
          {uncertain && (
            <div role="status">
              <p>
                Lần gửi chưa xác định kết quả. Đã khóa gửi mới để tránh tạo
                trùng.
              </p>
              <button
                type="button"
                disabled={busy}
                onClick={() => void reconcile()}
              >
                Kiểm tra lệnh đã tạo
              </button>
            </div>
          )}
          {order ? (
            <p role="status">
              Đã có lệnh{" "}
              <Link to={`/app/work-orders/${order.id}`}>
                {order.workOrderNo}
              </Link>
              . Mở lệnh để xem phân công và vật tư.
            </p>
          ) : (
            <button
              className="m1-button"
              disabled={busy || uncertain || !technicianId}
            >
              {busy ? "Đang xử lý…" : "Tạo lệnh & phân công"}
            </button>
          )}
        </form>
      </dialog>
    </>
  );
}
