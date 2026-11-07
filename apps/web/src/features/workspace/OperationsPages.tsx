import { useRef, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Info,
  Plus,
  RefreshCw,
  Users,
  Wrench,
} from "lucide-react";
import { useSession, getSessionGeneration } from "../../auth/session";
import { api } from "../../api/client";
import type { Page } from "../../types/domain";
import { PriorityBadge } from "../../components/Badges";
import {
  Badge,
  DataState,
  EmptyState,
  EntityPicker,
  NextStep,
  PageHeading,
  Pagination,
  RelatedName,
  SearchField,
} from "./WorkspaceUI";
import {
  asRow,
  formatDate,
  statusNames,
  useWorkspaceData,
  value,
  type Row,
} from "./workspace-data";

const workStatuses = [
  "CREATED",
  "ASSIGNED",
  "ACCEPTED",
  "TRAVELLING",
  "IN_PROGRESS",
  "ON_HOLD",
  "COMPLETED",
  "CANCELLED",
];
function useListQuery() {
  const [params, setParams] = useSearchParams();
  const rawPage = Number(params.get("page") || 1);
  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  const [revision, setRevision] = useState(0);
  function change(values: Record<string, string>) {
    const next = new URLSearchParams(params);
    next.delete("page");
    Object.entries(values).forEach(([key, value]) =>
      value ? next.set(key, value) : next.delete(key),
    );
    setParams(next);
  }
  return {
    params,
    page,
    revision,
    change,
    refresh: () => setRevision((v) => v + 1),
    turnPage: (page: number) =>
      setParams((previous) => {
        const next = new URLSearchParams(previous);
        next.set("page", String(page));
        return next;
      }),
  };
}
function StatusSelect({
  options,
  current,
  onChange,
  labels = {},
}: {
  options: string[];
  current: string;
  onChange: (value: string) => void;
  labels?: Record<string, string>;
}) {
  return (
    <select
      aria-label="Trạng thái"
      value={current}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">Tất cả trạng thái</option>
      {options.map((key) => (
        <option key={key} value={key}>
          {key.includes(",")
            ? "Đang thực hiện (nhóm)"
            : (labels[key] ?? statusNames[key] ?? key)}
        </option>
      ))}
    </select>
  );
}
function Refresh({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      className="ws-button ws-button--secondary"
      onClick={onClick}
    >
      <RefreshCw size={15} />
      Làm mới
    </button>
  );
}
function SearchSubmit({
  submit,
  placeholder,
  initial = "",
}: {
  submit: (query: string) => void;
  placeholder: string;
  initial?: string;
}) {
  return (
    <form
      className="ws-actions"
      style={{ flex: "1 1 290px" }}
      onSubmit={(e) => {
        e.preventDefault();
        submit(String(new FormData(e.currentTarget).get("q") ?? "").trim());
      }}
    >
      <SearchField
        key={initial}
        placeholder={placeholder}
        defaultValue={initial}
      />
      <button className="ws-button ws-button--secondary">Tìm</button>
    </form>
  );
}

export function WorkspaceWorkOrdersPage() {
  const { profile } = useSession(),
    query = useListQuery();
  const technician =
    profile?.roles.includes("TECHNICIAN") &&
    !profile.roles.some((role) =>
      ["TENANT_ADMIN", "SERVICE_MANAGER", "DISPATCHER"].includes(role),
    );
  const params = new URLSearchParams({
    page: String(query.page),
    pageSize: "20",
  });
  for (const key of ["q", "status", "priority", "type"])
    if (query.params.get(key)) params.set(key, query.params.get(key)!);
  if (technician) params.set("mine", "true");
  const state = useWorkspaceData<Page<Row>>(
    "workorders",
    `/work-orders?${params}`,
    query.revision,
  );
  const status = query.params.get("status") || "";
  const tabs = [
    { name: "Tất cả", status: "" },
    {
      name: technician ? "Chờ nhận việc" : "Chờ phân công",
      status: technician ? "ASSIGNED" : "CREATED",
    },
    { name: "Đang thực hiện", status: "ACCEPTED,TRAVELLING,IN_PROGRESS" },
    { name: "Tạm dừng", status: "ON_HOLD" },
    { name: "Hoàn tất", status: "COMPLETED" },
  ];
  return (
    <div className="ws-page">
      <PageHeading
        title={technician ? "Công việc của tôi" : "Lệnh công việc"}
        description={
          technician
            ? "Nhận việc, theo dõi lịch và cập nhật kết quả cho từng thiết bị."
            : "Theo dõi tiến độ, lịch thực hiện và người phụ trách trong cùng một danh sách."
        }
        actions={<Refresh onClick={query.refresh} />}
      />
      <div className="ws-help">
        <Info size={17} />
        <span>
          <strong>
            {technician
              ? "Bắt đầu từ việc chờ nhận."
              : "Mỗi công việc đều cần một bước tiếp theo."}
          </strong>{" "}
          {technician
            ? "Mở công việc để xem địa điểm, checklist và các thao tác được phép."
            : "Lệnh chờ phân công cần được điều phối; lệnh tạm dừng cần kiểm tra nguyên nhân."}
        </span>
      </div>
      <section className="ws-card">
        <div className="ws-tabs" role="group" aria-label="Nhóm công việc">
          {tabs.map((tab) => (
            <button
              key={tab.name}
              aria-pressed={status === tab.status}
              onClick={() => query.change({ status: tab.status })}
            >
              {tab.name}
            </button>
          ))}
        </div>
        <div className="ws-toolbar">
          <SearchSubmit
            initial={query.params.get("q") || ""}
            placeholder="Tìm mã lệnh, tiêu đề công việc…"
            submit={(q) => query.change({ q })}
          />
          <StatusSelect
            current={status}
            options={[
              ...workStatuses,
              ...(status.includes(",") ? [status] : []),
            ]}
            onChange={(status) => query.change({ status })}
          />
          <select
            aria-label="Mức ưu tiên"
            value={query.params.get("priority") || ""}
            onChange={(e) => query.change({ priority: e.target.value })}
          >
            <option value="">Tất cả ưu tiên</option>
            <option value="URGENT">Khẩn cấp</option>
            <option value="HIGH">Cao</option>
            <option value="NORMAL">Bình thường</option>
            <option value="LOW">Thấp</option>
          </select>
          {query.params.toString() && (
            <button
              className="ws-button ws-button--secondary"
              onClick={() =>
                query.change({ q: "", status: "", priority: "", type: "" })
              }
            >
              Xóa lọc
            </button>
          )}
        </div>
        <DataState {...state} retry={query.refresh}>
          <div className="ws-table-wrap">
            <table className="ws-table">
              <thead>
                <tr>
                  <th>LỆNH CÔNG VIỆC</th>
                  <th>THIẾT BỊ / KHÁCH HÀNG</th>
                  <th>ƯU TIÊN</th>
                  <th>PHỤ TRÁCH</th>
                  <th>LỊCH THỰC HIỆN</th>
                  <th>TRẠNG THÁI / BƯỚC TIẾP</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {state.data?.items.map((row) => (
                  <tr key={String(row.id)}>
                    <td data-label="Lệnh công việc">
                      <Link
                        className="ws-text-link"
                        to={`/app/work-orders/${row.id}`}
                      >
                        {value(row.workOrderNo)}
                      </Link>
                      <small>{value(row.title, "Công việc dịch vụ")}</small>
                    </td>
                    <td data-label="Thiết bị / Khách hàng">
                      <strong>
                        <RelatedName
                          area="assetM2"
                          path={
                            row.equipmentId
                              ? `/equipment/${row.equipmentId}`
                              : null
                          }
                          initial={row.equipmentName}
                          fallback="Xem thiết bị trong hồ sơ"
                        />
                      </strong>
                      <RelatedName
                        area="organization"
                        path={
                          row.customerId ? `/customers/${row.customerId}` : null
                        }
                        initial={row.customerName}
                      />
                    </td>
                    <td data-label="Ưu tiên">
                      <PriorityBadge
                        priority={String(row.priority ?? "NORMAL")}
                      />
                    </td>
                    <td data-label="Phụ trách">
                      {row.currentTechnicianId ? (
                        <RelatedName
                          area="workorders"
                          path={`/technicians/${row.currentTechnicianId}`}
                          initial={
                            row.currentTechnicianName ??
                            asRow(row.currentAssignment).technicianName
                          }
                          fallback="Mở lịch sử phân công để xem"
                        />
                      ) : ["COMPLETED", "CANCELLED"].includes(
                          String(row.status),
                        ) ? (
                        "Xem lịch sử phân công"
                      ) : (
                        "Chưa phân công"
                      )}
                    </td>
                    <td data-label="Lịch thực hiện">
                      <strong>{formatDate(row.scheduledStart, true)}</strong>
                      <small>
                        {row.scheduledEnd
                          ? `Đến ${formatDate(row.scheduledEnd, true)}`
                          : "Lịch hẹn cần được xác nhận"}
                      </small>
                    </td>
                    <td data-label="Trạng thái / Bước tiếp">
                      <Badge status={row.status} />
                      <NextStep>
                        {row.status === "CREATED"
                          ? "Điều phối phân công"
                          : row.status === "ASSIGNED"
                            ? "Kỹ thuật viên nhận việc"
                            : row.status === "ON_HOLD"
                              ? "Kiểm tra lý do tạm dừng"
                              : row.status === "COMPLETED"
                                ? "Xem báo cáo và đối soát"
                                : row.status === "CANCELLED"
                                  ? "Xem lý do hủy"
                                  : "Theo dõi tiến độ"}
                      </NextStep>
                    </td>
                    <td data-label="Thao tác">
                      <Link
                        className="ws-text-link"
                        to={`/app/work-orders/${row.id}`}
                        aria-label={`Xem ${row.workOrderNo}`}
                      >
                        <ArrowRight size={17} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!state.data?.items.length && (
            <EmptyState
              title="Chưa có công việc phù hợp"
              description={
                technician
                  ? "Công việc được phân công sẽ xuất hiện tại đây. Bạn có thể kiểm tra lại bộ lọc hoặc liên hệ điều phối viên."
                  : "Lệnh công việc được tạo từ yêu cầu dịch vụ hoặc công việc bảo trì. Kiểm tra bộ lọc hoặc tiếp tục từ hồ sơ nguồn."
              }
              action={
                !technician && (
                  <Link className="ws-button" to="/app/service-requests">
                    Xem yêu cầu dịch vụ
                    <ArrowRight size={15} />
                  </Link>
                )
              }
            />
          )}
        </DataState>
        <Pagination
          page={query.page}
          total={state.data?.total}
          onChange={query.turnPage}
        />
      </section>
    </div>
  );
}

export function WorkspaceTechniciansPage() {
  const query = useListQuery();
  const params = new URLSearchParams({
    page: String(query.page),
    pageSize: "20",
  });
  for (const key of ["q", "status"])
    if (query.params.get(key)) params.set(key, query.params.get(key)!);
  const state = useWorkspaceData<Page<Row>>(
    "workorders",
    `/technicians?${params}`,
    query.revision,
  );
  return (
    <div className="ws-page">
      <PageHeading
        title="Đội ngũ kỹ thuật"
        description="Tìm đúng người theo kỹ năng và trạng thái sẵn sàng để chuẩn bị cho công việc tiếp theo."
        actions={<Refresh onClick={query.refresh} />}
      />
      <div className="ws-help">
        <Users size={18} />
        <span>
          <strong>Phân công từ hồ sơ lệnh công việc.</strong> Kiểm tra kỹ năng,
          chi nhánh và lịch thực hiện trước khi giao việc. Trạng thái “Đang bận”
          không đại diện cho toàn bộ tải công việc.
        </span>
      </div>
      <section className="ws-card">
        <div className="ws-card-header">
          <div>
            <h2>Danh sách kỹ thuật viên</h2>
            <p>Hồ sơ và kỹ năng đã được ghi nhận trong hệ thống</p>
          </div>
        </div>
        <div className="ws-toolbar">
          <SearchSubmit
            initial={query.params.get("q") || ""}
            placeholder="Tìm theo mã nhân viên…"
            submit={(q) => query.change({ q })}
          />
          <StatusSelect
            current={query.params.get("status") || ""}
            options={["AVAILABLE", "BUSY", "OFF_DUTY", "INACTIVE"]}
            onChange={(status) => query.change({ status })}
          />
        </div>
        <DataState {...state} retry={query.refresh}>
          <div className="ws-table-wrap">
            <table className="ws-table">
              <thead>
                <tr>
                  <th>KỸ THUẬT VIÊN</th>
                  <th>CHI NHÁNH</th>
                  <th>KỸ NĂNG</th>
                  <th>TRẠNG THÁI</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {state.data?.items.map((row) => (
                  <tr key={String(row.id)}>
                    <td data-label="Kỹ thuật viên">
                      <Link
                        className="ws-text-link"
                        to={`/app/technicians/${row.id}`}
                      >
                        {value(
                          row.fullName,
                          value(row.employeeCode, "Hồ sơ kỹ thuật viên"),
                        )}
                      </Link>
                      <small>{value(row.employeeCode)}</small>
                    </td>
                    <td data-label="Chi nhánh">
                      {value(
                        row.branchName,
                        value(row.branchCode, "Tên chi nhánh chưa tải được"),
                      )}
                    </td>
                    <td data-label="Kỹ năng">
                      <div className="ws-pills">
                        {Array.isArray(row.skills) && row.skills.length ? (
                          row.skills.map((skill, i) => (
                            <span className="ws-pill" key={i}>
                              {value(
                                asRow(skill).name,
                                value(asRow(skill).code, "Kỹ năng chưa có tên"),
                              )}
                            </span>
                          ))
                        ) : (
                          <span>Chưa ghi nhận kỹ năng</span>
                        )}
                      </div>
                    </td>
                    <td data-label="Trạng thái">
                      <Badge status={row.status} />
                    </td>
                    <td data-label="Thao tác">
                      <Link
                        className="ws-text-link"
                        to={`/app/technicians/${row.id}`}
                      >
                        Xem hồ sơ
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!state.data?.items.length && (
            <EmptyState
              title="Chưa có kỹ thuật viên phù hợp"
              description="Hồ sơ kỹ thuật viên cần được liên kết với tài khoản nhân viên và chi nhánh. Kiểm tra bộ lọc hoặc liên hệ người quản lý đội ngũ."
            />
          )}
        </DataState>
        <Pagination
          page={query.page}
          total={state.data?.total}
          onChange={query.turnPage}
        />
      </section>
    </div>
  );
}

export function WorkspaceHandoverPage() {
  const { profile } = useSession(),
    query = useListQuery(),
    customer = profile?.userType === "CUSTOMER";
  const base = customer ? "/my/equipment-handovers" : "/equipment-handovers",
    destination = customer
      ? "/portal/equipment-handovers"
      : "/app/equipment-handovers";
  const params = new URLSearchParams({
    page: String(query.page),
    pageSize: "20",
  });
  for (const key of ["q", "status"])
    if (query.params.get(key)) params.set(key, query.params.get(key)!);
  const state = useWorkspaceData<Page<Row>>(
    "assetM2",
    `${base}?${params}`,
    query.revision,
  );
  const tabs = [
    { status: "", name: "Tất cả" },
    ...(!customer ? [{ status: "DRAFT", name: "Bản nháp" }] : []),
    { status: "PENDING_CUSTOMER_CONFIRMATION", name: "Chờ xác nhận" },
    { status: "ACTIVATED", name: "Đã kích hoạt" },
    { status: "REJECTED", name: "Đã từ chối" },
    { status: "EXPIRED", name: "Hết hạn" },
  ];
  const canRespond = profile?.roles.includes("CUSTOMER_ADMIN");
  return (
    <div className="ws-page">
      <PageHeading
        eyebrow={customer ? "CỔNG KHÁCH HÀNG" : undefined}
        title={
          customer ? "Bàn giao thiết bị của chúng tôi" : "Bàn giao thiết bị"
        }
        description={
          customer
            ? "Kiểm tra nội dung bàn giao và theo dõi thiết bị được kích hoạt sau xác nhận."
            : "Theo dõi thiết bị từ nội dung bàn giao đến khi khách hàng xác nhận và kích hoạt."
        }
        actions={
          <>
            <Refresh onClick={query.refresh} />
            {!customer && (
              <Link className="ws-button" to={`${destination}/new`}>
                <Plus size={16} />
                Tạo bàn giao
              </Link>
            )}
          </>
        }
      />
      <div className="ws-help">
        <Info size={18} />
        <span>
          <strong>
            {customer
              ? "Kiểm tra kỹ trước khi xác nhận."
              : "Bàn giao rõ ràng, bắt đầu dịch vụ thuận lợi."}
          </strong>{" "}
          {customer
            ? `Đối chiếu thiết bị, serial, địa điểm và tình trạng thực tế.${!canRespond ? " Quản trị viên khách hàng sẽ thực hiện chấp thuận hoặc từ chối." : ""}`
            : "Khách hàng cần được gửi nội dung bàn giao trước khi thực hiện xác nhận. Lịch sử từng lần luôn được giữ lại."}
        </span>
      </div>
      <section className="ws-card">
        <div className="ws-tabs" role="group" aria-label="Trạng thái bàn giao">
          {tabs.map((tab) => (
            <button
              aria-pressed={(query.params.get("status") || "") === tab.status}
              key={tab.name}
              onClick={() => query.change({ status: tab.status })}
            >
              {tab.name}
            </button>
          ))}
        </div>
        <div className="ws-toolbar">
          <SearchSubmit
            initial={query.params.get("q") || ""}
            placeholder="Tìm mã bàn giao, thiết bị hoặc serial…"
            submit={(q) => query.change({ q })}
          />
          <StatusSelect
            current={query.params.get("status") || ""}
            options={[
              "DRAFT",
              "PENDING_CUSTOMER_CONFIRMATION",
              "ACTIVATED",
              "REJECTED",
              "EXPIRED",
              "CANCELLED",
            ].filter((s) => !customer || s !== "DRAFT")}
            onChange={(status) => query.change({ status })}
          />
        </div>
        <DataState {...state} retry={query.refresh}>
          <div className="ws-table-wrap">
            <table className="ws-table">
              <thead>
                <tr>
                  <th>HỒ SƠ BÀN GIAO</th>
                  <th>THIẾT BỊ / SERIAL</th>
                  <th>{customer ? "ĐỊA ĐIỂM" : "KHÁCH HÀNG"}</th>
                  <th>HẠN XÁC NHẬN</th>
                  <th>TRẠNG THÁI</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {state.data?.items.map((row) => {
                  const snapshot = asRow(row.snapshot);
                  return (
                    <tr key={String(row.id)}>
                      <td data-label="Hồ sơ bàn giao">
                        <Link
                          className="ws-text-link"
                          to={`${destination}/${row.id}`}
                        >
                          {value(row.handoverNo)}
                        </Link>
                        <small>
                          {!customer
                            ? `Người tạo: ${value(row.createdByName ?? snapshot.createdByName, "Tên chưa được cung cấp")}`
                            : `Ngày bàn giao: ${formatDate(snapshot.deliveryAt)}`}
                        </small>
                      </td>
                      <td data-label="Thiết bị / Serial">
                        <strong>
                          {value(snapshot.assetCode)} · {value(snapshot.name)}
                        </strong>
                        <small>Serial: {value(snapshot.serialNumber)}</small>
                      </td>
                      <td data-label="Khách hàng / Địa điểm">
                        {value(
                          customer
                            ? (snapshot.customerSiteName ??
                                row.customerSiteName)
                            : snapshot.customerName,
                        )}
                      </td>
                      <td data-label="Hạn xác nhận">
                        {formatDate(row.expiresAt, true)}
                      </td>
                      <td data-label="Trạng thái">
                        <Badge status={row.status} />
                        <NextStep>
                          {row.status === "DRAFT"
                            ? "Gửi khách kiểm tra"
                            : row.status === "PENDING_CUSTOMER_CONFIRMATION"
                              ? "Chờ quản trị khách xác nhận"
                              : row.status === "ACTIVATED"
                                ? "Mở hồ sơ thiết bị"
                                : "Xem chi tiết và lý do"}
                        </NextStep>
                      </td>
                      <td data-label="Thao tác">
                        <Link
                          className="ws-text-link"
                          to={`${destination}/${row.id}`}
                        >
                          Xem chi tiết
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!state.data?.items.length && (
            <EmptyState
              title={
                customer
                  ? "Chưa có bàn giao cần theo dõi"
                  : "Chưa có hồ sơ bàn giao phù hợp"
              }
              description={
                customer
                  ? "Khi nhà cung cấp gửi bàn giao, bạn sẽ kiểm tra nội dung và theo dõi xác nhận tại đây."
                  : "Tạo hồ sơ bàn giao cho thiết bị đã đăng ký. Mỗi lần gửi và xác nhận được lưu trong lịch sử."
              }
              action={
                !customer && (
                  <Link className="ws-button" to={`${destination}/new`}>
                    <Plus size={15} />
                    Tạo bàn giao đầu tiên
                  </Link>
                )
              }
            />
          )}
        </DataState>
        <Pagination
          page={query.page}
          total={state.data?.total}
          onChange={query.turnPage}
        />
      </section>
      {!customer && (
        <Link
          className="ws-text-link"
          to="/app/equipment-registrations/new?handoverRequired=true"
        >
          Thiết bị chưa được đăng ký? Đăng ký thiết bị mới{" "}
          <ArrowRight size={13} />
        </Link>
      )}
    </div>
  );
}

export function PlanCreate({
  onClose,
  onSaved,
  onCheck,
}: {
  onClose: () => void;
  onSaved: () => void;
  onCheck: () => void;
}) {
  const [equipmentId, setEquipment] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [unknown, setUnknown] = useState(false);
  const sending = useRef(false);
  const generation = getSessionGeneration();
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (sending.current || getSessionGeneration() !== generation) return;
    if (!equipmentId) {
      setError("Vui lòng chọn thiết bị cần bảo trì.");
      return;
    }
    const data = new FormData(e.currentTarget);
    sending.current = true;
    setBusy(true);
    setError("");
    try {
      await api.maintenance("/maintenance-plans", {
        method: "POST",
        body: {
          equipmentId,
          name: String(data.get("name")).trim(),
          description:
            String(data.get("description") || "").trim() || undefined,
          frequencyUnit: String(data.get("frequencyUnit")),
          frequencyValue: Number(data.get("frequencyValue")),
          nextDueDate: String(data.get("nextDueDate")),
        },
      });
      if (getSessionGeneration() === generation) onSaved();
    } catch (cause) {
      if (getSessionGeneration() !== generation) return;
      const rejection =
        cause &&
        typeof cause === "object" &&
        "status" in cause &&
        Number(cause.status) >= 400 &&
        Number(cause.status) < 500 &&
        ![401, 408].includes(Number(cause.status));
      setUnknown(!rejection);
      if (rejection) sending.current = false;
      setError(
        rejection
          ? cause instanceof Error
            ? cause.message
            : "Không thể lưu kế hoạch. Kiểm tra thông tin và thử lại."
          : "Chưa xác định được kết quả lưu. Kiểm tra danh sách kế hoạch trước khi tạo lại để tránh trùng.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="ws-card" aria-label="Tạo kế hoạch bảo trì">
      <div className="ws-card-header">
        <div>
          <h2>Kế hoạch bảo trì mới</h2>
          <p>Chọn thiết bị và xác định chu kỳ chăm sóc định kỳ.</p>
        </div>
        <button
          className="ws-button ws-button--secondary"
          onClick={onClose}
          disabled={busy}
        >
          Đóng
        </button>
      </div>
      <form className="ws-card-body" onSubmit={save}>
        <fieldset
          disabled={busy || unknown}
          style={{ border: 0, padding: 0, margin: 0 }}
        >
          <div className="ws-form-grid">
            <div className="ws-full">
              <EntityPicker
                label="Thiết bị cần bảo trì"
                area="assetM2"
                path="/equipment"
                selected={equipmentId}
                onChange={setEquipment}
              />
            </div>
            <label className="ws-label ws-full">
              Tên kế hoạch
              <input
                name="name"
                required
                maxLength={200}
                placeholder="Ví dụ: Kiểm tra và vệ sinh định kỳ"
              />
            </label>
            <label className="ws-label">
              Lặp lại mỗi
              <input
                name="frequencyValue"
                type="number"
                min={1}
                max={10000}
                required
                defaultValue={3}
              />
            </label>
            <label className="ws-label">
              Đơn vị chu kỳ
              <select name="frequencyUnit" defaultValue="MONTH">
                <option value="DAY">Ngày</option>
                <option value="WEEK">Tuần</option>
                <option value="MONTH">Tháng</option>
                <option value="YEAR">Năm</option>
              </select>
            </label>
            <label className="ws-label">
              Ngày đến hạn đầu tiên
              <input type="date" name="nextDueDate" required />
            </label>
            <label className="ws-label ws-full">
              Nội dung bảo trì
              <textarea
                rows={3}
                name="description"
                maxLength={2000}
                placeholder="Nội dung cần kiểm tra, lưu ý đối với thiết bị…"
              />
            </label>
          </div>
        </fieldset>
        <div className="ws-help">
          <Info size={16} />
          <span>
            Lịch lặp giữ ngày gốc. Ngày đến hạn giúp theo dõi bảo trì; lịch hẹn
            thực hiện sẽ được xác nhận riêng.
          </span>
        </div>
        {error && (
          <p className="m1-error" role="alert">
            {error}
          </p>
        )}
        <div className="ws-form-actions">
          {unknown ? (
            <button className="ws-button" type="button" onClick={onCheck}>
              Kiểm tra danh sách kế hoạch
            </button>
          ) : (
            <button className="ws-button" disabled={busy || !equipmentId}>
              {busy ? "Đang lưu…" : "Lưu kế hoạch"}
            </button>
          )}
        </div>
      </form>
    </section>
  );
}

export function WorkspaceMaintenancePage() {
  const { profile } = useSession(),
    query = useListQuery(),
    [creating, setCreating] = useState(false),
    [saved, setSaved] = useState(false);
  const customer = profile?.userType === "CUSTOMER",
    base = customer ? "/portal" : "/app",
    tab = query.params.get("tab") === "tasks" ? "tasks" : "plans";
  const params = new URLSearchParams({
    page: String(query.page),
    pageSize: "20",
  });
  for (const key of ["status", "equipmentId"])
    if (query.params.get(key)) params.set(key, query.params.get(key)!);
  const state = useWorkspaceData<Page<Row>>(
    "maintenance",
    `/${tab === "plans" ? "maintenance-plans" : "maintenance-tasks"}?${params}`,
    query.revision,
  );
  const summary = useWorkspaceData<Row>(
    "maintenance",
    "/maintenance-summary",
    query.revision,
  );
  const canCreate = profile?.roles.includes("SERVICE_MANAGER");
  return (
    <div className="ws-page">
      <PageHeading
        eyebrow={customer ? "CHĂM SÓC THIẾT BỊ" : undefined}
        title="Bảo trì định kỳ"
        description="Chủ động theo dõi các kỳ bảo trì và công việc cần thực hiện cho thiết bị."
        actions={
          <>
            <Refresh onClick={query.refresh} />
            {canCreate && (
              <button
                className="ws-button"
                onClick={() => {
                  setCreating(!creating);
                  setSaved(false);
                }}
              >
                <Plus size={16} />
                Tạo kế hoạch
              </button>
            )}
          </>
        }
      />
      {saved && (
        <p className="ws-help" role="status">
          <CheckCircle2 size={17} />
          Đã lưu kế hoạch bảo trì. Danh sách đang được cập nhật.
        </p>
      )}
      {creating && canCreate && (
        <PlanCreate
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            setSaved(true);
            query.refresh();
          }}
          onCheck={() => {
            setCreating(false);
            setSaved(false);
            query.refresh();
          }}
        />
      )}
      <div className="ws-stats">
        {[
          { label: "Cần chú ý", key: "attentionTotal", icon: Wrench },
          {
            label: "Công việc mở quá hạn",
            key: "overdueOpenTaskCount",
            icon: Clock3,
          },
          {
            label: "Kế hoạch đến hạn chờ sinh việc",
            key: "duePlansAwaitingScheduler",
            icon: CalendarDays,
          },
        ].map(({ label, key, icon: Icon }) => (
          <div className="ws-stat" key={key}>
            <div className="ws-stat-top">
              {label}
              <span className="ws-stat-icon">
                <Icon size={17} />
              </span>
            </div>
            <strong>
              {summary.loading
                ? "…"
                : summary.error
                  ? "—"
                  : value(summary.data?.[key], "—")}
            </strong>
            <small>
              {summary.error
                ? "Tạm thời chưa tải được"
                : "Theo tổng hợp bảo trì hiện tại"}
            </small>
          </div>
        ))}
        <div className="ws-stat ws-stat--green">
          <div className="ws-stat-top">
            Kỳ đến hạn kế tiếp
            <CalendarDays size={17} />
          </div>
          <strong style={{ fontSize: 20 }}>
            {summary.loading
              ? "…"
              : formatDate(asRow(summary.data?.nextDue).date)}
          </strong>
          <small>
            {value(
              asRow(summary.data?.nextDue).name,
              "Chưa có lịch đến hạn được ghi nhận",
            )}
          </small>
        </div>
      </div>
      <div className="ws-help">
        <Info size={17} />
        <span>
          <strong>Ngày đến hạn khác với lịch hẹn.</strong> Theo dõi kỳ bảo trì
          tại đây; lịch thực hiện cụ thể được điều phối trong lệnh công việc.{" "}
          <Link className="ws-text-link" to={`${base}/maintenance-history`}>
            Xem lịch sử bảo trì
          </Link>
        </span>
      </div>
      <section className="ws-card">
        <div className="ws-tabs" role="group" aria-label="Loại hồ sơ bảo trì">
          <button
            aria-pressed={tab === "plans"}
            onClick={() => query.change({ tab: "plans", status: "" })}
          >
            Kế hoạch bảo trì
          </button>
          <button
            aria-pressed={tab === "tasks"}
            onClick={() => query.change({ tab: "tasks", status: "" })}
          >
            Công việc bảo trì
          </button>
        </div>
        <div className="ws-toolbar">
          <StatusSelect
            current={query.params.get("status") || ""}
            options={
              tab === "plans"
                ? ["ACTIVE", "PAUSED", "INACTIVE"]
                : [
                    "PENDING",
                    "WORK_ORDER_CREATED",
                    "COMPLETED",
                    "FAILED",
                    "CANCELLED",
                  ]
            }
            onChange={(status) => query.change({ status })}
          />
          <Link className="ws-text-link" to={`${base}/maintenance-history`}>
            Tra cứu toàn bộ lịch sử
            <ArrowRight size={13} />
          </Link>
        </div>
        <DataState {...state} retry={query.refresh}>
          <div className="ws-table-wrap">
            <table className="ws-table">
              <thead>
                <tr>
                  <th>{tab === "plans" ? "KẾ HOẠCH" : "CÔNG VIỆC"}</th>
                  <th>THIẾT BỊ</th>
                  <th>{tab === "plans" ? "CHU KỲ" : "NGUỒN"}</th>
                  <th>NGÀY ĐẾN HẠN</th>
                  <th>TRẠNG THÁI</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {state.data?.items.map((row) => (
                  <tr key={String(row.id)}>
                    <td data-label="Hồ sơ bảo trì">
                      <Link
                        className="ws-text-link"
                        to={`${base}/maintenance/${row.id}?kind=${tab === "plans" ? "plan" : "task"}`}
                      >
                        {value(
                          row.name ?? row.title ?? row.taskNo,
                          tab === "plans"
                            ? "Kế hoạch bảo trì"
                            : `Kỳ bảo trì ${formatDate(row.scheduledDate)}`,
                        )}
                      </Link>
                    </td>
                    <td data-label="Thiết bị">
                      <RelatedName
                        area="assetM2"
                        path={
                          row.equipmentId
                            ? `/equipment/${row.equipmentId}`
                            : null
                        }
                        initial={row.equipmentName}
                      />
                    </td>
                    <td data-label="Chu kỳ / Nguồn">
                      {tab === "plans"
                        ? `Mỗi ${value(row.frequencyValue, "—")} ${{ DAY: "ngày", WEEK: "tuần", MONTH: "tháng", YEAR: "năm" }[String(row.frequencyUnit)] ?? ""}`
                        : "Theo kế hoạch định kỳ"}
                    </td>
                    <td data-label="Ngày đến hạn">
                      {formatDate(row.nextDueDate ?? row.scheduledDate)}
                    </td>
                    <td data-label="Trạng thái">
                      <Badge status={row.status} />
                    </td>
                    <td data-label="Thao tác">
                      <Link
                        className="ws-text-link"
                        to={`${base}/maintenance/${row.id}?kind=${tab === "plans" ? "plan" : "task"}`}
                      >
                        Xem chi tiết
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!state.data?.items.length && (
            <EmptyState
              title={
                tab === "plans"
                  ? "Chưa có kế hoạch phù hợp"
                  : "Chưa có công việc bảo trì phù hợp"
              }
              description={
                tab === "plans"
                  ? "Kế hoạch giúp theo dõi chu kỳ chăm sóc của từng thiết bị. Khi có kế hoạch được áp dụng, bạn sẽ thấy thông tin tại đây."
                  : "Công việc bảo trì được sinh theo kỳ của kế hoạch. Đây là các lần thực hiện cụ thể, tách biệt với kế hoạch gốc."
              }
              action={
                canCreate &&
                tab === "plans" && (
                  <button
                    className="ws-button"
                    onClick={() => setCreating(true)}
                  >
                    <Plus size={15} />
                    Tạo kế hoạch đầu tiên
                  </button>
                )
              }
            />
          )}
        </DataState>
        <Pagination
          page={query.page}
          total={state.data?.total}
          onChange={query.turnPage}
        />
      </section>
    </div>
  );
}

const historyNames: Record<string, string> = {
  PLAN_CREATED: "Tạo kế hoạch bảo trì",
  PLAN_UPDATED: "Cập nhật kế hoạch",
  PLAN_STATUS_CHANGED: "Thay đổi trạng thái kế hoạch",
  TASK_GENERATED: "Sinh công việc bảo trì",
  SCHEDULE_ADVANCED: "Chuyển kỳ bảo trì tiếp theo",
  WORK_ORDER_CREATED: "Tạo lệnh thực hiện",
  WORK_ORDER_COMPLETED: "Hoàn tất lệnh công việc",
  WORK_ORDER_CANCELLED: "Hủy lệnh công việc",
  REPLACEMENT_REQUESTED: "Yêu cầu lệnh thay thế",
  EQUIPMENT_SNAPSHOT_REFRESHED: "Cập nhật liên kết thiết bị",
};
const fieldNames: Record<string, string> = {
  name: "Tên kế hoạch",
  description: "Nội dung",
  status: "Trạng thái",
  frequencyValue: "Số chu kỳ",
  frequencyUnit: "Đơn vị chu kỳ",
  nextDueDate: "Kỳ đến hạn tiếp theo",
  anchorDate: "Ngày gốc",
  scheduledDate: "Ngày đến hạn",
  lastCompletedAt: "Lần hoàn tất gần nhất",
};
function changeValue(input: unknown) {
  if (input == null) return "Chưa có";
  if (typeof input === "string")
    return (
      statusNames[input] ??
      { DAY: "Ngày", WEEK: "Tuần", MONTH: "Tháng", YEAR: "Năm" }[input] ??
      input
    );
  if (typeof input === "object") return "Có cập nhật trong hồ sơ liên quan";
  return String(input);
}
export function WorkspaceMaintenanceHistoryPage({
  equipmentId,
}: {
  equipmentId?: string;
}) {
  const { profile } = useSession(),
    query = useListQuery(),
    [advanced, setAdvanced] = useState(false);
  const base = profile?.userType === "CUSTOMER" ? "/portal" : "/app",
    selectedEquipment = equipmentId || query.params.get("equipmentId") || "";
  const params = new URLSearchParams({
    page: String(query.page),
    pageSize: "20",
  });
  if (selectedEquipment) params.set("equipmentId", selectedEquipment);
  for (const key of ["planId", "taskId", "eventType"])
    if (query.params.get(key)) params.set(key, query.params.get(key)!);
  const from = query.params.get("from") || "",
    to = query.params.get("to") || "";
  // Interpret calendar dates in the product timezone, with an inclusive end date.
  if (from) params.set("from", `${from}T00:00:00+07:00`);
  if (to) params.set("to", `${to}T23:59:59.999+07:00`);
  const invalidRange = Boolean(from && to && from > to);
  const state = useWorkspaceData<Page<Row>>(
    "maintenance",
    invalidRange ? null : `/maintenance-history?${params}`,
    query.revision,
  );
  return (
    <div className="ws-page">
      <PageHeading
        eyebrow="HÀNH TRÌNH CHĂM SÓC THIẾT BỊ"
        title="Lịch sử bảo trì"
        description="Theo dõi từng thay đổi, lần thực hiện và hồ sơ liên quan theo thời gian."
        actions={
          <>
            <Refresh onClick={query.refresh} />
            <Link
              className="ws-button ws-button--secondary"
              to={`${base}/maintenance`}
            >
              Xem kế hoạch
            </Link>
          </>
        }
      />
      <section className="ws-card">
        <div className="ws-card-header">
          <div>
            <h2>Tra cứu lịch sử</h2>
            <p>Chọn thiết bị theo tên hoặc mã; không cần ghi nhớ ID.</p>
          </div>
        </div>
        <div className="ws-card-body">
          <div className="ws-form-grid">
            {!equipmentId && (
              <EntityPicker
                label="Thiết bị"
                area="assetM2"
                path="/equipment"
                selected={selectedEquipment}
                onChange={(equipmentId) =>
                  query.change({ equipmentId, planId: "", taskId: "" })
                }
              />
            )}
            <label className="ws-label">
              Loại hoạt động
              <select
                value={query.params.get("eventType") || ""}
                onChange={(e) => query.change({ eventType: e.target.value })}
              >
                <option value="">Tất cả hoạt động</option>
                {Object.entries(historyNames).map(([key, name]) => (
                  <option value={key} key={key}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label className="ws-label">
              Từ ngày
              <input
                aria-label="Từ ngày"
                type="date"
                value={from}
                onChange={(e) => query.change({ from: e.target.value })}
              />
            </label>
            <label className="ws-label">
              Đến hết ngày
              <input
                aria-label="Đến hết ngày"
                type="date"
                value={to}
                onChange={(e) => query.change({ to: e.target.value })}
              />
            </label>
          </div>
          <div className="ws-actions" style={{ marginTop: 17 }}>
            <button
              className="ws-button ws-button--secondary"
              aria-expanded={advanced}
              onClick={() => setAdvanced(!advanced)}
            >
              Lọc theo kế hoạch / công việc
            </button>
            {query.params.toString() && (
              <button
                className="ws-button ws-button--secondary"
                onClick={() =>
                  query.change({
                    equipmentId: "",
                    planId: "",
                    taskId: "",
                    eventType: "",
                    from: "",
                    to: "",
                  })
                }
              >
                Xóa bộ lọc
              </button>
            )}
          </div>
          {advanced && (
            <div className="ws-form-grid" style={{ marginTop: 18 }}>
              <EntityPicker
                key={`plan:${selectedEquipment}`}
                label="Kế hoạch"
                area="maintenance"
                path={
                  selectedEquipment
                    ? `/maintenance-plans?equipmentId=${selectedEquipment}`
                    : "/maintenance-plans"
                }
                selected={query.params.get("planId") || ""}
                onChange={(planId) => query.change({ planId, taskId: "" })}
              />
              <EntityPicker
                key={`task:${selectedEquipment}:${query.params.get("planId")}`}
                label="Công việc bảo trì"
                area="maintenance"
                path={`/maintenance-tasks?${new URLSearchParams({ ...(selectedEquipment ? { equipmentId: selectedEquipment } : {}), ...(query.params.get("planId") ? { planId: query.params.get("planId")! } : {}) })}`}
                selected={query.params.get("taskId") || ""}
                onChange={(taskId) => query.change({ taskId })}
              />
            </div>
          )}
          {invalidRange && (
            <p className="m1-error" role="alert">
              Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.
            </p>
          )}
        </div>
      </section>
      <section className="ws-card">
        <div className="ws-card-header">
          <div>
            <h2>Dòng thời gian bảo trì</h2>
            <p>Mới nhất trước · Thời gian hiển thị theo Việt Nam</p>
          </div>
          <span className="ws-pill">{state.data?.total ?? "—"} hoạt động</span>
        </div>
        {!invalidRange && (
          <DataState {...state} retry={query.refresh}>
            {state.data?.items.length ? (
              <ol className="ws-history">
                {state.data.items.map((row, i) => (
                  <li key={String(row.id ?? i)}>
                    <h3>
                      {historyNames[String(row.eventType)] ??
                        "Cập nhật hồ sơ bảo trì"}
                    </h3>
                    <time>
                      {formatDate(
                        row.occurredAt ?? row.changedAt ?? row.createdAt,
                        true,
                      )}
                    </time>
                    <p>
                      Người thực hiện:{" "}
                      {value(
                        row.actorName ?? row.createdByName,
                        "Chưa có tên được công bố",
                      )}
                    </p>
                    {Boolean(
                      profile?.userType === "CUSTOMER"
                        ? row.customerNote
                        : (row.reason ??
                            row.reasonInternal ??
                            row.customerNote),
                    ) && (
                      <p>
                        {value(
                          profile?.userType === "CUSTOMER"
                            ? row.customerNote
                            : (row.customerNote ??
                                row.reason ??
                                row.reasonInternal),
                        )}
                      </p>
                    )}
                    <div className="ws-actions">
                      {Boolean(row.planId) && (
                        <Link
                          className="ws-text-link"
                          to={`${base}/maintenance/${row.planId}?kind=plan`}
                        >
                          Xem kế hoạch
                          <ArrowRight size={12} />
                        </Link>
                      )}
                      {Boolean(row.taskId) && (
                        <Link
                          className="ws-text-link"
                          to={`${base}/maintenance/${row.taskId}?kind=task`}
                        >
                          Xem công việc
                          <ArrowRight size={12} />
                        </Link>
                      )}
                    </div>
                    {Object.keys(asRow(row.changes)).some(
                      (key) => key in fieldNames,
                    ) && (
                      <details>
                        <summary>Thông tin đã thay đổi</summary>
                        <dl>
                          {Object.entries(asRow(row.changes))
                            .filter(([key]) => key in fieldNames)
                            .map(([key, change]) => {
                              const detail = asRow(change);
                              return (
                                <div key={key}>
                                  <dt>{fieldNames[key]}</dt>
                                  <dd>
                                    {changeValue(detail.before ?? detail.old)} →{" "}
                                    {changeValue(detail.after ?? detail.new)}
                                  </dd>
                                </div>
                              );
                            })}
                        </dl>
                      </details>
                    )}
                    {row.completeness === "LEGACY_SUMMARY" && (
                      <p>Lịch sử cũ chưa có đầy đủ chi tiết.</p>
                    )}
                  </li>
                ))}
              </ol>
            ) : (
              <EmptyState
                title="Chưa có hoạt động phù hợp"
                description="Các lần tạo kế hoạch, thay đổi và thực hiện bảo trì sẽ được ghi nhận tại đây. Bạn có thể đổi thiết bị hoặc mở rộng khoảng thời gian."
              />
            )}
          </DataState>
        )}
        <Pagination
          page={query.page}
          total={state.data?.total}
          onChange={query.turnPage}
        />
      </section>
      <div className="ws-help">
        <Info size={17} />
        <span>
          Lịch sử cũ có thể chưa đầy đủ. Thời điểm ghi nhận hệ thống và thời
          điểm hoạt động thực tế có thể khác nhau; thông tin chi tiết được giữ
          tại hồ sơ nguồn.
        </span>
      </div>
    </div>
  );
}

export function WorkspaceRequestsPage() {
  const { profile } = useSession(),
    query = useListQuery(),
    customer = profile?.userType === "CUSTOMER";
  const base = customer ? "/portal/requests" : "/app/service-requests";
  const params = new URLSearchParams({
    page: String(query.page),
    pageSize: "20",
  });
  for (const key of ["q", "status", "priority"])
    if (query.params.get(key)) params.set(key, query.params.get(key)!);
  const state = useWorkspaceData<Page<Row>>(
    "requestsLive",
    `/service-requests?${params}`,
    query.revision,
  );
  const canCreate = customer || profile?.roles.includes("SERVICE_MANAGER");
  const options = [
    "NEW",
    "REVIEWING",
    "AWAITING_INFO",
    "AWAITING_CUSTOMER_APPROVAL",
    "ACCEPTED",
    "PROCESSING",
    "RESOLVED",
    "CLOSED",
    "REJECTED",
    "COST_REJECTED",
    "CANCELLED",
  ];
  return (
    <div className="ws-page">
      <PageHeading
        eyebrow={customer ? "CỔNG KHÁCH HÀNG" : undefined}
        title={customer ? "Yêu cầu hỗ trợ" : "Yêu cầu dịch vụ"}
        description={
          customer
            ? "Gửi vấn đề của thiết bị và theo dõi phản hồi từ nhà cung cấp tại một nơi."
            : "Tiếp nhận, đánh giá và theo dõi từng yêu cầu trong phạm vi tài khoản."
        }
        actions={
          <>
            <Refresh onClick={query.refresh} />
            {canCreate && (
              <Link className="ws-button" to={`${base}/new`}>
                <Plus size={16} />
                Tạo yêu cầu
              </Link>
            )}
          </>
        }
      />
      {customer && (
        <div className="ws-help">
          <Info size={17} />
          <span>
            <strong>Đang chờ ai? Hãy xem bước tiếp theo.</strong> Chờ bổ sung
            nghĩa là cần thêm thông tin từ khách hàng; chờ duyệt chi phí cần
            quản trị viên khách hàng kiểm tra và xác nhận.
          </span>
        </div>
      )}
      <section className="ws-card">
        <div className="ws-tabs" role="group" aria-label="Nhóm yêu cầu">
          {[
            { name: "Tất cả", status: "" },
            {
              name: customer ? "Cần bổ sung" : "Mới tiếp nhận",
              status: customer ? "AWAITING_INFO" : "NEW",
            },
            { name: "Chờ duyệt chi phí", status: "AWAITING_CUSTOMER_APPROVAL" },
            { name: "Đang xử lý", status: "PROCESSING" },
            { name: "Đã xử lý", status: "RESOLVED" },
          ].map((tab) => (
            <button
              key={tab.name}

              aria-pressed={(query.params.get("status") || "") === tab.status}
              onClick={() => query.change({ status: tab.status })}
            >
              {tab.name}
            </button>
          ))}
        </div>
        <div className="ws-toolbar">
          <SearchSubmit
            initial={query.params.get("q") || ""}
            placeholder="Tìm mã hoặc nội dung yêu cầu…"
            submit={(q) => query.change({ q })}
          />
          <StatusSelect
            labels={{ ACCEPTED: "Đã tiếp nhận" }}
            current={query.params.get("status") || ""}
            options={options}
            onChange={(status) => query.change({ status })}
          />
          <select
            aria-label="Ưu tiên yêu cầu"
            value={query.params.get("priority") || ""}
            onChange={(e) => query.change({ priority: e.target.value })}
          >
            <option value="">Tất cả ưu tiên</option>
            <option value="URGENT">Khẩn cấp</option>
            <option value="HIGH">Cao</option>
            <option value="NORMAL">Bình thường</option>
            <option value="LOW">Thấp</option>
          </select>
          {query.params.toString() && (
            <button
              className="ws-button ws-button--secondary"
              onClick={() => query.change({ q: "", status: "", priority: "" })}
            >
              Xóa lọc
            </button>
          )}
        </div>
        <DataState {...state} retry={query.refresh}>
          <div className="ws-table-wrap">
            <table className="ws-table">
              <thead>
                <tr>
                  <th>YÊU CẦU</th>
                  <th>ƯU TIÊN</th>
                  <th>TRẠNG THÁI</th>
                  <th>BƯỚC TIẾP THEO</th>
                  <th>NGÀY GỬI</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {state.data?.items.map((row) => (
                  <tr key={String(row.id)}>
                    <td data-label="Yêu cầu">
                      <Link className="ws-text-link" to={`${base}/${row.id}`}>
                        {value(row.requestNo)}
                      </Link>
                      <small>{value(row.title)}</small>
                    </td>
                    <td data-label="Ưu tiên">
                      <PriorityBadge
                        priority={String(row.priority ?? "NORMAL")}
                      />
                    </td>
                    <td data-label="Trạng thái">
                      <Badge status={row.status} label={row.status === "ACCEPTED" ? "Đã tiếp nhận" : undefined} />
                    </td>
                    <td data-label="Bước tiếp theo">
                      <NextStep>
                        {row.status === "AWAITING_INFO"
                          ? "Khách hàng bổ sung thông tin"
                          : row.status === "AWAITING_CUSTOMER_APPROVAL"
                            ? "Quản trị khách hàng xem dự toán"
                            : row.status === "NEW" || row.status === "REVIEWING"
                              ? "Bộ phận dịch vụ đánh giá"
                              : row.status === "PROCESSING"
                                ? "Theo dõi tiến trình thực hiện"
                                : row.status === "RESOLVED"
                                  ? "Xem kết quả và phản hồi"
                                  : "Xem chi tiết hồ sơ"}
                      </NextStep>
                    </td>
                    <td data-label="Ngày gửi">{formatDate(row.createdAt)}</td>
                    <td data-label="Thao tác">
                      <Link
                        className="ws-text-link"
                        to={`${base}/${row.id}`}
                        aria-label={`Xem ${row.requestNo}`}
                      >
                        <ArrowRight size={16} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!state.data?.items.length && (
            <EmptyState
              title="Chưa có yêu cầu phù hợp"
              description={
                customer
                  ? "Chọn thiết bị và mô tả vấn đề để gửi yêu cầu hỗ trợ. Các phản hồi và tiến độ sẽ được cập nhật trong hồ sơ của yêu cầu."
                  : "Kiểm tra bộ lọc hoặc tạo yêu cầu dịch vụ để bắt đầu tiếp nhận vấn đề của khách hàng."
              }
              action={
                canCreate && (
                  <Link className="ws-button" to={`${base}/new`}>
                    <Plus size={15} />
                    Tạo yêu cầu
                  </Link>
                )
              }
            />
          )}
        </DataState>
        <Pagination
          page={query.page}
          total={state.data?.total}
          onChange={query.turnPage}
        />
      </section>
    </div>
  );
}
