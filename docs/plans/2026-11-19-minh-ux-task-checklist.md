# Checklist phần Minh — Cải tiến UX và hoàn thiện nghiệp vụ

Nguồn: `C:\Users\Admin\Downloads\2026-11-19-ux-issues-and-task-breakdown.md`.

Tài liệu này chuyển 4 nhóm việc MINH-01–04 thành checklist thực hiện. Trạng thái triển khai local ngày 19/11 được ghi ở mục 9; ô chưa đánh dấu là việc còn cần chốt/kiểm tra/bàn giao, không mặc định đã hoàn thành. Những endpoint, event và bảng mới trong file nguồn phải được đối chiếu code/contract trước khi triển khai.

## 1. Thứ tự và phụ thuộc

| Thứ tự | Nhóm việc | Điều kiện bắt đầu triển khai |
|---|---|---|
| 1 | Chốt contract và quy tắc chung | Đối chiếu baseline Git, ADR, schema và luồng hiện hành |
| 2 | MINH-02 — Giá phụ tùng | Chốt loại giá, quyền xem/sửa, tiền tệ và snapshot |
| 3 | MINH-01 — Bàn giao hàng loạt | Chốt cách khách xác nhận từng máy/lô và phạm vi rollback |
| 4 | MINH-03 — Phụ tùng theo báo giá | Huy chốt estimate revision/event; Khương chốt liên kết WO; MINH-02 có contract |
| 5 | MINH-04 — QR công khai | Chốt ngoại lệ truy cập công khai và dữ liệu được công bố; phối hợp Huy/Nguyên |

MINH-01 có thể làm độc lập với giá phụ tùng sau khi chốt contract. Không coi lịch hai tuần trong file nguồn là cam kết hoàn thành khi các phụ thuộc chưa được thống nhất.

## 2. Chuẩn bị chung

- [x] Ghi commit baseline, trạng thái local và danh sách file thuộc phạm vi Minh; đọc README, CONTRIBUTING, ADR và tài liệu API liên quan.
- [x] Rà lại code mới nhất để tận dụng Equipment Registration, policy snapshot, QR, PartRequest, ISSUE/reservation và recovery hiện có.
- [ ] Chốt contract với owner/consumer: request/response, quyền, tenant/branch/customer scope, lỗi, retry, idempotency và dữ liệu lịch sử.
- [ ] Tách thay đổi contract/schema dùng chung theo quy trình repository; thống nhất migration và tương thích client cũ.
- [ ] Ghi rõ các quyết định còn mở, người chốt và tiêu chí nghiệm thu trước khi đổi schema lớn.

## 3. MINH-01 — Bulk Handover / nhập bàn giao hàng loạt

### Quy tắc cần chốt

- [ ] Xác định đầu vào MVP: JSON, CSV và/hoặc Excel; chốt template, cột bắt buộc, kiểu ngày, giới hạn dòng/dung lượng và phản hồi lỗi theo dòng.
- [ ] Chốt mỗi lô thuộc tenant, branch, customer/site nào; có cho phép nhiều model/location trong lô hay không.
- [ ] Phân biệt nhập thiết bị, gửi bàn giao, khách chấp thuận và kích hoạt chính sách. Không tự kích hoạt bảo hành ngay khi import nếu luồng hiện hành yêu cầu khách xác nhận.
- [ ] Chốt xác nhận theo từng thiết bị hay toàn lô; giữ nội dung/version chính sách mà khách thực sự chấp thuận.
- [ ] Chốt chế độ toàn bộ hoặc không ghi gì trong Asset DB, hoặc ghi một phần có kết quả từng dòng. Không hứa rollback nguyên tử cả Maintenance/Identity/Organization.

### Triển khai

- [ ] Bổ sung endpoint sau khi thống nhất đường dẫn với Gateway; tái sử dụng logic registration thay vì tạo đường tắt bỏ validate/chính sách.
- [ ] Parse file an toàn; không thực thi công thức/macro; giới hạn dữ liệu và báo lỗi dòng/cột dễ hiểu.
- [ ] Validate model, serial trùng trong file/DB, ownership customer/site/location/branch, trạng thái và chính sách liên quan.
- [ ] Có bước kiểm tra trước khi ghi hoặc cơ chế tương đương để người dùng xem lỗi trước khi xác nhận nhập.
- [ ] Áp transaction đúng phạm vi Asset DB; dùng outbox và trạng thái provisioning cho phần liên service.
- [ ] Chống tạo trùng khi retry/mất phản hồi hoặc hai lô có cùng serial; có cách tra cứu kết quả theo lô/lệnh.
- [ ] Ghi actor, thời điểm, dữ liệu nguồn và kết quả từng thiết bị; sinh/truy xuất QR theo quyền và vòng đời QR hiện hành.

### Nghiệm thu và bàn giao

- [ ] Kiểm tra lô hợp lệ, lỗi giữa lô, serial trùng, ownership sai, hai lần gửi đồng thời, mất phản hồi và provisioning thất bại.
- [ ] Kiểm tra STORE/CUSTOMER_SITE và thời điểm hiệu lực bảo hành/bảo trì không bị thay đổi ngoài ý muốn.
- [ ] Bàn giao OpenAPI, file mẫu, ví dụ lỗi, cách retry/tra cứu và hướng dẫn tích hợp cho Nguyên.
- [ ] Xác định rõ ai làm Web Wizard. File nguồn chưa giao task Wizard riêng cho Nguyên; không mặc định NGUYEN-01 Quick Dispatch bao gồm Bulk Handover.

## 4. MINH-02 — Giá phụ tùng

- [ ] Đối chiếu schema/API Part hiện tại; chốt ý nghĩa `costPrice` và `standardPrice`.
- [ ] Chốt tiền tệ, số lẻ/làm tròn, giá bằng 0, giá chưa cấu hình, giới hạn giá và việc có bao gồm thuế hay không; không mở rộng thành kế toán/VAT.
- [ ] Chốt quyền xem giá vốn, xem giá niêm yết và sửa giá. Không trả giá vốn cho khách hoặc mọi người có quyền đọc danh mục.
- [ ] Tạo migration riêng Inventory; chốt cách xử lý dữ liệu cũ, ưu tiên không suy diễn giá chưa biết thành giá 0.
- [x] Cập nhật DTO/service/repository và response theo quyền; Decimal truyền qua API bằng định dạng được thống nhất, tránh sai số số thực.
- [x] Ghi lịch sử thay đổi giá với actor/thời điểm; thay giá danh mục không sửa báo giá đã duyệt.
- [x] Cung cấp tra cứu phụ tùng có tìm kiếm/phân trang, mã/tên/đơn vị/trạng thái/giá/tiền tệ cho form báo giá.
- [x] Kiểm tra validation giá, quyền giá vốn, tenant/branch scope, dữ liệu legacy và tương thích API cũ.
- [ ] Bàn giao migration, OpenAPI và ví dụ cho Huy/Nguyên; cập nhật SQL ERD nếu schema thay đổi.

## 5. MINH-03 — Liên kết báo giá và phụ tùng cần cấp

### Chốt với Huy và Khương

- [ ] Huy chốt dòng báo giá tham chiếu `partId`, số lượng/đơn vị, snapshot tên/giá/tiền tệ và revision khách đã duyệt.
- [ ] Xác định event thực tế đã có hay cần bổ sung; không mặc định `CostEstimateApproved` đã tồn tại trong catalog.
- [ ] Chốt trường hợp duyệt trước khi có WO: liên kết theo Request/revision và gắn WO sau bằng quy tắc rõ ràng.
- [ ] Phân biệt **đề xuất cần cấp** với **giữ tồn**. Mặc định không tự tạo reservation vật lý từ việc duyệt báo giá nếu chưa có quyết định riêng.
- [ ] Giữ reservation ADR 0014/0016 ở thao tác ISSUE; không tái định nghĩa reservation bằng bảng `recommended_parts`.
- [ ] Chốt sửa/hủy/thay revision, WO thay thế/nhiều WO, phụ tùng inactive, cấp thiếu và phát sinh ngoài phạm vi duyệt.

### Triển khai phía Minh

- [ ] Cung cấp API tra cứu phụ tùng/giá từ MINH-02; Inventory không đọc trực tiếp DB Service Request hoặc WO.
- [ ] Triển khai projection/consumer hoặc phương án API đã thống nhất; xử lý trùng, sai thứ tự, retry và dữ liệu đến trước liên kết WO.
- [ ] Lưu nguồn estimate/revision/line và trạng thái đồng bộ để truy được căn cứ, không ghi đè lịch sử đã cấp.
- [ ] API danh sách đề xuất theo WO có scope đúng và phân biệt lượng đề xuất, đã yêu cầu, đã cấp, còn cần xử lý theo định nghĩa đã chốt.
- [ ] Tận dụng PartRequest hiện có cho nhu cầu cấp; nếu thêm thao tác chuyển đề xuất thành phiếu phải chống trùng và kiểm lại quyền/trạng thái WO.
- [ ] Giữ nguyên nguyên tắc: duyệt báo giá chưa xuất kho; xuất kho chưa xác nhận sử dụng; đóng phiếu chưa đồng nghĩa hàng đã trả.
- [ ] Kiểm tra replay event, thay revision, mất liên kết WO, cấp đồng thời, vượt nhu cầu, thiếu tồn và phục hồi ISSUE.
- [ ] Bàn giao API/lỗi/retry cho Nguyên; nghiệm thu với Huy/Khương bằng luồng thật từ duyệt báo giá đến cấp vật tư.

## 6. MINH-04 — QR công khai và báo sự cố vãng lai

### Điều kiện bắt buộc trước triển khai

- [x] Người dùng đã duyệt allowlist QR công khai và hàng chờ báo lỗi chờ xác minh. Quy tắc chi tiết được ghi tại ADR 0024 để review; API hồ sơ riêng tư vẫn kiểm quyền.
- [ ] Chốt dữ liệu được công bố. Không tự công khai customer, liên hệ, site/location, lịch sử sửa chữa, chi phí hoặc thông tin nội bộ; cân nhắc cả serial và hạn bảo hành.
- [ ] Chốt token QR công khai riêng hay cơ chế hiện có; khả năng đoán mã, xoay/thu hồi, hết hiệu lực và xử lý mã cũ.
- [ ] Chốt với Huy: báo sự cố vãng lai là đầu mối cần xác minh hay Service Request thật; tenant/customer không lấy tùy ý từ body client.
- [ ] Chốt xử lý spam, báo trùng, liên hệ cá nhân, đồng ý lưu dữ liệu và thời gian lưu.

### Triển khai sau khi chốt

- [ ] Endpoint public chỉ trả allowlist dữ liệu; phản hồi không tạo kênh dò tenant/customer hoặc thiết bị bằng ID đoán được.
- [ ] Token gửi báo lỗi ngắn hạn, ràng buộc mục đích/thiết bị; chốt replay/idempotency và kiểm tra lại khi submit.
- [ ] Rate limit có phạm vi rõ, giới hạn payload và log che token/thông tin cá nhân; không coi rate limit là biện pháp duy nhất.
- [ ] Phối hợp Huy về submit/đính kèm và xác minh; Minh không tự ghi DB Request hoặc tạo đường upload bỏ kiểm soát.
- [ ] Kiểm tra QR thu hồi/không hợp lệ/thiết bị ngừng dùng, token giả/hết hạn, spam và dữ liệu bị lộ.
- [ ] Bàn giao OpenAPI, dữ liệu hiển thị, lỗi và hành vi xác thực cho Nguyên làm Public Landing Page.

## 7. Phối hợp ngoài bốn task chính

- [ ] Huy — cung cấp API Asset/Inventory theo quyền nếu Customer 360/Location Tree cần đếm thiết bị; không cho Organization JOIN trực tiếp database Asset/Inventory.
- [ ] Nguyên — rà nhu cầu search/filter/date/pagination trên danh sách Asset/Inventory cho TableToolbar; chỉ bổ sung backend thuộc Minh khi có thiếu thực tế.
- [ ] Khương — xác nhận tương thích WO, assignment, PartRequest và reservation cho luồng mới; Mobile thuộc owner riêng.
- [ ] Nhóm — chốt ownership thực tế; tài liệu nguồn chia 4 người, không tự suy ra thay đổi toàn bộ phân công của dự án.

## 8. Điều kiện đóng từng task

- [ ] Code, migration, API/event contract, ADR cần thiết và tài liệu sử dụng khớp nhau.
- [ ] Kiểm tra quyền tenant/branch/customer và không truy vấn database xuyên service.
- [ ] Unit/integration test cho logic, retry/concurrency và lỗi quan trọng đạt; chạy lint/typecheck/build của phạm vi ảnh hưởng và các gate repository yêu cầu.
- [ ] Có bằng chứng commit, môi trường, lệnh và kết quả; phân biệt test fixture với nghiệm thu toàn stack.
- [ ] Consumer Web/WO/Request xác nhận tích hợp; ghi rõ phần còn chờ người khác.
- [ ] Không dùng mục tiêu 500ms/3 click/giảm 70% làm kết quả đã đạt khi chưa có phương pháp đo và bằng chứng.
- [x] Có báo cáo bàn giao, hướng áp migration/phục hồi và danh sách giới hạn còn lại. Chưa commit/merge; thực hiện theo yêu cầu riêng của người dùng.

## 9. Trạng thái triển khai local ngày 19/11/2026

Baseline `f0751a4`; nhánh `codex/minh-ux-20261119`. Chi tiết trang demo, bằng chứng và giới hạn xem [bàn giao](../reports/2026-11-19-minh-ux-handoff.md), [ADR 0024](../decisions/0024-minh-ux-bulk-pricing-public-qr.md) và [API](../api/minh-ux.yaml).

- [x] MINH-01: backend preview/tạo lô JSON/CSV; transaction Asset, retry cùng key, tra cứu kết quả; Web chọn khách/site/model/vị trí mặc định, mẫu CSV và phục hồi lô.
- [ ] Mở rộng tùy chọn MINH-01: nhập XLSX trực tiếp và xác nhận/chính sách hàng loạt một lần. MVP hiện tại chọn CSV/JSON, tạo DRAFT; hoàn thiện chính sách và xác nhận từng máy theo luồng cũ.
- [x] MINH-02: migration giá nullable/VND, DTO, CRUD/read, cập nhật giá theo version, audit và ẩn giá vốn; Web danh sách/chi tiết phụ tùng.
- [x] MINH-03 phía Inventory: contract snapshot, consumer/inbox, xử lý trùng/cũ/xung đột, API đối chiếu theo WO và mục hiển thị trên Web.
- [ ] MINH-03 tích hợp thật: Huy bổ sung partId vào báo giá và producer/outbox; chốt vòng đời phát sinh/withdrawal. Nguyên nối picker báo giá theo contract đó. Không đánh dấu toàn luồng đã hoàn thành.
- [x] MINH-04: QR public opt-in, dữ liệu allowlist, form HMAC 15 phút, chống trùng, giới hạn tần suất; Web landing/cấu hình/hàng chờ xác minh; consumer khóa public khi nhận event khóa tenant.
- [ ] MINH-04 vận hành Internet: chính sách retention/purge, limiter dùng chung/edge, che QR trong access log, xác minh/convert sang SR và media/thông báo phối hợp Huy. Bản này lưu đầu mối liên hệ, chưa tự tạo SR/WO.
- [ ] Owner/consumer review contract và schema; UAT trình duyệt/toàn stack, commit/PR/merge. Các việc này chưa được tự coi là đạt từ kiểm tra local.
