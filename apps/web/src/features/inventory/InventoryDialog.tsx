import { useId, type ReactNode, type RefObject } from "react";
import { X } from "lucide-react";

export function RequiredMark() {
  return <span aria-hidden="true" className="inventory-required-mark">*</span>;
}

export function InventoryDialog({
  dialogRef,
  title,
  context,
  wide,
  busy,
  onClose,
  children,
}: {
  dialogRef: RefObject<HTMLDialogElement | null>;
  title: string;
  context?: string;
  wide?: boolean;
  busy: boolean;
  onClose?: () => void;
  children: ReactNode;
}) {
  const titleId = useId();

  return (
    <dialog
      ref={dialogRef}
      className={wide ? "inventory-dialog inventory-dialog--wide" : "inventory-dialog"}
      aria-labelledby={titleId}
      onCancel={(event) => { if (busy) event.preventDefault(); }}
      onClose={onClose}
    >
      <header className="inventory-section-heading inventory-dialog-heading">
        <div>
          <h2 id={titleId}>{title}</h2>
          {context && <p>{context}</p>}
        </div>
        <button
          type="button"
          className="inventory-dialog-close"
          aria-label="Đóng popup"
          disabled={busy}
          onClick={() => dialogRef.current?.close()}
        >
          <X size={19} aria-hidden="true" />
        </button>
      </header>
      {children}
    </dialog>
  );
}
