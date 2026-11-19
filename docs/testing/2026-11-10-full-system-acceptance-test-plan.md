# Kịch bản kiểm thử chức năng quan trọng toàn dự án PBL6

Ngày lập: 10/11/2026. Baseline: `develop` / `origin/develop` tại `48f86d5f3ca93e1cea5bb9c612e6f1576be60336` (đã gồm PR #67–#70).

**Đây là kế hoạch kiểm thử, chưa phải kết quả nghiệm thu. Tất cả ca mới mặc định NOT RUN.** Các báo cáo cũ chỉ là bằng chứng của phiên bản được ghi trong báo cáo đó. Không suy ra PASS cho baseline này từ kết quả cũ hoặc từ việc build thành công.

## 1. Phạm vi và cách sử dụng

Kiểm tra toàn bộ hành trình sau bán hàng: quản trị doanh nghiệp → khách hàng/site → Model/chính sách → bàn giao → yêu cầu → dự toán → WO → thực hiện/báo cáo/phụ tùng → khách xác nhận → lịch sử, bảo trì, thông báo và báo cáo. Kiểm tra Web bằng API thật qua Gateway; Mobile Technician là hạng mục nghiệm thu ứng dụng hiện có, không yêu cầu sửa code mobile.

- **P0:** sai phạm vi dữ liệu/quyền, mất hoặc nhân đôi dữ liệu, sai tồn kho, sai chấp thuận khách hàng, không hoàn thành được luồng cốt lõi. Chặn nghiệm thu khi lỗi.
- **P1:** chức năng nghiệp vụ quan trọng, lịch sử, xử lý lỗi và trải nghiệm vận hành.
- **P2:** tiện dụng, hiển thị và khả năng tiếp cận. Có thể nâng lên P0/P1 theo ảnh hưởng thực tế.
- **PASS:** đã thực hiện đủ bước, đạt kỳ vọng và có bằng chứng. **FAIL:** hành vi sai. **BLOCKED:** không thể chạy vì môi trường/quyền/phụ thuộc. **NOT RUN:** chưa thực hiện. **GAP:** nhu cầu chưa được triển khai/chốt, xem mục 8.
- Trong bảng, bước ngăn cách bằng `→` phải làm theo thứ tự. Mỗi biến thể ngăn bằng dấu chấm phẩy phải có kết quả riêng nếu kết quả khác nhau.
- Web không có nút nhưng backend có API: chạy API bằng tài khoản đúng quyền, ghi rõ kênh; không đánh dấu luồng UI PASS từ kết quả API.
- Khi so quyền, dùng request đã hợp lệ về body/trạng thái, chỉ thay đối tượng hoặc danh tính. Tránh coi lỗi validation là bằng chứng tenant isolation.

Ba thay đổi local chưa commit đang có khi lập tài liệu: mất nhắc phạm vi chi nhánh trong shell, mất menu Phân bổ dịch vụ, mất diễn giải thời hạn bảo trì ở danh sách/lịch sử. Vì vậy phải ghi cả commit và `git diff --stat` khi chạy; UI local hiện tại khác baseline Git. Các ca BR-01, BR-04, MT-06 cần đặc biệt ghi nhận khác biệt này. Tài liệu này không khôi phục hay sửa ba file đó.

## 2. Môi trường, tài khoản và dữ liệu

### 2.1. Chuẩn bị

1. Dùng môi trường kiểm thử/local riêng; ghi commit, diff local, phiên bản trình duyệt, Gateway origin và múi giờ Asia/Ho_Chi_Minh (UTC+7).
2. Chuẩn bị PostgreSQL, RabbitMQ, Redis, MinIO và các biến môi trường theo [README](../../README.md). Không ghi token/mật khẩu vào bằng chứng.
3. Nếu cần bộ demo, làm theo [hướng dẫn demo](../user-guide/demo-data.md). `pnpm demo:seed` có build/migrate và ghi dữ liệu. Không chạy tự động trong khi chỉ đọc tài liệu; không dùng `demo:reset` trên dữ liệu cần giữ.
4. Khi hạ tầng/dữ liệu đã sẵn sàng, chạy backend và frontend ở hai terminal:

   ```powershell
   pnpm dev:backend
   ```

   ```powershell
   pnpm dev:web
   ```

5. Xác nhận đăng nhập, health service, kết nối broker/outbox và tải một tệp MinIO thực. Thiếu service ghi BLOCKED, không dùng dữ liệu Studio để thay thế.
6. Mỗi ca phá hủy trạng thái dùng hồ sơ mới có tiền tố `UAT-<runId>-<caseId>`. Lưu ID trước khi chạy; không dùng cùng WO cho cả ca hủy và ca hoàn tất.
7. Các ca lỗi mạng, event replay, ngày scheduler và hai thao tác đồng thời dùng fixture/test harness riêng. Không đổi đồng hồ máy chủ dùng chung hay sửa trực tiếp DB vận hành để ép trạng thái.

### 2.2. Tài khoản

Tenant demo `MP`. Mật khẩu lấy từ cấu hình demo tại máy, không chép vào tài liệu này. Đăng nhập từng vai trò bằng profile trình duyệt riêng để tránh lẫn phiên.

| Ký hiệu | Tài khoản / cách chuẩn bị | Mục đích |
|---|---|---|
| PA | `platform.admin@pbl6.local`, không nhập tenant code | Quản trị nền tảng |
| TA | `tenant.admin@demo.local` | Quản trị toàn tenant |
| SM-A / SM-B | `service.manager@demo.local` / `service.manager.dn@demo.local` | HCM / Đà Nẵng |
| INV-A / INV-B | `inventory@demo.local` / `inventory.dn@demo.local` | Kho HCM / Đà Nẵng |
| TECH-A / TECH-A2 | `technician@demo.local` / `technician.hcm02@demo.local` | Người nhận việc / người không được phân công |
| TECH-B | `technician.dn01@demo.local` | Kỹ thuật viên chi nhánh khác |
| CA-A / CU-A | `customer.admin@demo.local` / `customer.user@demo.local` | Bệnh viện An Phúc |
| CA-B / CU-B | `factory.admin@demo.local` / `factory.user@demo.local` | Cơ khí Hòa Long, cùng tenant nhưng khác customer |
| TENANT-X | Tạo tenant kiểm thử thứ hai và tài khoản/hồ sơ tương ứng bằng fixture/API hợp lệ | Kiểm tra chéo tenant; hai customer của MP không thay thế được tenant thứ hai |
| LEGACY-D | Fixture Dispatcher cũ nếu cần kiểm tra tương thích | Không mời mới role Dispatcher; Service Manager đảm nhiệm điều phối theo ADR 0022 |

### 2.3. Bộ hồ sơ cần có

| Ký hiệu | Dữ liệu cần chuẩn bị |
|---|---|
| EQ-W / EQ-O / EQ-N | Máy còn bảo hành / hết bảo hành / không có bảo hành; gắn customer/site hợp lệ |
| SITE-A / SITE-B / SITE-U | Site được chi nhánh A/B phục vụ / site chưa có routing |
| POLICY | Một policy đã publish và một bản draft; các lịch YEARS, UNLIMITED, WARRANTY_END |
| WO-A / WO-B | WO ở chi nhánh A/B; trạng thái phù hợp từng ca; có các biến thể RESOLVED, PARTIALLY_RESOLVED, UNRESOLVED |
| PART-I / PART-D | Part chỉ nhận số nguyên / cho số lẻ; kho A/B; lượng tồn ghi lại trước mỗi ca |
| STOCK-5 | Part có tồn khả dụng 5, minQuantity 5; mọi giao dịch chuẩn bị đi qua API |
| FILES | JPEG/PNG/PDF hợp lệ trong giới hạn hiện hành, file vượt giới hạn, file sai loại; một tệp INTERNAL và một CUSTOMER |
| TIME | Lịch ngày 31/1, ngày 29/2 năm nhuận, ngày hết hạn inclusive và ngày sau hạn; giả lập bằng fixture kiểm thử |

Bộ demo đã có hồ sơ ở nhiều trạng thái; ngày và số tồn thay đổi sau thao tác. Đọc lại dữ liệu thật trước khi chọn ca. Mốc tồn minh họa trong tài liệu không thay thế số dư đầu ca.

## 3. Năm luồng nghiệm thu xuyên suốt

### E2E-01 — Bàn giao tại cửa hàng → sửa trong bảo hành → khách xác nhận (P0)

Tiền đề: SM-A, TECH-A, CA-A; SITE-A và chính sách đã publish; serial mới.

1. SM-A đăng ký máy, chọn STORE, customer/site, serial và ngày bàn giao; xem preview chính sách rồi hoàn tất.
2. Ghi ID registration/equipment/warranty/plan; mở lại để xác nhận chỉ có một bộ hồ sơ. Không có yêu cầu khách ký giả cho hình thức STORE.
3. CA-A xem máy và gửi yêu cầu. SM-A tiếp nhận, kiểm tra thời hạn và đánh giá sự cố có được bảo hành; quyết định xử lý đúng kết luận.
4. Khi yêu cầu được chấp nhận, tạo một WO, xếp lịch và phân công TECH-A. Kiểm tra cùng chi nhánh, đúng địa điểm công việc.
5. TECH-A nhận việc → di chuyển nếu cần → bắt đầu → checklist/nhật ký → báo cáo RESOLVED với tóm tắt công khai → hoàn tất.
6. Đợi event hội tụ trong thời gian đã thống nhất cho lượt chạy (mặc định chờ tối đa 60 giây trên local, sau đó điều tra, không coi là SLA sản phẩm). SR phải RESOLVED; chưa được tự CLOSED.
7. CA-A đọc kết quả/tệp được công bố rồi xác nhận. SR CLOSED; WO COMPLETED; dossier/history ghi đúng nguồn và tác giả.

Bằng chứng: ID và ảnh/response từng bước, timeline SR/WO, nội dung khách thực sự thấy. Kiểm tra CA-B, SM-B không đọc được ca ngoài phạm vi. Liên quan: AS-01, SR-01–04, WO-01–06, HS-01–03.

### E2E-02 — Bàn giao tại cơ sở khách, từ chối rồi xác nhận phiên bản mới (P0)

1. SM-A tạo CUSTOMER_SITE, nhập ngày bàn giao, ngày lắp đặt/vận hành nếu đã xảy ra, điều khoản và hạn xác nhận; gửi CA-A.
2. Trước xác nhận: máy chưa ACTIVE, chưa áp bảo hành/lịch bảo trì; thử đường API riêng cũng không được bỏ qua cổng xác nhận.
3. CA-A đọc snapshot và từ chối có lý do. SM-A chỉnh nội dung/ngày, xem lại policy preview và gửi bản mới.
4. Mở lại liên kết bản cũ: không thể xác nhận; nội dung cũ và lý do từ chối vẫn truy vết được.
5. CA-A xác nhận bản mới. Ngày bảo hành/lịch lấy ngày bàn giao đã duyệt, không lấy ngày bấm xác nhận.
6. Kiểm tra provisioning bảo trì: đang chờ phải hiển thị riêng; khi event xử lý xong chỉ có một nhóm Plan. Gửi lặp xác nhận/replay không tạo trùng.

Liên quan: AS-02–05, MP-03–05, MT-01; kiểm riêng Customer User không được quyết định thay Customer Admin.

### E2E-03 — Ngoài bảo hành, dự toán, phụ tùng và đối soát (P0)

1. CA-A gửi yêu cầu cho EQ-O. SM-A kiểm tra/đánh giá bảo hành, lập dự toán có nhân công và vật tư, kiểm tra tổng rồi gửi.
2. CA-A từ chối bản 1; SM-A tạo bản 2; CA-A duyệt đúng bản 2. Bản 1 giữ nguyên; không thể duyệt nhầm bản cũ.
3. Tạo WO và phân công TECH-A. INV-A xuất 2 đơn vị PART-I từ kho A cho WO qua reservation.
4. TECH-A xử lý, ghi kết quả và hoàn tất báo cáo khi không còn reservation HELD. Không ép xác nhận sử dụng trước báo cáo nếu contract yêu cầu sau báo cáo.
5. INV-A trả 1 đơn vị còn thừa về đúng kho. Người có quyền xác nhận dùng 1 đơn vị cho lần sửa, ghi lý do thay và xử lý linh kiện cũ.
6. Đối chiếu: đã xuất 2 = đã trả 1 + xác nhận dùng 1 + chưa đối soát 0. So với số dư đầu, tồn giảm đúng 1 nếu hàng trả đạt điều kiện khả dụng; ledger giữ mọi giao dịch.
7. CA-A xem kết quả công bố và lịch sử phụ tùng máy, rồi xác nhận SR. Không đưa giá vốn/ghi chú nội bộ ra customer.

Nếu thực tế phát sinh vượt phạm vi dự toán đã duyệt, ghi GAP quy tắc chấp thuận phát sinh tại mục 8; không coi bước nhập báo cáo là khách đã đồng ý thêm chi phí.

### E2E-04 — Bảo trì có thời hạn, WO bị hủy và yêu cầu thay thế (P0)

1. Tạo Plan có ngày neo và hạn kết thúc xác định từ policy; kiểm tra preview và dữ liệu Plan.
2. Chạy scheduler trong fixture đúng hạn: sinh một Task, event tạo một WO đúng chi nhánh site. Chạy lại không sinh trùng.
3. SM-A hủy WO theo quyền; Task giữ lịch sử và được xử lý theo trạng thái contract. Yêu cầu WO thay thế với requestId ổn định.
4. Gửi lặp cùng requestId; chỉ một WO thay thế được liên kết, ID khác WO đã hủy. Hoàn tất WO thay thế và đối chiếu Task/history.
5. Chạy scheduler tại ngày cuối và ngày sau hạn: kỳ hợp lệ trong hạn được xử lý; sau hạn Plan ACTIVE chuyển INACTIVE một lần, không tạo kỳ mới; WO/Task cũ vẫn còn.

Liên quan: MT-01–07. Lịch MONTH/YEAR giữ ngày neo; hoàn tất muộn không tự dời các kỳ sau.

### E2E-05 — Tenant Admin phân bổ hồ sơ và kiểm tra phạm vi chi nhánh (P0)

1. TA gán chi nhánh chính ACTIVE cho nhân viên và kỹ thuật viên; tạo site có routing A, site có routing B, site chưa routing.
2. Khách gửi yêu cầu tại từng site; ca A/B được định tuyến đúng; ca chưa phân bổ vào hàng chờ admin.
3. TA mở Phân bổ dịch vụ, gán ca chưa phân bổ có lý do và kiểm tra version/expectedBranchId. Nếu có WO cũ từ SR, phân bổ SR nguồn trước rồi WO phù hợp.
4. SM-A xử lý ca A và phân công TECH-A. Thử TECH-B phải bị từ chối. SM-B thử URL và API ca A phải bị chặn.
5. Đổi routing site từ A sang B: ca mới theo B; ca A đã có không tự chuyển. TA vẫn xem tổng; CA-A vẫn chỉ xem dữ liệu customer của mình.
6. INV-A chỉ giao dịch kho A; thông báo và báo cáo dùng cùng phạm vi. Tài khoản không có chi nhánh chính hợp lệ nhận hướng dẫn/lỗi rõ ràng.

## 4. Ma trận chức năng và tình huống lỗi

Mỗi dòng cần ghi trạng thái/bằng chứng trong bảng kết quả mục 9. Không đánh dấu cả nhóm PASS chỉ vì một ca đại diện đạt.

### 4.1. Identity, tenant và tổ chức

| ID / mức | Vai trò, tiền đề | Thao tác | Kết quả mong đợi |
|---|---|---|---|
| ID-01 P0 | Tất cả tài khoản mục 2 | Đăng nhập đúng tenant → xem danh tính/menu → logout → Back và gọi API cũ | Đúng người/phạm vi; không tiếp tục thao tác bằng phiên đã logout; UI không lộ dữ liệu cache của người trước |
| ID-02 P0 | Tài khoản hợp lệ | Sai mật khẩu, sai tenant, thiếu token, token không hợp lệ | Bị từ chối theo contract; không tạo phiên; không lộ secret hoặc thông tin nội bộ |
| ID-03 P0 | Phiên đang dùng | Làm access token hết hạn → nhiều GET đồng thời → refresh thất bại/refresh hết hạn | Refresh được điều phối; refresh thất bại yêu cầu login; không lặp vô hạn hoặc tự lặp POST gây ghi trùng |
| ID-04 P0 | TA, user thử nghiệm | Mời → kích hoạt → dùng lại link; đổi role/status → người dùng tải lại và gọi API | Link một lần theo contract; quyền/status được áp lại theo cơ chế hiện hành; không cấp thêm quyền qua UI |
| ID-05 P0 | TA, user nhiều role | Ghép các role hợp lệ → thử thao tác không có permission; sửa role qua body trái quyền | Quyền theo catalog; nhiều role không tự bỏ scope chi nhánh; không tự nâng quyền |
| ID-06 P0 | PA, tenant mới riêng | Tạo/xem/cập nhật tenant theo API → mời admin → thử TA gọi API platform | Quyền nền tảng đúng; TA không quản trị tenant khác; trạng thái và lịch sử lưu đúng |
| OR-01 P1 | TA/SM đúng quyền | Tạo customer/site/location/contact → sửa → tải lại → tra cứu tên/mã | Đúng quan hệ, dữ liệu được lưu; branch nhà cung cấp phân biệt rõ với site khách |
| OR-02 P0 | TA và CA-A | Liên kết user với customer A → thử liên kết đối tượng tenant khác → CA-A đọc customer B | Tham chiếu sai tenant/customer bị chặn; không ghi quan hệ một phần trái phép |
| OR-03 P1 | TA, chi nhánh có ca mở | Thử ngừng chi nhánh → xử lý ca mở theo điều kiện API → kiểm tra nhân viên | Không làm ca mở mất chủ quản; nhân viên thuộc chi nhánh không hoạt động bị chặn vận hành theo ADR 0022 |
| OR-04 P1 | TA | Tạo mã trùng, thiếu field bắt buộc, chuỗi quá dài; gửi hai cập nhật cạnh tranh | Validation cụ thể; không có bản ghi rác; phát hiện xung đột ở thao tác có version, không báo lưu thành công giả |

### 4.2. Chi nhánh, phân quyền và dữ liệu riêng tư

| ID / mức | Vai trò, tiền đề | Thao tác | Kết quả mong đợi |
|---|---|---|---|
| BR-01 P1 | SM-A, INV-A | Đăng nhập → mở dashboard/SR/kho → đọc phạm vi | Hiểu chi nhánh đang làm việc; UI giải thích khách/máy/Plan dùng chung tenant, ca dịch vụ/kho chịu scope chi nhánh |
| BR-02 P0 | SM-A, SM-B, TA | Lấy ID SR/WO A → SM-B gọi list/detail/mutation/estimate/report/attachment → TA đọc | B chặn tài nguyên A; TA đọc theo quyền toàn tenant, không tự có mọi quyền ghi nghiệp vụ |
| BR-03 P0 | Staff chưa có chi nhánh; Organization tạm lỗi trên test | Gọi API nghiệp vụ trong hai tình huống | Thiếu chi nhánh hợp lệ 403; nguồn scope lỗi 503; không fallback thành toàn tenant |
| BR-04 P1 | TA, ca chưa phân bổ | Mở menu Phân bổ dịch vụ → lọc chưa phân bổ/A/B → gán có lý do → hai admin gán cạnh tranh | Có đường vào UI; danh sách đúng; không ghi đè quyết định khác bằng expectedBranchId cũ |
| BR-05 P0 | TA, SITE-A | Đổi routing A→B → gửi SR mới → đọc ca cũ | Mới theo B, cũ giữ A; không viết lại lịch sử hay bảo hành |
| BR-06 P0 | SM-A, TECH-A/B | Phân công cùng chi nhánh → thử khác chi nhánh; sửa ID ở request | Server kiểm tra cùng chi nhánh, không chỉ lọc dropdown |
| SEC-01 P0 | MP và TENANT-X | Thay ID trong read/write/list filter/download/lookup operation bằng ID tenant kia | Không lộ dữ liệu/metadata/count/link tệp, không ghi chéo tenant; kiểm cả endpoint nội bộ qua đường truy cập không được phép |
| SEC-02 P0 | CA-A, CA-B, CU-A | Đọc máy/SR/estimate/handover/history của customer khác; gọi route staff | Chặn theo customer/role; biết ID hoặc QR không cấp quyền |
| SEC-03 P0 | CA-A, hồ sơ có INTERNAL và CUSTOMER | List/detail/count/comment/file và notification → đo dữ liệu trả về | Không có nội dung nội bộ ngay cả trong JSON/metadata/count; tệp công bố đúng phạm vi |
| SEC-04 P0 | Hai account, GET đang chậm | Logout A/login B trong lúc request A đang chạy; mở lại nháp | Response đến muộn không ghi đè phiên B; nháp/tồn/khóa recovery không lẫn tài khoản/customer/tenant |

### 4.3. Model, chính sách, thiết bị, bảo hành và bàn giao

| ID / mức | Vai trò, tiền đề | Thao tác | Kết quả mong đợi |
|---|---|---|---|
| MP-01 P1 | Người có quyền quản lý Model | Tạo Model và policy draft → sửa → publish → đọc revision cũ | Draft sửa được; bản publish/snapshot đã áp dụng không bị viết lại |
| MP-02 P0 | Policy mới cùng Model | Đổi policy mặc định → xem máy đã bàn giao và máy mới | Máy cũ giữ đúng cam kết; máy mới preview bản được chọn |
| MP-03 P0 | YEARS/UNLIMITED/WARRANTY_END | Preview các lịch → đổi ngày bàn giao/bảo hành → thử WARRANTY_END khi không có bảo hành áp dụng | Tính lại đúng, thiếu điều kiện bị từ chối; kỳ đầu vượt hạn bị chặn trước khi ghi Warranty/Plan |
| MP-04 P0 | Ngày cuối tháng/năm nhuận | Preview YEARS và hạn inclusive → đối chiếu Plan đã tạo | Quy tắc ngày nhất quán; không lệch do UTC; term được lưu cố định theo hồ sơ đã xác nhận |
| MP-05 P0 | Registration có policy snapshot | Publish bản mới giữa lúc gửi bàn giao và khách accept | Khách nhận đúng bản đã xem; bản mới không âm thầm đổi điều khoản đã gửi |
| AS-01 P0 | SM-A, serial mới | STORE → hoàn tất → reload/retry đúng cơ chế có sẵn | Một hồ sơ/máy; không tạo chữ ký khách; site của máy vẫn là site khách; không yêu cầu ngày lắp đặt/vận hành cho STORE |
| AS-02 P0 | SM-A, CA-A/CU-A | CUSTOMER_SITE → gửi → thử kích hoạt/áp policy trước accept → CU-A thử quyết định | Trước accept chưa kích hoạt/áp policy; Customer Admin đúng scope mới quyết định; server chặn bypass |
| AS-03 P0 | Handover đã gửi | CA-A accept hai lần/đồng thời → theo dõi provisioning | Chỉ một hiệu lực; snapshot/version đúng; Warranty/Plan không trùng; chờ đồng bộ được hiển thị rõ |
| AS-04 P0 | Handover đã gửi | Reject/cancel/expire từng hồ sơ riêng → sửa gửi lại → thử accept bản cũ | Lý do và bản cũ giữ lại; bản cũ không còn được chấp nhận; không tự ACTIVE khi quá hạn |
| AS-05 P0 | Handover accepted, broker tạm dừng trên test | Khôi phục broker → resume registration → replay event cùng receipt | Hoàn tất provisioning một lần; không đổi ngày khách xác nhận; không nhân đôi lịch |
| AS-06 P1 | Wizard CREATE/KEEP/NONE hoặc policy tương ứng hiện có | Lưu nháp → rời/quay lại; KEEP hồ sơ sẵn; NONE có lý do → submit | Resume đúng hồ sơ; KEEP không thay lịch cũ; NONE không tạo Warranty/Plan ngoài ý muốn |
| AS-07 P0 | Serial/mã trùng và tham chiếu khác scope | Tạo máy trùng theo unique constraint; customer/site/location không khớp → lưu | Bị chặn rõ; không gắn máy nhầm khách hoặc tenant; chưa tạo hồ sơ liên quan khi validation thất bại |
| AS-08 P1 | EQ-W/O/N, warranty ACTIVE/VOID | Xem trước/ngay/sau ngày kết thúc → đánh giá sự cố | Ngày kết thúc inclusive; VOID không cấp bảo hành; hết hạn/không có phân biệt; còn hạn không tự đồng nghĩa sự cố được miễn phí |
| AS-09 P0 | Máy có QR | Tạo/in lại QR theo quyền → mở QR chưa login và bằng customer khác | Nhận dạng đúng máy; quyền vẫn được kiểm tra; không lộ dossier chỉ từ mã QR |
| AS-10 P1 | WO cũ tại site A, máy hiện chuyển B | Mở WO cũ, dossier hiện tại và lịch sử máy | Địa điểm công việc cũ và vị trí hiện tại có nhãn rõ; không điều phối theo vị trí mới của máy mà hiểu nhầm ca cũ |

### 4.4. Service Request và dự toán

| ID / mức | Vai trò, tiền đề | Thao tác | Kết quả mong đợi |
|---|---|---|---|
| SR-01 P0 | CA-A/SM-A, máy hợp lệ | Tạo SR → list/detail/history → tạo với máy RETIRED hoặc sai customer | SR hợp lệ có mã và trạng thái NEW; đối tượng không hợp lệ bị chặn; chi nhánh từ site |
| SR-02 P1 | SR NEW | Review → request-info có lý do → customer trả lời | NEW→REVIEWING→AWAITING_INFO→REVIEWING; khách thấy yêu cầu bổ sung và lịch sử người/thời điểm |
| SR-03 P0 | SR REVIEWING | Kiểm tra bảo hành → đánh giá phạm vi sự cố → accept theo kết luận | Lưu checker/time/nguồn và lý do; không bỏ qua dự toán cần duyệt bằng việc chỉ thấy máy còn hạn |
| SR-04 P0 | Một SR ACCEPTED | Hai người tạo WO đồng thời → đợi event | Tối đa một WO chưa kết thúc cho SR; SR PROCESSING khi nhận event; không trùng lịch sử |
| SR-05 P1 | Hồ sơ riêng mỗi biến thể | Reject thiếu/có lý do; customer cancel ở trạng thái cho phép; cancel trực tiếp SR PROCESSING | Điều kiện/lý do đúng; PROCESSING yêu cầu hủy WO trước, không bỏ lại WO đang chạy |
| SR-06 P0 | WO kết thúc với ba result | RESOLVED/PARTIALLY_RESOLVED/UNRESOLVED → mở SR và customer projection | Hai kết quả đầu dẫn SR RESOLVED để chờ khách; UNRESOLVED về ACCEPTED theo contract; không tự coi máy đã hoạt động tốt |
| SR-07 P0 | SR RESOLVED; có biến thể assessmentRequired=true và legacy | Khách confirm hoặc reopen có lý do trên các hồ sơ riêng → thử đóng lặp | Confirm→CLOSED; reopen có assessmentRequired→REVIEWING và xóa assessment cũ để đánh giá lại; legacy→ACCEPTED; lịch sử đúng, không đóng tự động hoặc sửa hồ sơ terminal |
| SR-08 P1 | Staff, customer, cùng ca | Ghi INTERNAL/CUSTOMER comment → đổi account → lọc lịch sử | Khách chỉ thấy/ghi phần được phép; ghi chú không làm thay đổi trạng thái ngoài quy tắc bổ sung thông tin |
| CE-01 P0 | SR đủ điều kiện, SM-A | Tạo draft nhiều dòng → sửa số lượng/giá → gửi | Tổng tính ở server, độ chính xác đúng; validate âm/thiếu/số sai; sent không sửa trực tiếp |
| CE-02 P0 | CA-A, estimate SENT | Approve/reject đúng revision; CA-B và staff trái quyền thử respond | Chỉ người có quyền trong đúng customer chấp thuận; SR chuyển đúng; lưu người/thời điểm/lý do |
| CE-03 P0 | Bản 1 SENT, cửa sổ khách đang mở | SM revise thành bản 2 → khách duyệt bản 1 → mở lại bản 2 | Không chấp thuận bản đã bị thay thế; lịch sử bản 1 giữ nguyên; UI yêu cầu xem lại đúng bản |
| CE-04 P0 | Estimate hết hạn; estimate tổng 0 | Duyệt bản hết hạn; gửi/duyệt tổng 0 ngoài bảo hành | Hết hạn bị chặn; tổng 0 vẫn qua chấp thuận, không tự bỏ bước khách |
| CE-05 P0 | POST thành công nhưng response bị mất trên test | Gửi quyết định → mất response → reload/đối soát | UI không báo thất bại chắc chắn hoặc tự gửi mới; giữ cảnh báo chưa rõ và đọc kết quả. Nếu chưa có key/lookup bền vững, ghi GAP, không chứng nhận chống trùng đầy đủ |

### 4.5. Work Order, kỹ thuật viên và báo cáo

| ID / mức | Vai trò, tiền đề | Thao tác | Kết quả mong đợi |
|---|---|---|---|
| WO-01 P0 | SM-A, SR ACCEPTED hoặc Maintenance Task | Tạo WO; thử không có nguồn/cả hai nguồn/sai trạng thái SR | Chỉ một nguồn hợp lệ; validate tham chiếu/tenant/branch; dữ liệu khách/máy/địa điểm có thể truy vết |
| WO-02 P0 | TECH-A AVAILABLE/BUSY và OFF_DUTY/INACTIVE | Phân công theo từng trạng thái → reassign khi được phép | OFF_DUTY/INACTIVE bị chặn; BUSY không mặc định là lịch trống; lịch sử người cũ/new và version đúng |
| WO-03 P0 | TECH-A được phân công, TECH-A2 không được giao | A accept/reject có lý do ở hai ca → A2 thử thao tác cùng ID | Đúng người mới thực thi; từ chối trả về CREATED; trạng thái assignment/WO đồng bộ |
| WO-04 P1 | TECH-A đã accept | Travel/start → hold thiếu/có lý do → resume → thử thao tác sai thứ tự | Chuyển trạng thái đúng; startedAt không bị ghi lại khi resume; nút/lỗi giải thích điều kiện |
| WO-05 P0 | Checklist/report draft | Chuyển tab/quay lại → lưu checklist → hai người dùng version cũ → submit report thiếu field | Nháp được bảo vệ theo cơ chế UI; xung đột không ghi đè im lặng; thiếu dữ liệu bắt buộc không complete |
| WO-06 P0 | WO IN_PROGRESS, không HELD | Nộp report từng result → complete → reload → gửi lặp | Một report và một lần hoàn tất; summary công khai đúng; WO terminal không bị sửa bằng action cũ |
| WO-07 P0 | SM, hai WO từ SR riêng | Cancel với cancelServiceRequest=false / true → đợi event | SR về ACCEPTED / CANCELLED tương ứng theo contract; assignment được kết thúc; lý do giữ lại |
| WO-08 P0 | Hai WO của cùng TECH-A | Kết thúc một assignment trong khi còn assignment ACCEPTED → kết thúc hết; thử OFF_DUTY | BUSY/AVAILABLE cập nhật theo assignment thực; không tự ghi đè OFF_DUTY/INACTIVE |
| WO-09 P1 | Hai cửa sổ cùng WO | Cửa sổ A đổi trạng thái → B submit action/expectedVersion cũ | Conflict rõ, tải lại trạng thái; không báo thành công cho thao tác bị từ chối |

### 4.6. Kho, reservation, vật tư sử dụng và LowStock

| ID / mức | Vai trò, tiền đề | Thao tác | Kết quả mong đợi |
|---|---|---|---|
| IN-01 P1 | INV-A, TA | Tạo Part/kho, SKU trùng, kho sai branch; TA thử ghi kho | Catalog validate; scope branch đúng; TA không tự có quyền ghi chỉ vì là admin |
| IN-02 P0 | PART-I/PART-D | Nhập số nguyên, số lẻ hợp lệ, quá precision, 0/âm; thử 1000 và dấu thập phân | Không biến 1000 thành 1; phần nguyên không nhận lẻ; phần lẻ bảo toàn precision; lỗi không ghi ledger |
| IN-03 P0 | INV-A, tồn đầu đã ghi | Receive có chứng từ/note → replay cùng key/body → cùng key khác body | Một giao dịch, đúng số dư trước/sau; key khác payload bị chặn; không nhập hai lần |
| IN-04 P0 | WO đang xử lý, INV-A | Issue đủ tồn → xem usage/ledger/reservation → thử WO terminal/kho B | Chỉ xuất khi WO và scope hợp lệ; đúng kho/WO; reservation được settle hoặc hiện đang chờ, không giấu trạng thái |
| IN-05 P0 | Tồn 5, hai Issue mỗi lần 4 | Đồng bộ hai request để chạy cạnh tranh → đọc lại stock/ledger | Không âm tồn; tối đa một lần xuất 4 thành công; bên còn lại nhận lỗi; số dư và ledger khớp |
| IN-06 P0 | Test harness dừng giữa hold và commit/settle | Issue giữ HELD → đồng thời complete/cancel WO → giải quyết giao dịch | WO không complete/cancel khi HELD; giải quyết xong mới tiếp tục; lỗi chỉ đúng nguyên nhân kho |
| IN-07 P0 | Mất response ISSUE sau commit | Lookup cùng key → retry cùng intent → reload | Một lần trừ tồn; proof COMMITTED trả kết quả cũ; retry chỉ hoàn tất settlement, không phát sinh Issue mới |
| IN-08 P0 | Operation chưa commit và đã commit, hai fixture | Abort operation chưa commit → retry abort; thử abort COMMITTED | Chưa commit giải phóng hold an toàn; đã commit không hoàn tồn bằng abort, phải RETURN; không hết hạn hold âm thầm |
| IN-09 P0 | Đã issue 2 | Return 1 về đúng kho → thử trả sang kho khác/trả vượt còn lại | Đúng nguồn xuất; không trả quá outstanding; ledger/usage khớp; không sửa giao dịch gốc |
| IN-10 P0 | WO terminal hoặc Part/kho INACTIVE, còn hàng chưa trả | Return hợp lệ theo scope hiện tại → thử Issue mới | Return vẫn theo quy tắc đã chốt; Issue mới không lợi dụng ngoại lệ Return |
| IN-11 P0 | Hàng trả hỏng/cần kiểm tra | Return condition phù hợp → đọc khả dụng/cách ly → inspect theo quyền | Hàng cách ly không trở thành tồn cấp được; chuyển trạng thái kiểm tra có audit, không cộng hai lần |
| IN-12 P0 | Report đã có, vật tư chưa đối soát | Confirm-use với lý do thay/xử lý linh kiện cũ → vượt lượng còn lại → đính chính theo quyền | Chỉ lượng hợp lệ được xác nhận; phần chưa trả không tự coi đã dùng; correction giữ bản gốc và nguồn |
| IN-13 P0 | Ledger có giao dịch nguồn | Adjust tăng/giảm có reason/note; CORRECTION thiếu/sai nguồn → đối chiếu số dư | Correction phải trỏ nguồn hợp lệ; không âm/ghi đè ledger; lịch sử trước/sau/actor/chứng từ đầy đủ |
| IN-14 P1 | STOCK-5, broker hoạt động | Tồn 5→4→3→5→4; lần khác đổi minQuantity | Ở 5 không low khi min=5; dưới ngưỡng một cảnh báo/đợt; phục hồi re-arm; đổi ngưỡng đánh giá lại đúng |
| IN-15 P0 | Key tạo bởi user A, sau đó đổi scope/user | User không còn quyền lookup/retry/abort key cũ | Quyền hiện tại vẫn được kiểm tra; biết key không đọc/ghi kho ngoài scope |

### 4.7. Bảo trì định kỳ

| ID / mức | Vai trò, tiền đề | Thao tác | Kết quả mong đợi |
|---|---|---|---|
| MT-01 P0 | Plan ACTIVE đến hạn | Chạy scheduler hai lần/worker cạnh tranh → replay Task event | Một Task/kỳ và một WO nguồn; lỗi broker có thể khôi phục; WO nhận routing site đúng |
| MT-02 P0 | Ngày neo 31/1; lịch năm neo 29/2 | Sinh các kỳ liên tiếp, hoàn tất muộn | MONTH: 31/1→28/2 (năm thường)→31/3; YEAR clamp năm không nhuận rồi trở lại ngày neo khi hợp lệ; hoàn tất muộn không dời lịch |
| MT-03 P1 | Plan ACTIVE có Task đã sinh | Sửa chu kỳ/ngày, pause/resume, inactive → thử bật lại | Chỉ ảnh hưởng kỳ chưa sinh theo contract; Task/WO cũ giữ nguyên; INACTIVE cuối, không bật lại |
| MT-04 P0 | Task liên kết WO | Complete WO RESOLVED/PARTIALLY_RESOLVED/UNRESOLVED ở fixture riêng | Task/result cập nhật theo contract; UNRESOLVED làm FAILED và không cập nhật lastCompletedAt như lần bảo trì thành công |
| MT-05 P0 | WO maintenance đã hủy | Request replacement cùng requestId hai lần và cạnh tranh | Một WO mới; không mất WO cũ/history; quyền SM và liên kết Task đúng |
| MT-06 P0 | Plan có endDate, PAUSED/ACTIVE | Scheduler tại/sau hạn → resume sau hạn → sửa chu kỳ → list/history | Hạn inclusive; ACTIVE hết hạn thành INACTIVE một lần; không resume/gia hạn ngầm; không hiển thị nextDue kỹ thuật ngoài hạn như kỳ phục vụ còn hiệu lực |
| MT-07 P1 | Plan legacy không có term mới; hết hạn qua downtime | Đọc legacy; scheduler sau downtime trên plan hữu hạn | Legacy không bị tự áp hạn mới; gói hết hạn không sinh bù kỳ mới; Task/WO đã có vẫn xử lý được |
| MT-08 P1 | POST Plan trực tiếp bị mất response | Submit → reload → kiểm tra phương án đối soát trước khi gửi lại | Không khẳng định chống trùng nếu chưa có idempotency/lookup cho POST trực tiếp; ghi GAP và không tự tạo Plan thứ hai |

### 4.8. Tệp, hồ sơ thiết bị, thông báo và báo cáo

| ID / mức | Vai trò, tiền đề | Thao tác | Kết quả mong đợi |
|---|---|---|---|
| FL-01 P0 | Staff có quyền, FILES | Prepare→PUT→finalize→reload; thử sai loại/quá dung lượng theo contract | Chỉ finalized xuất hiện; lỗi không báo tải xong; API bearer không gửi tới storage URL |
| FL-02 P0 | PUT/finalize bị lỗi hoặc mất response | Dừng mạng từng giai đoạn → đối soát/retry đúng intent | Không tạo bản đính kèm trùng; phân biệt bytes đã gửi với hồ sơ đã finalize; cleanup thất bại hiện rõ |
| FL-03 P0 | INTERNAL/CUSTOMER, khách khác scope | Publish theo quyền → download; URL hết hạn → xin URL mới; truy cập ID trái quyền | Khách chỉ thấy phần công bố; API cấp link kiểm quyền; URL hết hạn không dùng được; link signed đã cấp tuân TTL, không mặc định thu hồi tức thì |
| FL-04 P1 | WO chưa/đã complete, report có/không | Upload vào WO/report theo từng trạng thái và vai trò | Đúng loại hồ sơ và quyền; không tạo lại báo cáo để thêm file; Technician không tự công bố phần ngoài quyền |
| HS-01 P1 | Máy có nhiều SR/WO/Task/usage | Mở dossier, timeline, lịch sử tổng và từng nguồn → lọc/phân trang | Đúng máy/serial, có nguồn và liên kết; phạm vi tổng hợp rõ; phân trang không làm hiểu lịch sử đã đầy đủ khi còn trang |
| HS-02 P0 | Máy từng thay/đính chính phụ tùng | Đọc service-parts và WO nguồn bằng staff/customer | Đúng part, lượng xác nhận dùng, lần sửa, lý do và linh kiện cũ; phân biệt issue/return/use/correction; không lộ nội bộ |
| HS-03 P1 | WO PARTIALLY_RESOLVED/UNRESOLVED | Xem đầu hồ sơ và portal | Phân biệt kết thúc công việc, kết quả sửa chữa, tình trạng máy và khách xác nhận; không hiện “đã sửa xong” chung cho mọi completed |
| NT-01 P0 | Hai customer, hai branch, recipient đã bootstrap | Tạo event SR/WO/LowStock → mở inbox/count của từng user | Đúng audience và scope; count từ server; không gửi nội dung ca A tới người không có quyền |
| NT-02 P1 | Nhiều trang thông báo | Lọc unread/read → mark-read hai lần → refresh → mở link cũ | Count/list nhất quán; đọc không đồng nghĩa duyệt hồ sơ; link mở đúng loại tài nguyên và kiểm quyền hiện tại |
| NT-03 P0 | Broker test, event cùng ID và event lỗi | Replay → tạm dừng consumer → khởi động lại | Không nhân đôi hiệu ứng cùng event; retry có thể quan sát; lỗi không bị nuốt thành thành công |
| RP-01 P1 | TA/SM, WO tại biên ngày và chi nhánh khác nhau | Chọn kỳ UTC+7 và branch → so aggregate với dữ liệu nguồn cùng filter | Không đếm từ một trang WO; biên ngày không thiếu/trùng; SM không thấy branch khác |
| RP-02 P1 | Không dữ liệu và API lỗi | Mở dashboard/report → so hai trường hợp → mở hồ sơ từ chỉ số | Empty khác error; không hiện số 0 giả khi nguồn lỗi; chỉ số nói đúng định nghĩa, không suy ra hài lòng từ số completed |

### 4.9. Web UX, Mobile hiện có và độ bền tích hợp

| ID / mức | Vai trò, tiền đề | Thao tác | Kết quả mong đợi |
|---|---|---|---|
| UX-01 P1 | Mỗi role | Danh sách→lọc/tìm/phân trang→chi tiết→Back; refresh URL trực tiếp | Giữ ngữ cảnh theo thiết kế; đúng route/quyền; không rơi về dữ liệu Studio hoặc trang trắng |
| UX-02 P1 | Form report/request/estimate/inventory | Nhập dở → chuyển tab → lỗi server → quay lại; bấm submit nhanh hai lần | Nội dung được giữ theo phạm vi nháp đã hỗ trợ; không báo đã lưu khi chưa lưu; pending khóa thao tác nguy hiểm |
| UX-03 P1 | Loading/empty/401/403/404/409/422/503 | Tạo từng response bằng môi trường kiểm thử → quan sát và retry | Thông báo đúng nguyên nhân; HELD kho không bị gộp thành “hồ sơ vừa thay đổi”; lỗi không xóa form hoặc hiện success |
| UX-04 P2 | Web 1440px và 390px, bàn phím | Tab/Enter/Escape trong form/modal, zoom, chuỗi dài, bảng nhiều dòng | Nhãn/focus/lỗi đọc được, không bị che nút chính; tương phản rõ, không chỉ dùng màu; kiểm responsive Web không phải sửa app mobile |
| MB-01 P0 | Android TECH-A/A2 | Login → danh sách/WO assigned → accept/start/report/complete; A2 thử ID đó | API thật và quyền assigned đúng; không thực thi WO của người khác; đối chiếu kết quả Web |
| MB-02 P0 | Draft checklist/report và action chưa rõ kết quả | Tắt app/mất mạng/restart/đổi tài khoản/đổi assignment → mở lại | Nháp theo user/tenant/WO; phân công cũ chỉ xem lại; không tự resend mutation chưa rõ kết quả |
| MB-03 P0 | Camera/PDF upload | Preview→gửi→đóng app lúc camera/PUT/finalize→khôi phục/hủy | Khôi phục receipt và file theo chức năng hiện có; không trùng attachment, không hiển thị đã finalize khi chưa xác nhận |
| MB-04 P1 | Lịch ngày/tuần/tháng, notification, parts | Chọn ngày→WO→Back; foreground; xem chưa xếp lịch; xem parts và inbox | Giữ filter/ngày; UTC+7; phụ tùng chỉ đọc, chưa trả không tự coi đã dùng; in-app notification không bị mô tả là push khi app đóng |
| MB-05 P2 | Android có dark/light/system | Đổi theme→restart/logout; tăng cỡ chữ→mở hồ sơ/hướng dẫn | Tùy chọn lưu đúng, login áp theme; phiên bản APK thực; không làm mất nháp; UI dùng được ở cỡ chữ lớn |
| SYS-01 P0 | Tám service và broker test | Service ghi thành công nhưng event delivery trễ → restart consumer | Outbox/inbox khôi phục; dữ liệu hội tụ mà không có transaction giả xuyên DB; giữ correlation/source để điều tra |
| SYS-02 P0 | Event WO cũ đến sau event mới | Gửi event sai thứ tự/lặp theo harness hiện có | Không kéo SR/Task/notification projection về trạng thái cũ trái quy tắc; ghi nhận inbox phù hợp |
| SYS-03 P0 | Dependency Organization/Asset/Inventory lỗi ở test | Thực hiện thao tác cần validate nguồn đó → khôi phục → đối soát | Fail rõ và an toàn; không fallback bỏ kiểm tenant/branch/stock; không ghi dở rồi báo thành công |
| SYS-04 P1 | Bộ demo trên DB test riêng | Seed→thực hiện một ca/thay tồn→seed lại | Không tạo trùng user/máy/WO hoặc reset tiến trình/tồn; tên seed không ghi đè nội dung người dùng đã sửa |

## 5. Kiểm tra nhất quán sau mỗi luồng

1. SR, WO, Task có đúng nguồn/ID, tenant/customer/branch và trạng thái; không có hai WO active cùng SR.
2. Mỗi quyết định lưu actor/time/reason theo contract; actor hệ thống không giả thành người dùng. Khi có version, bản đã chấp thuận đọc lại được.
3. Tồn cuối đối chiếu ledger đầu/cuối và từng delta; khả dụng và cách ly tách riêng. Vật tư từng WO đối chiếu xuất/trả/xác nhận dùng/chưa đối soát sau correction.
4. Chỉ dữ liệu CUSTOMER được trả cho khách; kiểm response và tệp thực tế, không chỉ ảnh màn hình.
5. Không còn operation treo không được ghi nhận; nếu còn PENDING_FINALIZE/HELD, có key, nguyên nhân, owner và bước recovery.
6. Notification/report/history phải hội tụ với nghiệp vụ nguồn; không dùng việc đã có thông báo để chứng minh transaction nguồn đúng.

## 6. Thứ tự chạy và phân công đề xuất

| Lượt | Phạm vi | Đầu mối đề xuất | Điều kiện sang lượt sau |
|---|---|---|---|
| 1 | Môi trường, tài khoản, ID/OR/BR/SEC | Nguyên + owner Organization; Hatsady kiểm Web | Login/scope đúng, không rò tenant/customer/branch |
| 2 | E2E-01, E2E-02, MP/AS | Minh; Hatsady UI; Huy phối hợp SR | Bàn giao/policy/registration không trùng, điều khoản đúng |
| 3 | E2E-03, SR/CE/WO/IN | Huy + Khương + Minh | Dự toán, kết quả và tồn kho đối soát được |
| 4 | E2E-04/05, MT/NT/RP/HS/FL | Minh/Huy/Khương theo service; Hatsady toàn luồng | Event hội tụ, lịch sử và dữ liệu công bố đúng |
| 5 | Race, fault injection, SYS; Web UX và Mobile MB | Nguyên phối hợp backend owners; Hatsady Web; owner mobile chạy MB | Có bằng chứng cho ca lỗi; không tự mở rộng/sửa mobile |

Chạy một luồng E2E-01 để kiểm tra stack trước, nhưng chỉ nghiệm thu toàn bộ khi các nhóm quan trọng đều có kết quả. Không chạy song song suite DB có TRUNCATE trên cùng database. Phân công là đề xuất nghiệm thu, chưa có nghĩa thành viên đã nhận việc.

## 7. Bộ tự động hiện có để hỗ trợ

Chỉ chạy sau khi đọc cấu hình của từng suite và trỏ đúng DB test. Các lệnh dưới là hướng dẫn, **chưa chạy trong lượt soạn tài liệu**.

| Nhóm | Lệnh/tài liệu đã có | Phạm vi bằng chứng |
|---|---|---|
| Tĩnh và unit | `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` | Không thay thế nghiệm thu trình duyệt/API/DB |
| Web | `pnpm --filter web test` | Component/transport theo suite, không mặc định là browser thật |
| Chi nhánh | `pnpm test:branch-scope`; [hướng dẫn](branch-service-management.md) | Cần tám DB test/broker riêng và tùy chọn browser theo tài liệu |
| Model/bàn giao | `pnpm test:model-policies`; [policy](model-service-policies-acceptance.md), [bàn giao](equipment-delivery-methods.md) | Bật fixture/browser đúng hướng dẫn; kiểm baseline và flags |
| Asset/Maintenance DB | `pnpm --filter asset-service test:db`, `pnpm --filter maintenance-service test:db` | Xem env test trong từng service; không dùng DB vận hành |
| Seed | `pnpm test:demo-seed`; [hướng dẫn](demo-data.md) | Có reset trên DB test, không chạy cùng suite DB khác |
| Inventory | [Contract](../api/inventory.yaml), [reservation](../api/inventory-reservations.yaml), [accountability](../api/inventory-accountability.yaml) | Chọn suite inventory hiện hành và fixture giao dịch cạnh tranh |
| API thủ công | [Bộ API testing](api/README.md) | Token theo role, lưu request đã che thông tin nhạy cảm |
| Android | [Mobile README](../../apps/mobile/README.md), [stage 4](mobile-stage-4.md), [stage 5](mobile-stage-5.md) | APK/device và API thật; không sửa code mobile để thực hiện kế hoạch này |

Kết quả CI bị billing chặn phải ghi BLOCKED, không ghi PASS. Chạy lại test đúng commit khi có thay đổi ảnh hưởng. Link bằng chứng cũ chỉ tham khảo, không sao chép trạng thái sang lượt này.

## 8. Nhu cầu chưa đủ căn cứ để nghiệm thu như chức năng hoàn chỉnh

[Bàn giao Workshop](../reports/2026-11-08-workshop-ui-handoff.md) là backlog ngày 08/11. PR #68–#70 đã bổ sung một phần policy/bàn giao/chi nhánh; khi chạy phải đánh giá lại từng gap theo code hiện tại. Không mặc định tất cả backlog cũ vẫn thiếu, cũng không đánh dấu hoàn thành chỉ vì đã có mockup.

| Nhu cầu | Cách kiểm tra/ghi nhận |
|---|---|
| Xác nhận thay khách có người đồng ý, kênh, căn cứ, thời điểm | Đối chiếu payload/API/audit thật; nếu chỉ có confirmedBy của nhân viên thì chưa đủ nghiệm thu bằng chứng đồng ý của khách |
| Owner ca, đang chờ ai, từ bao giờ và bước tiếp theo có cấu trúc | So field lưu/đọc sau reload; nội dung chỉ tồn tại trong Studio không được tính là đã triển khai |
| Dự toán phát sinh và đối chiếu phạm vi đã duyệt–đã làm | Cần quy tắc revision/approval thực; không coi việc ghi thêm phụ tùng là đồng ý tính thêm tiền |
| Khả dụng theo slot, lịch khách xác nhận | Phân biệt lịch scheduledStart/End và trạng thái AVAILABLE/BUSY với chống chồng lịch/chấp thuận lịch hẹn |
| Idempotency/lookup bền vững cho tạo SR và Plan trực tiếp | Gây mất response sau commit; nếu không tra cứu được kết quả thì ghi GAP, không cho gửi lại tùy tiện |
| Quên mật khẩu, gửi lại lời mời, thư viện hồ sơ đầy đủ, chỉ số hài lòng | Chỉ nghiệm thu khi API/nguồn dữ liệu thực tồn tại; report đếm WO không chứng minh đo hài lòng |
| Tất cả hành trình tại `/design/workshop` | Route DEV dùng dữ liệu mẫu; không dùng để PASS case nghiệp vụ thực hoặc xác nhận backend đã có |

Gap nào ảnh hưởng P0 phải được xử lý hoặc loại khỏi phạm vi nghiệm thu bằng quyết định rõ ràng; không che bằng ghi PASS cho giao diện.

## 9. Mẫu ghi kết quả và điều kiện nghiệm thu

Mỗi lần chạy tạo bản ghi riêng, giữ kế hoạch này làm nguồn case ổn định. Với case nhiều biến thể, thêm hậu tố như `IN-02-a`, `IN-02-b`.

```text
Run ID:
Ngày/giờ + múi giờ:
Người chạy / môi trường / thiết bị:
Commit / nhánh / diff local:
Service migrations và phiên bản build:
Case ID / biến thể:
Role / tenant / branch / customer (không ghi password/token):
Entity ID, operation key hoặc event ID dùng đối soát:
Tiền đề và số dư/trạng thái trước:
Bước thực tế:
Kỳ vọng:
Kết quả thực tế / HTTP code / business error code:
PASS | FAIL | BLOCKED | NOT RUN | GAP:
Ảnh/video/log/request-response đã che thông tin nhạy cảm:
Issue / mức ảnh hưởng / owner / bước tái hiện:
Dữ liệu còn treo, cách dọn hoặc khôi phục bằng API:
Retest commit / ngày / kết quả:
```

| Case ID | Trạng thái | Kết quả thực tế | Bằng chứng | Owner / issue | Retest |
|---|---|---|---|---|---|
| E2E-01 | NOT RUN | | | | |
| E2E-02 | NOT RUN | | | | |
| E2E-03 | NOT RUN | | | | |
| E2E-04 | NOT RUN | | | | |
| E2E-05 | NOT RUN | | | | |

Thêm một dòng cho từng case trong mục 4 vào báo cáo chạy, không chỉ năm luồng trên.

Điều kiện nghiệm thu đề xuất:

- Năm luồng E2E và mọi ca P0 trong phạm vi đã thống nhất đều PASS, có bằng chứng trên cùng build; không còn rò dữ liệu, sai tồn, nhân đôi hồ sơ hoặc chấp thuận sai phiên bản.
- P1 có kết quả rõ; lỗi còn mở phải có ảnh hưởng, owner và kế hoạch xử lý được nhóm chấp nhận. P2 có thể đưa backlog khi không cản luồng chính.
- Không tính BLOCKED/NOT RUN/GAP là đạt. Báo cáo số ca theo từng trạng thái và liệt kê phần chưa được kiểm tra.
- Giữ riêng kết quả Web/API/Android; không suy ra một nền tảng đạt từ nền tảng khác. Không tuyên bố toàn dự án đã hoàn thiện từ một buổi demo.

## 10. Nguồn đối chiếu

- [State machines](../architecture/state-machines.md), [events](../architecture/events.md), [quy ước API](../api/conventions.md).
- [ADR 0020 — thời hạn bảo trì](../decisions/0020-maintenance-terms.md), [ADR 0021 — bàn giao](../decisions/0021-registration-delivery-methods.md), [ADR 0022 — chi nhánh](../decisions/0022-branch-service-management.md).
- [Identity](../api/identity.yaml), [Organization](../api/organization.yaml), [Asset](../api/asset.yaml), [Service Request](../api/service-request.yaml), [Work Order](../api/workorder.yaml), [Maintenance](../api/maintenance.yaml), [Notification](../api/notification.yaml).
- [Kịch bản M2 thay thế WO](m2-maintenance-replacement-test-cases.md), [M3 Web](m3-test-cases.md), [hướng dẫn khách](../user-guide/customer.md), [hướng dẫn kho](../user-guide/inventory-staff.md).
