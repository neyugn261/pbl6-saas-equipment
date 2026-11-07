# Nghiệm thu giao diện Service Manager — 06/11/2026

## Phạm vi

Tiếp tục phần trang chủ và danh sách đã làm trong đợt role workspace. Đợt này
tập trung các trang con của **Service Manager**, bắt đầu từ WO-2026-0001 do người
dùng cung cấp. Không triển khai thêm quy trình ERP, thanh toán hoặc quyền mới.
Các component dùng chung có thể được các role khác sử dụng; giữ các kiểm thử
phân quyền và hợp đồng cũ, chưa coi đó là nghiệm thu lại trải nghiệm mọi role.

## Những thay đổi hoàn thành

| Nhóm màn hình | Nội dung |
| --- | --- |
| Chi tiết Work Order | Header mã/tên/trạng thái; loại, ưu tiên, người phụ trách, lịch; tiến trình và hướng dẫn bước tiếp. Các mục Tổng quan, Thực hiện/checklist, Phụ tùng, Báo cáo, Phân công/lịch sử, Tệp. Liên kết thiết bị, khách hàng và yêu cầu hoặc task gốc. |
| Điều phối WO | Form theo thao tác được backend cho phép: phân công, điều chỉnh lịch, hủy. Phân trang kỹ thuật viên, không coi BUSY là toàn bộ tải công việc. Giờ nhập/hiển thị Việt Nam; lịch dự kiến không được gọi là hẹn đã xác nhận. Hủy yêu cầu dịch vụ là lựa chọn riêng, mặc định không chọn. |
| Phụ tùng trong WO | Phân biệt đã xuất, đã trả, xác nhận sử dụng và chưa đối soát; xem snapshot kho/phụ tùng, các lần trả và xác nhận. Thiếu số liệu không giả là 0, đã xuất không suy ra đã dùng, không dùng giá kho làm giá khách trả. |
| Checklist và báo cáo | Checklist chỉ đọc có kết quả/ghi chú dễ đọc khi backend không cho chỉnh sửa. Báo cáo tách sự cố/nguyên nhân/giải pháp/kết quả/tóm tắt khách; tệp báo cáo tách tệp WO. Nguồn lỗi khác với chưa có báo cáo. |
| Chi tiết yêu cầu dịch vụ | Chia thông tin/trao đổi, bảo hành/dự toán, lịch sử. Trao đổi cũ nằm cạnh form; nhãn nội bộ/khách thấy. Liên kết các WO được lọc đúng yêu cầu. Hộp xác nhận có lý do thay cho prompt cho thao tác trạng thái. |
| Tạo yêu cầu | Tìm và phân trang thiết bị từ server, đọc lại thiết bị đã chọn để lấy customer đúng nguồn. Giữ lựa chọn ngoài trang hiện tại. Chặn bấm trùng; kết quả chưa rõ không báo thành công hoặc tự gửi lại. |
| Bảo hành và dự toán | Nguyên nhân/kết luận/checklist được diễn giải tiếng Việt. Dự toán có bảng hạng mục, đơn giá, thành tiền, phiên bản/trạng thái; biểu mẫu có nhãn đầy đủ, mở khi cần. Tổng chính thức do server tính. Xác nhận gửi/xóa nháp/tạo bản sửa. |
| Hồ sơ thiết bị | Chia thông tin/bảo hành, chính sách, dịch vụ/bảo trì, toàn bộ lịch sử. Chỉnh sửa mở khi cần. Thông số bằng tên/kiểu/giá trị thay JSON. Hiển thị thiếu trường bằng tên nghiệp vụ; liên hệ có email/điện thoại. Sửa lỗi dùng ID thiết bị gọi tệp đính kèm WO. QR vẫn theo luồng biên nhận đăng ký đã có. |
| Lịch sử thiết bị và trang liên quan | Chọn thiết bị/khách/địa điểm bằng danh mục; loại sự kiện theo mã thực tế. Hiển thị thiết bị và hồ sơ liên quan bằng liên kết có tên. Trước/sau dưới dạng thông tin nghiệp vụ; không in UUID/JSON trực tiếp làm nội dung chính. Giữ cảnh báo lịch sử cũ chưa đầy đủ. |
| Khách hàng | Tóm tắt doanh nghiệp, liên hệ, địa điểm; mục Thiết bị/dịch vụ có truy vấn customerId và phân trang riêng. Không biến khách hàng thành tenant. |
| Kỹ thuật viên | Tên/mã/chi nhánh/kỹ năng/liên hệ; WO lọc theo technicianId và phân trang. Diễn giải rõ đây là liên kết hiện tại, lịch sử phân công nằm ở từng WO. |
| Bảo trì | Hồ sơ kế hoạch/task có trạng thái, thiết bị, chu kỳ, kỳ tới/kết quả gần nhất; tách thông tin/điều chỉnh và lịch sử. Giữ lịch gốc và quy tắc terminal đã chốt. Giữ requestId và polling của yêu cầu WO thay thế; ID dự kiến không trình bày như lệnh đã được tạo. |
| Bàn giao | Tạo bản nháp có hướng dẫn/giờ Việt Nam/hạn 90 ngày; chi tiết chia nội dung và lịch sử, snapshot thiết bị/địa điểm, xác nhận/kích hoạt tách biệt. Giữ hợp đồng chấp thuận/từ chối của Customer Admin; staff không có nút xác nhận thay khách. |
| Model/chính sách | Chia bảo hành và bảo trì/checklist; trạng thái phiên bản, nguyên nhân và loại công việc có nhãn tiếng Việt. Giữ snapshot và các kiểm thử áp dụng phiên bản cũ. |
| Kho chỉ đọc | Tồn theo phụ tùng/kho có phân trang, bỏ giới hạn chỉ xem 100 dòng. Có bỏ lọc kho, liên kết phụ tùng, hướng dẫn lượng khả dụng/cách ly/ngưỡng. Không thêm quyền nhập/xuất cho Service Manager. |
| Báo cáo/tiện ích | Báo cáo nhãn Việt Nam, khoảng ngày giờ Việt Nam, phân bố trạng thái có thanh đo; giữ ý nghĩa hai nhóm chỉ số độc lập. Thông báo có lỗi/rỗng/thử lại rõ ràng. Hồ sơ tài khoản dịch tên role. |
| Dùng chung | Header, card, điều hướng mục hồ sơ, facts, tiến trình, notice, timeline; responsive và focus. Cuộn đầu trang khi Service Manager chuyển route. Không truyền key nội bộ của hook vào JSX spread. |

## Kiểm tra

- `pnpm --filter web typecheck`: PASS.
- `pnpm --filter web lint`: PASS.
- `pnpm --filter web test`: **70/70 PASS**.
- `pnpm --filter web build`: PASS. Vẫn có cảnh báo bundle JS > 500 kB
  (khoảng 647 kB minified, 181 kB gzip); chưa tách bundle theo route.
- Browser đăng nhập tài khoản demo Service Manager, đọc WO thật do người dùng
  cung cấp và SR/thiết bị/khách hàng liên quan; chuyển mục và mở form, không lưu
  dữ liệu nghiệp vụ để tạo ảnh.
- Rà các trang danh sách, tạo yêu cầu/bàn giao/kế hoạch, đăng ký thiết bị,
  model/chính sách, lịch sử, kho, báo cáo, thông báo, hồ sơ tài khoản.
- Desktop 1440×1000; mobile 390×844, document thường 375 px do scrollbar.
  Các trang đo không có tràn ngang document. Bằng chứng và giới hạn từng lượt
  đọc tại [JSON browser](../testing/2026-11-06-service-manager-browser.json).
- Đã mở mới lại trang sau quá trình cập nhật nóng; Vite từng giữ bản module
  trong lúc file đang ghi, đã làm mới module và xác nhận ứng dụng tải lại.

Test bổ sung kiểm tra double submit, quyền thao tác từ server, lỗi ghi chưa rõ
kết quả, giờ Việt Nam, hủy WO giữ SR, phiên cũ/response muộn, decimal hiển thị
không mất chữ số, nguồn liên quan lỗi từng phần, lỗi attachment ID thiết bị và
WO thay thế chưa được xác nhận. Test cũ giữ kiểm tra tenant/session/customer,
kho idempotency, snapshot bàn giao và chính sách đã áp dụng.

## Giới hạn và việc cần nghiệm thu tiếp

1. **Notification tại local trả 403 cho tài khoản demo.** UI thể hiện đúng lỗi
   quyền và có thử lại. Huy/Nguyên cần đối chiếu quyền, bootstrap/projection và
   Gateway; chưa kết luận chỉ từ thông báo lỗi service nào gây ra.
2. Local chưa có hồ sơ kỹ thuật viên, bảo trì, bàn giao và phụ tùng để nghiệm
   thu mọi trạng thái có dữ liệu trên trình duyệt. Các trạng thái một phần được
   kiểm bằng fixture. Cần UAT bộ dữ liệu thực tế: phân công/reassign, hoàn tất/
   chưa xử lý được, hủy/thay thế, trả hỏng/cách ly, xác nhận khách, dự toán nhiều
   phiên bản và ảnh/PDF. Không gọi smoke test là UAT trọn luồng.
3. Xác nhận/đổi lịch với khách, tải công việc theo thời gian, SLA, người đang
   giữ phụ tùng và đánh giá hài lòng vẫn cần contract nghiệp vụ. Không tạo nút
   lưu thành công giả hoặc dữ liệu mẫu vào hệ thống đang chạy. Phụ thuộc tại
   [bàn giao contract](../plans/2026-11-06-ui-backend-contract-gaps.md).
4. Một số lịch sử cũ chưa có tên actor/snapshot đầy đủ. UI ghi rõ chưa có tên,
   nhận diện được actor hiện tại khi ID khớp phiên; nguồn cần bổ sung projection
   tên phù hợp quyền. Tra cứu tên liên quan hiện có thể phát sinh nhiều GET.
5. Chặn gửi trùng trong một lần mở form không thay thế idempotency bền vững
   sau reload. Kết quả ghi chưa rõ phải kiểm tra hồ sơ trước khi tạo lại.
6. Các trang hiện có của Service Manager đã được rà/nâng cấp theo API hiện hành.
   Những màn hình nghiệp vụ mở rộng chưa có contract và trải nghiệm role khác
   chưa thuộc nghiệm thu này. Backend/schema/migration không thay đổi.

## Tệp chính

- `apps/web/src/features/workspace/ServiceManagerWorkOrder.tsx`
- `apps/web/src/features/workspace/ServiceDetailUI.tsx`, `service-detail-data.ts`,
  `service-detail.css`, `CustomerServicePanel.tsx`
- `apps/web/src/App.tsx`, `apps/web/src/routes/M2Pages.tsx`
- `EquipmentHandovers.tsx`, `EquipmentDirectories.tsx`, `EstimatePanel.tsx`,
  `ModelPolicyPage.tsx`, `ModelPolicyPanels.tsx`
- Inventory/Reports/Notification/Attachments và nhãn hồ sơ tài khoản.
- Test `service-manager-detail.test.mjs`, `service-manager-m2.test.mjs`, helper
  render và cập nhật import cho test hồi quy.

Ảnh local trong `tmp/` (Git bỏ qua): `ui-sm-work-order-overview.png`,
`ui-sm-work-order-desktop.png`, `ui-sm-work-order-mobile.png`,
`ui-sm-customer-desktop.png`. Chưa commit/push trong đợt UI này.
