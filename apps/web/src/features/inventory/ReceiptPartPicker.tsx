import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Search } from "lucide-react";
import type { Page } from "../../types/domain";
import { useWorkspaceData } from "../workspace/workspace-data";
import { RequiredMark } from "./InventoryDialog";

export type ReceiptPart = {
  id: string;
  sku: string;
  name: string;
  unit: string;
  allowFractional: boolean;
};

const pageSize = 12;

export function ReceiptPartPicker({ selected, onSelect, disabled }: {
  selected: ReceiptPart | null;
  onSelect: (part: ReceiptPart | null) => void;
  disabled: boolean;
}) {
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const [revision, setRevision] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const listId = useId();
  const expanded = open && !disabled;
  const searching = draft.trim() !== query;
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize), status: "ACTIVE" });
  if (query) params.set("q", query);
  const result = useWorkspaceData<Page<ReceiptPart>>(
    "inventory",
    expanded && !searching ? `/parts?${params}` : null,
    revision,
  );
  const rows = result.data?.items ?? [];
  const highlighted = rows[highlight];

  useEffect(() => {
    if (!searching) return;
    const timer = window.setTimeout(() => {
      setQuery(draft.trim());
      setPage(1);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [draft, searching]);

  function close() {
    setOpen(false);
    setHighlight(-1);
  }

  function choose(part: ReceiptPart) {
    onSelect(part);
    setDraft("");
    setQuery("");
    setPage(1);
    close();
  }

  function changePage(next: number) {
    setPage(next);
    setHighlight(-1);
    input.current?.focus();
  }

  function keyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Escape" && expanded) {
      event.preventDefault();
      event.stopPropagation();
      close();
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      if (rows.length) {
        const next = event.key === "ArrowDown" ? highlight + 1 : highlight < 0 ? rows.length - 1 : highlight - 1;
        const index = Math.max(0, Math.min(next, rows.length - 1));
        setHighlight(index);
        document.getElementById(`${listId}-${index}`)?.scrollIntoView({ block: "nearest" });
      }
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (expanded && highlighted) choose(highlighted);
      else setOpen(true);
    }
  }

  return (
    <div className="receipt-part-picker" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) close(); }}>
      <label className="ws-label" htmlFor={inputId}>
        <span>Phụ tùng <RequiredMark /></span>
      </label>
      <div className="receipt-part-combobox">
        <div className="ws-search receipt-part-search">
          <Search size={17} aria-hidden="true" />
          <input
            ref={input}
            id={inputId}
            type="search"
            role="combobox"
            aria-required="true"
            aria-autocomplete="list"
            aria-expanded={expanded}
            aria-controls={expanded ? listId : undefined}
            aria-activedescendant={expanded && highlighted ? `${listId}-${highlight}` : undefined}
            autoComplete="off"
            maxLength={100}
            placeholder="Tìm phụ tùng theo tên hoặc SKU…"
            disabled={disabled}
            value={draft}
            onFocus={() => setOpen(true)}
            onClick={() => setOpen(true)}
            onChange={(event) => {
              setDraft(event.target.value);
              setHighlight(-1);
              setOpen(true);
              if (selected) onSelect(null);
            }}
            onKeyDown={keyDown}
          />
        </div>
        {expanded && (
          <div className="receipt-part-results">
            <ul id={listId} role="listbox" aria-label="Kết quả tìm phụ tùng" aria-busy={searching || result.loading}>
              {rows.map((part, index) => (
                <li
                  key={part.id}
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={index === highlight}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => choose(part)}
                >
                  <strong>{part.name}</strong>
                  <small>{part.sku} · {part.unit}</small>
                </li>
              ))}
            </ul>
            {(searching || result.loading) && <p role="status">Đang tìm phụ tùng…</p>}
            {result.error && (
              <div className="receipt-part-page">
                <p role="alert">{result.error}</p>
                <button type="button" className="ws-button ws-button--secondary" onClick={() => {
                  setRevision(value => value + 1);
                  input.current?.focus();
                }}>Thử lại</button>
              </div>
            )}
            {!searching && result.data && !rows.length && <p role="status">Không tìm thấy phụ tùng phù hợp.</p>}
            {result.data && (page > 1 || result.data.total > pageSize) && (
              <div className="receipt-part-page">
                <small>Trang {page}/{Math.max(1, Math.ceil(result.data.total / pageSize))}</small>
                <div className="ws-actions">
                  <button type="button" className="ws-button ws-button--secondary" disabled={page === 1} onClick={() => changePage(page - 1)}>Trước</button>
                  <button type="button" className="ws-button ws-button--secondary" disabled={page * pageSize >= result.data.total} onClick={() => changePage(page + 1)}>Sau</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      {selected && (
        <div className="receipt-part-selection" role="group" aria-label="Phụ tùng đã chọn">
          <div>
            <strong>{selected.name}</strong>
            <small>{selected.sku} · {selected.unit}</small>
          </div>
          <button type="button" className="ws-button ws-button--secondary" disabled={disabled}
            onClick={() => { onSelect(null); setOpen(true); input.current?.focus(); }}>
            Đổi phụ tùng
          </button>
        </div>
      )}
    </div>
  );
}
