# M3 — Cải tiến sau rà soát nghiệp vụ

Ngày 02/11/2026. Phạm vi đã được chủ dự án yêu cầu trong chat: cải tiến các nhận
xét về minh bạch kho và phụ tùng sửa chữa. Quy tắc chi tiết: ADR 0015. Đây là bàn
giao trong repository, chưa gửi yêu cầu hoặc nhận approval từ các thành viên.

## Minh — chức năng đã triển khai

- Tách đã xuất / đã trả / xác nhận sử dụng / chưa đối soát; không suy ra đã lắp từ
  số chưa trả. Ghi xác nhận thực tế dựa trên completed WO, completed assignment và
  đúng Service Report thật; đảo xác nhận sai bằng bản ghi mới, không xóa lịch sử.
- Trả hàng GOOD vào tồn có thể xuất; DAMAGED/PENDING_INSPECTION vào cách ly. Kiểm
  tra rồi RELEASE/SCRAP theo từng lần trả gốc; chống xử lý vượt hoặc trùng. Giữ
  quy tắc trả sau khi WO đóng hoặc danh mục/kho INACTIVE; release cần ACTIVE.
- Audit trước/sau khi tạo/sửa danh mục, trạng thái và ngưỡng; snapshot danh mục
  tại giao dịch. Nhập có tham chiếu chứng từ hoặc diễn giải; điều chỉnh có loại
  lý do, CORRECTION liên kết giao dịch gốc với giới hạn và chiều đối ứng.
- Đơn vị được chuẩn hóa alias; phụ tùng mới mặc định số nguyên, hàng đo lường cần
  allowFractional=true. Không làm tròn dữ liệu cũ hoặc tự đổi chính sách cũ.
- Giá tham chiếu nội bộ cần cặp unitCost/unitCostCurrency; không nhập là chưa biết.
  Không dùng nó làm giá bán hay tự kết luận bảo hành.
- API lịch sử phụ tùng an toàn cho khách theo Equipment; Asset dossier có mục
  serviceParts và endpoint phân trang. Kiểm tra scope sống tại Asset, lọc tenant/
  customer/equipment; không lộ tồn, kho, giá vốn, actor hoặc ghi chú nội bộ.
- Recovery cung cấp kết quả xuất, trạng thái đồng bộ, người chịu trách nhiệm gốc,
  thời điểm bắt đầu chờ, hành động tiếp theo. GET cho inventory:read để quản lý
  giám sát; retry/abort giữ inventory:issue. Stock list có tên, tồn cách ly, thiếu
  bao nhiêu và trạng thái thiếu hiện tại.

## Khương — Work Order / Service Report

1. Reservation runtime và mọi đường complete/cancel theo bàn giao ADR 0014 vẫn
   là điều kiện bắt buộc trước khi ISSUE thật hoạt động. Inventory chưa sửa WO.
2. Luồng UI sau khi hoàn tất WO: nhận report ID, Technician xác nhận phụ tùng đã
   dùng qua Inventory `POST /work-order-parts/:id/confirm-use`. Body có quantity,
   serviceReportId, customerReason, removedPartDisposition và removedPartNote khi
   có linh kiện cũ. Dùng một Idempotency-Key cho một lần xác nhận.
3. WO hiện kết thúc assignment khi complete. Inventory dùng `/assignments` với
   status COMPLETED và technician ID của report; không cần một currentAssignment
   còn ACTIVE. Không tạo vòng chờ bắt WO phải có xác nhận sau-report trước khi
   được sinh report. Muốn đối soát trước complete cần một thiết kế report draft
   khác, phải review riêng.
4. Linh kiện cũ tháo từ máy ghi trong biên bản và disposition: trả khách / giữ để
   kiểm tra / hủy có sự đồng ý. Không gọi RETURN của phụ tùng mới cho linh kiện cũ.
5. Cần chốt projection tên kỹ thuật viên, completedAt và kết quả sửa chữa an toàn
   cho khách qua SR. Inventory ghi recordedAt là thời điểm nhận xác nhận; không
   giả nó thành ngày lắp. Khách hiện có report ID/WO number để liên kết.

## Huy — Service Request / estimate / Notification

1. Hiển thị kết luận bảo hành và dự toán được duyệt cạnh phụ tùng đã xác nhận.
   Inventory trả NOT_PROVIDED_BY_INVENTORY / NOT_DETERMINED_BY_INVENTORY; chưa có
   giá không phải miễn phí. Ngoài bảo hành kể cả 0 đồng vẫn qua approval ADR 0006.
2. Chốt dữ liệu từng phụ tùng tính cho khách, currency, nguồn estimate/revision/
   line và xử lý chênh với phạm vi khách đã đồng ý. Không lấy unitCost làm giá bán.
   Tăng phạm vi/chi phí phải được xác nhận trước khi thực hiện; việc ghép/gate này
   chưa được triển khai hoặc nghiệm thu trong lượt cải tiến Inventory.
3. Review điều kiện customer final-close khi còn phụ tùng chưa đối soát. WO kỹ
   thuật đã hoàn tất và hồ sơ phụ tùng hoàn chỉnh là hai tín hiệu riêng. Không
   gọi API kiểm tra rồi quảng bá là bảo đảm nguyên tử xuyên hai DB.
4. Ghép LowStock producer thật → Notification inbox → UI và audience đã thống nhất.
   Giữ một thông báo mỗi đợt; màn hình tồn thấp đọc stock hiện tại thay vì lấy
   snapshot event cũ làm trạng thái hiện tại. Cảnh báo tồn tại lâu vẫn thấy trong
   danh sách; producer không tự gửi lặp hoặc giả định có người đã nhận.

## Hatsady — màn hình và nghiệm thu

- Kho: phân biệt tồn có thể xuất và cách ly; nhập chứng từ/ghi chú, điều chỉnh có
  reasonCode; CORRECTION chọn giao dịch gốc cùng phụ tùng/kho. Hiển thị snapshot
  lịch sử; không thay tên lịch sử bằng tên hiện tại sau khi danh mục đổi.
- Trả: chọn đúng lần xuất, chọn tình trạng thực tế. Cách ly có danh sách kiểm tra,
  xử lý theo từng phiếu trả và số còn chưa xử lý. Cấm biểu diễn là có thể xuất lại.
- WO: các cột đã xuất/đã trả/đã dùng xác nhận/chưa đối soát, danh sách xác nhận và
  lần đảo. Lượng chưa đối soát vẫn phải hiện rõ; mất hàng tại công trường cần
  điều tra và chốt cách xử lý, không giả thành đã lắp hoặc trừ kho lần hai.
- Khách: Asset `/equipment/:id/service-parts` hoặc dossier.serviceParts; phân
  trang toàn bộ lịch sử. CONFIRM bị đảo có effectiveQuantity=0, REVERSE là bản sửa
  lịch sử chứ không phải lần thay mới. Có chú thích lịch sử cũ có thể thiếu.
- Recovery: UNCONFIRMED không hiển thị “xuất thất bại chắc chắn”; ISSUED + pending
  finalize vẫn là đã xuất. Cho người có quyền thao tác cùng key, đọc lại proof;
  không tự tạo key mới. inventory:read xem được, inventory:issue mới xử lý được.
- Khi API UNAVAILABLE/RESTRICTED/NOT_CONFIGURED, hiển thị đúng trạng thái; không
  dùng danh sách rỗng để ngụ ý chưa sửa chữa. Resolve actor IDs bằng nguồn danh
  bạ có quyền, không bịa tên; không đưa UUID kỹ thuật thành nhãn chính.

## Nguyên — config / Gateway / CI

- Inventory ASSET_SERVICE_URL và Asset INVENTORY_SERVICE_URL dùng các biến đã có
  trong .env.example. Thiếu dependency thì chỉ section/phép đọc liên quan không
  khả dụng, không bỏ qua quyền và không làm giả dữ liệu.
- Gateway prefix Inventory/Asset giữ nguyên, không expose internal paths. Review
  CORS/idempotency/recovery headers và chạy CI với migrations Inventory 0001–0005.
- Migrations cũ giữ nguyên; dev DB chưa được migrate trong lượt này, test DB riêng
  đã được dùng. Review thay đổi tương thích: RETURN condition bắt buộc; ADJUST
  reasonCode; RECEIVE note hoặc documentReference; unitCost cần currency; consumed
  chuyển sang xác nhận thực tế. Client cần cập nhật cùng đợt tích hợp.

## Kịch bản nghiệm thu chung

1. Nhập 5 → xuất 3 → Technician thực dùng 1, trả 1 tốt, còn 1 chưa đối soát:
   kho có thể xuất 3; không nói đã dùng cả 2 chưa trả. Khách chỉ thấy 1 đã xác nhận.
2. Trả hàng hỏng: tồn có thể xuất không tăng; kiểm tra release một phần, scrap
   phần còn lại; gọi lặp hoặc hai người xử lý đồng thời không vượt lượng gốc.
3. Xác nhận dùng và trả tranh cùng lượng: một bên bị từ chối, không âm/chồng lấn.
4. Nhập nhầm → CORRECTION liên kết; đổi tên danh mục → lịch sử tên cũ vẫn đọc được.
5. Khách khác/tenant khác không đọc được; response không chứa giá vốn/ghi chú kho.
6. Đảo xác nhận sai → lịch sử khách giữ bản gốc đã sửa, không cộng nhầm dù phân trang.
7. Mất mạng sau xuất → cùng key đối soát được; WO không đóng vượt reservation.
8. Bảo hành/ngoài bảo hành có dự toán phù hợp; chưa có quyết định phải hiển thị
   chưa xác định. Phần liên service/UI này chưa có bằng chứng UAT thật.
