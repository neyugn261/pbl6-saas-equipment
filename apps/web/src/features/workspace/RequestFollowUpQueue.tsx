import { useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { useSession } from "../../auth/session";
import type { Page } from "../../types/domain";
import { DataState, Pagination } from "./WorkspaceUI";
import { asRow, formatDate, useWorkspaceData, value, type Row } from "./workspace-data";
import { recordAge } from "./service-detail-data";
import "./request-follow-up.css";

export default function RequestFollowUpQueue({ unallocated = false }: { unallocated?: boolean }) {
  const { profile } = useSession();
  const allowed = profile?.userType === "TENANT_STAFF" &&
    (unallocated ? profile.roles.includes("TENANT_ADMIN") : profile.roles.includes("SERVICE_MANAGER"));
  const [page, setPage] = useState(1);
  const [revision, refresh] = useState(0);
  const [result, setResult] = useState("UNRESOLVED");
  const state = useWorkspaceData<Page<Row>>("requestsLive", allowed
    ? `/service-requests?page=${page}&pageSize=5&${unallocated ? "unallocated=true" : `followUp=${result}`}` : null, revision);
  if (!allowed) return null;
  const title = unallocated ? "Yêu cầu chưa phân bổ chi nhánh" : result === "UNRESOLVED"
    ? "Cảnh báo: Yêu cầu chưa xử lý được" : "Yêu cầu mới giải quyết một phần";
  return <section className={`request-follow-up ${unallocated || result === "PARTIALLY_RESOLVED" ? "request-follow-up--amber" : ""}`} aria-label={title}>
    <h2><AlertTriangle aria-hidden="true" size={22} /> {title} <span>{state.data?.total ?? "—"}</span></h2>
    {!unallocated && <label>Kết quả cần theo dõi <select value={result} onChange={(e) => { setResult(e.target.value); setPage(1); }}>
      <option value="UNRESOLVED">Chưa xử lý được</option><option value="PARTIALLY_RESOLVED">Giải quyết một phần</option>
    </select></label>}
    <button type="button" className="ws-button ws-button--secondary" onClick={() => refresh((v) => v + 1)}>Làm mới hàng chờ</button>
    <DataState {...state} retry={() => refresh((v) => v + 1)}>
      {state.data?.items.length ? <ul>{state.data.items.map((row) => {
        const follow = asRow(row.followUp);
        const since = unallocated ? row.createdAt : follow.recordedAt;
        return <li key={String(row.id)}>
          <Link to={`/app/service-requests/${row.id}`}><strong>{value(row.requestNo)}</strong> · {value(row.title)}</Link>
          {!unallocated && <p><strong>{result === "UNRESOLVED" ? "Chưa xử lý được" : "Giải quyết một phần"}</strong>{follow.workOrderNo ? ` · ${value(follow.workOrderNo)}` : ""}</p>}
          {!unallocated && <p>{value(follow.reason, "Chưa có lý do được ghi nhận; mở hồ sơ để kiểm tra kết quả.")}</p>}
          <p>Phụ trách: {unallocated || follow.responsibleRole === "TENANT_ADMIN" ? "Quản trị doanh nghiệp" : "Bộ phận quản lý dịch vụ của chi nhánh"}</p>
          <small>Ghi nhận: {formatDate(since, true)} · Đang chờ: {recordAge(since)}</small>
          <p>{unallocated ? "Phân bổ chi nhánh để bộ phận dịch vụ tiếp nhận." : value(follow.nextAction)}</p>
          {unallocated && <Link to="/app/organization/service-branches">Mở phân bổ chi nhánh →</Link>}
        </li>;
      })}</ul> : <p role="status">Không có yêu cầu trong hàng chờ này.</p>}
      <Pagination page={page} pageSize={5} total={state.data?.total} onChange={setPage} />
    </DataState>
  </section>;
}
