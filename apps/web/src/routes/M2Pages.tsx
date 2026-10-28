import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { useSession } from "../auth/session";
import type { Page } from "../types/domain";

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
  const [state, setState] = useState<{
    key: string;
    value?: T;
    error?: string;
    loading: boolean;
  }>({ key: "", loading: true });
  useEffect(() => {
    let active = true;
    load().then(
      (value) => {
        if (active) setState({ key, value, loading: false });
      },
      (error) => {
        if (active)
          setState({
            key,
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
  }, [key]);
  return state.key === key
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
          <dd>{/(Date|At)$/.test(key) ? date(row[key]) : asText(row[key])}</dd>
        </div>
      ))}
    </dl>
  );
}

function HistoryRows({ items }: { items: Row[] }) {
  return items.length ? (
    <ul className="m1-timeline">
      {items.map((item, index) => (
        <li key={asText(item.id ?? index)}>
          <strong>
            {asText(item.eventType ?? item.newStatus ?? item.status)}
          </strong>
          <span>
            {" "}
            · Xảy ra {date(item.occurredAt ?? item.changedAt)} · Ghi nhận{" "}
            {date(item.recordedAt ?? item.createdAt)}
          </span>
          <p>
            ID người thực hiện:{" "}
            {asText(item.actorId ?? item.createdBy ?? item.changedBy)} · Vai
            trò:{" "}
            {Array.isArray(item.actorRoles) && item.actorRoles.length
              ? item.actorRoles.join(", ")
              : "—"}
          </p>
          {Boolean(item.reason ?? item.reasonInternal) && (
            <p>Lý do: {asText(item.reason ?? item.reasonInternal)}</p>
          )}
          {Boolean(item.customerNote) && (
            <p>Ghi chú cho khách hàng: {asText(item.customerNote)}</p>
          )}
          {item.referenceType ? (
            <p>
              {asText(item.referenceType)}: {asText(item.referenceId)}
            </p>
          ) : null}
          {Boolean(item.planId) && <p>ID kế hoạch: {asText(item.planId)}</p>}
          {Boolean(item.taskId) && <p>ID công việc: {asText(item.taskId)}</p>}
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
              <pre>{JSON.stringify(item.changes, null, 2)}</pre>
            </details>
          )}
          {Boolean(item.context && typeof item.context === "object") && (
            <details>
              <summary>Bối cảnh ghi nhận</summary>
              <pre>{JSON.stringify(item.context, null, 2)}</pre>
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
                  id,
              )}
            </Link>
            <span>
              {asText(item.status)} ·{" "}
              {date(item.nextDueDate ?? item.scheduledDate ?? item.createdAt)}
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
  const [specs, setSpecs] = useState(
    equipment.technicalSpecifications
      ? JSON.stringify(equipment.technicalSpecifications, null, 2)
      : "",
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
    if (specs.trim()) {
      try {
        const parsed: unknown = JSON.parse(specs);
        if (
          !parsed ||
          typeof parsed !== "object" ||
          Array.isArray(parsed) ||
          Object.values(parsed).some(
            (value) => !["string", "number", "boolean"].includes(typeof value),
          )
        ) {
          throw new Error(
            "Thông số phải là object JSON có giá trị chữ, số hoặc đúng/sai.",
          );
        }
        technicalSpecifications = parsed as Record<
          string,
          string | number | boolean
        >;
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : "Thông số JSON không hợp lệ.",
        );
        return;
      }
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
        <label>
          Thông số kỹ thuật (JSON)
          <textarea value={specs} onChange={(e) => setSpecs(e.target.value)} />
        </label>
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
    <div className="m2-page">
      <header>
        <Link to={`${base}/equipment`}>← Thiết bị</Link>
        <h1>
          {asText(
            dossier?.equipment.displayName ??
              dossier?.equipment.assetCode ??
              "Hồ sơ thiết bị",
          )}
        </h1>
        <p>
          Hồ sơ thiết bị và dữ liệu liên kết · cập nhật {date(dossier?.asOf)}
        </p>
        {notice && <p role="status">{notice}</p>}
      </header>
      <Result state={state}>
        {dossier && (
          <>
            <div className="m2-grid">
              <Card title="Thông tin thiết bị">
                <Fields
                  row={dossier.equipment}
                  fields={[
                    ["assetCode", "Mã tài sản"],
                    ["serialNumber", "Serial"],
                    ["status", "Trạng thái"],
                    ["commissionedDate", "Ngày đưa vào vận hành"],
                    ["handoverDate", "Ngày bàn giao"],
                  ]}
                />
                <p>
                  Thông số kỹ thuật:{" "}
                  {dossier.equipment.technicalSpecifications
                    ? JSON.stringify(dossier.equipment.technicalSpecifications)
                    : "Chưa có"}
                </p>
                {dossier.profileCompleteness.missingFields.length > 0 && (
                  <p>
                    Hồ sơ còn thiếu:{" "}
                    {dossier.profileCompleteness.missingFields.join(", ")}
                  </p>
                )}
              </Card>
              {canManageEquipment && dossier.equipment.status !== "RETIRED" && (
                <EquipmentEditor
                  key={`${id}:${revision}`}
                  equipmentId={id!}
                  equipment={dossier.equipment}
                  onSaved={(message) => {
                    setNotice(message);
                    setRevision((value) => value + 1);
                  }}
                />
              )}
              {canManageEquipment && dossier.equipment.status === "RETIRED" && (
                <p>
                  Thiết bị đã ngừng sử dụng; không thể chỉnh hồ sơ hoặc xác nhận
                  tình trạng.
                </p>
              )}
              <Card title="Bảo hành và tình trạng">
                <p>
                  Bảo hành theo lịch:{" "}
                  {asText(
                    dossier.calendarCoverage && dossier.calendarCoverage.result,
                  )}
                </p>
                <p>
                  Quyết định bảo hành của từng yêu cầu được lưu riêng khi xét
                  duyệt.
                </p>
                <p>
                  Tình trạng vận hành:{" "}
                  {operationalLabels[
                    String(dossier.operationalCondition.status)
                  ] ?? asText(dossier.operationalCondition.status)}
                  {Boolean(dossier.operationalCondition.confirmedAt) && (
                    <>
                      {" "}
                      · Xác nhận{" "}
                      {date(dossier.operationalCondition.confirmedAt)}
                    </>
                  )}
                </p>
                <p>
                  Xác nhận này không bảo đảm tình trạng hiện tại của thiết bị.
                </p>
                {dossier.warranties.map((w) => (
                  <p key={String(w.id)}>
                    {asText(w.warrantyType)} · {date(w.startDate)} –{" "}
                    {date(w.endDate)} · {asText(w.status)} ·{" "}
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
                  {(row) => <p>{asText(row.name)}</p>}
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
                          {asText(row.name)} · {asText(row.phone)}
                        </p>
                      ))}
                    </>
                  )}
                </Source>
              </Card>
              <Card title="Yêu cầu dịch vụ">
                <Source section={dossier.requests}>
                  {(page) => (
                    <>
                      <LinkedRows
                        items={page.items}
                        type="request"
                        equipmentId={id!}
                      />
                      <Link to={`${base}/equipment/${id}/service-requests`}>
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
                        Lần kế tiếp: {date((row.nextDue as Row | null)?.date)}
                      </p>
                      <p>
                        Công việc đang quá hạn:{" "}
                        {asText(row.overdueOpenTaskCount)}
                      </p>
                      <p>Kế hoạch: {JSON.stringify(row.planCounts ?? {})}</p>
                    </>
                  )}
                </Source>
                <Source section={dossier.maintenanceHistory}>
                  {(page) => (
                    <>
                      <HistoryRows items={page.items} />
                      <Link to={`${base}/equipment/${id}/maintenance-history`}>
                        Xem toàn bộ lịch sử bảo trì ({page.total})
                      </Link>
                    </>
                  )}
                </Source>
                {(profile?.userType !== "CUSTOMER" ||
                  profile.roles.includes("CUSTOMER_ADMIN")) && (
                  <>
                    <Link to={`${base}/equipment/${id}/maintenance-plans`}>
                      Xem kế hoạch
                    </Link>{" "}
                    ·{" "}
                    <Link to={`${base}/equipment/${id}/maintenance-tasks`}>
                      Xem công việc
                    </Link>
                  </>
                )}
              </Card>
              <Card title="Dịch vụ ghi nhận gần nhất">
                <p>
                  {dossier.latestRecordedService.entry
                    ? date(dossier.latestRecordedService.entry.occurredAt)
                    : "Chưa ghi nhận"}
                </p>
                <p>Dữ liệu có thể cập nhật chậm hơn Work Order.</p>
              </Card>
              <Card title="Dòng lịch sử">
                <HistoryRows items={dossier.timelinePreview.items} />
                <Link to={`${base}/equipment/${id}/timeline`}>
                  Xem tất cả ({dossier.timelinePreview.total})
                </Link>
              </Card>
            </div>
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
      <h1>{kind}</h1>
      {kind !== "maintenance-plans" && kind !== "maintenance-tasks" && (
        <label>
          Lọc trạng thái{" "}
          <input
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
            placeholder="Trạng thái"
          />
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
              !(profile?.userType === "CUSTOMER" && key === "actorId"),
          )
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

export function WorkOrderPage() {
  const { id } = useParams();
  const state = useRemote<Row>(`wo:${id}`, () =>
    api.workorders(`/work-orders/${id}`),
  );
  const detail = useRemote<Section<Row>>(
    `wo-dossier:${id}:${state.value?.equipmentId}`,
    () =>
      state.value?.equipmentId
        ? api.assetM2(`/equipment/${state.value.equipmentId}/work-orders/${id}`)
        : Promise.resolve({ status: "NOT_FOUND", data: null }),
  );
  return (
    <div className="m2-page">
      <Link to="/app/work-orders">← Lệnh công việc</Link>
      <h1>{asText(state.value?.workOrderNo ?? "Chi tiết lệnh công việc")}</h1>
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
            {Array.isArray(state.value.allowedActions) && (
              <p>
                Thao tác hợp lệ:{" "}
                {state.value.allowedActions.join(", ") || "Không có"}
              </p>
            )}
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
                                  {asText(item.technicianId)}
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
                              <p>Người thực hiện: {asText(item.actorUserId)}</p>
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
                  {asText((data.warrantyCheck as Row | null)?.result)}
                </p>
                <p>
                  Bảo hành theo lịch hiện tại:{" "}
                  {asText((data.calendarCoverageNow as Row | null)?.result)}
                </p>
                <p>
                  Hai giá trị có thể khác nhau vì quyết định yêu cầu được lưu
                  tại thời điểm xét duyệt.
                </p>
                <p>
                  Đang chờ: {asText((data.request as Row | null)?.waitingFor)}
                </p>
                <p>
                  Thao tác hợp lệ:{" "}
                  {Array.isArray((data.request as Row | null)?.allowedActions)
                    ? ((data.request as Row).allowedActions as string[]).join(
                        ", ",
                      )
                    : "—"}
                </p>
                <p>
                  Kết quả:{" "}
                  {asText((data.request as Row | null)?.resolutionResult)}
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
                              {asText(estimate.status)}
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

export function MaintenancePage() {
  const { profile } = useSession();
  const [tab, setTab] = useState<"plans" | "tasks">("plans");
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const summary = useRemote<Row>("maintenance-summary", () =>
    api.maintenance("/maintenance-summary"),
  );
  const path = `/${tab === "plans" ? "maintenance-plans" : "maintenance-tasks"}?page=${page}&pageSize=20${status ? `&status=${status}` : ""}`;
  const state = useRemote<Page<Row>>(path, () => api.maintenance(path));
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
  const state = useRemote<Row>(`${path}:${revision}`, () => api.maintenance(path));
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
    const timer = window.setInterval(() => setRevision((value) => value + 1), 3000);
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
      <h1>{kind === "task" ? "Công việc bảo trì" : "Kế hoạch bảo trì"}</h1>
      <Result state={state}>
        {state.value && (
          <Card title="Thông tin">
            <Fields
              row={state.value}
              fields={[
                ["name", "Tên"],
                ["status", "Trạng thái"],
                ["equipmentId", "Thiết bị"],
                ["nextDueDate", "Lần kế tiếp"],
                ["scheduledDate", "Hạn thực hiện"],
                ["workOrderId", "Lệnh công việc"],
              ]}
            />
            <p>
              Ngày dự kiến chưa phải lịch hẹn đã xác nhận. Công việc hoàn tất
              không tự xác nhận tình trạng vận hành của thiết bị.
            </p>
          </Card>
        )}
      </Result>
      {journey && (
        <Card title="Hành trình công việc">
          <button type="button" onClick={() => setRevision((value) => value + 1)}>
            Làm mới
          </button>
          <p>Đang chờ: {asText(journey.waitingFor)}</p>
          <p>
            Lệnh công việc:{" "}
            {Array.isArray(journey.workOrders)
              ? journey.workOrders
                  .map((order: Row) => asText(order.workOrderId))
                  .join(", ")
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
                {asText(item.status)} · Work Order dự kiến{" "}
                {asText(item.replacementWorkOrderId)}
              </p>
            ))}
          {Array.isArray(journey.allowedActions) &&
            journey.allowedActions.includes("request-replacement") && (
              <>
                <button
                  disabled={busy || !replacementConsumerReady}
                  onClick={replace}
                >
                  Yêu cầu lệnh công việc thay thế
                </button>
                {!replacementConsumerReady && (
                  <p>Đang chờ Work Order Service hỗ trợ tạo lệnh thay thế.</p>
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
            <input
              value={historyDraft.eventType}
              onChange={(event) =>
                setHistoryDraft((current) => ({
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
                    {asText(row.employeeCode ?? row.userId)}
                  </Link>
                  <span>
                    {asText(row.status)} · {asText(row.branchId)}
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
  const state = useRemote<Row>(`technician:${id}`, () =>
    api.workorders(`/technicians/${id}`),
  );
  return (
    <div className="m2-page">
      <Link to="/app/technicians">← Kỹ thuật viên</Link>
      <h1>Hồ sơ kỹ thuật viên</h1>
      <Result state={state}>
        {state.value && (
          <Card title="Thông tin">
            <Fields
              row={state.value}
              fields={[
                ["employeeCode", "Mã nhân viên"],
                ["status", "Trạng thái"],
                ["branchId", "Chi nhánh"],
                ["userId", "Tài khoản"],
              ]}
            />
            <p>
              Kỹ năng:{" "}
              {Array.isArray(state.value.skills)
                ? state.value.skills
                    .map((skill: Row) => asText(skill.name ?? skill.skillId))
                    .join(", ")
                : "—"}
            </p>
          </Card>
        )}
      </Result>
    </div>
  );
}
