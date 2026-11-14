import { useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { useSession } from "../../auth/session";
import type { Page } from "../../types/domain";
import { DataState, Pagination } from "./WorkspaceUI";
import { asRow, formatDate, useWorkspaceData, value, type Row } from "./workspace-data";
import { recordAge } from "./service-detail-data";
import "./request-follow-up.css";

const pageSize = 5;

export default function RequestFollowUpQueue({ unallocated = false }: { unallocated?: boolean }) {
  const { profile } = useSession();
  const allowed = profile?.userType === "TENANT_STAFF" &&
    (unallocated ? profile.roles.includes("TENANT_ADMIN") : profile.roles.includes("SERVICE_MANAGER"));
  const [page, setPage] = useState(1);
  const [revision, refresh] = useState(0);
  const [result, setResult] = useState("UNRESOLVED");
  const state = useWorkspaceData<Page<Row>>("requestsLive", allowed
    ? `/service-requests?page=${page}&pageSize=${pageSize}&${unallocated ? "unallocated=true" : `followUp=${result}`}` : null, revision);
  if (!allowed) return null;

  const total = state.data?.total;
  const items = state.data?.items ?? [];
  const tone = !total ? "neutral" : unallocated || result === "PARTIALLY_RESOLVED" ? "amber" : "red";
  const title = unallocated ? "Yêu cầu chưa phân bổ chi nhánh" : result === "UNRESOLVED"
    ? "Cảnh báo: Yêu cầu chưa xử lý được" : "Yêu cầu mới giải quyết một phần";

  return (
    <section className={`request-follow-up request-follow-up--${tone}`} aria-label={title}>
      <header className="request-follow-up__header">
        <h2 className="request-follow-up__title">
          {tone !== "neutral" && <AlertTriangle aria-hidden="true" size={18} />}
          <span>{title}</span>
          {total !== undefined && <span className="request-follow-up__count" aria-label={`${total} yêu cầu`}>{total}</span>}
        </h2>
        <div className="request-follow-up__controls">
          {!unallocated && (
            <label>
              Kết quả cần theo dõi
              <select value={result} onChange={(e) => { setResult(e.target.value); setPage(1); }}>
                <option value="UNRESOLVED">Chưa xử lý được</option>
                <option value="PARTIALLY_RESOLVED">Giải quyết một phần</option>
              </select>
            </label>
          )}
          {!state.error && (
            <button type="button" className="ws-button ws-button--secondary" onClick={() => refresh((v) => v + 1)}>
              <RefreshCw aria-hidden="true" size={14} />
              Làm mới hàng chờ
            </button>
          )}
        </div>
      </header>
      <DataState {...state} retry={() => refresh((v) => v + 1)}>
        {items.length ? (
          <ul className="request-follow-up__list">
            {items.map((row) => {
              const follow = asRow(row.followUp);
              const since = unallocated ? row.createdAt : follow.recordedAt;
              return (
                <li key={String(row.id)}>
                  <Link to={`/app/service-requests/${row.id}`}><strong>{value(row.requestNo)}</strong> · {value(row.title)}</Link>
                  {!unallocated && (
                    <>
                      <p><strong>{result === "UNRESOLVED" ? "Chưa xử lý được" : "Giải quyết một phần"}</strong>{follow.workOrderNo ? ` · ${value(follow.workOrderNo)}` : ""}</p>
                      <p>{value(follow.reason, "Chưa có lý do được ghi nhận. Mở hồ sơ để kiểm tra kết quả.")}</p>
                    </>
                  )}
                  <p>Phụ trách: {unallocated || follow.responsibleRole === "TENANT_ADMIN" ? "Quản trị doanh nghiệp" : "Bộ phận quản lý dịch vụ của chi nhánh"}</p>
                  <small>Ghi nhận: {formatDate(since, true)} · Đang chờ: {recordAge(since)}</small>
                  <p>{unallocated ? "Phân bổ chi nhánh để bộ phận dịch vụ tiếp nhận." : value(follow.nextAction)}</p>
                  {unallocated && <Link to="/app/organization/service-branches">Mở phân bổ chi nhánh →</Link>}
                </li>
              );
            })}
          </ul>
        ) : <p className="request-follow-up__empty" role="status">Không có yêu cầu trong hàng chờ này.</p>}
        {!items.length && page > 1 ? (
          <button type="button" className="ws-button ws-button--secondary" onClick={() => setPage(1)}>Về trang đầu</button>
        ) : (total ?? 0) > pageSize && (
          <Pagination page={page} pageSize={pageSize} total={total} onChange={setPage} />
        )}
      </DataState>
    </section>
  );
}
