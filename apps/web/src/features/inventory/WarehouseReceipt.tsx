import { useId, useMemo, useRef, useState, type FormEvent } from "react";
import { FileUp, PackagePlus } from "lucide-react";
import { Link } from "react-router-dom";
import { getSessionGeneration, useSession } from "../../auth/session";
import { downloadBlob, makeXlsx } from "../equipment/spreadsheet";
import { InventoryDialog, RequiredMark } from "./InventoryDialog";
import { ReceiptPartPicker, type ReceiptPart } from "./ReceiptPartPicker";
import { StockMutation } from "./stock-mutation";
import { readWarehouseReceipt, receiptColumns, receiptLimit, receiptLine, type ReceiptLine } from "./warehouse-receipt-data";

export function WarehouseReceipt({ warehouse, onSaved }: {
  warehouse: { id: string; name: string; status: string };
  onSaved: () => void;
}) {
  const { profile } = useSession();
  const generation = getSessionGeneration();
  const scope = `${profile?.tenantId}:${profile?.id}`;
  const mutation = useMemo(() => new StockMutation(scope, generation, "receipts"), [scope, generation]);
  const path = `/warehouses/${warehouse.id}/receipts`;
  const dialog = useRef<HTMLDialogElement>(null);
  const lock = useRef(false);
  const referenceHintId = useId();
  const [method, setMethod] = useState<"manual" | "file">("manual");
  const [opened, setOpened] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState("");
  const [selected, setSelected] = useState<ReceiptPart | null>(null);
  const [newPart, setNewPart] = useState(false);
  const [file, setFile] = useState<{ name: string; lines: ReceiptLine[]; errors: string[] }>();
  const pending = mutation.pending;

  function open(next: "manual" | "file") {
    setMethod(next);
    setOpened(true);
    setSelected(null);
    setNewPart(false);
    setFile(undefined);
    setError("");
    setResult("");
    dialog.current?.showModal();
  }

  async function loadFile(source?: File) {
    setFile(undefined);
    setError("");
    if (!source) return;
    setReading(true);
    try {
      const parsed = await readWarehouseReceipt(source);
      setFile({ name: source.name, ...parsed });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không đọc được tệp.");
    } finally {
      setReading(false);
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string>;
    const documentReference = values.documentReference?.trim() ?? "";
    const note = values.note?.trim() ?? "";
    setError("");
    try {
      if (method === "manual" && !newPart && !selected)
        throw new Error("Chọn phụ tùng từ kết quả tìm kiếm.");
      if (!documentReference && !note) throw new Error("Nhập mã chứng từ hoặc ghi chú.");
      const lines = method === "manual"
        ? [receiptLine(selected ? { ...values, sku: selected.sku } : values)]
        : file?.lines;
      if (!lines?.length || (method === "file" && file?.errors.length))
        throw new Error("Kiểm tra và sửa dữ liệu trong tệp trước khi nhập.");
      if (selected && method === "manual" && !selected.allowFractional && !Number.isInteger(Number(lines[0].quantity)))
        throw new Error("Phụ tùng này yêu cầu số lượng nguyên.");
      const body = { lines, ...(documentReference ? { documentReference } : {}), ...(note ? { note } : {}) };
      if (new TextEncoder().encode(JSON.stringify(body)).byteLength > 100 * 1024)
        throw new Error("Dữ liệu nhập vượt giới hạn 100 KB của API. Chia file thành các lô nhỏ hơn.");
      await execute(body);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể nhập kho.");
    }
  }

  async function execute(body?: { lines: ReceiptLine[]; documentReference?: string; note?: string }) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const count = body?.lines.length ?? (Array.isArray(pending?.body.lines) ? pending.body.lines.length : 0);
      await mutation.execute(body ? { mode: "RECEIVE_BATCH", path, label: warehouse.name, body } : undefined);
      setResult(`Đã nhập ${count} dòng phụ tùng vào ${warehouse.name}.`);
      onSaved();
      dialog.current?.close();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể nhập kho.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  const pendingWarehouse = pending?.path.split("/")[2];
  return (
    <div className="warehouse-receipt-actions">
      <div className="ws-actions">
        <button type="button" className="ws-button ws-button--secondary" aria-haspopup="dialog" disabled={warehouse.status !== "ACTIVE" || Boolean(pending) || !!mutation.storageError} onClick={() => open("file")}>
          <FileUp size={16} aria-hidden="true" /> Nhập từ file
        </button>
        <button type="button" className="ws-button" aria-haspopup="dialog" disabled={warehouse.status !== "ACTIVE" || Boolean(pending) || !!mutation.storageError} onClick={() => open("manual")}>
          <PackagePlus size={16} aria-hidden="true" /> Nhập tay
        </button>
      </div>
      {result && <p role="status" className="inventory-feedback">{result}</p>}
      {mutation.storageError && <p role="alert" className="m1-error">{mutation.storageError}</p>}
      {pending && (
        <div className="warehouse-receipt-recovery">
          <p role="status">Đang chờ xác nhận lần nhập vào {pending.label ?? "kho"}.</p>
          {pending.path === path ? (
            <button type="button" className="ws-button ws-button--secondary" disabled={busy} onClick={() => void execute()}>
              Xác nhận lại giao dịch
            </button>
          ) : (
            <Link className="ws-text-link" to={`/app/inventory/warehouses/${pendingWarehouse}`}>Mở kho cần xác nhận</Link>
          )}
          {error && <p className="m1-error" role="alert">{error}</p>}
        </div>
      )}
      <InventoryDialog
        dialogRef={dialog}
        title={method === "file" ? "Nhập phụ tùng từ file" : "Nhập phụ tùng bằng tay"}
        context={warehouse.name}
        wide={method === "file"}
        busy={busy || reading}
        onClose={() => {
          if (dialog.current?.open) return;
          setOpened(false);
          setError("");
        }}
      >
        {opened && <form className="inventory-dialog-form" onSubmit={(event) => void save(event)}>
          <div className="inventory-dialog-body">
            <fieldset className="inventory-dialog-content" disabled={busy || Boolean(pending)}>
              {method === "manual" ? (
                <>
                  {!newPart && <ReceiptPartPicker selected={selected} onSelect={setSelected} disabled={busy || Boolean(pending)} />}
                  <label className="warehouse-receipt-check">
                    <input type="checkbox" checked={newPart} onChange={(event) => {
                      setNewPart(event.target.checked);
                      setSelected(null);
                    }} />
                    Khai báo phụ tùng mới
                  </label>
                  <div className="ws-form-grid">
                    {newPart && (
                      <label className="ws-label">
                        <span>Mã phụ tùng (SKU) <RequiredMark /></span>
                        <input name="sku" required maxLength={100} placeholder="VD PT-001" />
                      </label>
                    )}
                    <label className="ws-label">
                      <span>Số lượng nhập <RequiredMark /></span>
                      <input name="quantity" required inputMode="decimal" placeholder="VD 12 hoặc 2,5" />
                    </label>
                  </div>
                  {newPart && (
                    <>
                      <div className="ws-form-grid">
                        <label className="ws-label">
                          <span>Tên phụ tùng <RequiredMark /></span>
                          <input name="name" required maxLength={200} placeholder="VD Vòng bi 6204" />
                        </label>
                        <label className="ws-label">
                          <span>Đơn vị tính <RequiredMark /></span>
                          <input name="unit" required maxLength={30} placeholder="VD cái, bộ, m" />
                        </label>
                      </div>
                      <label className="warehouse-receipt-check">
                        <input type="checkbox" name="allowFractional" value="true" /> Cho phép số lượng lẻ
                      </label>
                      <label className="ws-label">Mô tả <textarea name="description" maxLength={4000} rows={2} placeholder="VD Vòng bi dùng cho động cơ bơm" /></label>
                    </>
                  )}
                </>
              ) : (
                <>
                  <div className="warehouse-receipt-file">
                    <label className="ws-label">
                      <span>File nhập kho <RequiredMark /></span>
                      <input type="file" required accept=".csv,.xlsx" disabled={reading} onChange={(event) => void loadFile(event.target.files?.[0])} />
                    </label>
                    <button type="button" className="ws-button ws-button--secondary" onClick={() => {
                      const bytes = makeXlsx(receiptColumns, [], "Phụ tùng");
                      downloadBlob(new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), "mau-nhap-phu-tung.xlsx");
                    }}>Tải mẫu XLSX</button>
                  </div>
                  <p className="inventory-muted">CSV hoặc XLSX, tối đa {receiptLimit} dòng và 2 MB. Mỗi SKU một dòng. Điền tên và đơn vị cho mã mới. Trong Excel, đặt cột SKU ở dạng văn bản để giữ số 0 đầu.</p>
                  {reading && <p role="status">Đang đọc tệp…</p>}
                  {file && (
                    <div className="warehouse-receipt-preview">
                      <p><strong>{file.name}</strong> · {file.lines.length} dòng đọc được</p>
                      {file.errors.length > 0 && (
                        <ul className="m1-error" role="alert">{file.errors.map((message) => <li key={message}>{message}</li>)}</ul>
                      )}
                      {file.lines.length > 0 && (
                        <div className="m2-inventory-table">
                          <table>
                            <thead><tr><th>SKU</th><th>Tên phụ tùng</th><th>Số lượng</th></tr></thead>
                            <tbody>
                              {file.lines.map((line) => <tr key={line.sku}><td>{line.sku}</td><td>{line.name || "Theo danh mục"}</td><td>{line.quantity} {line.unit}</td></tr>)}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
              <fieldset className="warehouse-receipt-reference" aria-describedby={referenceHintId}>
                <legend>Chứng từ nhập kho <RequiredMark /></legend>
                <label className="ws-label">Mã chứng từ <input name="documentReference" maxLength={150} placeholder="VD NK-2026-001" /></label>
                <label className="ws-label">Ghi chú <textarea name="note" rows={2} maxLength={2000} placeholder="VD Nhập bổ sung từ nhà cung cấp" /></label>
                <p id={referenceHintId} className="inventory-muted">Điền ít nhất một trong hai trường.</p>
              </fieldset>
            </fieldset>
          </div>
          <div className="inventory-dialog-bottom">
            {error && <p role="alert" className="m1-error">{error}</p>}
            <footer className="ws-actions inventory-dialog-footer">
              <button type="button" className="ws-button ws-button--secondary" disabled={busy || reading} onClick={() => dialog.current?.close()}>Hủy</button>
              {pending?.path === path ? (
                <button type="button" className="ws-button" disabled={busy} onClick={() => void execute()}>Xác nhận lại giao dịch</button>
              ) : (
                  <button type="submit" className="ws-button" disabled={busy || reading || !!pending || (method === "manual" && !newPart && !selected) || (method === "file" && (!file?.lines.length || file.errors.length > 0))}>
                  {busy ? "Đang nhập…" : "Xác nhận nhập kho"}
                </button>
              )}
            </footer>
          </div>
        </form>}
      </InventoryDialog>
    </div>
  );
}
