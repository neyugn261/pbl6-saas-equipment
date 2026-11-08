import { useState, type FormEvent, type ReactNode } from "react";
import { machine } from "./design-data";
export function Card({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="ws-card studio-card">
      <header className="ws-card-header">
        <h2>{title}</h2>
      </header>
      <div className="studio-card-body">{children}</div>
    </section>
  );
}
export function MachineCard() {
  return (
    <div className="studio-machine">
      <span className="workshop-code">
        {machine.code} / SERIAL {machine.serial}
      </span>
      <strong>{machine.name}</strong>
      <span>
        {machine.customer} · {machine.site}
      </span>
    </div>
  );
}
export function Field({
  label,
  value,
  onChange,
  required = false,
  type = "text",
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  type?: string;
  hint?: string;
}) {
  return (
    <label className="ws-label">
      {label}
      {type === "textarea" ? (
        <textarea
          rows={3}
          required={required}
          maxLength={5000}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <input
          required={required}
          type={type}
          maxLength={500}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      <small>
        {hint ||
          (type === "date" && value
            ? `Ngày đang chọn: ${value.split("-").reverse().join("/")}`
            : "")}
      </small>
    </label>
  );
}
export function Choice({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly (readonly [string, string])[];
}) {
  return (
    <label className="ws-label">
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map(([key, text]) => (
          <option key={key} value={key}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}
export function Notice({ children }: { children: ReactNode }) {
  return (
    <div className="workshop-next" role="status">
      {children}
    </div>
  );
}
export function ReviewAction({
  label,
  children,
  onConfirm,
  disabled = false,
}: {
  label: string;
  children: ReactNode;
  onConfirm: () => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="ws-button"
        disabled={disabled}
        onClick={(event) => {
          if (
            event.currentTarget.form &&
            !event.currentTarget.form.reportValidity()
          )
            return;
          setOpen(true);
        }}
      >
        {label}
      </button>
      {open && (
        <div
          className="studio-confirm"
          role="region"
          aria-label="Đọc lại trước khi xác nhận"
        >
          <h3>Đọc lại trước khi xác nhận</h3>
          {children}
          <div className="ws-actions">
            <button type="button" onClick={() => setOpen(false)}>
              Quay lại chỉnh sửa
            </button>
            <button
              type="button"
              className="ws-button"
              disabled={disabled}
              onClick={(event) => {
                if (
                  disabled ||
                  (event.currentTarget.form &&
                    !event.currentTarget.form.reportValidity())
                )
                  return;
                onConfirm();
                setOpen(false);
              }}
            >
              Xác nhận trong bản thiết kế
            </button>
          </div>
        </div>
      )}
    </>
  );
}
export function Receipt({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="studio-receipt" role="status">
      <span className="ws-eyebrow">BIÊN NHẬN MINH HỌA</span>
      <h2>{title}</h2>
      {children}
      <p>Chỉ cập nhật phiên thiết kế này; chưa gửi hoặc ghi vào hồ sơ thật.</p>
      <button type="button" onClick={() => window.print()}>
        In bản đang xem
      </button>
    </section>
  );
}
export function Form({
  children,
  onSubmit,
}: {
  children: ReactNode;
  onSubmit: () => void;
}) {
  return (
    <form
      className="studio-form"
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      {children}
    </form>
  );
}
