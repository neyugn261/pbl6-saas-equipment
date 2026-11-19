# So sánh luồng người dùng chốt với hệ thống hiện tại

Ngày 19/11/2026. Tài liệu này là mốc yêu cầu mới nhất, thay thế các giả định mâu thuẫn trong hai bản đề xuất/rà soát trước. Đây là so sánh thiết kế với code local, chưa phải thay đổi chức năng.

## 1. Hiểu đúng yêu cầu mới nhất

1. Số lượng thiết bị tùy lô/đơn thực tế; 50 chỉ là ví dụ, không phải giới hạn nghiệp vụ hoặc giới hạn file mong muốn.
2. Việc xác nhận nhóm được hoàn thành ngoài hệ thống, thể hiện trong dữ liệu CSV/Excel trước upload. Không xây thêm bước bắt khách xác nhận lại từng máy/nhóm trên Portal cho luồng import này.
3. Mỗi dòng là một thiết bị vật lý, đầy đủ nhận dạng và thông tin liên quan; nhiều model và nhiều nơi lắp trong cùng khách hàng.
4. Địa điểm và vị trí lắp đặt phải chi tiết đến từng máy. Theo mô tả trước, có thể bổ sung sau bằng file; “được bổ sung sau” không có nghĩa được để thiếu vĩnh viễn hoặc tự thay bằng trụ sở khách.
5. Bảo hành giữ mốc ngày bàn giao thực tế cho mọi máy như người dùng đã chốt.
6. Trọng tâm là nhập/kiểm tra/lưu/cập nhật dữ liệu chuẩn, bảng thiết bị và bộ lọc; không mở rộng sang quy trình bán hàng/ERP chỉ vì số lượng đi theo đơn.

Giới hạn tài nguyên khi xử lý file lớn cần được thiết kế riêng và công khai; không dùng giới hạn 50 dòng hiện tại làm yêu cầu nghiệp vụ. Hệ thống có thể xử lý theo khối nội bộ và có tiến độ/kết quả, không bắt người dùng chia một lô thành các lô nghiệp vụ 50 máy.

## 2. Hai luồng đang khác nhau

### Luồng người dùng muốn

Chuẩn bị CSV/XLSX có dữ liệu thiết bị và kết quả xác nhận ngoài hệ thống → upload → ánh xạ/kiểm tra/preview → lưu hồ sơ theo dữ liệu hợp lệ → tra cứu trên grid → bổ sung thông tin lắp đặt bằng form/file cập nhật khi cần.

Nếu import ở giai đoạn chưa có thông tin lắp, phải thể hiện rõ hồ sơ còn thiếu. Chỉ đánh dấu đủ dữ liệu lắp khi đã có địa điểm/vị trí chi tiết phù hợp; không suy ra đã lắp chỉ vì có địa chỉ dự kiến.

### Luồng hiện tại

Chọn một khách và một site chung → chọn model mặc định → tải CSV tối đa 50 dòng/100 KB → preview → tạo Equipment và Registration DRAFT → mở hồ sơ từng máy để hoàn thiện chính sách/ngày → với CUSTOMER_SITE, gửi hồ sơ và chờ khách xác nhận trên Portal; STORE hoàn tất bởi nhân viên theo luồng hiện có.

**Khác biệt cốt lõi:** luồng mong muốn lấy file làm nguồn dữ liệu đã được chuẩn bị/xác nhận ngoài hệ thống; luồng hiện tại lấy file làm nguồn tạo nháp, rồi tiếp tục quy trình xác nhận bên trong hệ thống. Không thể coi hai luồng này đã tương đương.

## 3. Bảng so sánh

| Nội dung | Người dùng yêu cầu | Code hiện tại | Mức đáp ứng |
|---|---|---|---|
| Số máy | Lớn/nhỏ tùy thực tế, không cố định 50 | DTO, parser và service chặn quá 50; UI ghi tối đa 50 | Chưa đáp ứng |
| Kích thước file | Đủ chứa dữ liệu chi tiết của lô thực tế | CSV tối đa 100.000 ký tự, Web giới hạn file 100 KB | Cần thiết kế lại giới hạn/xử lý file |
| Định dạng | CSV và Excel | CSV; chưa có parser XLSX cho luồng này | Đáp ứng một phần |
| Model | Nhiều loại/model, dùng mã nghiệp vụ dễ chuẩn bị | Có modelId từng dòng hoặc modelId mặc định; dùng UUID nội bộ | Có nền tảng, chưa thuận tiện cho file nghiệp vụ |
| Khách hàng | Dữ liệu rõ ràng và đúng khách | Chọn customerId trên Web; không có mã/tên/địa chỉ khách trong schema CSV | Chưa đáp ứng mẫu file đầy đủ |
| Nơi lắp mỗi máy | Có thể khác nhau giữa các máy | customerSiteId bắt buộc và dùng chung cả lô; mỗi dòng có thể có locationId thuộc site đó | Chưa hỗ trợ nhiều site trong một file |
| Vị trí lắp chi tiết | Có tên/mã cơ sở, địa chỉ, vị trí cụ thể | Organization đã có Site/Location phân cấp; CSV chỉ nhận locationId tùy chọn; form cho “Không chỉ định” | Mô hình có một phần, import/điều kiện hoàn thiện còn thiếu |
| Bổ sung nơi lắp sau | Cập nhật đúng các máy đã có bằng file | Site phải có ngay lúc tạo; bulk chỉ tạo mới | Chưa đáp ứng |
| Xác nhận nhóm | Đã thực hiện trước upload, không xác nhận lại trên Web | Import không đọc kết quả xác nhận; CUSTOMER_SITE tiếp tục chờ Portal theo từng hồ sơ | Khác luồng mong muốn |
| Kết quả import | Hồ sơ được ghi nhận theo dữ liệu/trạng thái thực tế trong file | Luôn tạo DRAFTS_CREATED, không hoàn tất bàn giao từ file | Khác luồng mong muốn |
| Thông tin kỹ thuật/liên hệ | File chứa hoặc đối chiếu được đầy đủ các trường cần thiết | Hệ thống có dữ liệu model, thông số, contact ở các luồng khác; CSV bulk không nhận những cột đó | Không phải chưa có dữ liệu, nhưng chưa nhập được qua file này |
| Cập nhật file | Bổ sung địa điểm, vị trí, ngày và thông tin được phép | Chưa có bulk update từ CSV/XLSX | Chưa đáp ứng |
| Mốc bảo hành | Ngày bàn giao thực tế | Luồng Model policy đã lấy handoverDate, nhưng bulk mới tạo nháp, chưa áp dụng chính sách | Đúng mốc; thiếu nối với import đã xác nhận |
| Grid thiết bị | Nhiều cột, đủ thông tin theo quyền | Bảng cơ bản, thông tin đầy đủ hơn nằm trong hồ sơ chi tiết | Đáp ứng một phần |
| Bộ lọc | Khách/model/loại/ngày giao/nơi lắp và nhiều điều kiện | API có một số filter cơ bản; UI và API chưa có đầy đủ các điều kiện mới | Đáp ứng một phần |
| Chống trùng/lịch sử | Không tạo lại máy khi bổ sung, có truy vết | Bulk create đã có kiểm tra trùng và Idempotency-Key; Asset có history | Nên giữ và mở rộng cho update/import lớn |

## 4. Dữ liệu file cần thiết kế lại

Danh sách dưới đây là schema đề xuất cho luồng mới, không phải tên cột đã được parser hiện tại chấp nhận. Không dùng file theo danh sách này để thử import vào API cũ rồi kỳ vọng thành công.

| Nhóm | Nội dung file/đối chiếu cần có |
|---|---|
| Nhận dạng máy | Mã thiết bị, serial dạng text, mã model/hãng phân giải được, tên máy |
| Khách hàng | Mã/tên khách và thông tin địa chỉ tham chiếu; không âm thầm sửa master data từ từng dòng máy |
| Lô/đợt bàn giao | Mã lô/nguồn hồ sơ, đợt hoặc mã biên bản liên quan nếu có; không biến thành module quản lý đơn hàng |
| Giao nhận | Ngày bàn giao thực tế và kết quả ghi nhận theo dữ liệu đã xác nhận ngoài hệ thống; dữ liệu nguồn đủ để đối chiếu |
| Nơi nhận | Địa chỉ nhận hàng, độc lập với trụ sở và nơi lắp khi khác nhau |
| Nơi lắp | Mã/tên cơ sở, địa chỉ cụ thể, tòa nhà/khu/tầng/phòng hoặc vị trí phù hợp loại địa điểm; không bắt nơi ngoài trời phải có tầng/phòng giả |
| Lắp đặt | Ngày dự kiến/ngày thực tế nếu có; trạng thái chưa xác định/chờ lắp/đã lắp/không cần lắp và thông tin bên thực hiện khi cần |
| Chi tiết thiết bị | Thông số theo model và thông số riêng được phép; tài liệu/ghi chú người dùng cần xem |
| Liên hệ | Người và phương thức liên hệ phục vụ giao nhận/lắp đặt, theo quyền |
| Chính sách | Tham chiếu chính sách bảo hành/bảo trì áp dụng và dữ liệu cần thiết để tính ngày; không tự suy diễn từ một ô “đã xác nhận” |

Parser hiện chỉ cho các cột `modelId`, `assetCode`, `serialNumber`, `displayName`, `locationId`, `handoverDate`; khách/site/phương thức ở phần chọn chung. Cột ngoài allowlist bị từ chối. Do đó thêm cột trong Excel không tự làm hệ thống lưu được thông tin mới.

## 5. Những gì giữ, đổi và chưa triển khai

### Giữ

- Nhận dạng từng máy, tenant/customer scope, Site/Location có cấu trúc.
- Model/policy, ngày bắt đầu bảo hành theo ngày bàn giao thực tế.
- Preview, kiểm tra tham chiếu/trùng, idempotency, history và quyền backend.

### Cần đổi cho luồng import mới

- Schema file chi tiết dùng mã nghiệp vụ, per-row model/site/location, CSV/XLSX, xử lý lô biến thiên.
- Import kết quả đã xác nhận ngoài hệ thống: lưu dữ liệu đúng nguồn và người import; không giả actor Portal hoặc bắt khách thực hiện lại thao tác đã làm.
- Không đưa mọi dòng vào quy trình DRAFT rồi chờ Portal như hiện tại. Cần mapping rõ dữ liệu nào đủ điều kiện ghi nhận trạng thái nào; dữ liệu lỗi/thiếu không tự được coi là hoàn tất.
- Luồng cập nhật từ file cho thiết bị đã tồn tại, có version và dữ liệu trước/sau.
- Điều kiện đầy đủ của địa điểm/vị trí lắp, grid và filter phía server.

Đây là thay đổi nghiệp vụ/contract thực sự, không chỉ sửa chữ hoặc bỏ nút xác nhận. Luồng Portal đang hoạt động không được tự tắt toàn hệ thống trước khi thiết kế xong đường import nguồn xác nhận ngoài hệ thống. So sánh này chưa tự quyết định bỏ Portal ở các luồng khác.

## 6. Bằng chứng code

- `apps/asset-service/src/registrations/bulk.dto.ts`: giới hạn 50, CSV, allowlist cột, phần chọn chung customer/site.
- `apps/asset-service/src/registrations/bulk.service.ts`: tạo hồ sơ qua RegistrationService, trả DRAFTS_CREATED, lưu kết quả theo key.
- `apps/asset-service/src/model-policies/model-setup.service.ts`: dùng handoverDate; CUSTOMER_SITE đi qua handover submit.
- `apps/asset-service/src/registrations/registration-handover.service.ts`: tạo PENDING_CUSTOMER_CONFIRMATION và snapshot theo máy.
- `apps/organization-service/prisma/schema.prisma`: CustomerSite/Location, địa chỉ và quan hệ phân cấp.
- `apps/web/src/routes/MinhAssetUx.tsx`: chọn site chung, giới hạn file, wizard tạo nháp.
- `apps/web/src/routes/EquipmentRegistration.tsx`: vị trí chi tiết tùy chọn, quy trình hồ sơ tiếp theo.
- `apps/asset-service/src/equipment/dto/equipment.dto.ts` và `apps/web/src/App.tsx`: filter/list hiện hành.
