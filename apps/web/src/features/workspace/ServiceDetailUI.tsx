import { serviceLabels } from "./service-detail-data";
import { useEffect, useId, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, Info, RefreshCw } from "lucide-react";
import { Badge } from "./WorkspaceUI";
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
      <div className="sd-header-main">
        <div>
          <span className="ws-eyebrow">{code}</span>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        <div className="sd-header-actions">
          {status != null && <Badge status={status} label={statusLabel} />}{" "}
          {actions}
        </div>
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
/** Render domain metadata without exposing internal UUID references or raw JSON. */
export function BusinessValues({ data }: { data: unknown }) {
  if (data == null || data === "") return <span>Chưa ghi nhận</span>;
  if (typeof data === "boolean") return <span>{data ? "Có" : "Không"}</span>;
  if (Array.isArray(data))
    return data.length ? (
      <ul>
        {data.map((entry, i) => (
          <li key={i}>
            <BusinessValues data={entry} />
          </li>
        ))}
      </ul>
    ) : (
      <span>Không có</span>
    );
  if (typeof data === "object") {
    const entries = Object.entries(data).filter(
      ([key]) =>
        !/(^id$|Id$|Ids$|token|requestId|correlation|tenant|actorRoles)/i.test(
          key,
        ),
    );
    return entries.length ? (
      <dl className="sd-facts sd-facts--compact">
        {entries.map(([key, entry]) => (
          <div key={key}>
            <dt>
              {serviceLabels[key] ?? key.replace(/([a-z])([A-Z])/g, "$1 $2")}
            </dt>
            <dd>
              <BusinessValues data={entry} />
            </dd>
          </div>
        ))}
      </dl>
    ) : (
      <span>Thay đổi liên kết nội bộ; xem hồ sơ liên quan.</span>
    );
  }
  const text = String(data);
  if (/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(text))
    return <span>Tham chiếu nội bộ</span>;
  return <span>{serviceLabels[text] ?? text}</span>;
}
