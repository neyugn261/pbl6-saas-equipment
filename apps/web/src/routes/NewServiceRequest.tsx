import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Boxes } from "lucide-react";
import { api, ApiError } from "../api/client";
import { useSession, getSessionGeneration } from "../auth/session";
import { useDirectory } from "./registration-data";
import { rememberDemoRequest } from "./demo-request";
import { StatusBadge } from "../components/Badges";
import { RelatedName, PageHeading } from "../features/workspace/WorkspaceUI";
import { useFormDraft } from "../features/workspace/use-form-draft";
import type { Page, EquipmentRecord, RequestRecord } from "../types/domain";
function Frame({
  title,
  eyebrow,
  description,
  children,
}: {
  title: string;
  eyebrow: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="ws-page">
      <PageHeading title={title} eyebrow={eyebrow} description={description} />
      {children}
    </div>
  );
}
function Loading() {
  return <p role="status">Đang tải thiết bị…</p>;
}
function Problem({ error }: { error: unknown }) {
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => ref.current?.focus(), [error]);
  return (
    <p ref={ref} tabIndex={-1} className="m1-error" role="alert">
      {error instanceof Error ? error.message : "Chưa thể hoàn tất thao tác."}
    </p>
  );
}
export default function NewRequestPage() {
  const { profile } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const requestedEquipmentId = new URLSearchParams(location.search).get(
    "equipmentId",
  );
  const [equipmentPage, setEquipmentPage] = useState(1);
  const [equipmentSearch, setEquipmentSearch] = useState("");
  const [equipmentDraft, setEquipmentDraft] = useState("");
  const [readRevision, refreshRead] = useState(0);
  const generation = getSessionGeneration();
  const submitLock = useRef(false);
  const [uncertain, setUncertain] = useState(false);
  const data = useDirectory<Page<EquipmentRecord>>(
    "assetM2",
    `/equipment?page=${equipmentPage}&pageSize=20&q=${encodeURIComponent(equipmentSearch)}`,
    readRevision,
  );
  const [requestDraft, setRequestDraft, draftStatus] = useFormDraft(
    `request:new:${requestedEquipmentId ?? "choose"}`,
    {
      equipmentId: requestedEquipmentId ?? "",
      type: "REPAIR",
      priority: "NORMAL",
      title: "",
      description: "",
      faultCode: "",
      observedAt: "",
      contactName: "",
      contactPhone: "",
      contactWindow: "",
      actualLocation: "",
      submissionPending: false,
    },
  );
  const { equipmentId, type, priority, title, description } = requestDraft;
  const setEquipmentId = (value: string) =>
    setRequestDraft((old) => ({ ...old, equipmentId: value }));
  const setType = (value: string) =>
    setRequestDraft((old) => ({ ...old, type: value }));
  const setPriority = (value: string) =>
    setRequestDraft((old) => ({ ...old, priority: value }));
  const setTitle = (value: string) =>
    setRequestDraft((old) => ({ ...old, title: value }));
  const setDescription = (value: string) =>
    setRequestDraft((old) => ({ ...old, description: value }));
  const selected = useDirectory<EquipmentRecord>(
    "assetM2",
    equipmentId ? `/equipment/${equipmentId}` : null,
    readRevision,
  );
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (
      submitLock.current ||
      uncertain ||
      requestDraft.submissionPending ||
      generation !== getSessionGeneration()
    )
      return;
    const selectedEquipment = selected.value;
    if (!selectedEquipment) {
      setError(new Error("Vui lòng chọn thiết bị."));
      return;
    }
    const descriptionPayload = [
      description,
      requestDraft.faultCode && `Mã lỗi: ${requestDraft.faultCode}`,
      requestDraft.observedAt && `Bắt đầu xảy ra: ${requestDraft.observedAt}`,
      requestDraft.actualLocation &&
        `Địa điểm khách báo: ${requestDraft.actualLocation}`,
      requestDraft.contactName && `Người liên hệ: ${requestDraft.contactName}`,
      requestDraft.contactPhone &&
        `Điện thoại liên hệ: ${requestDraft.contactPhone}`,
      requestDraft.contactWindow &&
        `Giờ thuận tiện liên hệ: ${requestDraft.contactWindow}`,
    ]
      .filter(Boolean)
      .join("\n\n");
    if (
      !title.trim() ||
      !description.trim() ||
      descriptionPayload.length > 10000 ||
      selectedEquipment.status === "RETIRED"
    ) {
      setError(
        new Error(
          "Kiểm tra tiêu đề, thiết bị và nội dung. Tổng mô tả kèm thông tin bổ sung không quá 10.000 ký tự.",
        ),
      );
      return;
    }
    submitLock.current = true;
    setBusy(true);
    setError(null);
    draftStatus.save({ ...requestDraft, submissionPending: true });
    try {
      const created = await api.requestsLive<RequestRecord>(
        "/service-requests",
        {
          method: "POST",
          body: {
            equipmentId,
            type,
            priority,
            title,
            description: descriptionPayload,
            ...(profile?.userType === "CUSTOMER"
              ? {}
              : { customerId: selectedEquipment.customerId }),
          },
        },
      );
      if (generation !== getSessionGeneration()) return;
      draftStatus.clear();
      rememberDemoRequest(profile?.tenantId ?? null, created.id);
      navigate(
        `${profile?.userType === "CUSTOMER" ? "/portal/requests" : "/app/service-requests"}/${created.id}`,
        { state: { created: true } },
      );
    } catch (cause) {
      if (generation === getSessionGeneration()) {
        const unknown =
          !(cause instanceof ApiError) ||
          [401, 408].includes(cause.status) ||
          cause.status >= 500;
        setUncertain(unknown);
        if (!unknown)
          draftStatus.save({ ...requestDraft, submissionPending: false });
        setError(
          unknown
            ? new Error(
                "Chưa xác định yêu cầu đã tạo hay chưa. Kiểm tra danh sách yêu cầu trước khi tạo lại để tránh trùng hồ sơ.",
              )
            : cause,
        );
      }
    } finally {
      submitLock.current = false;
      if (generation === getSessionGeneration()) setBusy(false);
    }
  }
  const selectedEquipment = selected.value;
  return (
    <Frame
      title="Bạn cần hỗ trợ thiết bị nào?"
      eyebrow="YÊU CẦU MỚI"
      description="Cung cấp thông tin sự cố để bộ phận dịch vụ tiếp nhận và xử lý."
    >
      {data.loading && !selectedEquipment ? (
        <Loading />
      ) : data.error && !selectedEquipment ? (
        <>
          <Problem error={data.error} />
          <button onClick={() => refreshRead((value) => value + 1)}>
            Đọc lại danh sách thiết bị
          </button>
        </>
      ) : (
        <form className="m1-form m1-request-form" onSubmit={submit}>
          {error ? <Problem error={error} /> : null}
          <p role="status">
            {draftStatus.saved === false
              ? "Nháp chưa được lưu trên trình duyệt. Giữ trang này mở và sao chép nội dung trước khi rời."
              : "Bản nháp được giữ trong tab này cho đúng tài khoản, tối đa 12 giờ. Gửi thành công sẽ xóa nháp."}
          </p>
          {requestDraft.submissionPending && !busy && (
            <p role="alert">
              Lần gửi trước chưa xác định kết quả. Kiểm tra danh sách yêu cầu và
              liên hệ bộ phận dịch vụ trước khi tạo lại để tránh trùng hồ sơ.
            </p>
          )}
          {(uncertain || requestDraft.submissionPending) && !busy && (
            <Link
              to={
                profile?.userType === "CUSTOMER"
                  ? "/portal/requests"
                  : "/app/service-requests"
              }
            >
              Kiểm tra danh sách yêu cầu →
            </Link>
          )}
          <fieldset
            disabled={busy || requestDraft.submissionPending}
            className="m1-request-detail-grid workshop-form-fields"
          >
            <div>
              <section className="m1-card m1-section-card">
                <div className="m1-section-header">
                  <h2>1. Chọn thiết bị</h2>
                </div>
                <div className="m1-section-body">
                  {data.error && (
                    <p role="alert">
                      Danh sách tìm kiếm chưa tải được; máy đã chọn vẫn được
                      kiểm tra riêng theo hồ sơ.
                    </p>
                  )}
                  <div className="ws-actions">
                    <label>
                      Tìm thiết bị
                      <input
                        value={equipmentDraft}
                        onChange={(event) =>
                          setEquipmentDraft(event.target.value)
                        }
                        placeholder="Mã tài sản hoặc serial…"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setEquipmentSearch(equipmentDraft);
                        setEquipmentPage(1);
                      }}
                    >
                      Tìm
                    </button>
                  </div>
                  <label>
                    Thiết bị
                    <select
                      required
                      value={equipmentId}
                      onChange={(event) => setEquipmentId(event.target.value)}
                    >
                      <option value="">Chọn thiết bị</option>
                      {selectedEquipment &&
                        !data.value?.items.some(
                          (item) => item.id === equipmentId,
                        ) && (
                          <option value={equipmentId}>
                            {selectedEquipment.displayName ||
                              selectedEquipment.assetCode}{" "}
                            · {selectedEquipment.serialNumber}
                          </option>
                        )}
                      {data.value?.items
                        .filter((item) => item.status !== "RETIRED")
                        .map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.displayName ||
                              item.model?.name ||
                              item.assetCode}{" "}
                            · Serial {item.serialNumber}
                          </option>
                        ))}
                    </select>
                  </label>
                  {data.value && (
                    <div className="registration-pagination">
                      <button
                        type="button"
                        disabled={equipmentPage === 1}
                        onClick={() => setEquipmentPage((p) => p - 1)}
                      >
                        Trước
                      </button>
                      <span>
                        Trang {equipmentPage} · {data.value.total} thiết bị
                      </span>
                      <button
                        type="button"
                        disabled={equipmentPage * 20 >= data.value.total}
                        onClick={() => setEquipmentPage((p) => p + 1)}
                      >
                        Sau
                      </button>
                    </div>
                  )}
                  {selected.loading && (
                    <p role="status">Đang tải thông tin thiết bị đã chọn…</p>
                  )}
                  {selected.error ? <Problem error={selected.error} /> : null}
                  {selectedEquipment && (
                    <div className="m1-selected-equipment">
                      <span className="m1-entity-avatar">
                        <Boxes size={19} />
                      </span>
                      <span>
                        <strong>
                          {selectedEquipment.displayName ??
                            selectedEquipment.model?.name ??
                            selectedEquipment.assetCode}
                        </strong>
                        <small>
                          {selectedEquipment.assetCode} · Serial{" "}
                          {selectedEquipment.serialNumber}
                        </small>
                        <small>
                          Khách hàng:{" "}
                          <RelatedName
                            area="organization"
                            path={`/customers/${selectedEquipment.customerId}`}
                          />
                        </small>
                        <small>
                          Địa điểm trong hồ sơ:{" "}
                          <RelatedName
                            area="organization"
                            path={
                              selectedEquipment.customerSiteId
                                ? `/sites/${selectedEquipment.customerSiteId}`
                                : null
                            }
                          />
                        </small>
                      </span>
                      {selectedEquipment.warranty?.result && (
                        <StatusBadge
                          status={selectedEquipment.warranty.result}
                        />
                      )}
                    </div>
                  )}
                </div>
              </section>
              <section className="m1-card m1-section-card">
                <div className="m1-section-header">
                  <h2>2. Mô tả vấn đề</h2>
                </div>
                <div className="m1-section-body m1-form-fields">
                  <label>
                    Loại
                    <select
                      value={type}
                      onChange={(event) => setType(event.target.value)}
                    >
                      {["WARRANTY", "REPAIR", "MAINTENANCE", "INSPECTION"].map(
                        (value) => (
                          <option key={value} value={value}>
                            {
                              {
                                WARRANTY: "Bảo hành",
                                REPAIR: "Sửa chữa sự cố",
                                MAINTENANCE: "Bảo trì",
                                INSPECTION:
                                  "Chưa rõ nguyên nhân / cần kiểm tra",
                              }[value]
                            }
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                  <label>
                    Mức ảnh hưởng bạn đang gặp
                    <select
                      value={priority}
                      onChange={(event) => setPriority(event.target.value)}
                    >
                      {["LOW", "NORMAL", "HIGH", "URGENT"].map((value) => (
                        <option key={value} value={value}>
                          {
                            {
                              LOW: "Thấp",
                              NORMAL: "Trung bình",
                              HIGH: "Cao",
                              URGENT: "Khẩn cấp",
                            }[value]
                          }
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Tiêu đề
                    <input
                      required
                      maxLength={200}
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                    />
                  </label>
                  <label>
                    Mô tả
                    <textarea
                      required
                      maxLength={10000}
                      rows={5}
                      value={description}
                      onChange={(event) => setDescription(event.target.value)}
                    />
                  </label>
                  <p>
                    Bộ phận dịch vụ sẽ xem xét mức ưu tiên xử lý theo ảnh hưởng
                    thực tế bạn mô tả.
                  </p>
                  <details className="workshop-extra-fields">
                    <summary>Thêm mã lỗi, hiện trường và người liên hệ</summary>
                    <p>Thông tin bổ sung được gửi cùng mô tả sự cố.</p>
                    {(
                      [
                        ["faultCode", "Mã lỗi hiển thị trên máy"],
                        ["observedAt", "Bắt đầu xảy ra (ngày/giờ Việt Nam)"],
                        ["actualLocation", "Địa điểm thực tế nếu khác hồ sơ"],
                        ["contactName", "Người hỗ trợ tại hiện trường"],
                        ["contactPhone", "Điện thoại liên hệ"],
                        [
                          "contactWindow",
                          "Giờ thuận tiện liên hệ / tiếp cận máy",
                        ],
                      ] as const
                    ).map(([key, label]) => (
                      <label key={key}>
                        {label}
                        <input
                          maxLength={key === "contactPhone" ? 30 : 200}
                          value={requestDraft[key]}
                          onChange={(event) =>
                            setRequestDraft((old) => ({
                              ...old,
                              [key]: event.target.value,
                            }))
                          }
                        />
                      </label>
                    ))}
                  </details>
                </div>
              </section>
            </div>
            <aside>
              <section className="m1-card m1-section-card">
                <div className="m1-section-header">
                  <h2>Xác nhận yêu cầu</h2>
                </div>
                <div className="m1-section-body m1-submit-panel">
                  <p>
                    Kiểm tra thông tin thiết bị và mô tả trước khi gửi yêu cầu.
                  </p>
                  <button
                    disabled={
                      busy ||
                      uncertain ||
                      requestDraft.submissionPending ||
                      selected.loading ||
                      !selectedEquipment ||
                      !title.trim() ||
                      !description.trim() ||
                      selectedEquipment.status === "RETIRED"
                    }
                  >
                    {busy ? "Đang gửi…" : "Gửi yêu cầu dịch vụ"}
                  </button>
                </div>
              </section>
            </aside>
          </fieldset>
        </form>
      )}
    </Frame>
  );
}
