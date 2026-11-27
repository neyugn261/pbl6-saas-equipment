# Inventory Staff guide

Inventory Staff can manage the parts catalog and stock transactions. Tenant
Admins can read inventory but do not receive write controls from this UI.
Inventory is not a purchasing, procurement, or accounting system.

## Parts and warehouses

1. Open **Kho & tồn kho** (`/app/inventory/warehouses`) and choose a warehouse.
   Inventory Staff can add a warehouse under an active branch.
2. Search for a SKU or part name in the warehouse. Open the part to see its
   available, quarantined and minimum quantities.
3. Select **Nhập tay**. Search by name or SKU and select an existing part from
   the results. Use **Khai báo phụ tùng mới** to enter the SKU, name and unit
   for a part being received for the first time.
4. Select **Nhập từ file** and download the XLSX template. CSV and XLSX files
   support up to 100 rows and 2 MB, with up to 100 KB of parsed receipt data.
   Fill `sku` and `quantity` for each line. Format SKU as text in Excel to keep leading zeros.
   New SKUs also require `name` and `unit`. Optional columns are
   `allowFractional` and `description`. List each SKU once.
5. Review the preview, enter a document reference or note, then confirm. A
   rejected line rolls back the whole receipt. If the result is uncertain,
   choose **Xác nhận lại giao dịch** to replay the same receipt.

## Phiếu phụ tùng trên Web

- Vào **Kho phụ tùng → Phiếu phụ tùng**, chọn **Xin cấp phụ tùng** hoặc **Đề nghị trả kho**. Có thể lọc theo trạng thái và lệnh công việc. Service Manager cũng có thể mở phiếu theo lệnh từ hồ sơ công việc và lập phiếu xin cấp khi lệnh đủ điều kiện.
- Khi cấp, chọn dòng phụ tùng, kho thuộc chi nhánh, số lượng giao và mã biên nhận đã ký. Người nhận lấy từ kỹ thuật viên hiện tại đã nhận lệnh. Nếu cấp thiếu, phiếu tiếp tục hiển thị lượng có thể cấp. Từ chối hoặc đóng phần còn lại cần lý do.
- Khi nhận trả, kiểm tra kho xuất gốc rồi ghi số lượng thực nhận và tình trạng. Hàng hỏng hoặc cần kiểm tra vào tồn cách ly. Đóng phần chưa nhận giữ phần còn phải đối soát trên lệnh.
- Nếu chưa rõ kết quả sau khi gửi, dùng **Thử lại thao tác đã lưu**. Nếu phiếu báo cần đối soát, mở **Giao dịch & đối soát** của lệnh. Trong **Thông tin phiếu**, mở **Lịch sử phiếu** để xem thời điểm và số lượng từng lần cấp, nhận hoặc lý do đóng phiếu.

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
