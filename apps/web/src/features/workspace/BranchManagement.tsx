import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import { useSession, getSessionGeneration } from "../../auth/session";
import { useDirectory, errorText } from "../../routes/registration-data";
import type { Page } from "../../types/domain";

type Branch = { id: string; code: string; name: string; status: string };
type Context = { branch: Branch | null };

function BranchSelect({
  value,
  onChange,
  disabled = false,
  empty = "Chọn chi nhánh",
}: {
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  empty?: string;
}) {
  const [q, setQ] = useState("");
  const data = useDirectory<Page<Branch>>(
    "organization",
    `/branches?pageSize=100&status=ACTIVE&q=${encodeURIComponent(q)}`,
  );
  return (
    <>
      <input
        aria-label="Tìm chi nhánh theo tên hoặc mã"
        placeholder="Tìm chi nhánh"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        disabled={disabled}
      />
      <select
        aria-label="Chi nhánh"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled || data.loading || !!data.error}
      >
        <option value="">{empty}</option>
        {value && !data.value?.items.some((b) => b.id === value) && (
          <option value={value}>Chi nhánh hiện tại</option>
        )}
        {data.value?.items.map((b) => (
          <option key={b.id} value={b.id}>
            {b.code} · {b.name}
          </option>
        ))}
      </select>
      {data.error && <p role="alert">{data.error}</p>}
      {data.value && data.value.total > 100 && (
        <p>Thu hẹp tên hoặc mã để tìm thêm chi nhánh.</p>
      )}
    </>
  );
}

export function BranchScopeNotice() {
  const { profile } = useSession();
  const admin = profile?.roles.includes("TENANT_ADMIN");
  const scoped = profile?.userType === "TENANT_STAFF" && !admin;
  const data = useDirectory<Context>(
    "organization",
    scoped ? "/staff/me/branch" : null,
  );
  if (profile?.userType !== "TENANT_STAFF") return null;
  if (admin)
    return (
      <p className="m1-hint">
        Phạm vi quản trị: toàn doanh nghiệp.{" "}
        <Link to="/app/organization/service-branches">
          Xem theo chi nhánh và phân bổ hồ sơ
        </Link>
      </p>
    );
  return (
    <div
      role={
        data.error || (!data.loading && !data.value?.branch)
          ? "alert"
          : "status"
      }
      className="m1-hint"
    >
      {data.loading
        ? "Đang xác định chi nhánh…"
        : data.error
          ? `Không xác định được chi nhánh: ${data.error}`
          : data.value?.branch
            ? `Chi nhánh làm việc: ${data.value.branch.name}. Yêu cầu, công việc và kho áp dụng phạm vi chi nhánh; khách hàng, thiết bị và kế hoạch bảo trì dùng chung doanh nghiệp.`
            : "Chưa có chi nhánh chính đang hoạt động. Liên hệ Tenant Admin để được gán trước khi xử lý dịch vụ."}
    </div>
  );
}

export function StaffBranchAssignment({
  userId,
  technician = false,
}: {
  userId: string;
  technician?: boolean;
}) {
  const [revision, refresh] = useState(0),
    [selected, select] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const current = useDirectory<Context>(
    "organization",
    `/staff/${userId}/branch`,
    revision,
  );
  async function save() {
    const generation = getSessionGeneration();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await api.organization(`/branches/${selected}/users`, {
        method: "POST",
        body: { userId, isPrimary: true },
      });
      if (generation !== getSessionGeneration()) return;
      setMessage(
        "Đã gán chi nhánh chính. Nếu là kỹ thuật viên, cập nhật hồ sơ kỹ thuật viên cùng chi nhánh.",
      );
      refresh((v) => v + 1);
    } catch (cause) {
      if (generation === getSessionGeneration()) setError(errorText(cause));
    } finally {
      if (generation === getSessionGeneration()) setBusy(false);
    }
  }
  return (
    <section className="m1-card">
      <h2>Chi nhánh chính</h2>
      <p>
        {current.loading
          ? "Đang tải…"
          : current.error || current.value?.branch?.name || "Chưa được gán"}
      </p>
      <BranchSelect value={selected} onChange={select} disabled={busy} />
      <button
        disabled={!selected || busy || current.loading || !!current.error}
        onClick={() => void save()}
      >
        Gán chi nhánh chính
      </button>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {technician && current.value?.branch && (
        <TechnicianBranchSetup
          key={`${userId}:${current.value.branch.id}`}
          userId={userId}
          branchId={current.value.branch.id}
        />
      )}
    </section>
  );
}

function TechnicianBranchSetup({
  userId,
  branchId,
}: {
  userId: string;
  branchId: string;
}) {
  const [revision, refresh] = useState(0),
    [code, setCode] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const data = useDirectory<
    Page<{ id: string; branchId: string; employeeCode: string }>
  >("workorders", `/technicians?userId=${userId}`, revision);
  const row = data.value?.items[0];
  async function save() {
    const generation = getSessionGeneration();
    setBusy(true);
    setError("");
    try {
      await api.workorders(`/technicians${row ? `/${row.id}` : ""}`, {
        method: row ? "PATCH" : "POST",
        body: row
          ? { branchId }
          : { userId, branchId, employeeCode: code.trim() },
      });
      if (generation === getSessionGeneration()) refresh((v) => v + 1);
    } catch (cause) {
      if (generation === getSessionGeneration()) {
        setError(errorText(cause));
        refresh((v) => v + 1);
      }
    } finally {
      if (generation === getSessionGeneration()) setBusy(false);
    }
  }
  return (
    <div>
      <h3>Hồ sơ kỹ thuật viên</h3>
      {data.loading ? (
        <p>Đang tải hồ sơ…</p>
      ) : data.error ? (
        <p role="alert">{data.error}</p>
      ) : row?.branchId === branchId ? (
        <p role="status">{row.employeeCode} đã thuộc chi nhánh chính.</p>
      ) : (
        <>
          <p>
            {row
              ? "Chi nhánh công tác trên hồ sơ cần được cập nhật theo chi nhánh chính mới."
              : "Tạo hồ sơ để tài khoản kỹ thuật viên có thể được phân công công việc."}
          </p>
          {!row && (
            <input
              aria-label="Mã nhân viên kỹ thuật"
              placeholder="Mã nhân viên"
              value={code}
              maxLength={50}
              onChange={(e) => setCode(e.target.value)}
              disabled={busy}
            />
          )}
          <button
            disabled={busy || (!row && !code.trim())}
            onClick={() => void save()}
          >
            {row ? "Cập nhật chi nhánh hồ sơ" : "Tạo hồ sơ kỹ thuật viên"}
          </button>
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}

export function SiteBranchRouting({
  siteId,
  branchId,
  onSaved,
}: {
  siteId: string;
  branchId?: string | null;
  onSaved: () => void;
}) {
  const [selected, select] = useState<string | undefined>(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const chosen = selected ?? branchId ?? "";
  async function save() {
    const generation = getSessionGeneration();
    setBusy(true);
    setError("");
    try {
      await api.organization(`/sites/${siteId}`, {
        method: "PATCH",
        body: { defaultServicingBranchId: chosen || null },
      });
      if (generation === getSessionGeneration()) onSaved();
    } catch (cause) {
      if (generation === getSessionGeneration()) setError(errorText(cause));
    } finally {
      if (generation === getSessionGeneration()) setBusy(false);
    }
  }
  return (
    <div>
      <p>Chi nhánh tiếp nhận yêu cầu mới</p>
      <BranchSelect
        value={chosen}
        onChange={select}
        disabled={busy}
        empty="Chưa phân bổ — Tenant Admin tiếp nhận"
      />
      <button
        disabled={busy || selected === undefined}
        onClick={() => void save()}
      >
        Lưu chi nhánh phục vụ
      </button>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}

type CaseRow = {
  id: string;
  title: string;
  status: string;
  requestNo?: string;
  workOrderNo?: string;
  branchId: string | null;
};
function Allocation({
  row,
  area,
  onSaved,
}: {
  row: CaseRow;
  area: "requestsLive" | "workorders";
  onSaved: () => void;
}) {
  const [branchId, select] = useState(""),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function save() {
    const generation = getSessionGeneration();
    setBusy(true);
    setError("");
    try {
      await api[area](
        `/${area === "requestsLive" ? "service-requests" : "work-orders"}/${row.id}/branch`,
        {
          method: "PATCH",
          body: {
            branchId,
            reason: reason.trim(),
            ...(area === "requestsLive"
              ? { expectedBranchId: row.branchId }
              : {}),
          },
        },
      );
      if (generation === getSessionGeneration()) onSaved();
    } catch (cause) {
      if (generation === getSessionGeneration()) setError(errorText(cause));
    } finally {
      if (generation === getSessionGeneration()) setBusy(false);
    }
  }
  return (
    <div>
      <BranchSelect value={branchId} onChange={select} disabled={busy} />
      <input
        aria-label="Lý do phân bổ"
        placeholder="Lý do phân bổ"
        maxLength={1000}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        disabled={busy}
      />
      <button
        disabled={busy || !branchId || !reason.trim()}
        onClick={() => void save()}
      >
        Phân bổ chi nhánh
      </button>
      {error && (
        <p role="alert">
          {error} Tải lại danh sách để kiểm tra kết quả trước khi gửi lại.
        </p>
      )}
    </div>
  );
}

export function BranchAllocationPage() {
  const [area, setArea] = useState<"requestsLive" | "workorders">(
      "requestsLive",
    ),
    [filter, setFilter] = useState("unallocated"),
    [page, setPage] = useState(1),
    [revision, refresh] = useState(0);
  const path = area === "requestsLive" ? "/service-requests" : "/work-orders";
  const data = useDirectory<Page<CaseRow>>(
    area,
    `${path}?page=${page}&pageSize=20${filter === "unallocated" ? "&unallocated=true" : filter ? `&branchId=${filter}` : ""}`,
    revision,
  );
  return (
    <div className="live-admin">
      <header className="m1-header">
        <h1>Phân bổ dịch vụ theo chi nhánh</h1>
        <p>
          Tenant Admin xem toàn doanh nghiệp. Hồ sơ cũ hoặc địa điểm chưa cấu
          hình chi nhánh nằm ở hàng chờ. Với WO cũ từ Request, phân bổ Request
          nguồn trước, sau đó phân bổ WO cùng chi nhánh.
        </p>
      </header>
      <div className="live-toolbar">
        <select
          aria-label="Loại hồ sơ"
          value={area}
          onChange={(e) => {
            setArea(e.target.value as typeof area);
            setPage(1);
          }}
        >
          <option value="requestsLive">Yêu cầu dịch vụ</option>
          <option value="workorders">Công việc</option>
        </select>
        <select
          aria-label="Phạm vi hồ sơ"
          value={filter === "unallocated" ? "unallocated" : "branches"}
          onChange={(e) => {
            setFilter(e.target.value === "unallocated" ? "unallocated" : "");
            setPage(1);
          }}
        >
          <option value="unallocated">Chưa phân bổ</option>
          <option value="branches">Xem theo chi nhánh</option>
        </select>
        {filter !== "unallocated" && (
          <BranchSelect
            value={filter}
            empty="Tất cả chi nhánh"
            onChange={(id) => {
              setFilter(id);
              setPage(1);
            }}
          />
        )}
        <button onClick={() => refresh((v) => v + 1)}>Tải lại</button>
      </div>
      {data.loading && <p role="status">Đang tải hồ sơ…</p>}
      {data.error && <p role="alert">{data.error}</p>}
      {data.value && (
        <>
          <p>{data.value.total} hồ sơ phù hợp.</p>
          {data.value.items.map((row) => (
            <article className="m1-card" key={row.id}>
              <h2>
                <Link
                  to={`/app/${area === "requestsLive" ? "service-requests" : "work-orders"}/${row.id}`}
                >
                  {row.requestNo || row.workOrderNo} · {row.title}
                </Link>
              </h2>
              <p>
                {row.status} ·{" "}
                {row.branchId ? "Đã có chi nhánh xử lý" : "Chưa phân bổ"}
              </p>
              {!row.branchId &&
                ![
                  "COMPLETED",
                  "CANCELLED",
                  "CLOSED",
                  "RESOLVED",
                  "REJECTED",
                ].includes(row.status) && (
                  <Allocation
                    row={row}
                    area={area}
                    onSaved={() => refresh((v) => v + 1)}
                  />
                )}
            </article>
          ))}
          <nav aria-label="Phân trang">
            <button disabled={page <= 1} onClick={() => setPage(page - 1)}>
              Trước
            </button>
            <span> Trang {page} </span>
            <button
              disabled={page * 20 >= data.value.total}
              onClick={() => setPage(page + 1)}
            >
              Sau
            </button>
          </nav>
        </>
      )}
    </div>
  );
}
