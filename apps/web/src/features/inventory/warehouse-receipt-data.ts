import { parseCsvFile, parseXlsx } from "../equipment/spreadsheet";

export const receiptColumns = ["sku", "quantity", "name", "unit", "allowFractional", "description"];
export const receiptLimit = 100;
export const receiptFileLimit = 2 * 1024 * 1024;

export type ReceiptLine = {
  sku: string;
  quantity: string;
  name?: string;
  unit?: string;
  allowFractional?: boolean;
  description?: string;
};

export function receiptLine(values: Record<string, string>): ReceiptLine {
  const sku = values.sku?.trim();
  const quantity = values.quantity?.trim().replace(",", ".");
  const name = values.name?.trim();
  const unit = values.unit?.trim();
  const description = values.description?.trim();
  const fractional = values.allowFractional?.trim().toLowerCase();
  if (!sku || sku.length > 100) throw new Error("Mã phụ tùng phải có từ 1 đến 100 ký tự.");
  if (!quantity || !/^(0|[1-9][0-9]{0,9})(\.[0-9]{1,2})?$/.test(quantity) || Number(quantity) <= 0)
    throw new Error("Số lượng phải lớn hơn 0, tối đa 10 chữ số nguyên và 2 chữ số thập phân.");
  if (Boolean(name) !== Boolean(unit) || (name?.length ?? 0) > 200 || (unit?.length ?? 0) > 30)
    throw new Error("Nhập cả tên và đơn vị khi khai báo phụ tùng mới.");
  const yes = ["true", "1", "co", "có"];
  const no = ["false", "0", "khong", "không"];
  if (fractional && ![...yes, ...no].includes(fractional))
    throw new Error("Cột allowFractional dùng true hoặc false.");
  const allowFractional = fractional ? yes.includes(fractional) : undefined;
  if (allowFractional === false && !Number.isInteger(Number(quantity)))
    throw new Error("Phụ tùng đếm theo đơn vị nguyên không nhận số lượng lẻ.");
  if ((description?.length ?? 0) > 4000) throw new Error("Mô tả tối đa 4.000 ký tự.");
  return {
    sku, quantity,
    ...(name && unit ? { name, unit } : {}),
    ...(allowFractional === undefined ? {} : { allowFractional }),
    ...(description ? { description } : {}),
  };
}

export async function readWarehouseReceipt(file: File) {
  if (file.size > receiptFileLimit) throw new Error("Chọn tệp không quá 2 MB.");
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension !== "csv" && extension !== "xlsx") throw new Error("Chọn tệp CSV hoặc XLSX.");
  const rows = await (extension === "csv" ? parseCsvFile(file) : parseXlsx(file, 8 * 1024 * 1024));
  if (!rows.length) throw new Error("Tệp chưa có dòng phụ tùng.");
  if (rows.length > receiptLimit) throw new Error(`Một lô tối đa ${receiptLimit} dòng.`);
  const headers = Object.keys(rows[0]);
  if (!headers.includes("sku") || !headers.includes("quantity") ||
      headers.some((header) => !receiptColumns.includes(header)))
    throw new Error("Cột không khớp mẫu. Hai cột bắt buộc là sku và quantity.");

  const lines: ReceiptLine[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const [index, row] of rows.entries()) {
    try {
      const item = receiptLine(row);
      if (seen.has(item.sku)) throw new Error(`Mã ${item.sku} bị trùng trong lô.`);
      seen.add(item.sku);
      lines.push(item);
    } catch (error) {
      errors.push(`Mục ${index + 1}: ${error instanceof Error ? error.message : "Dữ liệu chưa hợp lệ."}`);
    }
  }
  return { lines, errors };
}
