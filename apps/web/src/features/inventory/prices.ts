export function priceText(value: string | null | undefined, currency = "VND") {
  return value == null
    ? "Chưa cấu hình"
    : `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(Number(value))} ${currency}`;
}
