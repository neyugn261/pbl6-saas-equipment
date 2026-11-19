export type SheetRow = Record<string, string>;

export async function parseCsvFile(file: File): Promise<SheetRow[]> {
  const source = (await file.text()).replace(/^\uFEFF/, "");
  const records: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') { cell += '"'; i++; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"' && cell === "") quoted = true;
    else if (char === "," || char === "\r" || char === "\n") {
      row.push(cell.trim()); cell = "";
      if (char !== ",") { if (row.some(Boolean)) records.push(row); row = []; if (char === "\r" && source[i + 1] === "\n") i++; }
    } else cell += char;
  }
  if (quoted) throw new Error("Tệp CSV có dấu ngoặc kép chưa đóng.");
  row.push(cell.trim()); if (row.some(Boolean)) records.push(row);
  const headers = (records.shift() ?? []).map(value => value.trim());
  if (!headers.length || new Set(headers).size !== headers.length) throw new Error("Dòng tiêu đề CSV trống hoặc có cột trùng.");
  return records.map((values, index) => {
    if (values.length > headers.length) throw new Error(`Dòng ${index + 2} có nhiều ô hơn tiêu đề.`);
    return Object.fromEntries(headers.map((header, i) => {
      const value = values[i] ?? "";
      return [header, /^'[\s]*[=+@-]/.test(value) ? value.slice(1) : value];
    }));
  });
}

export function protectCsvCell(value: unknown) {
  const text = value == null ? "" : String(value);
  return /^[\s]*[=+@\-]/.test(text) ? `'${text}` : text;
}

export function makeCsv(headers: string[], rows: SheetRow[]) {
  const quote = (value: unknown) => `"${protectCsvCell(value).replaceAll('"', '""')}"`;
  return `\uFEFF${[headers, ...rows.map(row => headers.map(key => row[key] ?? ""))]
    .map(line => line.map(quote).join(",")).join("\r\n")}`;
}

const encoder = new TextEncoder();
function crc32(bytes: Uint8Array) {
  let crc = -1;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ -1) >>> 0;
}
function concat(parts: Uint8Array[]) {
  const out = new Uint8Array(parts.reduce((n, part) => n + part.length, 0));
  let offset = 0;
  for (const part of parts) { out.set(part, offset); offset += part.length; }
  return out;
}
function u16(view: DataView, offset: number, value: number) { view.setUint16(offset, value, true); }
function u32(view: DataView, offset: number, value: number) { view.setUint32(offset, value, true); }

function zipStore(files: Record<string, string>) {
  const local: Uint8Array[] = [], central: Uint8Array[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const nameBytes = encoder.encode(name), body = encoder.encode(content), crc = crc32(body);
    const header = new Uint8Array(30 + nameBytes.length), view = new DataView(header.buffer);
    u32(view, 0, 0x04034b50); u16(view, 4, 20); u16(view, 6, 0); u16(view, 8, 0);
    u32(view, 14, crc); u32(view, 18, body.length); u32(view, 22, body.length);
    u16(view, 26, nameBytes.length); u16(view, 28, 0); header.set(nameBytes, 30);
    local.push(header, body);
    const entry = new Uint8Array(46 + nameBytes.length), cv = new DataView(entry.buffer);
    u32(cv, 0, 0x02014b50); u16(cv, 4, 20); u16(cv, 6, 20); u16(cv, 8, 0); u16(cv, 10, 0);
    u32(cv, 16, crc); u32(cv, 20, body.length); u32(cv, 24, body.length);
    u16(cv, 28, nameBytes.length); u16(cv, 30, 0); u16(cv, 32, 0); u16(cv, 34, 0); u16(cv, 36, 0);
    u32(cv, 38, 0); u32(cv, 42, offset); entry.set(nameBytes, 46); central.push(entry);
    offset += header.length + body.length;
  }
  const directory = concat(central), locals = concat(local), end = new Uint8Array(22), view = new DataView(end.buffer);
  u32(view, 0, 0x06054b50); u16(view, 8, central.length); u16(view, 10, central.length);
  u32(view, 12, directory.length); u32(view, 16, locals.length); u16(view, 20, 0);
  return concat([locals, directory, end]);
}

const xml = (text: string) => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
const columnName = (index: number) => {
  let value = "", n = index + 1;
  while (n) { const r = (n - 1) % 26; value = String.fromCharCode(65 + r) + value; n = Math.floor((n - 1) / 26); }
  return value;
};

export function makeXlsx(headers: string[], rows: SheetRow[]) {
  const table = [headers, ...rows.map(row => headers.map(key => row[key] ?? ""))];
  const sheetRows = table.map((row, ri) => `<row r="${ri + 1}">${row.map((value, ci) => {
    const ref = `${columnName(ci)}${ri + 1}`;
    return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xml(String(value ?? ""))}</t></is></c>`;
  }).join("")}</row>`).join("");
  const files = {
    "[Content_Types].xml": '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
    "_rels/.rels": '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    "xl/workbook.xml": '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Equipment" sheetId="1" r:id="rId1"/></sheets></workbook>',
    "xl/_rels/workbook.xml.rels": '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    "xl/worksheets/sheet1.xml": `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows}</sheetData></worksheet>`,
  };
  return zipStore(files);
}

async function findEntry(bytes: Uint8Array, filename: string) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { end = i; break; }
  }
  if (end < 0) throw new Error("Tệp XLSX không có chỉ mục ZIP hợp lệ.");
  const count = view.getUint16(end + 10, true), directory = view.getUint32(end + 16, true), decoder = new TextDecoder();
  let cursor = directory;
  for (let i = 0; i < count; i++) {
    if (view.getUint32(cursor, true) !== 0x02014b50) throw new Error("Chỉ mục XLSX bị lỗi.");
    const method = view.getUint16(cursor + 10, true), compressed = view.getUint32(cursor + 20, true);
    const nameLength = view.getUint16(cursor + 28, true), extra = view.getUint16(cursor + 30, true), comment = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true), name = decoder.decode(bytes.slice(cursor + 46, cursor + 46 + nameLength));
    if (name === filename) {
      if (view.getUint32(localOffset, true) !== 0x04034b50) throw new Error("Dữ liệu XLSX bị lỗi.");
      const localName = view.getUint16(localOffset + 26, true), localExtra = view.getUint16(localOffset + 28, true);
      const start = localOffset + 30 + localName + localExtra, part = bytes.slice(start, start + compressed);
      if (method === 0) return part;
      if (method !== 8 || typeof DecompressionStream === "undefined") throw new Error("Trình duyệt không hỗ trợ giải nén XLSX này.");
      return new Uint8Array(await new Response(new Blob([part]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer());
    }
    cursor += 46 + nameLength + extra + comment;
  }
  throw new Error(`Không tìm thấy ${filename} trong XLSX.`);
}

function excelDate(value: string) {
  if (!/^\d+(?:\.\d+)?$/.test(value)) return value;
  const date = new Date(Date.UTC(1899, 11, 30) + Number(value) * 86400000);
  return date.toISOString().slice(0, 10);
}

export async function parseXlsx(file: File): Promise<SheetRow[]> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const sharedBytes = await findEntry(bytes, "xl/sharedStrings.xml").catch(() => null);
  const sheetBytes = await findEntry(bytes, "xl/worksheets/sheet1.xml");
  const parser = new DOMParser();
  const sharedDoc = sharedBytes ? parser.parseFromString(new TextDecoder().decode(sharedBytes), "application/xml") : null;
  const shared = sharedDoc ? [...sharedDoc.getElementsByTagName("si")].map(si => [...si.getElementsByTagName("t")].map(t => t.textContent ?? "").join("")) : [];
  const doc = parser.parseFromString(new TextDecoder().decode(sheetBytes), "application/xml");
  if (doc.querySelector("parsererror")) throw new Error("Không đọc được nội dung trang tính XLSX.");
  const matrix = [...doc.getElementsByTagName("row")].map(row => {
    const cells = new Map<number, string>();
    for (const cell of [...row.getElementsByTagName("c")]) {
      const ref = cell.getAttribute("r") ?? "A1", col = ref.match(/^[A-Z]+/)?.[0] ?? "A";
      const index = [...col].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;
      const type = cell.getAttribute("t"), value = cell.getElementsByTagName("v")[0]?.textContent ?? "";
      const text = type === "s" ? shared[Number(value)] ?? "" : type === "inlineStr" ? [...cell.getElementsByTagName("t")].map(t => t.textContent ?? "").join("") : value;
      cells.set(index, text.trim());
    }
    return Array.from({ length: Math.max(-1, ...cells.keys()) + 1 }, (_, i) => cells.get(i) ?? "");
  }).filter(row => row.some(Boolean));
  const headers = (matrix.shift() ?? []).map(value => value.trim());
  if (!headers.length || new Set(headers).size !== headers.length) throw new Error("Dòng tiêu đề XLSX trống hoặc có cột trùng.");
  const dateFields = new Set(["purchaseDate", "handoverDate", "installationDate"]);
  return matrix.map((values, index) => {
    if (values.length > headers.length) throw new Error(`Dòng ${index + 2} có nhiều ô hơn tiêu đề.`);
    return Object.fromEntries(headers.map((header, i) => [header, dateFields.has(header) ? excelDate(values[i] ?? "") : values[i] ?? ""]));
  });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob), anchor = document.createElement("a");
  anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url);
}
