import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  ArrowRight,
  Inbox,
  RefreshCw,
  Search,
} from "lucide-react";
import {
  formatDate,
  statusNames,
  useWorkspaceData,
  value,
  type Area,
  type Row,
} from "./workspace-data";
import "./workspace.css";
import type { Page } from "../../types/domain";

export function Badge({ status, label }: { status: unknown; label?: string }) {
  const key = String(status ?? "");
  const tone = [
    "COMPLETED",
    "ACTIVE",
    "AVAILABLE",
    "ACTIVATED",
    "CLOSED",
    "RESOLVED",
  ].includes(key)
    ? "green"
    : [
          "ON_HOLD",
          "PAUSED",
          "PENDING",
          "PENDING_CUSTOMER_CONFIRMATION",
          "AWAITING_INFO",
          "AWAITING_CUSTOMER_APPROVAL",
          "ASSIGNED",
          "NEW",
        ].includes(key)
      ? "amber"
      : ["CANCELLED", "FAILED", "REJECTED", "EXPIRED", "INACTIVE"].includes(key)
        ? "red"
        : "blue";
  return (
    <span className={`ws-badge ws-badge--${tone}`}>
      <span aria-hidden="true" />
      {label ?? statusNames[key] ?? value(status, "Chưa xác định")}
    </span>
  );
}
export function PageHeading({
  eyebrow = "KHÔNG GIAN DỊCH VỤ",
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <header className="ws-heading">
      <div>
        <span className="ws-eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="ws-actions">{actions}</div>
    </header>
  );
}
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="ws-empty">
      <span className="ws-empty-icon">
        <Inbox size={27} strokeWidth={1.5} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function DataState({
  loading,
  error,
  retry,
  children,
}: {
  loading: boolean;
  error?: string;
  retry: () => void;
  children: ReactNode;
}) {
  if (loading)
    return (
      <div className="ws-skeleton" role="status" aria-label="Đang tải dữ liệu">
        <span />
        <span />
        <span />
      </div>
    );
  if (error)
    return (
      <div className="ws-error" role="alert">
        <AlertCircle size={22} />
        <div>
          <strong>Chưa thể hiển thị dữ liệu</strong>
          <p>{error}</p>
          <button className="ws-button ws-button--secondary" onClick={retry}>
            <RefreshCw size={14} />
            Thử lại
          </button>
        </div>
      </div>
    );
  return children;
}
export function Pagination({
  page,
  total,
  pageSize = 20,
  onChange,
}: {
  page: number;
  total?: number;
  pageSize?: number;
  onChange: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil((total ?? 0) / pageSize));
  return (
    <footer className="ws-pagination">
      <span>
        {total === undefined
          ? "Chưa có tổng số bản ghi"
          : total
            ? `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} trong ${total} bản ghi`
            : "0 bản ghi"}
        <span className="ws-page-count">
          {" "}
          · Trang {page}/{pages}
        </span>
      </span>
      <div>
        <button
          className="ws-button ws-button--secondary"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
        >
          Trước
        </button>
        <button
          className="ws-button ws-button--secondary"
          disabled={total === undefined || page >= pages}
          onClick={() => onChange(page + 1)}
        >
          Sau
        </button>
      </div>
    </footer>
  );
}
export function SearchField({
  name = "q",
  placeholder = "Tìm kiếm…",
  defaultValue = "",
}: {
  name?: string;
  placeholder?: string;
  defaultValue?: string;
}) {
  return (
    <label className="ws-search">
      <Search size={17} aria-hidden="true" />
      <span className="ws-sr-only">{placeholder}</span>
      <input
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        maxLength={100}
      />
    </label>
  );
}
export function RelatedName({
  area,
  path,
  initial,
  fallback = "Tên chưa tải được",
  to,
}: {
  area: Area;
  path: string | null;
  initial?: unknown;
  fallback?: string;
  to?: string;
}) {
  const data = useWorkspaceData<Row>(area, initial ? null : path);
  const row = data.data;
  const name = value(
    initial ??
      row?.displayName ??
      row?.fullName ??
      row?.name ??
      row?.assetCode ??
      row?.employeeCode,
    data.loading ? "Đang tải tên…" : fallback,
  );
  return to ? (
    <Link className="ws-text-link" to={to}>
      {name}
    </Link>
  ) : (
    <span>{name}</span>
  );
}
export function NextStep({ children }: { children: ReactNode }) {
  return (
    <span className="ws-next-step">
      <ArrowRight size={13} aria-hidden="true" />
      {children}
    </span>
  );
}

export function EntityPicker({
  label,
  area,
  path,
  selected,
  onChange,
}: {
  label: string;
  area: Area;
  path: string | null;
  selected: string;
  onChange: (id: string) => void;
}) {
  const [q, setQ] = useState(""),
    [draft, setDraft] = useState(""),
    [page, setPage] = useState(1);
  const searchable = area !== "maintenance";
  const params = new URLSearchParams({
    page: String(page),
    pageSize: "20",
    ...(q && searchable ? { q } : {}),
  });
  const data = useWorkspaceData<Page<Row> | Row[]>(
    area,
    path ? `${path}${path.includes("?") ? "&" : "?"}${params}` : null,
  );
  const allRows = Array.isArray(data.data) ? data.data : null;
  const filteredRows = allRows?.filter(row => !q || Object.values(row).some(entry => typeof entry === 'string' && entry.toLocaleLowerCase('vi').includes(q.toLocaleLowerCase('vi'))));
  const rows = filteredRows ? filteredRows.slice((page - 1) * 20, page * 20) : (data.data as Page<Row> | undefined)?.items ?? [];
  const total = filteredRows?.length ?? (data.data as Page<Row> | undefined)?.total ?? 0;
  return (
    <div className="ws-label">
      <span>{label}</span>
      {searchable && (
        <div className="ws-actions">
          <input
            aria-label={`Tìm ${label.toLowerCase()}`}
            placeholder="Tìm theo tên hoặc mã…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button
            type="button"
            className="ws-button ws-button--secondary"
            onClick={() => {
              setQ(draft);
              setPage(1);
            }}
            disabled={!path}
          >
            Tìm
          </button>
        </div>
      )}
      <select
        aria-label={label}
        value={selected}
        disabled={!path || data.loading}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">
          {data.loading ? "Đang tải lựa chọn…" : `Chọn ${label.toLowerCase()}`}
        </option>
        {selected && !rows.some((row) => row.id === selected) && (
          <option value={selected}>Đã chọn · tên chưa có trên trang này</option>
        )}
        {rows.map((row) => (
          <option key={String(row.id)} value={String(row.id)}>
            {[
              row.assetCode,
              row.employeeCode,
              row.displayName ??
                row.name ??
                row.fullName ??
                row.title ??
                row.taskNo,
              row.serialNumber,
              row.scheduledDate ? formatDate(row.scheduledDate) : null,
            ]
              .filter(Boolean)
              .map(String)
              .join(" · ") || "Hồ sơ chưa có tên"}
          </option>
        ))}
      </select>
      {data.error && <small role="alert">{data.error}</small>}
      {data.data && (
        <small>
          {total} lựa chọn · Trang {page}
          {page > 1 && (
            <button
              type="button"
              className="ws-button ws-button--secondary"
              onClick={() => setPage(page - 1)}
            >
              Trước
            </button>
          )}
          {page * 20 < total && (
            <button
              type="button"
              className="ws-button ws-button--secondary"
              onClick={() => setPage(page + 1)}
            >
              Sau
            </button>
          )}
        </small>
      )}
    </div>
  );
}
