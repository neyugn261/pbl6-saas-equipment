import { useState } from "react";
import { api, ApiError } from "../../api/client";
import { downloadBlob, makeCsv, makeXlsx, parseCsvFile, parseXlsx, type SheetRow } from "./spreadsheet";
import "./equipment-batch.css";

type UpdateRow = {
  equipmentId: string;
  updatedAt: string;
  purchaseDate?: string | null;
  handoverDate?: string | null;
  installationDate?: string | null;
  customerSiteId?: string;
  locationId?: string | null;
};
type Preview = { valid: boolean; count: number; rows: { row: number; valid: boolean; assetCode?: string; message?: string }[] };
type Result = { id: string; status: string; count: number; rows: { row: number; valid: boolean; assetCode?: string; message?: string }[] };
const editable = new Set(["purchaseDate", "handoverDate", "installationDate", "customerSiteId", "locationId"]);
const knownReadOnly = new Set(["assetCode", "serialNumber", "displayName", "model", "customer", "customerCode", "site", "siteCode", "siteAddress", "location", "locationCode", "status", "operationalStatus", "warranty", "warrantyEndDate", "exportedAt", "appliedFilters"]);

function toUpdateRows(input: SheetRow[]): UpdateRow[] {
  if (input.length === 0 || input.length > 2000) throw new Error("Tệp cần có từ 1 đến 2.000 dòng thiết bị.");
  const headers = new Set(Object.keys(input[0]));
  if (!headers.has("equipmentId") || !headers.has("updatedAt")) throw new Error("Tệp phải có cột equipmentId và updatedAt từ file xuất danh sách thiết bị.");
  for (const header of headers) if (!editable.has(header) && !knownReadOnly.has(header) && !["equipmentId", "updatedAt"].includes(header)) throw new Error(`Cột không được hỗ trợ: ${header}`);
  return input.map((row, index) => {
    const equipmentId = row.equipmentId?.trim(), updatedAt = row.updatedAt?.trim();
    if (!equipmentId || !updatedAt) throw new Error(`Dòng ${index + 2} thiếu equipmentId hoặc updatedAt.`);
    const patch: UpdateRow = { equipmentId, updatedAt };
    for (const field of editable) {
      const value = row[field]?.trim();
      if (value === undefined || value === "") continue;
      if (value === "__CLEAR__") Object.assign(patch, { [field]: null });
      else Object.assign(patch, { [field]: value });
    }
    if (!Object.keys(patch).some(key => editable.has(key))) throw new Error(`Dòng ${index + 2} không có trường cần cập nhật.`);
    return patch;
  });
}

export default function EquipmentBatchUpdatePanel({ onClose, onUpdated, onComplete }: { onClose: () => void; onUpdated: () => void; onComplete: () => void }) {
  const [rows, setRows] = useState<UpdateRow[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [filename, setFilename] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [key, setKey] = useState("");

  async function read(file?: File) {
    if (!file) return;
    setBusy(true); setError(""); setPreview(null); setResult(null); setKey("");
    try {
      if (file.size > 5_000_000) throw new Error("Tệp tối đa 5 MB.");
      const parsed = file.name.toLowerCase().endsWith(".xlsx") ? await parseXlsx(file) : file.name.toLowerCase().endsWith(".csv") ? await parseCsvFile(file) : (() => { throw new Error("Chỉ nhận tệp .xlsx hoặc .csv."); })();
      setRows(toUpdateRows(parsed)); setFilename(file.name);
    } catch (cause) { setRows([]); setError(cause instanceof Error ? cause.message : "Không đọc được tệp."); }
    finally { setBusy(false); }
  }
  async function check() {
    setBusy(true); setError(""); setPreview(null);
    try { setPreview(await api.asset<Preview>("/bulk-handovers/update/preview", { method: "POST", body: { rows } })); }
    catch (cause) { setError(cause instanceof ApiError ? `${cause.status} · ${cause.message}` : cause instanceof Error ? cause.message : "Không kiểm tra được tệp."); }
    finally { setBusy(false); }
  }
  async function apply() {
    if (!preview?.valid || busy) return;
    const idempotencyKey = key || crypto.randomUUID();
    setKey(idempotencyKey); setBusy(true); setError("");
    try {
      const saved = await api.asset<Result>("/bulk-handovers/update", { method: "POST", headers: { "Idempotency-Key": idempotencyKey }, body: { rows } });
      setResult(saved);
      if (saved.rows.some(row => row.valid)) onUpdated();
      if (saved.status === "COMPLETED") onComplete();
    } catch (cause) { setError(cause instanceof ApiError ? `${cause.status} · ${cause.message}` : cause instanceof Error ? cause.message : "Không cập nhật được lô."); }
    finally { setBusy(false); }
  }
  function downloadTemplate(format: "csv" | "xlsx") {
    const headers = ["equipmentId", "updatedAt", "assetCode", "serialNumber", "customerSiteId", "purchaseDate", "handoverDate", "installationDate", "locationId"];
    const data = rows.map(row => ({ ...Object.fromEntries(Object.entries(row).map(([key, value]) => [key, value == null ? "" : String(value)])), assetCode: "", serialNumber: "" }));
    const filenameBase = "mau-cap-nhat-thiet-bi";
    if (format === "xlsx") downloadBlob(new Blob([makeXlsx(headers, data)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${filenameBase}.xlsx`);
    else downloadBlob(new Blob([makeCsv(headers, data)], { type: "text/csv;charset=utf-8" }), `${filenameBase}.csv`);
  }
  return <section className="equipment-batch-panel" aria-label="Nhập cập nhật thiết bị theo lô">
    <div className="equipment-batch-panel__heading"><div><h3>Cập nhật thiết bị từ XLSX / CSV</h3><p>Giữ nguyên mã và serial. Dòng trống giữ nguyên dữ liệu; điền <code>__CLEAR__</code> ở ngày hoặc locationId để xóa giá trị. customerSiteId và locationId nhận ID từ cơ sở/vị trí đã được xác thực. Ngày mua không thay đổi mốc bảo hành.</p></div><button type="button" onClick={onClose}>Đóng</button></div>
    <label className="equipment-batch-panel__file">Chọn file cập nhật (.xlsx / .csv)<input type="file" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={busy} onChange={event => void read(event.target.files?.[0])}/></label>
    {filename && <p>{filename} · {rows.length.toLocaleString("vi-VN")} thiết bị</p>}
    {error && <p className="m1-error" role="alert">{error}</p>}
    <div className="equipment-batch-panel__actions"><button type="button" className="ws-button ws-button--secondary" disabled={busy || !rows.length} onClick={() => downloadTemplate("xlsx")}>Tải mẫu XLSX</button><button type="button" className="ws-button ws-button--secondary" disabled={busy || !rows.length} onClick={() => downloadTemplate("csv")}>Tải mẫu CSV</button><button type="button" className="m1-button" disabled={busy || !rows.length} onClick={() => void check()}>{busy ? "Đang xử lý…" : "Kiểm tra dữ liệu"}</button><button type="button" className="m1-button" disabled={busy || !preview?.valid || !!result} onClick={() => void apply()}>Cập nhật lô</button></div>
    {preview && <div className="equipment-batch-panel__result" role="status"><strong>{preview.valid ? `${preview.count} dòng hợp lệ` : "Cần sửa dòng lỗi trước khi cập nhật"}</strong>{preview.rows.filter(row => !row.valid).map(row => <p key={row.row}>Dòng {row.row}: {row.message}</p>)}</div>}
    {result && <div className="equipment-batch-panel__result" role="status"><strong>Kết quả: {result.status} · {result.count} dòng</strong>{result.rows.filter(row => !row.valid).map(row => <p key={row.row}>Dòng {row.row}: {row.message}</p>)}</div>}
  </section>;
}
