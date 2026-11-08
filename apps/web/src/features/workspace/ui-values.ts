/** Display exact decimal strings without converting through a floating point number. */
export function quantityText(input: unknown) {
  const text = String(input ?? "");
  if (!/^-?\d+(\.\d+)?$/.test(text)) return "Chưa có số liệu";
  const [whole, fraction] = text.split(".");
  const decimal = fraction?.replace(/0+$/, "");
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}${decimal ? `,${decimal}` : ""}`;
}
export function quantityInput(input: string, fractional = true) {
  const text = input.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(text) || !/[1-9]/.test(text)) return null;
  if (!fractional && /\.[0-9]*[1-9]/.test(text)) return null;
  return text;
}
export function vietnamInstant(input: string) {
  return new Date(`${input}+07:00`).toISOString();
}
export const stockLabels: Record<string, string> = {
  RECEIVE: "Nhập kho",
  ISSUE: "Xuất cho công việc",
  RETURN: "Nhận trả",
  ADJUST_IN: "Điều chỉnh tăng",
  ADJUST_OUT: "Điều chỉnh giảm",
  RELEASE: "Chuyển về tồn khả dụng",
  SCRAP: "Loại bỏ",
  COUNT_VARIANCE: "Chênh lệch kiểm kê",
  DAMAGE: "Hư hỏng",
  LOSS: "Thất thoát",
  CORRECTION: "Sửa giao dịch trước",
  OTHER: "Lý do khác",
  PENDING: "Chờ xác định kết quả",
  COMMITTED: "Đã ghi tồn",
  ABORTED: "Đã hủy trước khi ghi tồn",
  FAILED: "Cần kiểm tra",
  SETTLED: "Đã đối soát",
  HELD: "Đang chờ phối hợp",
  RELEASED: "Đã giải quyết",
};
/** Editable Vietnamese decimal without thousands separators. */
export const quantityEntry = (input: unknown) =>
  quantityText(input).replaceAll(".", "");
