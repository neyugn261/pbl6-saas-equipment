import {
  serviceLabels,
  equipmentLifecycleLabel,
  workOrderActionError,
} from "../features/workspace/service-detail-data";
import EquipmentPartsHistory from "../features/workspace/EquipmentPartsHistory";
import { WorkOrderLocation } from "../features/workspace/WorkOrderReadiness";
import TechnicianOrderContext from "../features/workspace/TechnicianOrderContext";
import { useFormDraft } from "../features/workspace/use-form-draft";
import { vietnamInstant } from "../features/workspace/ui-values";
import {
  BusinessValues,
  ServiceSections,
  ServiceNotice,
  ServiceHeader,
  ServiceFacts,
} from "../features/workspace/ServiceDetailUI";
import { EntityPicker, RelatedName } from "../features/workspace/WorkspaceUI";
import {
  MaintenancePolicyDetails,
  WorkOrderChecklist,
  AppliedPolicyPanel,
} from "./ModelPolicyPanels";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { getSessionGeneration, useSession } from "../auth/session";
import type { Page } from "../types/domain";
import { AttachmentsPanel } from "../features/attachments/AttachmentsPanel";
import { displayName, technicianName } from "../display-names";
import DossierQr from "./DossierQr";

type Row = Record<string, unknown>;
type Availability =
  "AVAILABLE" | "RESTRICTED" | "UNAVAILABLE" | "NOT_CONFIGURED" | "NOT_FOUND";
type Section<T> = { status: Availability; data: T | null; fetchedAt?: string };
const replacementConsumerReady =
  import.meta.env.VITE_M2_REPLACEMENT_ENABLED !== "false";
type Dossier = {
  equipment: Row;
  warranties: Row[];
  calendarCoverage: Row | null;
  operationalCondition: Row;
  profileCompleteness: {
    missingFields: string[];
    legacyHistoryMayBeIncomplete: boolean;
  };
  customer: Section<Row>;
  site: Section<Row>;
  contacts: Section<Row[]>;
  location: Section<Row>;
  requests: Section<Page<Row>>;
  workOrders: Section<Page<Row>>;
  maintenance: Section<Row>;
  maintenanceHistory: Section<Page<Row>>;
  timelinePreview: Page<Row>;
  latestRecordedService: { entry: Row | null; mayLagSourceService: boolean };
  asOf: string;
};

const asText = (value: unknown) =>
  value == null || value === "" ? "—" : String(value);
const statusLabel: Record<string, string> = {
  ...serviceLabels,
  CREATED: "Mới tạo",
  ASSIGNED: "Đã phân công",
  ACCEPTED: "Đã nhận",
  TRAVELLING: "Đang di chuyển",
  IN_PROGRESS: "Đang thực hiện",
  ON_HOLD: "Tạm dừng",
  COMPLETED: "Hoàn tất",
  CANCELLED: "Đã hủy",
  ACTIVE: "Đang hoạt động",
  PAUSED: "Tạm dừng",
  INACTIVE: "Ngừng hoạt động",
  AVAILABLE: "Sẵn sàng",
  BUSY: "Đang bận",
  OFF_DUTY: "Nghỉ ca",
  PENDING: "Đang chờ",
  WORK_ORDER_CREATED: "Đã tạo lệnh",
  FAILED: "Thất bại",
};
const historyEventLabel: Record<string, string> = {
  REGISTERED: "Ghi nhận thiết bị",
  DETAILS_UPDATED: "Cập nhật thông tin thiết bị",
  STATUS_CHANGED: "Đổi trạng thái thiết bị",
  OPERATIONAL_STATUS_CONFIRMED: "Xác nhận tình trạng vận hành",
  MOVED: "Chuyển địa điểm thiết bị",
  WARRANTY_ADDED: "Thêm bảo hành",
  WARRANTY_VOIDED: "Hủy hiệu lực bảo hành",
  MODEL_CREATED: "Tạo model",
  MODEL_UPDATED: "Cập nhật model",
  REGISTRATION_CUSTOMER_CONFIRMED: "Khách xác nhận bàn giao",
  REGISTRATION_STAFF_COMPLETED: "Nhân viên hoàn tất bàn giao tại cửa hàng",
  MODEL_POLICIES_APPLIED: "Áp dụng chính sách model",
  SERVICE_SETUP_COMPLETED: "Hoàn tất thiết lập dịch vụ",
  QR_CREATED: "Tạo mã QR",
  QR_REPRINTED: "Cấp lại mã QR",
  QR_REVOKED: "Thu hồi mã QR",
  PLAN_CREATED: "Tạo kế hoạch",
  PLAN_UPDATED: "Cập nhật kế hoạch",
  PLAN_STATUS_CHANGED: "Đổi trạng thái kế hoạch",
  TASK_GENERATED: "Tạo công việc bảo trì",
  SCHEDULE_ADVANCED: "Chuyển kỳ bảo trì",
  REPLACEMENT_REQUESTED: "Yêu cầu lệnh thay thế",
  WORK_ORDER_CREATED: "Tạo lệnh công việc",
  WORK_ORDER_CANCELLED: "Hủy lệnh công việc",
  WORK_ORDER_COMPLETED: "Hoàn tất lệnh công việc",
  SERVICE_REQUEST_STATUS_CHANGED: "Đổi trạng thái yêu cầu dịch vụ",
};
const eventLabel = (value: unknown) => {
  const key = asText(value);
  return key === "—"
    ? key
    : (historyEventLabel[key] ??
        statusLabel[key] ??
        key.replaceAll("_", " ").toLowerCase());
};
const operationalLabels: Record<string, string> = {
  UNKNOWN: "Chưa xác nhận tình trạng vận hành",
  OPERATIONAL: "Hoạt động",
  DEGRADED: "Suy giảm",
  NOT_OPERATIONAL: "Không hoạt động",
};
const date = (value: unknown) => {
  if (!value) return "—";
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text))
    return text.split("-").reverse().join("/");
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime())
    ? "—"
    : parsed.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
};
const message: Record<Exclude<Availability, "AVAILABLE">, string> = {
  RESTRICTED: "Bạn không có quyền xem mục này.",
  UNAVAILABLE: "Nguồn dữ liệu tạm thời không phản hồi. Vui lòng thử lại.",
  NOT_CONFIGURED: "Nguồn dữ liệu chưa được cấu hình.",
  NOT_FOUND: "Không tìm thấy dữ liệu tại nguồn.",
};

function useRemote<T>(key: string, load: () => Promise<T>) {
  const generation = getSessionGeneration();
  const [state, setState] = useState<{
    key: string;
    value?: T;
    error?: string;
    loading: boolean;
  }>({ key: "", loading: true });
  useEffect(() => {
    let active = true;
    const requestKey = `${key}:session-${generation}`;
    load().then(
      (value) => {
        if (active) setState({ key: requestKey, value, loading: false });
      },
      (error) => {
        if (active)
          setState({
            key: requestKey,
            error:
              error instanceof ApiError
                ? `${error.status} · ${error.message}`
                : String(error),
            loading: false,
          });
      },
    );
    return () => {
      active = false;
    };
    // The key identifies the server query; callers construct a fresh load function each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, generation]);
  return state.key === `${key}:session-${generation}`
    ? state
    : {
        key,
        value: undefined as T | undefined,
        error: undefined as string | undefined,
        loading: true,
      };
}

function Result({
  state,
  children,
}: {
  state: { loading: boolean; error?: string };
  children: React.ReactNode;
}) {
  if (state.loading) return <p role="status">Đang tải…</p>;
  if (state.error)
    return (
      <p role="alert" className="m1-error">
        {state.error}
      </p>
    );
  return children;
}

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="m1-card m1-section-card">
      <div className="m1-section-header">
        <h2>{title}</h2>
      </div>
      <div className="m1-section-body">{children}</div>
    </section>
  );
}

function Source<T>({
  section,
  children,
}: {
  section: Section<T>;
  children: (data: T) => React.ReactNode;
}) {
  if (!section) return <p role="status">Chưa tải được mục này.</p>;
  if (section.status !== "AVAILABLE")
    return <p role="status">{message[section.status]}</p>;
  return section.data == null ? (
    <p>Chưa có dữ liệu.</p>
  ) : (
    <>{children(section.data)}</>
  );
}

function Fields({ row, fields }: { row: Row; fields: [string, string][] }) {
  return (
    <dl>
      {fields.map(([key, label]) => (
        <div key={key}>
          <dt>{label}</dt>
          <dd>
            {key === "currentTechnicianId"
              ? row.currentTechnicianId
                ? technicianName(
                    row.currentTechnicianName,
                    row.currentTechnicianEmployeeCode,
                  )
                : "Chưa phân công"
              : key === "branchId"
                ? displayName("branch", {
                    name: row.branchName,
                    code: row.branchCode,
                  })
                : key === "userId"
                  ? displayName("user", {
                      name: row.fullName,
                      code: row.employeeCode,
                    })
                  : key === "equipmentId"
                    ? displayName("equipment", {
                        name: row.equipmentName,
                        code: row.assetCode,
                      })
                    : key === "workOrderId"
                      ? row.workOrderId
                        ? displayName("workOrder", { code: row.workOrderNo })
                        : "Chưa tạo lệnh công việc"
                      : /(Date|At|Start|End)$/.test(key)
                        ? date(row[key])
                        : (statusLabel[String(row[key])] ?? asText(row[key]))}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function HistoryRows({ items }: { items: Row[] }) {
  const { profile } = useSession();
  const base = profile?.userType === "CUSTOMER" ? "/portal" : "/app";
  return items.length ? (
    <ul className="m1-timeline">
      {items.map((item, index) => (
        <li key={asText(item.id ?? index)}>
          <strong>
            {eventLabel(item.eventType ?? item.newStatus ?? item.status)}
          </strong>
          <span>
            {" "}
            · Xảy ra {date(item.occurredAt ?? item.changedAt)} · Ghi nhận{" "}
            {date(item.recordedAt ?? item.createdAt)}
          </span>
          {Boolean(item.equipmentId) && (
            <p>
              Thiết bị:{" "}
              <RelatedName
                area="assetM2"
                path={`/equipment/${item.equipmentId}`}
                initial={
                  (item.context as Row | null)?.displayName ??
                  (item.context as Row | null)?.assetCode
                }
                to={`${base}/equipment/${item.equipmentId}`}
                fallback="Mở hồ sơ thiết bị"
              />
            </p>
          )}
          <p>
            Người thực hiện:{" "}
            {item.actorType === "SYSTEM"
              ? "Hệ thống"
              : displayName("user", {
                  name:
                    item.actorName ??
                    item.createdByName ??
                    item.changedByName ??
                    (String(
                      item.actorId ?? item.createdBy ?? item.changedBy,
                    ).toLowerCase() === profile?.id?.toLowerCase()
                      ? profile?.fullName
                      : null),
                })}
            {Array.isArray(item.actorRoles) && item.actorRoles.length
              ? ` · ${item.actorRoles.map((role) => serviceLabels[String(role)] ?? "Nhân viên").join(", ")}`
              : ""}
          </p>
          {Boolean(item.reason ?? item.reasonInternal) && (
            <p>Lý do: {asText(item.reason ?? item.reasonInternal)}</p>
          )}
          {Boolean(item.customerNote) && (
            <p>Ghi chú cho khách hàng: {asText(item.customerNote)}</p>
          )}
          {item.referenceType === "SERVICE_REQUEST" &&
            Boolean(item.referenceId) && (
              <p>
                <Link
                  to={`${base === "/portal" ? "/portal/requests" : "/app/service-requests"}/${item.referenceId}`}
                >
                  Mở yêu cầu dịch vụ liên quan
                </Link>
              </p>
            )}
          {profile?.userType === "TENANT_STAFF" &&
            item.referenceType === "WORK_ORDER" &&
            Boolean(item.referenceId) && (
              <p>
                <Link to={`/app/work-orders/${item.referenceId}`}>
                  Mở lệnh công việc liên quan
                </Link>
              </p>
            )}
          {Boolean(item.planId) && (
            <p>
              <Link to={`/app/maintenance/${item.planId}?kind=plan`}>
                Mở kế hoạch liên quan
              </Link>
            </p>
          )}
          {Boolean(item.taskId) && (
            <p>
              <Link to={`/app/maintenance/${item.taskId}?kind=task`}>
                Mở công việc bảo trì liên quan
              </Link>
            </p>
          )}
          {item.completeness === "LEGACY_SUMMARY" && (
            <p>Chi tiết cũ có thể chưa đầy đủ.</p>
          )}
          {Boolean(
            item.changes &&
            typeof item.changes === "object" &&
            Object.keys(item.changes).length > 0,
          ) && (
            <details>
              <summary>Trước / sau</summary>
              <BusinessValues data={item.changes} />
            </details>
          )}
          {Boolean(item.context && typeof item.context === "object") && (
            <details>
              <summary>Bối cảnh ghi nhận</summary>
              <BusinessValues data={item.context} />
            </details>
          )}
        </li>
      ))}
    </ul>
  ) : (
    <p>Chưa có lịch sử được ghi nhận.</p>
  );
}

function LinkedRows({
  items,
  type,
  equipmentId,
}: {
  items: Row[];
  type: "request" | "workorder" | "plan" | "task";
  equipmentId: string;
}) {
  const { pathname } = useLocation();
  const base = pathname.startsWith("/portal") ? "/portal" : "/app";
  if (!items.length) return <p>Chưa có bản ghi.</p>;
  return (
    <ul className="m2-linked-list">
      {items.map((item) => {
        const id = String(item.id);
        const path =
          type === "request"
            ? `${base === "/portal" ? "/portal/requests" : "/app/service-requests"}/${id}`
            : type === "workorder"
              ? `${base}/work-orders/${id}?equipmentId=${equipmentId}`
              : `${base}/maintenance/${id}?kind=${type}`;
        return (
          <li key={id}>
            <Link to={path}>
              {asText(
                item.requestNo ??
                  item.workOrderNo ??
                  item.name ??
                  item.title ??
                  item.taskNo ??
                  "Xem hồ sơ",
              )}
            </Link>
            <span className="m2-row-meta">
              <span
                className={`m2-status m2-status--${String(item.status ?? "").toLowerCase()}`}
              >
                {statusLabel[String(item.status)] ?? asText(item.status)}
              </span>
              <time>
                {date(item.nextDueDate ?? item.scheduledDate ?? item.createdAt)}
              </time>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function EquipmentEditor({
  equipmentId,
  equipment,
  onSaved,
}: {
  equipmentId: string;
  equipment: Row;
  onSaved: (message: string) => void;
}) {
  const [displayName, setDisplayName] = useState(
    String(equipment.displayName ?? ""),
  );
  const [specs, setSpecs] = useState<
    { name: string; value: string; type: string }[]
  >(() =>
    Object.entries((equipment.technicalSpecifications ?? {}) as Row).map(
      ([name, value]) => ({ name, value: String(value), type: typeof value }),
    ),
  );
  const [commissionedDate, setCommissionedDate] = useState(
    String(equipment.commissionedDate ?? "").slice(0, 10),
  );
  const [operationalStatus, setOperationalStatus] = useState(
    String(equipment.operationalStatus ?? "UNKNOWN"),
  );
  const [reason, setReason] = useState("");
  const [customerNote, setCustomerNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submitProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    let technicalSpecifications: Record<
      string,
      string | number | boolean
    > | null = null;
    if (specs.length) {
      if (
        specs.some((item) => !item.name.trim()) ||
        new Set(specs.map((item) => item.name.trim())).size !== specs.length
      ) {
        setError("Tên thông số không được trống hoặc trùng nhau.");
        return;
      }
      if (
        specs.some(
          (item) =>
            item.type === "number" &&
            (!item.value.trim() || !Number.isFinite(Number(item.value))),
        )
      ) {
        setError("Giá trị số không hợp lệ.");
        return;
      }
      technicalSpecifications = Object.fromEntries(
        specs.map((item) => [
          item.name.trim(),
          item.type === "number"
            ? Number(item.value)
            : item.type === "boolean"
              ? item.value === "true"
              : item.value,
        ]),
      );
    }
    setBusy(true);
    try {
      await api.assetM2(`/equipment/${equipmentId}`, {
        method: "PATCH",
        body: {
          displayName: displayName.trim() || null,
          technicalSpecifications,
          commissionedDate: commissionedDate || null,
        },
      });
      onSaved("Đã lưu hồ sơ thiết bị.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  async function confirmCondition(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!reason.trim()) {
      setError("Cần nhập lý do cho mỗi lần xác nhận tình trạng vận hành.");
      return;
    }
    setBusy(true);
    try {
      await api.assetM2(`/equipment/${equipmentId}`, {
        method: "PATCH",
        body: {
          operationalStatus,
          reason: reason.trim(),
          customerNote: customerNote.trim() || null,
        },
      });
      onSaved("Đã xác nhận tình trạng vận hành.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Cập nhật thiết bị">
      <form className="m2-editor" onSubmit={submitProfile}>
        <h3>Hồ sơ</h3>
        <label>
          Tên hiển thị
          <input
            maxLength={200}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </label>
        <fieldset className="sd-specs">
          <legend>Thông số kỹ thuật</legend>
          {specs.map((item, index) => (
            <div className="sd-spec-row" key={index}>
              <label>
                Tên thông số
                <input
                  aria-label={`Tên thông số ${index + 1}`}
                  value={item.name}
                  maxLength={100}
                  onChange={(e) =>
                    setSpecs(
                      specs.map((row, i) =>
                        i === index ? { ...row, name: e.target.value } : row,
                      ),
                    )
                  }
                />
              </label>
              <label>
                Kiểu dữ liệu
                <select
                  value={item.type}
                  onChange={(e) =>
                    setSpecs(
                      specs.map((row, i) =>
                        i === index
                          ? {
                              ...row,
                              type: e.target.value,
                              value: e.target.value === "boolean" ? "true" : "",
                            }
                          : row,
                      ),
                    )
                  }
                >
                  <option value="string">Văn bản</option>
                  <option value="number">Số</option>
                  <option value="boolean">Có / Không</option>
                </select>
              </label>
              <label>
                Giá trị
                {item.type === "boolean" ? (
                  <select
                    value={item.value}
                    onChange={(e) =>
                      setSpecs(
                        specs.map((row, i) =>
                          i === index ? { ...row, value: e.target.value } : row,
                        ),
                      )
                    }
                  >
                    <option value="true">Có</option>
                    <option value="false">Không</option>
                  </select>
                ) : (
                  <input
                    type={item.type === "number" ? "number" : "text"}
                    step="any"
                    value={item.value}
                    onChange={(e) =>
                      setSpecs(
                        specs.map((row, i) =>
                          i === index ? { ...row, value: e.target.value } : row,
                        ),
                      )
                    }
                  />
                )}
              </label>
              <button
                type="button"
                aria-label={`Xóa thông số ${index + 1}`}
                onClick={() => setSpecs(specs.filter((_, i) => i !== index))}
              >
                Bỏ
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              setSpecs([...specs, { name: "", value: "", type: "string" }])
            }
          >
            + Thêm thông số
          </button>
        </fieldset>
        <label>
          Ngày đưa vào vận hành
          <input
            type="date"
            value={commissionedDate}
            onChange={(e) => setCommissionedDate(e.target.value)}
          />
        </label>
        <button disabled={busy} type="submit">
          Lưu hồ sơ
        </button>
      </form>
      <form className="m2-editor" onSubmit={confirmCondition}>
        <h3>Xác nhận tình trạng vận hành</h3>
        <label>
          Tình trạng
          <select
            value={operationalStatus}
            onChange={(e) => setOperationalStatus(e.target.value)}
          >
            <option value="UNKNOWN">Chưa rõ</option>
            <option value="OPERATIONAL">Hoạt động</option>
            <option value="DEGRADED">Suy giảm</option>
            <option value="NOT_OPERATIONAL">Không hoạt động</option>
          </select>
        </label>
        <label>
          Lý do xác nhận
          <textarea
            required
            maxLength={2000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        <label>
          Ghi chú cho khách hàng (nếu có)
          <textarea
            maxLength={2000}
            value={customerNote}
            onChange={(e) => setCustomerNote(e.target.value)}
          />
        </label>
        <button disabled={busy} type="submit">
          Xác nhận tình trạng
        </button>
      </form>
      {error && (
        <p role="alert" className="m1-error">
          {error}
        </p>
      )}
    </Card>
  );
}

export function DossierPage() {
  const { id } = useParams();
  const { profile } = useSession();
  const [revision, setRevision] = useState(0);
  const [notice, setNotice] = useState("");
  const state = useRemote<Dossier>(`dossier:${id}:${revision}`, () =>
    api.assetM2(`/equipment/${id}/dossier`),
  );
  const dossier = state.value;
  const base = profile?.userType === "CUSTOMER" ? "/portal" : "/app";
  const canManageEquipment =
    profile?.userType === "TENANT_STAFF" &&
    profile.roles.some((role) =>
      ["TENANT_ADMIN", "SERVICE_MANAGER"].includes(role),
    );
  return (
    <div className="m2-page sd-page">
      <ServiceHeader
        back={`${base}/equipment`}
        backLabel="Danh sách thiết bị"
        code={asText(dossier?.equipment.assetCode ?? "HỒ SƠ THIẾT BỊ")}
        title={asText(
          dossier?.equipment.displayName ??
            dossier?.equipment.assetCode ??
            "Hồ sơ thiết bị",
        )}
        description={`Thông tin thiết bị, bảo hành và các hoạt động dịch vụ đã ghi nhận · Cập nhật ${date(dossier?.asOf)}`}
        status={dossier?.equipment.status}
        statusLabel={equipmentLifecycleLabel(dossier?.equipment.status)}
      />
      {notice && <p role="status">{notice}</p>}
      {canManageEquipment && dossier && (
        <ServiceNotice
          title={
            dossier.profileCompleteness.missingFields.length
              ? "Hồ sơ cần bổ sung thông tin"
              : "Hồ sơ dịch vụ của thiết bị"
          }
        >
          <p>
            Kiểm tra thông tin nhận dạng, phạm vi bảo hành và lịch sử trước khi
            quyết định xử lý.
          </p>
          <div className="registration-actions">
            <Link to={`/app/service-requests/new?equipmentId=${id}`}>
              + Tạo yêu cầu dịch vụ
            </Link>
            <Link
              to={
                dossier.equipment.registrationId
                  ? `/app/equipment-registrations/${dossier.equipment.registrationId}`
                  : `/app/equipment-registrations/new?equipmentId=${id}`
              }
            >
              {dossier.equipment.registrationStatus === "COMPLETED"
                ? "Xem biên nhận thiết lập dịch vụ"
                : "Hoàn thiện bàn giao & bảo hành"}
            </Link>
          </div>
        </ServiceNotice>
      )}
      <Result state={state}>
        {dossier && (
          <>
            <section
              className="workshop-equipment-passport"
              aria-label="Nhận dạng thiết bị"
            >
              <div>
                <span className="workshop-code">
                  HỒ SƠ THIẾT BỊ / {asText(dossier.equipment.assetCode)}
                </span>
                <h2>
                  {asText(
                    dossier.equipment.displayName ??
                      dossier.equipment.assetCode,
                  )}
                </h2>
                <p>Serial {asText(dossier.equipment.serialNumber)}</p>
                <Source section={dossier.customer}>
                  {(row) => <strong>{asText(row.name)}</strong>}
                </Source>
                <Source section={dossier.site}>
                  {(row) => <p>{asText(row.name)}</p>}
                </Source>
              </div>
              <dl>
                <div>
                  <dt>Ngày bàn giao</dt>
                  <dd>{date(dossier.equipment.handoverDate)}</dd>
                </div>
                <div>
                  <dt>Bảo hành theo lịch</dt>
                  <dd>
                    {statusLabel[String(dossier.calendarCoverage?.result)] ??
                      asText(dossier.calendarCoverage?.result)}
                  </dd>
                </div>
                <div>
                  <dt>Tình trạng vận hành đã ghi nhận</dt>
                  <dd>
                    {operationalLabels[
                      String(dossier.operationalCondition.status)
                    ] ?? asText(dossier.operationalCondition.status)}
                  </dd>
                </div>
              </dl>
            </section>
            {canManageEquipment && id && (
              <DossierQr key={id} equipmentId={id} assetCode={asText(dossier.equipment.assetCode)} />
            )}
            <ServiceSections
              items={[
                {
                  key: "profile",
                  label: "Thông tin & bảo hành",
                  content: (
                    <div className="m2-grid">
                      <Card title="Thông tin thiết bị">
                        <Fields
                          row={{
                            ...dossier.equipment,
                            lifecycleLabel: equipmentLifecycleLabel(
                              dossier.equipment.status,
                            ),
                          }}
                          fields={[
                            ["assetCode", "Mã tài sản"],
                            ["serialNumber", "Serial"],
                            ["lifecycleLabel", "Vòng đời hồ sơ thiết bị"],
                            ["commissionedDate", "Ngày đưa vào vận hành"],
                            ["handoverDate", "Ngày bàn giao"],
                          ]}
                        />
                        <h3>Thông số kỹ thuật</h3>
                        <BusinessValues
                          data={dossier.equipment.technicalSpecifications}
                        />
                        {dossier.profileCompleteness.missingFields.length >
                          0 && (
                          <p>
                            Hồ sơ còn thiếu:{" "}
                            {dossier.profileCompleteness.missingFields
                              .map((field) => serviceLabels[field] ?? field)
                              .join(", ")}
                          </p>
                        )}
                      </Card>
                      {canManageEquipment &&
                        dossier.equipment.status !== "RETIRED" && (
                          <details className="sd-edit-disclosure">
                            <summary>
                              Chỉnh sửa hồ sơ / xác nhận tình trạng
                            </summary>
                            <EquipmentEditor
                              key={`${id}:${revision}`}
                              equipmentId={id!}
                              equipment={dossier.equipment}
                              onSaved={(message) => {
                                setNotice(message);
                                setRevision((value) => value + 1);
                              }}
                            />
                          </details>
                        )}
                      {canManageEquipment &&
                        dossier.equipment.status === "RETIRED" && (
                          <p>
                            Thiết bị đã ngừng sử dụng; không thể chỉnh hồ sơ
                            hoặc xác nhận tình trạng.
                          </p>
                        )}
                      <Card title="Bảo hành và tình trạng">
                        <p>
                          Bảo hành theo lịch:{" "}
                          {asText(
                            statusLabel[
                              String(dossier.calendarCoverage?.result)
                            ] ?? dossier.calendarCoverage?.result,
                          )}
                        </p>
                        <p>
                          Quyết định bảo hành của từng yêu cầu được lưu riêng
                          khi xét duyệt.
                        </p>
                        <p>
                          Tình trạng vận hành:{" "}
                          {operationalLabels[
                            String(dossier.operationalCondition.status)
                          ] ?? asText(dossier.operationalCondition.status)}
                          {Boolean(
                            dossier.operationalCondition.confirmedAt,
                          ) && (
                            <>
                              {" "}
                              · Xác nhận{" "}
                              {date(dossier.operationalCondition.confirmedAt)}
                            </>
                          )}
                        </p>
                        <p>
                          Xác nhận này không bảo đảm tình trạng hiện tại của
                          thiết bị.
                        </p>
                        {dossier.warranties.map((w) => (
                          <p key={String(w.id)}>
                            {statusLabel[String(w.warrantyType)] ??
                              asText(w.warrantyType)}{" "}
                            · {date(w.startDate)} – {date(w.endDate)} ·{" "}
                            {statusLabel[String(w.status)] ?? asText(w.status)}{" "}
                            ·{" "}
                            <Link to={`${base}/warranties/${w.id}/history`}>
                              Lịch sử
                            </Link>
                          </p>
                        ))}
                        {profile?.userType !== "CUSTOMER" &&
                          Boolean(dossier.equipment.modelId) && (
                            <Link
                              to={`/app/models/${dossier.equipment.modelId}/history`}
                            >
                              Lịch sử Model
                            </Link>
                          )}
                      </Card>
                      <Card title="Khách hàng và vị trí">
                        <Source section={dossier.customer}>
                          {(row) => (
                            <p>
                              <strong>{asText(row.name)}</strong>
                              {Boolean(row.address) && (
                                <>
                                  <br />
                                  {asText(row.address)}
                                </>
                              )}
                            </p>
                          )}
                        </Source>
                        <Source section={dossier.site}>
                          {(row) => <p>Địa điểm: {asText(row.name)}</p>}
                        </Source>
                        <Source section={dossier.location}>
                          {(row) => <p>Vị trí: {asText(row.name)}</p>}
                        </Source>
                        <Source section={dossier.contacts}>
                          {(rows) => (
                            <>
                              {rows.map((row) => (
                                <p key={String(row.id)}>
                                  <strong>{asText(row.name)}</strong>
                                  <br />
                                  {Boolean(row.phone) && (
                                    <a href={`tel:${row.phone}`}>
                                      {asText(row.phone)}
                                    </a>
                                  )}
                                  {Boolean(row.email) && (
                                    <>
                                      <br />
                                      <a href={`mailto:${row.email}`}>
                                        {asText(row.email)}
                                      </a>
                                    </>
                                  )}
                                </p>
                              ))}
                            </>
                          )}
                        </Source>
                      </Card>
                    </div>
                  ),
                },
                {
                  key: "policy",
                  label: "Chính sách áp dụng",
                  content: id && (
                    <AppliedPolicyPanel key={id} equipmentId={id} />
                  ),
                },
                {
                  key: "services",
                  label: "Dịch vụ & bảo trì",
                  content: (
                    <div className="m2-grid">
                      <Card title="Yêu cầu dịch vụ">
                        <Source section={dossier.requests}>
                          {(page) => (
                            <>
                              <LinkedRows
                                items={page.items}
                                type="request"
                                equipmentId={id!}
                              />
                              <Link
                                to={`${base}/equipment/${id}/service-requests`}
                              >
                                Xem tất cả ({page.total})
                              </Link>
                            </>
                          )}
                        </Source>
                      </Card>
                      <Card title="Lệnh công việc">
                        <Source section={dossier.workOrders}>
                          {(page) => (
                            <>
                              <LinkedRows
                                items={page.items}
                                type="workorder"
                                equipmentId={id!}
                              />
                              <Link to={`${base}/equipment/${id}/work-orders`}>
                                Xem tất cả ({page.total})
                              </Link>
                            </>
                          )}
                        </Source>
                      </Card>
                      <Card title="Bảo trì">
                        <Source section={dossier.maintenance}>
                          {(row) => (
                            <>
                              <p>
                                Lần kế tiếp:{" "}
                                {date((row.nextDue as Row | null)?.date)}
                              </p>
                              <p>
                                Công việc đang quá hạn:{" "}
                                {asText(row.overdueOpenTaskCount)}
                              </p>
                              <h3>Tình trạng kế hoạch</h3>
                              <BusinessValues data={row.planCounts ?? {}} />
                            </>
                          )}
                        </Source>
                        <Source section={dossier.maintenanceHistory}>
                          {(page) => (
                            <>
                              <HistoryRows items={page.items} />
                              <Link
                                to={`${base}/equipment/${id}/maintenance-history`}
                              >
                                Xem toàn bộ lịch sử bảo trì ({page.total})
                              </Link>
                            </>
                          )}
                        </Source>
                        {(profile?.userType !== "CUSTOMER" ||
                          profile.roles.includes("CUSTOMER_ADMIN")) && (
                          <>
                            <Link
                              to={`${base}/equipment/${id}/maintenance-plans`}
                            >
                              Xem kế hoạch
                            </Link>{" "}
                            ·{" "}
                            <Link
                              to={`${base}/equipment/${id}/maintenance-tasks`}
                            >
                              Xem công việc
                            </Link>
                          </>
                        )}
                      </Card>
                      <Card title="Dịch vụ ghi nhận gần nhất">
                        <p>
                          {dossier.latestRecordedService.entry
                            ? date(
                                dossier.latestRecordedService.entry.occurredAt,
                              )
                            : "Chưa ghi nhận"}
                        </p>
                        <p>Dữ liệu có thể cập nhật chậm hơn Work Order.</p>
                      </Card>
                    </div>
                  ),
                },
                {
                  key: "history",
                  label: "Lịch sử đã ghi nhận",
                  content: (
                    <div className="sd-stack">
                      <ServiceNotice title="Phạm vi lịch sử được tổng hợp">
                        <p>
                          Gồm thay đổi hồ sơ thiết bị, trạng thái yêu cầu và kết
                          quả công việc đã đồng bộ. Phân công, nhật ký kỹ thuật
                          và trao đổi chi tiết nằm trong hồ sơ nguồn theo quyền
                          của bạn. Dữ liệu cũ có thể chưa đầy đủ; các nguồn có
                          thể cập nhật vào những thời điểm khác nhau.
                        </p>
                      </ServiceNotice>
                      <Card title="Dòng lịch sử">
                        <HistoryRows items={dossier.timelinePreview.items} />
                        <Link to={`${base}/equipment/${id}/timeline`}>
                          Xem tất cả ({dossier.timelinePreview.total})
                        </Link>
                      </Card>
                    </div>
                  ),
                },
                {
                  key: "service-parts",
                  label: "Phụ tùng đã sử dụng",
                  content: id ? (
                    <EquipmentPartsHistory key={id} equipmentId={id} />
                  ) : null,
                },
              ]}
            />
          </>
        )}
      </Result>
    </div>
  );
}

const linkedPaths = {
  "service-requests": "service-requests",
  "work-orders": "work-orders",
  "maintenance-plans": "maintenance-plans",
  "maintenance-tasks": "maintenance-tasks",
} as const;
export function EquipmentFeedPage({
  kind,
}: {
  kind: keyof typeof linkedPaths;
}) {
  const { id } = useParams();
  const { pathname } = useLocation();
  const base = pathname.startsWith("/portal") ? "/portal" : "/app";
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const path = `/equipment/${id}/${linkedPaths[kind]}?page=${page}&pageSize=20${status && kind !== "maintenance-plans" && kind !== "maintenance-tasks" ? `&status=${encodeURIComponent(status)}` : ""}`;
  const state = useRemote<Section<Page<Row>>>(path, () => api.assetM2(path));
  return (
    <div className="m2-page">
      <Link to={`${base}/equipment/${id}`}>← Hồ sơ thiết bị</Link>
      <h1>
        {
          {
            "service-requests": "Yêu cầu dịch vụ của thiết bị",
            "work-orders": "Lệnh công việc của thiết bị",
            "maintenance-plans": "Kế hoạch bảo trì của thiết bị",
            "maintenance-tasks": "Công việc bảo trì của thiết bị",
          }[kind]
        }
      </h1>
      <p>
        Tra cứu hồ sơ liên quan theo từng thiết bị; chọn một dòng để xem đầy đủ
        thông tin.
      </p>
      {kind !== "maintenance-plans" && kind !== "maintenance-tasks" && (
        <label>
          Lọc trạng thái{" "}
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
          >
            <option value="">Tất cả trạng thái</option>
            {(kind === "work-orders"
              ? [
                  "CREATED",
                  "ASSIGNED",
                  "ACCEPTED",
                  "TRAVELLING",
                  "IN_PROGRESS",
                  "ON_HOLD",
                  "COMPLETED",
                  "CANCELLED",
                ]
              : [
                  "NEW",
                  "REVIEWING",
                  "AWAITING_INFO",
                  "ACCEPTED",
                  "AWAITING_CUSTOMER_APPROVAL",
                  "PROCESSING",
                  "RESOLVED",
                  "CLOSED",
                  "REJECTED",
                  "CANCELLED",
                ]
            ).map((key) => (
              <option key={key} value={key}>
                {statusLabel[key] ?? key}
              </option>
            ))}
          </select>
        </label>
      )}
      <Result state={state}>
        {state.value && (
          <Source section={state.value}>
            {(data) => (
              <>
                <LinkedRows
                  items={data.items}
                  type={
                    kind === "service-requests"
                      ? "request"
                      : kind === "work-orders"
                        ? "workorder"
                        : kind === "maintenance-plans"
                          ? "plan"
                          : "task"
                  }
                  equipmentId={id!}
                />
                <p>
                  Trang {page} · Tổng {data.total}
                </p>
                <button disabled={page === 1} onClick={() => setPage(page - 1)}>
                  Trước
                </button>
                <button
                  disabled={page * 20 >= data.total}
                  onClick={() => setPage(page + 1)}
                >
                  Sau
                </button>
              </>
            )}
          </Source>
        )}
      </Result>
    </div>
  );
}

type HistoryFilter = {
  equipmentId: string;
  customerId: string;
  siteId: string;
  actorId: string;
  eventType: string;
  referenceType: string;
  referenceId: string;
  from: string;
  to: string;
  sort: string;
};
const emptyHistoryFilter: HistoryFilter = {
  equipmentId: "",
  customerId: "",
  siteId: "",
  actorId: "",
  eventType: "",
  referenceType: "",
  referenceId: "",
  from: "",
  to: "",
  sort: "-occurredAt",
};
export function HistoryFeedPage({ equipmentId }: { equipmentId?: string }) {
  const { pathname } = useLocation();
  const { profile } = useSession();
  const [draft, setDraft] = useState<HistoryFilter>(emptyHistoryFilter);
  const [filter, setFilter] = useState<HistoryFilter>(emptyHistoryFilter);
  const [page, setPage] = useState(1);
  const params = new URLSearchParams({ page: String(page), pageSize: "20" });
  for (const [key, value] of Object.entries(filter))
    if (value && !(equipmentId && key === "equipmentId"))
      params.set(
        key,
        key === "from" || key === "to" ? new Date(value).toISOString() : value,
      );
  const path = equipmentId
    ? `/equipment/${equipmentId}/timeline?${params}`
    : `/equipment-history?${params}`;
  const state = useRemote<Page<Row>>(path, () => api.assetM2(path));
  const fields: [keyof HistoryFilter, string][] = [
    ["equipmentId", "ID thiết bị"],
    ["customerId", "ID khách hàng"],
    ["siteId", "ID địa điểm"],
    ["actorId", "ID người thực hiện"],
    ["eventType", "Loại sự kiện"],
    ["referenceType", "Loại tham chiếu"],
    ["referenceId", "ID tham chiếu"],
  ];
  const base = pathname.startsWith("/portal") ? "/portal" : "/app";
  return (
    <div className="m2-page">
      {equipmentId && (
        <Link to={`${base}/equipment/${equipmentId}`}>← Hồ sơ thiết bị</Link>
      )}
      <h1>Lịch sử thiết bị</h1>
      <form
        className="m2-filters"
        onSubmit={(event) => {
          event.preventDefault();
          setFilter(draft);
          setPage(1);
        }}
      >
        {fields
          .filter(
            ([key]) =>
              !(equipmentId && key === "equipmentId") &&
              !(profile?.userType === "CUSTOMER" && key === "actorId") &&
              !(
                profile?.roles.includes("SERVICE_MANAGER") &&
                ["actorId", "referenceId", "referenceType"].includes(key)
              ),
          )
          .map(([key, label]) =>
            ["equipmentId", "customerId", "siteId"].includes(key) ? (
              <EntityPicker
                key={key}
                label={
                  key === "equipmentId"
                    ? "Thiết bị"
                    : key === "customerId"
                      ? "Khách hàng"
                      : "Địa điểm"
                }
                area={key === "equipmentId" ? "assetM2" : "organization"}
                path={
                  key === "equipmentId"
                    ? "/equipment"
                    : key === "customerId"
                      ? "/customers"
                      : draft.customerId
                        ? `/customers/${draft.customerId}/sites`
                        : null
                }
                selected={draft[key]}
                onChange={(id) =>
                  setDraft((current) => ({
                    ...current,
                    [key]: id,
                    ...(key === "customerId" ? { siteId: "" } : {}),
                  }))
                }
              />
            ) : (
              <label key={key}>
                {label}
                <select
                  value={draft[key]}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      [key]: event.target.value,
                    }))
                  }
                >
                  <option value="">Tất cả</option>
                  {Object.entries(historyEventLabel).map(([code, label]) => (
                    <option key={code} value={code}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            ),
          )}
        {(["from", "to"] as const).map((key) => (
          <label key={key}>
            {key === "from" ? "Từ" : "Đến"}
            <input
              type="datetime-local"
              value={draft[key]}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  [key]: event.target.value,
                }))
              }
            />
          </label>
        ))}
        <label>
          Sắp xếp
          <select
            value={draft.sort}
            onChange={(event) =>
              setDraft((current) => ({ ...current, sort: event.target.value }))
            }
          >
            <option value="-occurredAt">Mới nhất</option>
            <option value="occurredAt">Cũ nhất</option>
          </select>
        </label>
        <button type="submit">Áp dụng bộ lọc</button>
      </form>
      <Result state={state}>
        {state.value && (
          <>
            <HistoryRows items={state.value.items} />
            <p>
              Trang {page} · Tổng {state.value.total}
            </p>
            <button disabled={page === 1} onClick={() => setPage(page - 1)}>
              Trước
            </button>
            <button
              disabled={page * 20 >= state.value.total}
              onClick={() => setPage(page + 1)}
            >
              Sau
            </button>
          </>
        )}
      </Result>
    </div>
  );
}

export function ResourceHistoryPage({ kind }: { kind: "model" | "warranty" }) {
  const { id } = useParams();
  const [page, setPage] = useState(1);
  const [draft, setDraft] = useState({ eventType: "", from: "", to: "" });
  const [filter, setFilter] = useState(draft);
  const path =
    kind === "model"
      ? `/equipment-models/${id}/history`
      : `/warranties/${id}/history`;
  const params = new URLSearchParams({ page: String(page), pageSize: "20" });
  if (kind === "warranty") {
    if (filter.eventType) params.set("eventType", filter.eventType);
    if (filter.from) params.set("from", new Date(filter.from).toISOString());
    if (filter.to) params.set("to", new Date(filter.to).toISOString());
  }
  const query = `${path}?${params}`;
  const state = useRemote<Row>(query, () => api.assetM2(query));
  const history = state.value?.history as Page<Row> | undefined;
  return (
    <div className="m2-page">
      <h1>Lịch sử {kind === "model" ? "Model" : "bảo hành"}</h1>
      {kind === "warranty" && (
        <form
          className="m2-filters"
          onSubmit={(event) => {
            event.preventDefault();
            setFilter(draft);
            setPage(1);
          }}
        >
          <label>
            Loại sự kiện
            <input
              value={draft.eventType}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  eventType: event.target.value,
                }))
              }
            />
          </label>
          <label>
            Từ
            <input
              type="datetime-local"
              value={draft.from}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  from: event.target.value,
                }))
              }
            />
          </label>
          <label>
            Đến
            <input
              type="datetime-local"
              value={draft.to}
              onChange={(event) =>
                setDraft((current) => ({ ...current, to: event.target.value }))
              }
            />
          </label>
          <button type="submit">Áp dụng bộ lọc</button>
        </form>
      )}
      <Result state={state}>
        {history && (
          <>
            <HistoryRows items={history.items} />
            {state.value?.legacyHistoryMayBeIncomplete && (
              <p>Lịch sử trước khi bật ghi nhận có thể chưa đầy đủ.</p>
            )}
            <p>
              Trang {page} · Tổng {history.total}
            </p>
            <button disabled={page === 1} onClick={() => setPage(page - 1)}>
              Trước
            </button>
            <button
              disabled={page * 20 >= history.total}
              onClick={() => setPage(page + 1)}
            >
              Sau
            </button>
          </>
        )}
      </Result>
    </div>
  );
}

export function WorkOrderListPage() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const path = `/work-orders?page=${page}&pageSize=20${status ? `&status=${encodeURIComponent(status)}` : ""}`;
  const state = useRemote<Page<Row>>(path, () => api.workorders(path));
  return (
    <div className="m2-page">
      <h1>Lệnh công việc</h1>
      <label>
        Trạng thái{" "}
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Tất cả</option>
          {[
            "CREATED",
            "ASSIGNED",
            "ACCEPTED",
            "TRAVELLING",
            "IN_PROGRESS",
            "ON_HOLD",
            "COMPLETED",
            "CANCELLED",
          ].map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
      </label>
      <Result state={state}>
        {state.value && (
          <>
            <LinkedRows
              items={state.value.items}
              type="workorder"
              equipmentId=""
            />
            <p>
              Trang {page} · Tổng {state.value.total}
            </p>
            <button disabled={page === 1} onClick={() => setPage(page - 1)}>
              Trước
            </button>
            <button
              disabled={page * 20 >= state.value.total}
              onClick={() => setPage(page + 1)}
            >
              Sau
            </button>
          </>
        )}
      </Result>
    </div>
  );
}

function WorkOrderControls({
  order,
  id,
  refresh,
}: {
  order: Row;
  id: string;
  refresh: () => void;
}) {
  const sessionGeneration = getSessionGeneration();
  const actions = Array.isArray(order.allowedActions)
    ? (order.allowedActions as string[])
    : [];
  const [technicianId, setTechnicianId] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [reason, setReason] = useState("");
  const [cancelRequest, setCancelRequest] = useState(false);
  const [report, setReport, reportDraft] = useFormDraft(`work-report:${id}`, {
    problemDescription: "",
    rootCause: "",
    solution: "",
    result: "RESOLVED",
    customerSummary: "",
    remainingWork: "",
    submissionPending: false,
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const performing = useRef(false);
  const technicians = useRemote<Page<Row>>(
    `wo-technicians:${actions.includes("assign")}`,
    () =>
      actions.includes("assign")
        ? api.workorders("/technicians?page=1&pageSize=100")
        : Promise.resolve({ items: [], total: 0, page: 1, pageSize: 100 }),
  );
  async function perform(path: string, method: string, body?: unknown) {
    if (
      getSessionGeneration() !== sessionGeneration ||
      performing.current ||
      report.submissionPending
    )
      return;
    performing.current = true;
    if (path === "/complete")
      reportDraft.save({ ...report, submissionPending: true });
    setBusy(true);
    setError("");
    try {
      await api.workorders(`/work-orders/${id}${path}`, { method, body });
      if (getSessionGeneration() === sessionGeneration) {
        if (path === "/complete") reportDraft.clear();
        refresh();
      }
    } catch (cause) {
      if (getSessionGeneration() !== sessionGeneration) return;
      if (
        cause instanceof ApiError &&
        cause.status < 500 &&
        ![401, 408].includes(cause.status)
      )
        reportDraft.save({ ...report, submissionPending: false });
      setError(
        cause instanceof ApiError ? workOrderActionError(cause) : String(cause),
      );
      if (cause instanceof ApiError && cause.status === 409) refresh();
    } finally {
      performing.current = false;
      setBusy(false);
    }
  }
  const transitions: {
    action: string;
    path: string;
    label: string;
    body?: unknown;
  }[] = [
    { action: "accept", path: "/accept", label: "Nhận lệnh", body: {} },
    {
      action: "reject",
      path: "/reject",
      label: "Từ chối phân công",
      body: { reason },
    },
    {
      action: "start-travel",
      path: "/start-travel",
      label: "Bắt đầu di chuyển",
      body: {},
    },
    { action: "start", path: "/start", label: "Bắt đầu công việc", body: {} },
    { action: "hold", path: "/hold", label: "Tạm dừng", body: { reason } },
    {
      action: "resume",
      path: "/resume",
      label: "Tiếp tục công việc",
      body: {},
    },
    {
      action: "complete",
      path: "/complete",
      label: "Hoàn tất và gửi báo cáo",
      body: {
        problemDescription: report.problemDescription,
        rootCause: report.rootCause,
        solution: report.solution,
        result: report.result,
        customerSummary: [
          report.customerSummary,
          report.result !== "RESOLVED" && report.remainingWork
            ? `Phần còn lại / phối hợp tiếp: ${report.remainingWork}`
            : "",
        ]
          .filter(Boolean)
          .join("\n\n"),
      },
    },
    {
      action: "cancel",
      path: "/cancel",
      label: "Hủy Work Order",
      body: { reason, cancelServiceRequest: cancelRequest },
    },
  ];
  if (
    !actions.some((action) =>
      [
        "assign",
        "update",
        "cancel",
        "accept",
        "reject",
        "start-travel",
        "start",
        "hold",
        "resume",
        "complete",
      ].includes(action),
    )
  )
    return null;
  return (
    <Card title="Thao tác Work Order">
      {report.submissionPending && (
        <p role="alert">
          Lần gửi báo cáo trước chưa xác định kết quả. Đọc lại hồ sơ trước khi
          thao tác thêm; bản nháp vẫn được giữ.
        </p>
      )}
      {report.submissionPending && (
        <button type="button" disabled={busy} onClick={refresh}>
          Kiểm tra trạng thái lệnh
        </button>
      )}
      {error && (
        <p className="m1-error" role="alert">
          {error}
        </p>
      )}
      {actions.includes("assign") && (
        <form
          className="m2-editor"
          onSubmit={(event) => {
            event.preventDefault();
            void perform("/assign", "POST", { technicianId });
          }}
        >
          <label>
            Kỹ thuật viên{" "}
            <select
              required
              value={technicianId}
              onChange={(event) => setTechnicianId(event.target.value)}
            >
              <option value="">Chọn kỹ thuật viên</option>
              {technicians.value?.items
                .filter(
                  (row) => row.status === "AVAILABLE" || row.status === "BUSY",
                )
                .map((row) => (
                  <option key={String(row.id)} value={String(row.id)}>
                    {technicianName(row.fullName, row.employeeCode)} ·{" "}
                    {asText(row.status)}
                  </option>
                ))}
            </select>
          </label>
          {technicians.error && <p role="alert">{technicians.error}</p>}
          <button disabled={busy || technicians.loading}>
            {order.currentTechnicianId ? "Phân công lại" : "Phân công"}
          </button>
        </form>
      )}
      {actions.includes("update") && (
        <form
          className="m2-editor"
          onSubmit={(event) => {
            event.preventDefault();
            if (!start && !end) {
              setError("Nhập ít nhất một mốc thời gian.");
              return;
            }
            if (start && end && new Date(end) <= new Date(start)) {
              setError("Giờ kết thúc phải sau giờ bắt đầu.");
              return;
            }
            void perform("", "PATCH", {
              ...(start ? { scheduledStart: vietnamInstant(start) } : {}),
              ...(end ? { scheduledEnd: vietnamInstant(end) } : {}),
            });
          }}
        >
          <label>
            Bắt đầu dự kiến{" "}
            <input
              type="datetime-local"
              value={start}
              onChange={(event) => setStart(event.target.value)}
            />
          </label>
          <label>
            Kết thúc dự kiến{" "}
            <input
              type="datetime-local"
              value={end}
              onChange={(event) => setEnd(event.target.value)}
            />
          </label>
          <button disabled={busy}>Lưu lịch dự kiến</button>
          <p>Để trống mốc không cần thay đổi.</p>
        </form>
      )}
      {actions.some((action) =>
        ["reject", "hold", "cancel"].includes(action),
      ) && (
        <label>
          Lý do thao tác
          <input
            maxLength={2000}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </label>
      )}
      {actions.includes("complete") && (
        <fieldset
          className="m2-editor"
          disabled={busy || report.submissionPending}
        >
          <legend>Báo cáo dịch vụ bắt buộc khi hoàn tất</legend>
          <p role="status">
            {reportDraft.saved === false
              ? "Nháp chưa lưu được trên trình duyệt; sao chép nội dung trước khi rời."
              : "Nháp được giữ trong tab này theo tài khoản và lệnh, tối đa 12 giờ. Chưa gửi cho khách."}
          </p>
          <label>
            Mô tả sự cố
            <textarea
              rows={4}
              required
              maxLength={5000}
              value={report.problemDescription}
              onChange={(event) =>
                setReport({ ...report, problemDescription: event.target.value })
              }
            />
          </label>
          <label>
            Nguyên nhân
            <textarea
              rows={3}
              maxLength={5000}
              value={report.rootCause}
              onChange={(event) =>
                setReport({ ...report, rootCause: event.target.value })
              }
            />
          </label>
          <label>
            Giải pháp
            <textarea
              rows={4}
              required
              maxLength={5000}
              value={report.solution}
              onChange={(event) =>
                setReport({ ...report, solution: event.target.value })
              }
            />
          </label>
          <label>
            Kết quả
            <select
              value={report.result}
              onChange={(event) =>
                setReport({ ...report, result: event.target.value })
              }
            >
              <option value="RESOLVED">Đã xử lý</option>
              <option value="PARTIALLY_RESOLVED">Xử lý một phần</option>
              <option value="UNRESOLVED">Chưa xử lý được</option>
            </select>
          </label>
          <label>
            Tóm tắt hiển thị khách hàng
            <textarea
              rows={4}
              required
              maxLength={1500}
              value={report.customerSummary}
              onChange={(event) =>
                setReport({ ...report, customerSummary: event.target.value })
              }
            />
          </label>
          {report.result !== "RESOLVED" && (
            <label>
              Phần chưa giải quyết / bước cần phối hợp
              <textarea
                required
                rows={3}
                maxLength={400}
                value={report.remainingWork}
                onChange={(event) =>
                  setReport({ ...report, remainingWork: event.target.value })
                }
              />
            </label>
          )}
          <details>
            <summary>Xem trước nội dung khách sẽ đọc</summary>
            <h3>{serviceLabels[report.result]}</h3>
            <p>{report.customerSummary || "Chưa có tóm tắt."}</p>
            {report.result !== "RESOLVED" && (
              <p>
                Phần còn lại:{" "}
                {report.remainingWork || "Cần bổ sung trước khi gửi."}
              </p>
            )}
            <p>
              Nguyên nhân và ghi chú nội bộ không tự trở thành nội dung công bố
              cho khách.
            </p>
          </details>
        </fieldset>
      )}
      {actions.includes("cancel") && Boolean(order.serviceRequestId) && (
        <label>
          <input
            type="checkbox"
            checked={cancelRequest}
            onChange={(event) => setCancelRequest(event.target.checked)}
          />{" "}
          Đồng thời hủy Service Request
        </label>
      )}
      {actions.includes("cancel") && !cancelRequest && (
        <p>
          Hủy Work Order không tự hủy Service Request; yêu cầu sẽ giữ theo quyết
          định backend.
        </p>
      )}
      <div className="m1-actions">
        {transitions
          .filter(({ action }) => actions.includes(action))
          .map(({ action, path, label, body }) => (
            <button
              key={action}
              disabled={
                busy ||
                report.submissionPending ||
                (["reject", "hold", "cancel"].includes(action) &&
                  !reason.trim()) ||
                (action === "complete" &&
                  (!report.problemDescription.trim() ||
                    !report.solution.trim() ||
                    !report.customerSummary.trim() ||
                    (report.result !== "RESOLVED" &&
                      !report.remainingWork.trim())))
              }
              onClick={() =>
                void perform(
                  path,
                  "POST",
                  action === "cancel" ||
                    action === "reject" ||
                    action === "hold"
                    ? {
                        ...(body as Record<string, unknown>),
                        reason: reason.trim(),
                      }
                    : body,
                )
              }
            >
              {busy ? "Đang xử lý…" : label}
            </button>
          ))}
      </div>
    </Card>
  );
}

export function WorkOrderPage() {
  const { id } = useParams();
  const [revision, setRevision] = useState(0);
  const state = useRemote<Row>(`wo:${id}:${revision}`, () =>
    api.workorders(`/work-orders/${id}`),
  );
  const detail = useRemote<Section<Row>>(
    `wo-dossier:${id}:${state.value?.equipmentId}:${revision}`,
    () =>
      state.value?.equipmentId
        ? api.assetM2(`/equipment/${state.value.equipmentId}/work-orders/${id}`)
        : Promise.resolve({ status: "NOT_FOUND", data: null }),
  );
  return (
    <div className="m2-page sd-page">
      <ServiceHeader
        back="/app/work-orders"
        backLabel="Công việc của tôi"
        code={asText(state.value?.workOrderNo ?? "LỆNH CÔNG VIỆC")}
        title={asText(state.value?.title ?? "Chi tiết công việc")}
        description="Nhận đúng thiết bị và địa điểm, thực hiện checklist, ghi nhận kết quả và bằng chứng."
        status={state.value?.status}
      />
      {state.value && (
        <TechnicianOrderContext order={state.value} revision={revision} />
      )}
      <Result state={state}>
        {state.value && (
          <Card title="Lệnh công việc">
            <Fields
              row={state.value}
              fields={[
                ["title", "Tiêu đề"],
                ["status", "Trạng thái"],
                ["priority", "Ưu tiên"],
                ["type", "Loại"],
                ["scheduledStart", "Bắt đầu dự kiến"],
                ["scheduledEnd", "Kết thúc dự kiến"],
                ["currentTechnicianId", "Kỹ thuật viên hiện tại"],
              ]}
            />
            <p>{asText(state.value.description)}</p>
            <p>Khung giờ dự kiến chưa phải lịch hẹn đã xác nhận.</p>
            <WorkOrderLocation order={state.value} />
            <ServiceNotice title="Thực hiện theo công việc được giao">
              <p>
                Các thao tác được phép nằm dưới hồ sơ. Khi báo cáo kết quả một
                phần hoặc chưa xử lý được, ghi rõ phần còn lại và nội dung cần
                phối hợp cho khách hàng.
              </p>
            </ServiceNotice>
            {Boolean(state.value.serviceRequestId) && (
              <Link
                to={`/app/service-requests/${state.value.serviceRequestId}`}
              >
                Mở yêu cầu dịch vụ
              </Link>
            )}
          </Card>
        )}
      </Result>
      {state.value && id && (
        <WorkOrderChecklist
          key={id + ":checklist"}
          id={id}
          changed={() => setRevision((v) => v + 1)}
        />
      )}
      {state.value && id && (
        <WorkOrderControls
          key={id}
          order={state.value}
          id={id}
          refresh={() => setRevision((value) => value + 1)}
        />
      )}
      <Result state={detail}>
        {detail.value && (
          <Source section={detail.value}>
            {(row) => (
              <div className="m2-grid">
                <Card title="Lịch sử phân công">
                  <Source section={row.assignments as Section<Row[]>}>
                    {(items) =>
                      items.length ? (
                        <ul className="m2-linked-list">
                          {items.map((item) => (
                            <li key={String(item.id)}>
                              <span>
                                <Link
                                  to={`/app/technicians/${item.technicianId}`}
                                >
                                  {technicianName(
                                    item.technicianName,
                                    item.technicianEmployeeCode,
                                  )}
                                </Link>{" "}
                                · {asText(item.status)}
                              </span>
                              <span>
                                Giao {date(item.assignedAt)} · Nhận{" "}
                                {date(item.acceptedAt)} · Gỡ{" "}
                                {date(item.unassignedAt)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p>Chưa phân công.</p>
                      )
                    }
                  </Source>
                </Card>
                <Card title="Thay đổi trạng thái">
                  <Source section={row.history as Section<Row[]>}>
                    {(items) => <HistoryRows items={items} />}
                  </Source>
                </Card>
                <Card title="Nhật ký công việc">
                  <Source section={row.logs as Section<Row[]>}>
                    {(items) =>
                      items.length ? (
                        <ul className="m1-timeline">
                          {items.map((item) => (
                            <li key={String(item.id)}>
                              <strong>{asText(item.eventType)}</strong> ·{" "}
                              {date(item.createdAt)}
                              <p>
                                Người thực hiện:{" "}
                                {displayName("user", { name: item.actorName })}
                              </p>
                              {Boolean(item.note) && <p>{asText(item.note)}</p>}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p>Chưa có nhật ký.</p>
                      )
                    }
                  </Source>
                </Card>
                <Card title="Báo cáo dịch vụ">
                  <Source section={row.report as Section<Row>}>
                    {(report) => (
                      <>
                        <Fields
                          row={report}
                          fields={[
                            ["result", "Kết quả"],
                            ["problemDescription", "Sự cố"],
                            ["rootCause", "Nguyên nhân"],
                            ["solution", "Giải pháp"],
                            ["customerSummary", "Tóm tắt cho khách hàng"],
                            ["submittedAt", "Ngày nộp"],
                          ]}
                        />
                        {id && (
                          <AttachmentsPanel
                            kind="SERVICE_REPORT"
                            workOrderId={id}
                          />
                        )}
                      </>
                    )}
                  </Source>
                </Card>
              </div>
            )}
          </Source>
        )}
      </Result>
    </div>
  );
}

export function RequestDossierExtras({
  equipmentId,
  requestId,
  revision,
}: {
  equipmentId: string;
  requestId: string;
  revision: number;
}) {
  const state = useRemote<Section<Row>>(
    `request-dossier:${equipmentId}:${requestId}:${revision}`,
    () =>
      api.assetM2(`/equipment/${equipmentId}/service-requests/${requestId}`),
  );
  return (
    <Card title="Quyết định bảo hành và dự toán">
      <Result state={state}>
        {state.value && (
          <Source section={state.value}>
            {(data) => (
              <>
                <p>
                  Bảo hành khi xét duyệt:{" "}
                  {statusLabel[
                    String((data.warrantyCheck as Row | null)?.result)
                  ] ?? asText((data.warrantyCheck as Row | null)?.result)}
                </p>
                <p>
                  Bảo hành theo lịch hiện tại:{" "}
                  {statusLabel[
                    String((data.calendarCoverageNow as Row | null)?.result)
                  ] ?? asText((data.calendarCoverageNow as Row | null)?.result)}
                </p>
                <p>
                  Hai giá trị có thể khác nhau vì quyết định yêu cầu được lưu
                  tại thời điểm xét duyệt.
                </p>
                <p>
                  Đang chờ:{" "}
                  {serviceLabels[
                    String((data.request as Row | null)?.waitingFor)
                  ] ?? "Không có bước chờ"}
                </p>
                <p>
                  Kết quả:{" "}
                  {serviceLabels[
                    String((data.request as Row | null)?.resolutionResult)
                  ] ?? asText((data.request as Row | null)?.resolutionResult)}
                </p>
                <p>
                  Tóm tắt cho khách hàng:{" "}
                  {asText((data.request as Row | null)?.resolutionSummary)}
                </p>
                <h3>Các phiên bản dự toán</h3>
                <Source section={data.estimates as Section<Row[]>}>
                  {(revisions) =>
                    revisions.length ? (
                      <ul className="m2-linked-list">
                        {revisions.map((estimate) => (
                          <li key={String(estimate.id)}>
                            <span>
                              Bản {asText(estimate.revisionNo)} ·{" "}
                              {serviceLabels[String(estimate.status)] ??
                                asText(estimate.status)}
                            </span>
                            <span>
                              {asText(estimate.totalAmount)}{" "}
                              {asText(estimate.currency)} · Hiệu lực đến{" "}
                              {date(estimate.validUntil)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p>Chưa có dự toán.</p>
                    )
                  }
                </Source>
              </>
            )}
          </Source>
        )}
      </Result>
    </Card>
  );
}

type MaintenanceFilter = {
  equipmentId: string;
  planId: string;
  taskId: string;
  eventType: string;
  from: string;
  to: string;
};
const emptyMaintenanceFilter: MaintenanceFilter = {
  equipmentId: "",
  planId: "",
  taskId: "",
  eventType: "",
  from: "",
  to: "",
};

export function MaintenanceHistoryPage({
  equipmentId,
}: {
  equipmentId?: string;
}) {
  const { pathname } = useLocation();
  const [draft, setDraft] = useState<MaintenanceFilter>(emptyMaintenanceFilter);
  const [filter, setFilter] = useState<MaintenanceFilter>(
    emptyMaintenanceFilter,
  );
  const [page, setPage] = useState(1);
  const params = new URLSearchParams({ page: String(page), pageSize: "20" });
  if (equipmentId) params.set("equipmentId", equipmentId);
  for (const [key, value] of Object.entries(filter)) {
    if (value && !(equipmentId && key === "equipmentId")) {
      params.set(
        key,
        key === "from" || key === "to" ? new Date(value).toISOString() : value,
      );
    }
  }
  const path = `/maintenance-history?${params}`;
  const state = useRemote<Page<Row>>(path, () => api.maintenance(path));
  const base = pathname.startsWith("/portal") ? "/portal" : "/app";
  const fields: [keyof MaintenanceFilter, string][] = [
    ["equipmentId", "ID thiết bị"],
    ["planId", "ID kế hoạch"],
    ["taskId", "ID công việc"],
    ["eventType", "Loại sự kiện"],
  ];
  return (
    <div className="m2-page">
      <Link
        to={
          equipmentId
            ? `${base}/equipment/${equipmentId}`
            : `${base}/maintenance`
        }
      >
        ← {equipmentId ? "Hồ sơ thiết bị" : "Bảo trì"}
      </Link>
      <h1>Lịch sử bảo trì{equipmentId ? " của thiết bị" : ""}</h1>
      <form
        className="m2-filters"
        onSubmit={(event) => {
          event.preventDefault();
          setFilter(draft);
          setPage(1);
        }}
      >
        {fields
          .filter(([key]) => !(equipmentId && key === "equipmentId"))
          .map(([key, label]) => (
            <label key={key}>
              {label}
              <input
                value={draft[key]}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    [key]: event.target.value,
                  }))
                }
              />
            </label>
          ))}
        {(["from", "to"] as const).map((key) => (
          <label key={key}>
            {key === "from" ? "Từ" : "Đến"}
            <input
              type="datetime-local"
              value={draft[key]}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  [key]: event.target.value,
                }))
              }
            />
          </label>
        ))}
        <button type="submit">Áp dụng bộ lọc</button>
      </form>
      <Result state={state}>
        {state.value && (
          <>
            <HistoryRows items={state.value.items} />
            <p>Lịch sử cũ có thể không đầy đủ.</p>
            <p>
              Trang {page} · Tổng {state.value.total}
            </p>
            <button disabled={page === 1} onClick={() => setPage(page - 1)}>
              Trước
            </button>
            <button
              disabled={page * 20 >= state.value.total}
              onClick={() => setPage(page + 1)}
            >
              Sau
            </button>
          </>
        )}
      </Result>
    </div>
  );
}

function MaintenancePlanForm({
  plan,
  onSaved,
  onRefresh,
}: {
  plan?: Row;
  onSaved: () => void;
  onRefresh: () => void;
}) {
  const sessionGeneration = getSessionGeneration();
  const [equipmentId, setEquipmentId] = useState("");
  const [name, setName] = useState(String(plan?.name ?? ""));
  const [frequencyUnit, setFrequencyUnit] = useState(
    String(plan?.frequencyUnit ?? "MONTH"),
  );
  const [frequencyValue, setFrequencyValue] = useState(
    Number(plan?.frequencyValue ?? 1),
  );
  const [nextDueDate, setNextDueDate] = useState(
    String(plan?.nextDueDate ?? "").slice(0, 10),
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (getSessionGeneration() !== sessionGeneration) return;
    setError("");
    setBusy(true);
    try {
      const body = plan
        ? { name, frequencyUnit, frequencyValue, nextDueDate }
        : { equipmentId, name, frequencyUnit, frequencyValue, nextDueDate };
      await api.maintenance(
        plan ? `/maintenance-plans/${plan.id}` : "/maintenance-plans",
        { method: plan ? "PATCH" : "POST", body },
      );
      if (getSessionGeneration() !== sessionGeneration) return;
      onSaved();
    } catch (cause) {
      if (getSessionGeneration() !== sessionGeneration) return;
      setError(
        cause instanceof ApiError
          ? `${cause.status} · ${cause.message}`
          : String(cause),
      );
      onRefresh();
    } finally {
      setBusy(false);
    }
  }
  async function status(value: string) {
    if (getSessionGeneration() !== sessionGeneration) return;
    setError("");
    setBusy(true);
    try {
      await api.maintenance(`/maintenance-plans/${plan?.id}`, {
        method: "PATCH",
        body: { status: value },
      });
      if (getSessionGeneration() !== sessionGeneration) return;
      onSaved();
    } catch (cause) {
      if (getSessionGeneration() !== sessionGeneration) return;
      setError(
        cause instanceof ApiError
          ? `${cause.status} · ${cause.message}`
          : String(cause),
      );
      onRefresh();
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card title={plan ? "Cập nhật kế hoạch" : "Tạo kế hoạch bảo trì"}>
      {error && (
        <p className="m1-error" role="alert">
          {error}
        </p>
      )}
      {plan && (
        <p>
          Trạng thái hiện tại:{" "}
          {statusLabel[String(plan.status)] ?? asText(plan.status)}. Ngày đến
          hạn được tính theo lịch đã chốt.
        </p>
      )}
      {plan?.status === "ACTIVE" && (
        <button disabled={busy} onClick={() => void status("PAUSED")}>
          Tạm dừng
        </button>
      )}
      {plan?.status === "PAUSED" && (
        <button disabled={busy} onClick={() => void status("ACTIVE")}>
          Tiếp tục
        </button>
      )}
      {plan && plan.status !== "INACTIVE" && (
        <button
          disabled={busy}
          onClick={() => {
            if (window.confirm("Ngừng kế hoạch này?")) void status("INACTIVE");
          }}
        >
          Ngừng kế hoạch
        </button>
      )}
      {plan?.status !== "INACTIVE" && (
        <form className="m2-editor" onSubmit={save}>
          {!plan && (
            <label>
              ID thiết bị{" "}
              <input
                required
                value={equipmentId}
                onChange={(event) => setEquipmentId(event.target.value)}
              />
            </label>
          )}
          <label>
            Tên kế hoạch{" "}
            <input
              required
              maxLength={200}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label>
            Chu kỳ{" "}
            <select
              value={frequencyUnit}
              onChange={(event) => setFrequencyUnit(event.target.value)}
            >
              <option value="DAY">Ngày</option>
              <option value="WEEK">Tuần</option>
              <option value="MONTH">Tháng</option>
              <option value="YEAR">Năm</option>
            </select>
          </label>
          <label>
            Số chu kỳ{" "}
            <input
              required
              type="number"
              min={1}
              max={10000}
              value={frequencyValue}
              onChange={(event) =>
                setFrequencyValue(Number(event.target.value))
              }
            />
          </label>
          <label>
            Ngày đến hạn{" "}
            <input
              required
              type="date"
              value={nextDueDate}
              onChange={(event) => setNextDueDate(event.target.value)}
            />
          </label>
          <button disabled={busy}>{busy ? "Đang lưu…" : "Lưu kế hoạch"}</button>
        </form>
      )}
    </Card>
  );
}

export function MaintenancePage() {
  const { profile } = useSession();
  const [revision, setRevision] = useState(0);
  const [showCreate, setShowCreate] = useState(false);
  const [tab, setTab] = useState<"plans" | "tasks">("plans");
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const summary = useRemote<Row>("maintenance-summary", () =>
    api.maintenance("/maintenance-summary"),
  );
  const path = `/${tab === "plans" ? "maintenance-plans" : "maintenance-tasks"}?page=${page}&pageSize=20${status ? `&status=${status}` : ""}`;
  const state = useRemote<Page<Row>>(`${path}:${revision}`, () =>
    api.maintenance(path),
  );
  if (
    profile?.userType === "CUSTOMER" &&
    !profile.roles.includes("CUSTOMER_ADMIN")
  )
    return <p>Không có quyền xem kế hoạch bảo trì.</p>;
  const statuses =
    tab === "plans"
      ? ["ACTIVE", "PAUSED", "INACTIVE"]
      : ["PENDING", "WORK_ORDER_CREATED", "COMPLETED", "FAILED", "CANCELLED"];
  return (
    <div className="m2-page">
      <h1>Bảo trì định kỳ</h1>
      {profile?.roles.includes("SERVICE_MANAGER") && (
        <button
          className="m2-create-toggle"
          type="button"
          onClick={() => setShowCreate((value) => !value)}
        >
          {showCreate ? "Đóng biểu mẫu" : "+ Tạo kế hoạch bảo trì"}
        </button>
      )}
      {showCreate && (
        <MaintenancePlanForm
          onSaved={() => {
            setRevision((value) => value + 1);
            setShowCreate(false);
          }}
          onRefresh={() => setRevision((value) => value + 1)}
        />
      )}
      <Link
        to={`${profile?.userType === "CUSTOMER" ? "/portal" : "/app"}/maintenance-history`}
      >
        Xem lịch sử bảo trì
      </Link>
      <Card title="Tổng quan">
        <Result state={summary}>
          {summary.value && (
            <>
              <p>
                Lần đến hạn kế tiếp:{" "}
                {date((summary.value.nextDue as Row | null)?.date)} ·{" "}
                {asText((summary.value.nextDue as Row | null)?.name)}
              </p>
              <p>
                Kế hoạch đến hạn chờ scheduler:{" "}
                {asText(summary.value.duePlansAwaitingScheduler)}
              </p>
              <p>
                Công việc mở quá hạn:{" "}
                {asText(summary.value.overdueOpenTaskCount)}
              </p>
              <p>Cần chú ý: {asText(summary.value.attentionTotal)}</p>
              <p>Ngày đến hạn của kế hoạch chưa phải lịch hẹn đã xác nhận.</p>
            </>
          )}
        </Result>
      </Card>
      <div className="m1-tabs">
        <button
          aria-selected={tab === "plans"}
          onClick={() => {
            setTab("plans");
            setStatus("");
            setPage(1);
          }}
        >
          Kế hoạch
        </button>
        <button
          aria-selected={tab === "tasks"}
          onClick={() => {
            setTab("tasks");
            setStatus("");
            setPage(1);
          }}
        >
          Công việc
        </button>
      </div>
      <label>
        Trạng thái{" "}
        <select
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            setPage(1);
          }}
        >
          <option value="">Tất cả</option>
          {statuses.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </label>
      <Result state={state}>
        {state.value && (
          <>
            <LinkedRows
              items={state.value.items}
              type={tab === "plans" ? "plan" : "task"}
              equipmentId=""
            />
            <p>
              Trang {page} · Tổng {state.value.total}
            </p>
            <button disabled={page === 1} onClick={() => setPage(page - 1)}>
              Trước
            </button>
            <button
              disabled={page * 20 >= state.value.total}
              onClick={() => setPage(page + 1)}
            >
              Sau
            </button>
          </>
        )}
      </Result>
    </div>
  );
}

export function MaintenanceRecordPage() {
  const { id } = useParams();
  const { search, pathname } = useLocation();
  const { profile } = useSession();
  const [revision, setRevision] = useState(0);
  const [historyPageNo, setHistoryPageNo] = useState(1);
  const [historyDraft, setHistoryDraft] = useState({
    eventType: "",
    from: "",
    to: "",
  });
  const [historyFilter, setHistoryFilter] = useState(historyDraft);
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionResult, setActionResult] = useState("");
  const replacementRequestId = useRef<string | null>(null);
  const replacementKey = `pbl6.m2.replacement.${profile?.tenantId ?? "none"}.${profile?.id ?? "none"}.${id ?? "none"}`;
  useEffect(() => {
    replacementRequestId.current = sessionStorage.getItem(replacementKey);
  }, [replacementKey]);
  const kind =
    new URLSearchParams(search).get("kind") === "task" ? "task" : "plan";
  const path = `/${kind === "task" ? "maintenance-tasks" : "maintenance-plans"}/${id}`;
  const state = useRemote<Row>(`${path}:${revision}`, () =>
    api.maintenance(path),
  );
  const equipmentLabel = useRemote<Row | null>(
    `maintenance-equipment:${state.value?.equipmentId}:${revision}`,
    () =>
      state.value?.equipmentId
        ? api.assetM2(`/equipment/${state.value.equipmentId}`)
        : Promise.resolve(null),
  );
  const workOrderLabel = useRemote<Row | null>(
    `maintenance-order:${state.value?.workOrderId}:${revision}`,
    () =>
      state.value?.workOrderId && profile?.userType === "TENANT_STAFF"
        ? api.workorders(`/work-orders/${state.value.workOrderId}`)
        : Promise.resolve(null),
  );
  const historyParams = new URLSearchParams({
    page: String(historyPageNo),
    pageSize: "20",
  });
  if (historyFilter.eventType)
    historyParams.set("eventType", historyFilter.eventType);
  if (historyFilter.from)
    historyParams.set("from", new Date(historyFilter.from).toISOString());
  if (historyFilter.to)
    historyParams.set("to", new Date(historyFilter.to).toISOString());
  const historyPath = `${path}/${kind === "task" ? "journey" : "history"}?${historyParams}`;
  const history = useRemote<Row | Page<Row>>(`${historyPath}:${revision}`, () =>
    api.maintenance(historyPath),
  );
  const journey =
    kind === "task" ? (history.value as Row | undefined) : undefined;
  const historyPage =
    kind === "task"
      ? (journey?.history as Page<Row> | undefined)
      : (history.value as Page<Row> | undefined);
  const pendingReplacement =
    Array.isArray(journey?.replacements) &&
    journey.replacements.some((row: Row) => row.status === "PENDING");
  useEffect(() => {
    if (!pendingReplacement) return;
    const timer = window.setInterval(
      () => setRevision((value) => value + 1),
      3000,
    );
    return () => window.clearInterval(timer);
  }, [pendingReplacement]);
  useEffect(() => {
    const requestId = replacementRequestId.current;
    if (
      requestId &&
      Array.isArray(journey?.replacements) &&
      journey.replacements.some(
        (row: Row) => row.requestId === requestId && row.status === "LINKED",
      )
    ) {
      sessionStorage.removeItem(replacementKey);
      replacementRequestId.current = null;
      setActionResult("Work Order thay thế đã được liên kết.");
    }
  }, [journey, replacementKey]);
  async function replace() {
    if (busy) return;
    setBusy(true);
    setActionError("");
    setActionResult("");
    try {
      replacementRequestId.current ??= crypto.randomUUID();
      sessionStorage.setItem(replacementKey, replacementRequestId.current);
      await api.maintenance(`${path}/replacement`, {
        method: "POST",
        body: { requestId: replacementRequestId.current },
      });
      setActionResult(
        "Đã ghi nhận yêu cầu thay thế; đang chờ Work Order Service xử lý.",
      );
      setRevision((value) => value + 1);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="m2-page">
      <Link
        to={
          pathname.startsWith("/portal")
            ? "/portal/maintenance"
            : "/app/maintenance"
        }
      >
        ← Bảo trì
      </Link>
      <ServiceHeader
        back={
          pathname.startsWith("/portal")
            ? "/portal/maintenance"
            : "/app/maintenance"
        }
        backLabel="Bảo trì định kỳ"
        code={kind === "task" ? "CÔNG VIỆC BẢO TRÌ" : "KẾ HOẠCH BẢO TRÌ"}
        title={asText(
          state.value?.name ??
            (kind === "task"
              ? "Chi tiết công việc bảo trì"
              : "Chi tiết kế hoạch bảo trì"),
        )}
        description="Theo dõi chu kỳ, kỳ đến hạn và lịch sử thực hiện của thiết bị."
        status={state.value?.status}
      />
      <ServiceNotice
        title={
          kind === "plan"
            ? "Lịch bảo trì giữ ngày gốc"
            : "Theo dõi công việc đến hạn"
        }
      >
        <p>
          {kind === "plan"
            ? "Hoàn thành muộn không làm dời kỳ kế tiếp. Sửa lịch chỉ tác động kỳ chưa sinh; các công việc đã tạo được giữ nguyên."
            : "Kiểm tra lệnh công việc liên quan để theo dõi phân công, thực hiện và báo cáo. Ngày dự kiến chưa phải lịch hẹn xác nhận."}
        </p>
      </ServiceNotice>
      <ServiceSections
        items={[
          {
            key: "overview",
            label: "Thông tin & điều chỉnh",
            content: (
              <>
                <Result state={state}>
                  {state.value && (
                    <Card title="Thông tin">
                      <Fields
                        row={{
                          ...state.value,
                          equipmentName:
                            equipmentLabel.value?.displayName ??
                            (equipmentLabel.value?.model as Row | undefined)
                              ?.name,
                          assetCode: equipmentLabel.value?.assetCode,
                          workOrderNo: workOrderLabel.value?.workOrderNo,
                        }}
                        fields={[
                          ["name", "Tên"],
                          ["status", "Trạng thái"],
                          ["equipmentId", "Thiết bị"],
                          ["nextDueDate", "Lần kế tiếp"],
                          ["frequencyValue", "Chu kỳ"],
                          ["frequencyUnit", "Đơn vị chu kỳ"],
                          ["lastCompletedAt", "Hoàn tất gần nhất"],
                          ["scheduledDate", "Hạn thực hiện"],
                          ["workOrderId", "Lệnh công việc"],
                        ]}
                      />
                      <p>
                        Ngày dự kiến chưa phải lịch hẹn đã xác nhận. Công việc
                        hoàn tất không tự xác nhận tình trạng vận hành của thiết
                        bị.
                      </p>
                    </Card>
                  )}
                </Result>
                {state.value && (
                  <MaintenancePolicyDetails record={state.value} />
                )}
                {kind === "plan" &&
                  state.value &&
                  profile?.roles.includes("SERVICE_MANAGER") && (
                    <details className="sd-edit-disclosure">
                      <summary>
                        Điều chỉnh kế hoạch / thay đổi trạng thái
                      </summary>
                      <MaintenancePlanForm
                        key={String(state.value.id)}
                        plan={state.value}
                        onSaved={() => setRevision((value) => value + 1)}
                        onRefresh={() => setRevision((value) => value + 1)}
                      />
                    </details>
                  )}
                {journey && (
                  <Card title="Hành trình công việc">
                    <button
                      type="button"
                      onClick={() => setRevision((value) => value + 1)}
                    >
                      Làm mới
                    </button>
                    <p>
                      Đang chờ:{" "}
                      {statusLabel[String(journey.waitingFor)] ??
                        (journey.waitingFor
                          ? "Xử lý lệnh công việc liên quan"
                          : "Không có bước chờ")}
                    </p>
                    <p>
                      Lệnh công việc:{" "}
                      {Array.isArray(journey.workOrders)
                        ? journey.workOrders.map(
                            (order: Row, index: number) => (
                              <Link
                                key={String(order.workOrderId)}
                                to={`/app/work-orders/${order.workOrderId}`}
                              >
                                {asText(
                                  order.workOrderNo ?? `Mở lệnh ${index + 1}`,
                                )}{" "}
                              </Link>
                            ),
                          )
                        : "—"}
                    </p>
                    <p>
                      Yêu cầu thay thế:{" "}
                      {Array.isArray(journey.replacements)
                        ? journey.replacements.length
                        : "—"}
                    </p>
                    {Array.isArray(journey.replacements) &&
                      journey.replacements.map((item: Row) => (
                        <p key={String(item.requestId)}>
                          {statusLabel[String(item.status)] ??
                            asText(item.status)}{" "}
                          ·{" "}
                          {item.status === "LINKED" &&
                          item.replacementWorkOrderId ? (
                            <Link
                              to={`/app/work-orders/${item.replacementWorkOrderId}`}
                            >
                              Mở lệnh thay thế
                            </Link>
                          ) : (
                            "Đang chờ xác nhận tạo lệnh thay thế"
                          )}
                        </p>
                      ))}
                    {Array.isArray(journey.allowedActions) &&
                      journey.allowedActions.includes(
                        "request-replacement",
                      ) && (
                        <>
                          <button
                            disabled={busy || !replacementConsumerReady}
                            onClick={replace}
                          >
                            Yêu cầu lệnh công việc thay thế
                          </button>
                          {!replacementConsumerReady && (
                            <p>
                              Đang chờ Work Order Service hỗ trợ tạo lệnh thay
                              thế.
                            </p>
                          )}
                        </>
                      )}
                    {actionError && (
                      <p role="alert" className="m1-error">
                        {actionError}
                      </p>
                    )}
                    {actionResult && <p role="status">{actionResult}</p>}
                  </Card>
                )}
              </>
            ),
          },
          {
            key: "history",
            label: "Lịch sử bảo trì",
            content: (
              <Card title="Lịch sử">
                <form
                  className="m2-filters"
                  onSubmit={(event) => {
                    event.preventDefault();
                    setHistoryFilter(historyDraft);
                    setHistoryPageNo(1);
                  }}
                >
                  <label>
                    Loại sự kiện
                    <select
                      value={historyDraft.eventType}
                      onChange={(event) =>
                        setHistoryDraft((current) => ({
                          ...current,
                          eventType: event.target.value,
                        }))
                      }
                    >
                      <option value="">Tất cả sự kiện</option>
                      {Object.entries(historyEventLabel).map(
                        ([code, label]) => (
                          <option key={code} value={code}>
                            {label}
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                  <label>
                    Từ
                    <input
                      type="datetime-local"
                      value={historyDraft.from}
                      onChange={(event) =>
                        setHistoryDraft((current) => ({
                          ...current,
                          from: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label>
                    Đến
                    <input
                      type="datetime-local"
                      value={historyDraft.to}
                      onChange={(event) =>
                        setHistoryDraft((current) => ({
                          ...current,
                          to: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <button type="submit">Áp dụng bộ lọc</button>
                </form>
                <Result state={history}>
                  {historyPage && (
                    <>
                      <HistoryRows items={historyPage.items} />
                      <p>
                        Trang {historyPageNo} · Tổng {historyPage.total}
                      </p>
                      <button
                        disabled={historyPageNo === 1}
                        onClick={() => setHistoryPageNo((value) => value - 1)}
                      >
                        Trước
                      </button>
                      <button
                        disabled={historyPageNo * 20 >= historyPage.total}
                        onClick={() => setHistoryPageNo((value) => value + 1)}
                      >
                        Sau
                      </button>
                    </>
                  )}
                </Result>
              </Card>
            ),
          },
        ]}
      />
    </div>
  );
}

export function TechniciansPage() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const path = `/technicians?page=${page}&pageSize=20${status ? `&status=${status}` : ""}`;
  const state = useRemote<Page<Row>>(path, () => api.workorders(path));
  return (
    <div className="m2-page">
      <h1>Kỹ thuật viên</h1>
      <label>
        Trạng thái{" "}
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Tất cả</option>
          {["AVAILABLE", "BUSY", "OFF_DUTY", "INACTIVE"].map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
      </label>
      <Result state={state}>
        {state.value && (
          <>
            <ul className="m2-linked-list">
              {state.value.items.map((row) => (
                <li key={String(row.id)}>
                  <Link to={`/app/technicians/${row.id}`}>
                    {technicianName(row.fullName, row.employeeCode)}
                  </Link>
                  <span>
                    <span
                      className={`m2-status m2-status--${String(row.status ?? "").toLowerCase()}`}
                    >
                      {statusLabel[String(row.status)] ?? asText(row.status)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
            <p>
              Trang {page} · Tổng {state.value.total}
            </p>
            <button disabled={page === 1} onClick={() => setPage(page - 1)}>
              Trước
            </button>
            <button
              disabled={page * 20 >= state.value.total}
              onClick={() => setPage(page + 1)}
            >
              Sau
            </button>
          </>
        )}
      </Result>
    </div>
  );
}

export function TechnicianPage() {
  const { id } = useParams();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const orders = useRemote<Page<Row>>(
    `technician-orders:${id}:${page}:${status}`,
    () =>
      api.workorders(
        `/work-orders?technicianId=${id}&page=${page}&pageSize=20${status ? `&status=${status}` : ""}`,
      ),
  );
  const state = useRemote<Row>(`technician:${id}`, () =>
    api.workorders(`/technicians/${id}`),
  );
  return (
    <div className="m2-page">
      <Link to="/app/technicians">← Kỹ thuật viên</Link>
      <ServiceHeader
        back="/app/technicians"
        backLabel="Đội ngũ kỹ thuật"
        code="HỒ SƠ KỸ THUẬT VIÊN"
        title={
          state.value
            ? technicianName(state.value.fullName, state.value.employeeCode)
            : "Hồ sơ kỹ thuật viên"
        }
        description="Thông tin hỗ trợ điều phối và liên hệ trong quá trình thực hiện dịch vụ."
        status={state.value?.status}
      />
      <Result state={state}>
        {state.value && (
          <Card title="Thông tin kỹ thuật viên">
            <Fields
              row={state.value}
              fields={[
                ["employeeCode", "Mã nhân viên"],
                ["status", "Trạng thái"],
                ["branchId", "Chi nhánh"],
                ["userId", "Tài khoản"],
              ]}
            />
            <ServiceFacts
              items={[
                { label: "Email", value: asText(state.value.email) },
                { label: "Điện thoại", value: asText(state.value.phone) },
              ]}
            />
            <p>
              Kỹ năng:{" "}
              {Array.isArray(state.value.skills)
                ? state.value.skills
                    .map((skill: Row) =>
                      asText(
                        skill.name ?? skill.code ?? "Kỹ năng không xác định",
                      ),
                    )
                    .join(", ")
                : "—"}
            </p>
          </Card>
        )}
      </Result>
      <Card title="Lệnh công việc gắn với kỹ thuật viên">
        <p>
          Danh sách theo người được gắn với lệnh hiện tại; lịch sử phân công đầy
          đủ nằm trong từng lệnh.
        </p>
        <label>
          Lọc trạng thái{" "}
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Tất cả trạng thái</option>
            {[
              "ASSIGNED",
              "ACCEPTED",
              "TRAVELLING",
              "IN_PROGRESS",
              "ON_HOLD",
              "COMPLETED",
              "CANCELLED",
            ].map((key) => (
              <option key={key} value={key}>
                {statusLabel[key]}
              </option>
            ))}
          </select>
        </label>
        <Result state={orders}>
          {orders.value && (
            <>
              <ul className="m2-linked-list">
                {orders.value.items.map((row) => (
                  <li key={String(row.id)}>
                    <Link to={`/app/work-orders/${row.id}`}>
                      {asText(row.workOrderNo)} · {asText(row.title)}
                    </Link>
                    <span>
                      {statusLabel[String(row.status)] ?? asText(row.status)} ·{" "}
                      {date(row.scheduledStart)}
                    </span>
                  </li>
                ))}
              </ul>
              {!orders.value.items.length && (
                <p>Chưa có lệnh phù hợp bộ lọc.</p>
              )}
              <div className="registration-pagination">
                <button
                  disabled={page === 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Trước
                </button>
                <span>
                  Trang {page} · {orders.value.total} lệnh
                </span>
                <button
                  disabled={page * 20 >= orders.value.total}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Sau
                </button>
              </div>
            </>
          )}
        </Result>
      </Card>
    </div>
  );
}
