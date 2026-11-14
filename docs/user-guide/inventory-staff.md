# Inventory Staff guide

Inventory Staff can manage the parts catalog and stock transactions. Tenant
Admins can read inventory but do not receive write controls from this UI.
Inventory is not a purchasing, procurement, or accounting system.

## Parts and warehouses

1. Open **Phụ tùng** (`/app/inventory/parts`) and add a part with a unique SKU,
   name, unit, and fractional-quantity setting.
2. Open **Kho & tồn kho** (`/app/inventory/warehouses`) and create a warehouse
   under an active branch.
3. Inspect stock and minimum thresholds from the warehouse list or part detail.
   Quantities are decimal strings; preserve the displayed precision and do not
   round through a spreadsheet float conversion.

## Phiếu phụ tùng trên Web

- Vào **Kho phụ tùng → Phiếu phụ tùng**, chọn **Xin cấp phụ tùng** hoặc **Đề nghị trả kho**. Có thể lọc theo trạng thái và lệnh công việc. Service Manager cũng có thể mở phiếu theo lệnh từ hồ sơ công việc và lập phiếu xin cấp khi lệnh đủ điều kiện.
- Khi cấp, chọn dòng phụ tùng, kho thuộc chi nhánh, số lượng giao và mã biên nhận đã ký. Người nhận lấy từ kỹ thuật viên hiện tại đã nhận lệnh. Nếu cấp thiếu, phiếu tiếp tục hiển thị lượng có thể cấp. Từ chối hoặc đóng phần còn lại cần lý do.
- Khi nhận trả, kiểm tra kho xuất gốc rồi ghi số lượng thực nhận và tình trạng. Hàng hỏng hoặc cần kiểm tra vào tồn cách ly. Đóng phần chưa nhận giữ phần còn phải đối soát trên lệnh.
- Nếu chưa rõ kết quả sau khi gửi, dùng **Thử lại thao tác đã lưu**. Nếu phiếu báo cần đối soát, mở **Giao dịch & đối soát** của lệnh. Mở **Lịch sử phiếu** để xem các lần cấp, nhận hoặc quyết định đóng.

## Receive, issue, return, and adjust

- **Receive:** choose an active warehouse and part, enter a positive quantity,
  and provide either a document reference or an explanatory note.
- **Issue to Work Order:** choose a real non-terminal Work Order and issue
  quantity. The server verifies tenant ownership, work-order scope, stock, and
  the reservation protocol. If the result is uncertain, use the same operation
  key's retry/abort recovery actions; never submit a second issue to compensate
  for a timeout.
- **Return:** load the selected Work Order's issued parts, enter the returned
  quantity and condition, then submit. Return only parts actually outstanding.
- **Adjust:** enter a positive quantity, direction, reason, and required note.
  A `CORRECTION` must reference the original transaction and is validated by the
  backend; use the transaction ID from the ledger.
- **Stock conflict (409):** another operation may have changed available stock.
  Reload the stock/ledger before making a new decision. Do not assume the
  rejected operation changed inventory.

The **Lịch sử thẻ kho** section is the immutable transaction ledger. Use its
filters and pages to trace receive, issue, return, and adjustment entries.
When the backend returns 401/403/404/422/503, follow the message and correct
the session, permission, selected reference, or service availability rather
than recording a local/manual success.
