import { useEffect, useState, type ReactNode } from "react";
import { Search } from "lucide-react";
import "./management.css";

export default function TableToolbar({
  query,
  onQuery,
  placeholder = "Tìm theo tên hoặc mã…",
  children,
  onReset,
}: {
  query: string;
  onQuery: (value: string) => void;
  placeholder?: string;
  children?: ReactNode;
  onReset?: () => void;
}) {
  const [editing, setEditing] = useState({ base: query, value: query });
  const draft =
    editing.base === query || editing.value.trim() === query
      ? editing.value
      : query;
  useEffect(() => {
    if (draft.trim() === query) return;
    const timer = window.setTimeout(() => onQuery(draft.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [draft, query, onQuery]);
  return (
    <form
      className="ws-toolbar management-toolbar"
      role="search"
      aria-label="Tìm kiếm và lọc danh sách"
      onSubmit={(event) => {
        event.preventDefault();
        onQuery(draft.trim());
      }}
    >
      <label className="management-toolbar__search">
        Tìm kiếm
        <span className="ws-search">
          <Search size={17} aria-hidden="true" />
          <input
            type="search"
            maxLength={100}
            aria-label="Tìm kiếm danh sách"
            placeholder={placeholder}
            value={draft}
            onChange={(event) =>
              setEditing({ base: query, value: event.target.value })
            }
          />
        </span>
      </label>
      {children}
      <div className="management-toolbar__actions">
        <button type="submit" className="ws-button">Tìm</button>
        {onReset && (
          <button
            type="button"
            className="ws-button ws-button--secondary"
            onClick={() => {
              setEditing({ base: query, value: "" });
              onReset();
            }}
          >
            Xóa bộ lọc
          </button>
        )}
      </div>
    </form>
  );
}
