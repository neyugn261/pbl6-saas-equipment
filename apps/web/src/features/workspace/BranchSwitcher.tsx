import { useEffect, useId, useState } from "react";
import { Building2, Info, Search } from "lucide-react";
import { useSession } from "../../auth/session";
import { useDirectory } from "../../routes/registration-data";
import type { Page } from "../../types/domain";
import { selectBranch, selectedBranchId } from "./branch-context";
import "./management.css";

export default function BranchSwitcher({
  onChange,
}: {
  onChange: (id: string) => void;
}) {
  const { profile } = useSession();
  const controlId = useId();
  const key = `pbl6.branch-view.${profile?.tenantId}.${profile?.id}`;
  const [id, setId] = useState(() => {
    try {
      return sessionStorage.getItem(key) || "";
    } catch {
      return "";
    }
  });
  const [q, setQ] = useState("");
  const branches = useDirectory<
    Page<{ id: string; code: string; name: string }>
  >(
    "organization",
    `/branches?status=ACTIVE&pageSize=100&q=${encodeURIComponent(q)}`,
  );
  useEffect(() => {
    if (selectedBranchId() !== id) {
      selectBranch(id);
      onChange(id);
    }
  }, [id, onChange]);
  return (
    <div className="management-branch">
      <div className="management-branch__heading">
        <Building2 size={15} aria-hidden="true" />
        <label htmlFor={controlId}>Chi nhánh mặc định</label>
        <details className="management-branch__help" onKeyDown={event => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.currentTarget.open = false;
          }
        }}>
          <summary aria-label="Phạm vi áp dụng của chi nhánh mặc định" title="Phạm vi áp dụng"><Info size={16} aria-hidden="true" /></summary>
          <div className="management-branch__help-content">
            <strong>Phạm vi áp dụng</strong>
            <p>Áp dụng cho yêu cầu, lệnh, đội kỹ thuật, KPI và danh sách kho. Các mục khác giữ phạm vi truy cập hiện có.</p>
            <p>Bộ lọc chi nhánh riêng trên từng trang được ưu tiên.</p>
          </div>
        </details>
      </div>
      <div className="management-branch__controls">
        <div className="ws-search management-branch__search">
          <Search size={16} aria-hidden="true" />
          <input
            type="search"
            maxLength={100}
            aria-label="Tìm chi nhánh"
            placeholder="Tìm tên hoặc mã…"
            value={q}
            onChange={(event) => setQ(event.target.value)}
          />
        </div>
        <select
          id={controlId}
          value={id}
          disabled={branches.loading || !!branches.error}
          onChange={(event) => {
            const next = event.target.value;
            selectBranch(next);
            setId(next);
            onChange(next);
            try {
              sessionStorage.setItem(key, next);
            } catch {
              /* Selection remains valid for this page. */
            }
          }}
        >
          <option value="">Toàn doanh nghiệp</option>
          {id && !branches.value?.items.some((branch) => branch.id === id) && (
            <option value={id}>Chi nhánh đang chọn</option>
          )}
          {branches.value?.items.map((branch) => (
            <option key={branch.id} value={branch.id}>
              {branch.code} · {branch.name}
            </option>
          ))}
        </select>
      </div>
      {branches.error && <span role="alert">Không tải được chi nhánh.</span>}
      {(branches.value?.total ?? 0) > 100 && (
        <small>Tìm theo tên/mã để xem thêm chi nhánh.</small>
      )}
    </div>
  );
}
