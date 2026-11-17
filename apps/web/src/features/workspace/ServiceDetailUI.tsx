import { serviceLabels } from "./service-detail-data";
import { useEffect, useId, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, Info, RefreshCw } from "lucide-react";
import { Badge } from "./WorkspaceUI";
import { hideTechnicalIds } from "../../display-names";
import "./service-detail.css";

export function ServiceHeader({
  back,
  backLabel,
  code,
  title,
  description,
  status,
  statusLabel,
  actions,
}: {
  back: string;
  backLabel: string;
  code: string;
  title: string;
  description: string;
  status?: unknown;
  statusLabel?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="sd-header">
      <Link className="sd-back" to={back}>
        <ArrowLeft size={15} />
        {backLabel}
      </Link>
      <div className="sd-header-main page-title-header">
        <span className="ws-eyebrow page-title-eyebrow">{code}</span>
        <h1>{title}</h1>
        <div className="sd-header-actions page-title-actions">
          {status != null && <Badge status={status} label={statusLabel} />}{" "}
          {actions}
        </div>
        <p className="page-title-description">{description}</p>
      </div>
    </header>
  );
}
export function ServiceCard({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="sd-card">
      <header>
        <div>
          <h2>{title}</h2>
          {description && <p>{description}</p>}
        </div>
        {actions}
      </header>
      <div className="sd-card-body">{children}</div>
    </section>
  );
}
export function ServiceSections({
  items,
}: {
  items: { key: string; label: string; content: ReactNode }[];
}) {
  const fromHash = () =>
    new URLSearchParams(window.location?.hash.slice(1) ?? "").get("section");
  const [selected, setSelected] = useState(fromHash() ?? items[0]?.key);
  const [visited, setVisited] = useState<string[]>([selected]);
  useEffect(() => {
    const changed = () => {
      const key = fromHash();
      if (key) {
        setSelected(key);
        setVisited((values) => [...new Set([...values, key])]);
      }
    };
    window.addEventListener("hashchange", changed);
    return () => window.removeEventListener("hashchange", changed);
  }, []);
  const instance = useId();
  const active = items.some((item) => item.key === selected)
    ? selected
    : items[0]?.key;
  return (
    <div className="sd-sections">
      <nav className="sd-section-nav" aria-label="Các mục hồ sơ">
        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            aria-pressed={active === item.key}
            aria-controls={`${instance}-${item.key}`}
            onClick={() => {
              setSelected(item.key);
              setVisited((values) => [...new Set([...values, item.key])]);
              window.history?.replaceState(
                null,
                "",
                `#section=${encodeURIComponent(item.key)}`,
              );
            }}
          >
            {item.label}
          </button>
        ))}
      </nav>
      {items.map((item) => (
        <div
          key={item.key}
          id={`${instance}-${item.key}`}
          className="sd-section-panel"
          hidden={active !== item.key}
        >
          {active === item.key || visited.includes(item.key)
            ? item.content
            : null}
        </div>
      ))}
    </div>
  );
}
export function ServiceFacts({
  items,
}: {
  items: { label: string; value: ReactNode; hint?: string }[];
}) {
  return (
    <dl className="sd-facts">
      {items.map((item) => (
        <div key={item.label}>
          <dt>{item.label}</dt>
          <dd>
            {item.value}
            <small>{item.hint}</small>
          </dd>
        </div>
      ))}
    </dl>
  );
}
export function ServiceNotice({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="sd-notice">
      <Info size={19} />
      <div>
        <strong>{title}</strong>
        <div>{children}</div>
      </div>
    </div>
  );
}
export function RefreshButton({
  refresh,
  busy = false,
}: {
  refresh: () => void;
  busy?: boolean;
}) {
  return (
    <button
      type="button"
      className="ws-button ws-button--secondary"
      disabled={busy}
      onClick={refresh}
    >
      <RefreshCw size={14} />
      Làm mới
    </button>
  );
}
export function ServiceProgress({ status }: { status: unknown }) {
  const steps = [
    ["CREATED", "Tạo lệnh"],
    ["ASSIGNED", "Phân công"],
    ["ACCEPTED", "Nhận việc"],
    ["IN_PROGRESS", "Thực hiện"],
    ["COMPLETED", "Hoàn tất"],
  ];
  const key =
    status === "TRAVELLING"
      ? "ACCEPTED"
      : status === "ON_HOLD"
        ? "IN_PROGRESS"
        : status;
  const current = steps.findIndex(([code]) => code === key);
  return (
    <ol className="sd-progress" aria-label="Tiến trình công việc">
      {steps.map(([code, label], i) => (
        <li
          key={code}
          data-state={
            i < current ? "done" : i === current ? "current" : "pending"
          }
          aria-current={i === current ? "step" : undefined}
        >
          <span>{i < current ? "✓" : i + 1}</span>
          {label}
        </li>
      ))}
    </ol>
  );
}
export function ServiceLink({
  to,
  children,
}: {
  to: string;
  children: ReactNode;
}) {
  return (
    <Link className="sd-related-link" to={to}>
      {children}
      <ArrowRight size={15} />
    </Link>
  );
}
const isInternalField = (key: string) =>
  /(^id$|Id$|Ids$|token|requestId|correlation|tenant|actorRoles)/i.test(key);

/** Compare audited fields in rows instead of recursively nesting before/after cards. */
export function BusinessChanges({ data }: { data: unknown }) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return <BusinessValues data={data} />;
  }
  const record = data as Record<string, unknown>;
  const isObject = (value: unknown): value is Record<string, unknown> =>
    !!value && typeof value === "object" && !Array.isArray(value);
  let entries = Object.entries(record).filter(([key]) => !isInternalField(key));
  // Older events may store whole before/after snapshots rather than field deltas.
  if (entries.every(([key]) => ["before", "after"].includes(key)) &&
      (isObject(record.before) || isObject(record.after))) {
    const before = isObject(record.before) ? record.before : {};
    const after = isObject(record.after) ? record.after : {};
    entries = [...new Set([...Object.keys(before), ...Object.keys(after)])]
      .filter((key) => !isInternalField(key))
      .map((key) => [key, { before: before[key] ?? null, after: after[key] ?? null }]);
  }
  if (!entries.every(([, entry]) => isObject(entry) &&
      ["before", "after", "oldValue", "newValue", "old", "new"].some((key) => Object.hasOwn(entry, key)))) {
    return <BusinessValues data={data} />;
  }
  const rows = entries.map(([key, entry]) => {
    const change = entry as Record<string, unknown>;
    const before = Object.hasOwn(change, "before") ? change.before : Object.hasOwn(change, "oldValue") ? change.oldValue : change.old;
    const after = Object.hasOwn(change, "after") ? change.after : Object.hasOwn(change, "newValue") ? change.newValue : change.new;
    return { key, before: before ?? null, after: after ?? null };
  }).filter(({ before, after }) => JSON.stringify(before) !== JSON.stringify(after));
  return rows.length ? (
    <div className="sd-history-changes">
      <table className="sd-change-table" aria-label="So sánh thông tin trước và sau sự kiện">
        <colgroup><col style={{ width: "28%" }} /><col /><col /></colgroup>
        <thead><tr><th scope="col">Thông tin</th><th scope="col">Giá trị cũ</th><th scope="col">Giá trị mới</th></tr></thead>
        <tbody>
          {rows.map(({ key, before, after }) => (
            <tr key={key}>
              <th scope="row">{serviceLabels[key] ?? key.replace(/([a-z])([A-Z])/g, "$1 $2")}</th>
              <td data-label="Giá trị cũ"><BusinessValues data={before} field={key} /></td>
              <td data-label="Giá trị mới"><BusinessValues data={after} field={key} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : <p>Không có thay đổi về thông tin hiển thị.</p>;
}

/** Render domain metadata without exposing internal UUID references or raw JSON. */
export function BusinessValues({ data, field }: { data: unknown; field?: string }) {
  if (data == null || data === "") return <span>Chưa ghi nhận</span>;
  if (typeof data === "boolean") return <span>{data ? "Có" : "Không"}</span>;
  if (Array.isArray(data))
    return data.length ? (
      <ul>
        {data.map((entry, i) => (
          <li key={i}>
            <BusinessValues data={entry} field={field} />
          </li>
        ))}
      </ul>
    ) : (
      <span>Không có</span>
    );
  if (typeof data === "object") {
    const record = data as Record<string, unknown>;
    const entries = Object.entries(record).filter(
      ([key, entry]) =>
        !isInternalField(key) &&
        !(key === "termYears" && entry == null &&
          ["UNLIMITED", "WARRANTY_END"].includes(String(record.termMode))) &&
        !(key === "endDate" && entry == null && record.termMode === "UNLIMITED"),
    );
    const comparisonKeys = ["before", "oldValue", "after", "newValue"];
    const comparison = entries.length > 0 && entries.every(([key]) => comparisonKeys.includes(key));
    if (comparison) entries.sort(([a], [b]) => comparisonKeys.indexOf(a) - comparisonKeys.indexOf(b));
    return entries.length ? (
      <dl className={`sd-facts sd-facts--compact sd-business-values${comparison ? " sd-business-values--comparison" : ""}`}>
        {entries.map(([key, entry]) => (
          <div key={key}>
            <dt>
              {serviceLabels[key] ?? key.replace(/([a-z])([A-Z])/g, "$1 $2")}
            </dt>
            <dd>
              <BusinessValues data={entry} field={comparisonKeys.includes(key) ? field : key} />
            </dd>
          </div>
        ))}
      </dl>
    ) : (
      <span>Thay đổi liên kết nội bộ; xem hồ sơ liên quan.</span>
    );
  }
  const text = hideTechnicalIds(String(data), "Tham chiếu nội bộ");
  // Keep calendar dates stable across time zones and leave user-authored text intact.
  if (field && /(Date|At|Start|End)$/.test(field) && /^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const parsed = new Date(`${text}T00:00:00Z`);
    if (!Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === text) {
      return <span>{new Intl.DateTimeFormat("vi-VN", { timeZone: "UTC", day: "2-digit", month: "2-digit", year: "numeric" }).format(parsed)}</span>;
    }
  }
  if (field && ["name", "planName", "description", "note", "reason", "customerNote", "displayName"].includes(field)) {
    return <span>{text}</span>;
  }
  return <span>{serviceLabels[text] ?? text}</span>;
}
