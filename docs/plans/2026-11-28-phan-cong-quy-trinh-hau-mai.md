# PBL6 · Phân công triển khai quy trình hậu mãi cho bốn thành viên

Ngày 28/11/2026 · Bản kế hoạch để nhóm triển khai và nghiệm thu. Các mục có ô đánh dấu là công việc cần làm.

## 1. Chia theo chức năng

| Người phụ trách | Chức năng trọn luồng | Khi demo, người này phải làm được gì? |
|---|---|---|
| **Nguyên** | **Doanh nghiệp bán hàng, hợp đồng và tài khoản** | Tạo doanh nghiệp sử dụng PBL6, ghi hợp đồng, mời quản trị viên. Đăng nhập bằng Tenant Admin để cấp tài khoản cho đúng đại diện khách hàng. |
| **Huy** | **Tiếp nhận thiết bị từ Excel, bảo hành và bàn giao** | Nhập file nhiều khách, đối chiếu dữ liệu, ghi đúng quyền lợi theo serial. Xuất phiếu, xử lý khách thiếu tài khoản và theo dõi đến khi bàn giao được xác nhận. |
| **Khương** | **Bảo trì và thực hiện dịch vụ trên web/mobile** | Từ cam kết trong file, lập kế hoạch bảo trì, sinh kỳ, điều phối và hoàn tất lệnh. Cùng một kỹ thuật viên có thể tiếp tục công việc khi đổi giữa hai nền tảng. |
| **Minh** | **Kho phụ tùng, điều chuyển và cấp/trả theo lệnh** | Tenant Admin tạo kho và gán thủ kho. Thủ kho nhập Excel, chuyển hàng, cấp cho kỹ thuật viên, nhận trả và đối soát được từng số lượng. |

Mỗi người sở hữu cả dữ liệu, API, giao diện, migration, dữ liệu mẫu, hướng dẫn sử dụng và kiểm thử trong chức năng của mình. Người phụ trách cũng sửa các màn hình quản trị thuộc chức năng đó. Ví dụ **Minh làm cả giao diện Tenant Admin tạo kho**. Việc một màn hình dành cho admin không chuyển đầu việc sang Nguyên. Quyền review theo thư mục của repository vẫn áp dụng khi mở PR.

### Quy trình mà cả bốn phần phải ghép được

1. Platform Admin mở tenant cho doanh nghiệp bán thiết bị, ghi nhận hợp đồng và mời Tenant Admin đầu tiên. Tenant Admin chuẩn bị chi nhánh, người dùng và kho.
2. Bên bán gửi file tổng hợp những máy đã giao hoặc đang chờ nghiệm thu. Hậu mãi kiểm tra file, ghi nhận khách, địa điểm, thiết bị và các cam kết đã bán.
3. Mỗi máy đi theo căn cứ bàn giao thực tế. Máy có đủ căn cứ theo hình thức đã chọn được hoàn tất. Máy cần khách xác nhận được giữ chờ. Nếu thiếu tài khoản, Tenant Admin nhận yêu cầu mời đại diện khách.
4. Đội dịch vụ có thể chuẩn bị lịch bảo trì trong khi chờ bàn giao. Khi đủ điều kiện, thiết bị được đưa vào vận hành với bảo hành đã chốt và kế hoạch bảo trì phù hợp. Có thể hoàn tất bàn giao khi lịch chi tiết còn đang lập.
5. Khi có sự cố hoặc đến kỳ bảo trì, đội dịch vụ điều phối lệnh. Kỹ thuật viên xin phụ tùng, thủ kho cấp, kỹ thuật viên báo cáo phần đã dùng và trả phần còn lại. Lịch sử được truy về đúng máy và đúng lệnh.

## 2. Nguyên · Doanh nghiệp, hợp đồng và tài khoản

**Điểm bắt đầu.** Organization đã có tenant với mã, tên và gói. Identity đã có lời mời Tenant Admin, kích hoạt và khôi phục mật khẩu. Web có màn quản trị và mời người dùng. Tái sử dụng các luồng này. Trong kế hoạch, “người bán” là doanh nghiệp thuê PBL6. Đại diện quản trị, người ký hợp đồng và người liên hệ nghiệp vụ có thể là ba người khác nhau. [Tenant DTO](../../apps/organization-service/src/tenants/dto/tenant.dto.ts) · [Mời Tenant Admin](../../apps/identity-service/src/users/platform-admins.controller.ts) · [Quản trị web](../../apps/web/src/routes/LiveAdministration.tsx)

| Mã | Đầu việc và sản phẩm cần giao | Điều kiện nghiệm thu |
|---|---|---|
| N1 | **Hồ sơ doanh nghiệp.** Bổ sung tên pháp lý, tên hiển thị, mã số thuế, địa chỉ, email, số điện thoại và người liên hệ vào luồng xem/tạo/cập nhật. Giữ mã tenant dùng đăng nhập. Màn chi tiết có phần doanh nghiệp, hợp đồng và quản trị viên. | Tạo được một doanh nghiệp mới và mở lại đủ thông tin. Tenant cũ thiếu trường mới vẫn đăng nhập được và có thể bổ sung dần. Platform Admin không thấy kho, thiết bị hay yêu cầu dịch vụ nội bộ của tenant. |
| N2 | **Hợp đồng sử dụng PBL6.** Quản lý số hợp đồng, doanh nghiệp, đại diện hai bên, ngày ký, hiệu lực từ/đến, gói và phạm vi dịch vụ, giới hạn hoặc mức hỗ trợ nếu có, bản đính kèm và người ghi nhận. Ghi được lần gia hạn, ngày mới, căn cứ thay đổi, trường hợp chấm dứt và lý do. | Có danh sách chưa hiệu lực, đang hiệu lực, sắp hết hạn, hết hạn, chấm dứt. “Sắp hết hạn” là bộ lọc theo ngày. Gia hạn giữ được bản trước. Tệp chỉ mở trong phạm vi được cấp. Phạm vi demo là quản lý hợp đồng và nhắc hạn, không tự khóa tenant theo ngày hết hạn. |
| N3 | **Cấp tài khoản doanh nghiệp.** Từ hồ sơ người bán, mời Tenant Admin đầu tiên qua họ tên, email, điện thoại. Theo dõi đã mời, đã kích hoạt, lời mời hết hạn hoặc gửi lỗi. Với tài khoản chưa kích hoạt cho gửi lại lời mời. Với tài khoản hoạt động cho gửi hướng dẫn đặt lại mật khẩu qua luồng OTP hiện có. | Tạo tenant thành công nhưng gửi thư lỗi thì thử gửi lại trên tenant đã tạo. Email nhận được dùng đúng mục đích. Sau khi đổi mật khẩu, người dùng đăng nhập được theo cơ chế Identity hiện hành. |
| N4 | **Cấp tài khoản cho đại diện khách.** Tenant Admin mở một yêu cầu có sẵn mã khách và thông tin liên hệ, chọn người có quyền nhận bàn giao, mời Customer Admin, gắn membership đúng khách. Nếu đã có đại diện đủ quyền thì dùng lại. Xử lý mời thành công nhưng liên kết khách thất bại, sai email, thiếu liên hệ, lời mời hết hạn. | Gắn lại membership hoặc gửi lại lời mời không tạo thêm tài khoản. Một contact hoặc Customer User thông thường chưa đủ quyền ký. Tín hiệu “sẵn sàng nhận bàn giao” chỉ đúng khi tài khoản và membership đều hoạt động, có quyền phản hồi. |
| N5 | **Bàn làm việc Platform Admin và Tenant Admin.** Platform tập trung doanh nghiệp chờ kích hoạt, hợp đồng sắp hết hạn, lời mời còn treo, nút **Thêm doanh nghiệp**. Tenant tập trung khách cần tài khoản, nhân viên chưa gán chi nhánh/kho và hồ sơ cần phân bổ. Dùng danh sách có lọc khi bấm vào số đếm. | Số đếm khớp kết quả khi mở. Bấm việc cấp tài khoản đi thẳng tới N4 có sẵn khách. Bấm việc gán thủ kho mở đúng màn Minh làm. Có trạng thái trống, đang tải, lỗi và thử lại. |

**Ranh giới.** Nguyên sở hữu thao tác mời, kích hoạt, gắn membership và đặt lại mật khẩu. Huy sở hữu lý do nghiệp vụ yêu cầu mời, số thiết bị đang chờ và việc chuyển tiếp hồ sơ sau kích hoạt. Minh sở hữu dữ liệu gán người vào kho. Nguyên tích hợp đường dẫn và số đếm của hai chức năng vào dashboard quản trị.

## 3. Huy · Excel hậu mãi, bảo hành và bàn giao

**Điểm bắt đầu.** Luồng bulk hiện nhận một khách hàng chung cho lô, hỗ trợ tám trường CSV và tạo hồ sơ nháp. Model đã có manufacturer/category dạng thuộc tính. Luồng bàn giao hiện hành phân biệt giao tại cửa hàng và chờ khách xác nhận tại cơ sở. Asset đã lưu bản điều khoản áp dụng cho từng máy. [Nhập lô hiện tại](../../apps/asset-service/src/registrations/bulk.dto.ts) · [Xử lý lô](../../apps/asset-service/src/registrations/bulk.service.ts) · [Quy tắc bàn giao](../decisions/0021-registration-delivery-methods.md)

### H1–H2. Chuẩn hóa danh mục và file bên bán

- [ ] **H1 · Danh mục thiết bị.** Chuẩn hóa hãng và loại trong phạm vi tenant. Một model nối với một hãng và một loại. Một loại có thể dùng chung cho nhiều hãng. Trình bày được **Hãng → Loại → Model → Thiết bị có serial**. Ví dụ *Apple → Điện thoại → iPhone 15 → serial A001*. Dùng lại mã model hiện có. Lập bảng ánh xạ dữ liệu hãng/loại cũ, đưa tên mơ hồ vào danh sách cần đối chiếu, bảo toàn liên kết máy và chính sách. Cung cấp danh mục loại có mã ổn định để Minh gắn linh kiện tương thích.
- [ ] **H2 · Workbook và từ điển cột.** Giao file XLSX tải từ trang tiếp nhận, một bản mẫu điền sẵn và bảng mô tả trường bắt buộc/có điều kiện, khóa tham chiếu, định dạng ngày và ví dụ hợp lệ. Người bán dùng mã nghiệp vụ. Backend chịu trách nhiệm ánh xạ sang ID nội bộ. Quy ước mã và serial là văn bản để giữ số 0 đầu.

| Sheet | Đơn vị mỗi dòng | Các trường cần thể hiện trong mẫu |
|---|---|---|
| **Khách hàng và cơ sở** | Một cơ sở của khách. Khi có nhiều liên hệ, lặp khóa cơ sở và phân biệt bằng mã liên hệ | Mã/tên doanh nghiệp khách, mã số thuế nếu có, mã/tên cơ sở, địa chỉ, mã liên hệ, họ tên, vai trò, điện thoại, email. Nêu rõ đầu mối nhận bàn giao nếu bên bán biết. |
| **Thiết bị bàn giao** | Một máy vật lý | Số và ngày chứng từ, hình thức và căn cứ bàn giao, mã khách/cơ sở, mã/tên vị trí lắp, mã hãng/loại/model, serial, mã tài sản nếu có, ngày mua/ngày giao thực tế, tham chiếu gói và phiên bản, ngày hiệu lực hoặc ngoại lệ có căn cứ. Nếu chưa có mã tài sản, bước đối chiếu phải cấp mã hợp lệ trước khi xác nhận. |
| **Điều khoản dịch vụ** | Một phiên bản gói | Mã gói, phiên bản, loại dịch vụ, đơn vị chịu bảo hành, thời hạn hoặc mốc hiệu lực, phạm vi, nguyên nhân được bảo hành, loại trừ, điều khoản cho khách. Với bảo trì ghi số lần/tần suất, thời hạn, các mốc cố định hoặc phụ lục mà bên bán đã cam kết. |

**Nghiệm thu H1–H2.** Một file chứa hai khách, nhiều cơ sở và hai máy cùng model nhưng khác quyền lợi phải đọc ra đúng liên kết của từng serial. Có dòng chỉ bảo hành, chỉ bảo trì, có cả hai và không có dịch vụ. Tên hãng gần giống hoặc thiếu mã không được tự nối nhầm.

### H3–H7. Từ file đến xác nhận

| Mã | Đầu việc và sản phẩm cần giao | Điều kiện nghiệm thu |
|---|---|---|
| H3 | **Tiếp nhận theo lô.** Trang chính có ba bước **Tải file → Đối chiếu → Xác nhận dòng hợp lệ**. Phân loại mới, đã có, trùng, xung đột, thiếu thông tin. Báo lỗi bằng tên sheet, dòng, cột và cách sửa. Tạo khách/cơ sở/liên hệ mới qua Organization, liên kết lại bản ghi đã nhận diện. Form chỉnh hồ sơ dùng cho sửa sai có ghi nhận. | Có thể nhập phần hợp lệ, sửa và nhập tiếp phần lỗi. Nạp lại cùng file/chứng từ hoặc gửi lại sau mất kết nối không nhân đôi máy, liên hệ, bảo hành hoặc phiếu. Trùng mã tài sản hay model + serial nhưng khác chủ phải dừng dòng đó. Nếu Organization đã ghi xong mà Asset lỗi, chạy lại từ phần còn thiếu. |
| H4 | **Quyền lợi theo serial.** Tách rõ *có / không có / chưa rõ* cho từng dịch vụ. Lưu bản điều khoản đã chốt, phiên bản hoặc điều khoản riêng theo chứng từ, nguồn và ngày hiệu lực. File có đủ điều khoản riêng vẫn phải biểu diễn được dù chưa có gói mẫu tương ứng. Thay đổi sau tiếp nhận có lý do, người sửa và lịch sử. Khi khách báo hỏng, Service Request lấy bảo hành của đúng máy để xét cả thời hạn lẫn nguyên nhân. | Hai máy cùng model mang hai thời hạn khác nhau. Đổi mặc định model không đổi máy cũ. Bảo hành chưa rõ được đưa đi đối chiếu. Chưa rõ lịch bảo trì không chặn phần bảo hành đã xác minh. Máy ghi rõ không có cả hai vẫn được tiếp nhận và có thể báo sự cố. |
| H5 | **Bàn giao theo căn cứ.** Phân biệt dữ liệu dự kiến giao với giao thực tế. Giữ luồng tại cửa hàng. Với biên bản đã ký, ghi số, ngày, căn cứ, người đối chiếu trước khi hoàn tất theo quy định doanh nghiệp. Thiếu căn cứ và cần nghiệm thu tại cơ sở thì chờ Customer Admin. Ghi thay đổi so với ADR 0021 trước khi bật nhánh biên bản ký sẵn. | Hiển thị riêng đã tiếp nhận dữ liệu, đang chờ bàn giao và đã hoàn tất. Xác nhận đến muộn vẫn tính bảo hành từ mốc cam kết. Hồ sơ chờ không kích hoạt vận hành sớm. Kiểm tra bản đang xem khi chấp nhận/từ chối, yêu cầu lý do khi từ chối, giữ được lịch sử gửi lại. |
| H6 | **Khách chưa có tài khoản.** Mở một việc cho Tenant Admin theo tenant + khách, gắn số hồ sơ đang chờ và link tới N4. Cho biết thiếu người nhận, đã mời/chờ kích hoạt, đã sẵn sàng. Khi có người đủ quyền, gửi yêu cầu trong portal và bắt đầu hạn phản hồi theo thời điểm yêu cầu sẵn sàng cho khách. Tách lời mời email của Identity và thông báo bàn giao của Notification. | 20 máy của một khách tạo một việc cấp tài khoản. Nếu khách đã có đại diện hợp lệ thì gửi thẳng. Kích hoạt trước/sau khi nộp phiếu đều xử lý được. Sự kiện đến lặp không nhân đôi. Phiếu đã hủy hoặc thay thế không gửi lại như phiếu đang chờ. Khách khác doanh nghiệp không thể mở hoặc ký. |
| H7 | **Phiếu xuất gửi khách và cổng khách hàng.** Xuất phiếu theo khách và biên bản, có bên giao/nhận, ngày, cơ sở, danh sách máy/serial, bảo hành, quyền lợi bảo trì, lịch cố định đã cam kết và hướng dẫn vào portal. Bố trí bàn làm việc Customer Admin cho bàn giao/dự toán/kết quả chờ phản hồi. Customer User thấy thiết bị được phép xem, yêu cầu của mình và nút **Báo sự cố**. | Hai khách cùng trong một file nhận hai phiếu riêng. Việc xuất file không làm đổi trạng thái xác nhận. Customer Admin xem đúng nội dung được gửi, đồng ý hoặc từ chối được. Bấm số đếm trên portal mở đúng tập hồ sơ. |

**Bàn giao nghiệp vụ cho Khương.** Khi đối chiếu xong, Khương đọc được quyền lợi bảo trì theo serial để chuẩn bị kế hoạch. Khi bàn giao hoàn tất, gửi căn cứ kích hoạt cùng mã máy, khách, cơ sở, mốc hiệu lực, phiên bản cam kết và trạng thái. Một máy có thể đã bàn giao mà vẫn chờ lập kế hoạch.

## 4. Khương · Bảo trì và thực hiện dịch vụ trên web/mobile

**Điểm bắt đầu.** Maintenance đã có mẫu theo model, plan, task, scheduler và xử lý tạo kế hoạch từ bàn giao. Mobile có workspace kết nối dịch vụ thật. Lấy hành vi ở workspace thật làm chuẩn cho web. [Thời hạn và kỳ bảo trì](../decisions/0020-maintenance-terms.md) · [Nhóm kế hoạch hiện tại](../../apps/maintenance-service/src/registrations/registration-group.service.ts) · [Mobile thực tế](../../apps/mobile/lib/features/workspace/live_workspace.dart)

| Mã | Đầu việc và sản phẩm cần giao | Điều kiện nghiệm thu |
|---|---|---|
| K1 | **Tách quyền lợi và kế hoạch.** Màn hình từng máy hiển thị cam kết từ H4/H5. Quản lý dịch vụ có danh sách **Chờ lập kế hoạch**, lọc theo chi nhánh phụ trách, khách, cơ sở, model. Cho dự kiến lịch khi đang chờ bàn giao. Phân biệt không có gói, thiếu dữ liệu cam kết, có gói chưa lập, đã chuẩn bị, đang chạy. | Máy chỉ có bảo hành không tự sinh kế hoạch. Máy chưa rõ gói đi đối chiếu. Máy có bảo trì nhưng chưa chốt lịch chi tiết vẫn hoàn tất được bàn giao. Việc còn phải lập lịch xuất hiện đúng một lần. |
| K2 | **Lập và chốt lịch.** Chọn mẫu theo model hoặc lập từ điều khoản riêng, nhập công việc/checklist, kỳ đầu, chu kỳ, số lần hoặc thời hạn, chi nhánh phụ trách. Cho lập theo nhóm máy cùng điều kiện và xem trước kết quả từng serial. Kiểm ngày đầu/cuối, gói không giới hạn và gói kết thúc cùng bảo hành. | Gói hai lần trong năm đầu hiển thị đúng hai kỳ. Điều khoản có ngày cố định được giữ đúng. Gói theo ngày hết bảo hành yêu cầu có mốc kết thúc hợp lệ. Đổi mẫu không viết lại kế hoạch cũ hay kỳ đã hoàn thành. |
| K3 | **Kích hoạt và sinh việc.** Chỉ kích hoạt khi lịch đã chốt và bàn giao đủ căn cứ. Hỗ trợ cả hai thứ tự đến của hai điều kiện. Ngừng đường cũ tự tạo thêm plan cho hồ sơ dùng luồng mới. Giữ khả năng đọc và tiếp tục các hồ sơ cũ. Dùng cơ chế sự kiện và xử lý lặp sẵn có. | Bàn giao trước/chốt lịch sau hoặc ngược lại đều tạo đúng số plan/task. Thử lại sau lỗi không nhân đôi, không sinh kỳ ngoài hạn. Task đến hạn mở được lệnh, điều phối đúng chi nhánh và đúng máy. |
| K4 | **Bàn làm việc Service Manager và Dispatcher.** Manager thấy yêu cầu mới, lệnh chờ phân công và máy chờ lập kế hoạch. Dispatcher cũ thấy hàng chờ phân công và lịch kỹ thuật viên. Giữ giới hạn chi nhánh và đường dẫn có bộ lọc. | Một lần bấm vào việc chờ mở đúng hồ sơ cần xử lý. Manager điều phối được cả lệnh sửa chữa phát sinh từ yêu cầu của khách và lệnh bảo trì. Dispatcher cũ giữ khả năng điều phối theo quyền hiện hành. |
| K5 | **Web kỹ thuật viên tương đương mobile.** Năm mục *Trang chủ, Công việc, Lịch, Thiết bị, Cá nhân*. Trang chủ ưu tiên việc chờ nhận, lịch hôm nay và tiếp tục lệnh đang làm. Chi tiết lệnh có nhận/từ chối, di chuyển, bắt đầu, tạm dừng/tiếp tục, checklist, thiết bị, phụ tùng, báo cáo và tệp theo đúng hành động server cho phép. Lập bảng đối chiếu từng thao tác web/mobile, gồm nháp, lỗi mạng, dữ liệu đã gửi và quyền xem tệp. | Nhận lệnh ở mobile, tiếp tục trên web, gửi báo cáo rồi kiểm tra lại ở mobile. Cùng tài khoản thấy cùng dữ liệu đã lưu trên server. Nháp lưu trên thiết bị ghi rõ đang lưu ở đâu. Kỹ thuật viên khác không thể mở lệnh ngoài phạm vi. |
| K6 | **Phụ tùng trong lệnh và kết quả cho khách.** Tích hợp thao tác tìm phụ tùng, xin cấp, ghi phần đã dùng trong báo cáo, đề nghị trả và xem tiến độ do Minh cung cấp. Web và mobile dùng chung mã lệnh, phiếu, người nhận và quy tắc số lượng. Khách chỉ đọc kết quả/phụ tùng được phép công bố. | Kỹ thuật viên xin 3, kho cấp 2, kỹ thuật viên dùng 1 và trả 1. Hai nền tảng hiển thị nhất quán phần đã cấp, đã dùng, thực nhận trả và phần xin chưa cấp. Khách không thấy giá vốn hay thẻ kho. |

**Ranh giới.** Huy ghi điều khoản mà khách đã mua. Khương sở hữu lịch và việc thực hiện sau đó. Minh sở hữu số lượng tồn và phiếu. Khương sở hữu các thao tác trên màn hình lệnh của kỹ thuật viên và dùng API cấp/trả do Minh cung cấp.

## 5. Minh · Kho, nhập file, điều chuyển và phiếu phụ tùng

**Điểm bắt đầu.** Inventory đã có tồn theo kho, thẻ kho, nhập lô, cấp/trả theo lệnh, đối soát và hàng cách ly. Hiện thủ kho có thể tạo kho và phạm vi chính theo chi nhánh. Quyền quản trị kho cần tách khỏi quyền ghi giao dịch. [API kho](../../apps/inventory-service/src/inventory/inventory.controller.ts) · [Quy tắc cấp/trả](../decisions/0023-inventory-part-and-return-requests.md) · [Hướng dẫn kho](../user-guide/inventory-staff.md)

| Vai trò | Phạm vi và thao tác cần áp dụng ở cả API và giao diện |
|---|---|
| Tenant Admin | Xem kho, tồn, lịch sử trong tenant. Tạo/cập nhật kho, gán thủ kho, xem chênh lệch. Việc ký thực nhập/xuất thuộc nhân viên phụ trách kho. |
| Nhân viên kho | Một kho đang hoạt động thuộc chi nhánh chính. Chỉ đọc/ghi tồn và xử lý phiếu thuộc kho mình. Khi chuyển hàng được tra mã/tên kho đích cùng tenant. Một kho có thể có nhiều nhân viên. |
| Service Manager | Đọc số khả dụng trong chi nhánh, lập phiếu thay kỹ thuật viên và theo dõi cấp cho lệnh thuộc phạm vi. |
| Kỹ thuật viên | Tra phụ tùng phù hợp, xin cấp, theo dõi phần đã nhận, đã dùng, còn phải trả của lệnh hoặc của mình theo quyền hiện hành. |
| Platform Admin, Customer Admin, Customer User | Ẩn mục kho nội bộ và từ chối API đọc/ghi kho. Khách chỉ nhận thông tin phụ tùng đã công bố trong kết quả dịch vụ. |
| Dispatcher cũ | Phạm vi công việc là điều phối. Nếu cần biết tiến độ cho một lệnh, hiển thị tình trạng sẵn sàng trên lệnh theo quyền đọc lệnh. |

| Mã | Đầu việc và sản phẩm cần giao | Điều kiện nghiệm thu |
|---|---|---|
| M1 | **Tạo kho và gán người.** Làm cả màn Tenant Admin, chọn chi nhánh, mã, tên, địa chỉ và nhân viên phụ trách. Gắn kho lúc cấp role Inventory Staff hoặc khi quản trị tài khoản, kiểm tra đúng tenant/chi nhánh. Hiện danh sách tài khoản cũ cần gán kho. Khi đổi kho lưu người thực hiện, thời điểm và lịch sử. | Chỉ Tenant Admin tạo kho. Hai thủ kho cùng chi nhánh nhưng khác kho không xem/sửa được tồn của nhau qua danh sách, chi tiết, export, phiếu hoặc thử lại giao dịch. Đổi kho có hiệu lực cho lần truy cập kế tiếp. |
| M2 | **Dữ liệu phụ tùng.** Một SKU liên kết nhiều loại thiết bị theo mã loại H1. Vị trí chính nằm trên cặp kho + SKU, ví dụ kệ A1, B2. Ngày thực nhập và chứng từ nằm trên từng phiếu, lưu riêng thời điểm ghi hệ thống. Chi tiết hiển thị lần nhập gần nhất, số khả dụng, số cách ly, kệ và lịch sử nhập. | Cùng SKU nằm ở hai kệ khác nhau tại hai kho. Hai đợt nhập vẫn có hai ngày. Tìm theo một trong các loại tương thích trả đúng SKU. SKU cũ chưa có loại/kệ vẫn tra được để bổ sung. |
| M3 | **Nhập bằng file.** Tại kho được gán, tải mẫu, nhập số chứng từ/ngày thực nhập, tải XLSX, xem trước và xác nhận. Dòng gồm SKU, số lượng, kệ. SKU mới cần tên, đơn vị, loại tương thích. Dùng lại parser, kiểm tra đơn vị/số lẻ và xử lý lô hiện hành. Bỏ nút nhận hàng nhập tay khỏi luồng chính. | SKU có số 0 đầu đọc đúng. Báo được dòng sai hoặc trùng, kho sai quyền, loại không tồn tại, số lượng không hợp lệ. Phiếu kho chỉ ghi sau khi toàn phiếu hợp lệ. Gửi lại cùng giao dịch không cộng tồn lần hai. |
| M4 | **Phiếu chuyển liên kho.** Một mã phiếu gồm kho nguồn/đích trong cùng tenant, từng SKU, lượng dự kiến/xuất/thực nhận, người giao/nhận, thời điểm và kệ đích. Thủ kho nguồn xác nhận xuất, giảm khả dụng và ghi đang chuyển. Thủ kho đích xác nhận thực nhận mới tăng tồn đích. Cho hai bên tra cùng phiếu và đóng phần chênh có căn cứ. | Chặn chuyển cùng kho, vượt tồn khả dụng và sai người nhận. Xuất 10, nhận 8 thì đích tăng 8, còn 2 chờ đối soát. Giữ cân bằng nguồn + đang chuyển + đích, ghi thẻ kho mỗi phía. Có thể nhận nốt hoặc ghi xử lý chênh có lý do. Nhấn hai lần, mất mạng hay hai thủ kho xuất đồng thời không làm âm/nhân đôi tồn. |
| M5 | **Rà lại phiếu phụ tùng.** Giữ *xin cấp* và *đề nghị trả*, chỉ định kho xử lý từ lúc lập phiếu. Nếu có duy nhất một kho phù hợp thì chọn sẵn. Trả về kho đã xuất. Danh sách thủ kho chia *Chờ cấp, Chờ nhận trả, Chuyển kho*. Chi tiết có WO (lệnh công việc), người nhận, từng lượng và nút xử lý tiếp theo. Lịch sử thu gọn. | Phiếu xin chưa trừ tồn, đề nghị trả chưa tăng tồn. Cấp/nhận thiếu được, từ chối hoặc đóng phần dư có lý do. Hàng trả hỏng vào cách ly. Giữ biên nhận, trách nhiệm người đã nhận và khả năng đối soát giao dịch cũ. Chuyển kho có mã phiếu riêng, không mượn phiếu cấp cho WO. |
| M6 | **Bàn làm việc thủ kho.** Nổi bật nút **Nhập từ file**, các phiếu cần cấp/nhận, điều chuyển đến và SKU dưới ngưỡng tại kho được gán. API phục vụ K6 chỉ trả danh mục và số liệu được phép cho kỹ thuật viên. | Cùng dữ liệu mẫu, hai thủ kho thấy hai hàng chờ riêng. Tài khoản chưa gán kho được chỉ dẫn liên hệ Tenant Admin. Mục chưa gán xuất hiện trên N5. Lối tắt trên dashboard và màn kho cho cùng kết quả. |

## 6. Bốn điểm thống nhất để làm song song

| Điểm nối | Người đưa hợp đồng dữ liệu | Ai sử dụng | Thống nhất trước khi nối API thật |
|---|---|---|---|
| Tài khoản và khách cần mời | Nguyên đưa API mời, membership và điều kiện tài khoản hoạt động. Huy đưa danh sách việc theo khách cùng đường dẫn hồ sơ chờ | Huy, Nguyên | Mã tenant/khách/contact, trạng thái tài khoản và liên kết, số hồ sơ chờ, link thao tác, cách đọc lại khi sự kiện đến trước/sau. |
| Loại thiết bị và cam kết dịch vụ | Huy | Minh dùng loại thiết bị. Khương dùng cam kết và căn cứ bàn giao | Mã loại ổn định, mã máy, khách/cơ sở, mã phiên bản/điều khoản riêng, ngày hiệu lực, số kỳ/tần suất, nguồn chứng từ, trạng thái bàn giao. Có mẫu gói vắng, chưa rõ và đã chốt. |
| Phụ tùng trên lệnh | Minh đưa API phiếu và số lượng. Khương đưa phạm vi/nhân sự/trạng thái lệnh | Khương, Minh | ID lệnh, kho và người nhận; SKU, đơn vị, số xin/cấp/dùng/trả; tình trạng trả, trạng thái thực nhận và hành động hợp lệ. Dùng cùng fixture cho hai client. |
| Trang chủ và điều hướng | Mỗi người cung cấp trang chủ hoặc thẻ của chức năng mình. Nguyên ráp bộ định tuyến và khung dashboard chung | Cả nhóm | Nguyên sửa file khung dùng chung một lần. Các thành viên đặt màn hình theo feature và bàn giao đường dẫn, vai trò, bộ lọc, số đếm. Minh cung cấp thao tác gán kho cho màn người dùng. |

**Cách tránh xung đột.** Huy sửa dữ liệu áp dụng bảo hành và phát thông tin bàn giao trong Asset. Khương sửa lớp tiếp nhận kế hoạch và sinh kỳ trong Maintenance. Nguyên làm hồ sơ tenant/hợp đồng trong Organization; Huy làm ánh xạ customer/site/location/contact của file qua API Organization. Minh giữ sổ kho và chứng từ trong Inventory. Nếu có chung schema Prisma hoặc catalog sự kiện, mỗi thay đổi mở PR nhỏ theo miền dữ liệu và lấy migration mới sau khi rebase. Service chỉ ghi database của mình. Các màn hình có thể phát triển từ mẫu request/response trong khi API thật đang làm.

## 7. Thứ tự tích hợp và an toàn dữ liệu

| Mốc | Nguyên | Huy | Khương | Minh | Điều kiện qua mốc |
|---|---|---|---|---|---|
| **A · Chốt mẫu và quy tắc** | Mẫu doanh nghiệp, hợp đồng, lời mời | Workbook, ánh xạ mã, sơ đồ trạng thái bàn giao | Mẫu quyền lợi → plan → task, danh sách thao tác web/mobile | Ma trận quyền, mẫu nhập kho, sơ đồ phiếu chuyển | Mỗi điểm nối ở mục 6 có ví dụ đúng/sai, người sở hữu và consumer đọc được. Ghi quyết định về biên bản ký sẵn và tách điều kiện sinh plan. |
| **B · Chạy từng chức năng riêng** | N1–N4 với một tenant | H1–H5 với hai khách | K1–K3 với cam kết mẫu | M1–M4 với hai kho | Mỗi người demo độc lập bằng dữ liệu trong phạm vi mình. Migrations chạy được trên bản sao dữ liệu cũ. |
| **C · Nối luồng thật** | N5 và lời mời hoạt động | H6–H7, portal, xét bảo hành khi báo hỏng | K4–K6, lệnh trên hai nền tảng | M5–M6 và phiếu của lệnh thật | Demo hai chuỗi *file → khách xác nhận → kế hoạch* và *lệnh → cấp/trả → báo cáo* qua Gateway. |
| **D · Chuyển luồng và nghiệm thu** | Tổng hợp kết quả tích hợp | Kiểm máy cũ, import lại và lịch sử quyền lợi | Kiểm lịch/WO cũ và web/mobile | Kiểm tồn đầu/cuối và phiếu đang mở | Đạt các ca dưới đây trên cùng bản tích hợp. Lỗi còn lại ghi người nhận xử lý và ca cần chạy lại. |

**Chuyển dữ liệu cũ.** Trước khi đổi luồng, ghi số tenant/tài khoản, máy theo model, bảo hành đã áp dụng, plan/task đang chạy, tồn theo kho/SKU và phiếu mở. Bổ sung trường và liên kết theo từng service. Ánh xạ hãng/loại và thủ kho khi có căn cứ. Bản ghi còn thiếu hiện trong danh sách cần bổ sung. Sau chuyển đổi, so sánh số liệu, mở lại hồ sơ cũ và thử tiếp tục giao dịch đang dở. Nếu phải tạm dừng phát hành, giữ chứng từ/thẻ kho đã ghi, dừng luồng mới và dùng lịch sử để đối soát. Không dùng reset dữ liệu phát triển làm phương án chuyển đổi.

## 8. Bộ ca nghiệm thu chung

Dùng hai tenant, ít nhất hai kho cùng chi nhánh, hai thủ kho, hai khách hàng, một khách chưa có tài khoản, một Customer User, một Customer Admin và một kỹ thuật viên. Bộ file mẫu gồm lô hợp lệ, lô trộn dòng sai, file nhập kho và bản nhập lại. Cần có thiết bị và phiếu đã tồn tại trước thay đổi.

| Ca | Thao tác trên bản tích hợp | Kết quả cần quan sát | Người chạy chính |
|---|---|---|---|
| 01 | Tạo người bán và hợp đồng, gửi lại lời mời, kích hoạt, đặt lại mật khẩu, gia hạn hợp đồng | Một tenant, một tài khoản đúng vai trò, lịch sử hợp đồng còn đủ, truy cập doanh nghiệp khác bị từ chối | Nguyên |
| 02 | Nhập lô gồm hai khách, hai cơ sở, hai serial cùng model khác thời hạn. Có thêm dòng sai khách và mã trùng | Ghi dòng hợp lệ đúng máy, báo đúng dòng sai. Sửa rồi nhập lại không nhân đôi. Thay mẫu model không đổi quyền lợi máy cũ | Huy |
| 03 | Gửi 20 máy cho khách chưa có tài khoản, mời, kích hoạt, xuất phiếu, xác nhận hoặc từ chối rồi gửi lại | Một việc cấp tài khoản; file riêng đúng khách; hạn phản hồi bắt đầu đúng lúc. Customer User và khách khác không ký được. Có dấu vết phiên bản đã ký | Huy, Nguyên phối hợp |
| 04 | Nhập hồ sơ có biên bản đã ký, hồ sơ dự kiến giao và máy không mua dịch vụ. Thử thêm máy có phần bảo hành chưa rõ | Mỗi hồ sơ vào đúng nhánh. Lịch sử có nguồn chứng từ. Máy không có dịch vụ vẫn báo hỏng được; điều khoản chưa rõ hiện để đối chiếu | Huy |
| 05 | Cam kết bảo trì hai kỳ, thử lần lượt lập lịch trước và sau bàn giao. Phát lại sự kiện. Đổi mẫu sau khi kích hoạt | Mỗi máy có đúng kế hoạch và số kỳ, ngày đầu/cuối đúng cam kết. Lỗi đồng bộ thử lại được. Các kỳ đã sinh không đổi theo mẫu mới | Khương |
| 06 | Tenant Admin tạo hai kho, gán hai nhân viên. Nhập một SKU cho hai loại thiết bị, khác kệ giữa hai kho | Đúng tồn, đúng ngày thực nhập, đúng kệ. Tìm SKU được bằng cả hai loại. Nhân viên kho không tạo kho và không ghi vào kho bên cạnh | Minh |
| 07 | Xuất chuyển 10, đích nhận 8, gửi lại yêu cầu rồi nhận nốt 2. Thử thao tác bằng tài khoản sai kho | Từng thời điểm đối soát được nguồn, đang chuyển, đích; cuối cùng đích tăng đúng 10. Cả hai phía thấy cùng số phiếu và thời điểm | Minh |
| 08 | Mobile nhận lệnh, web xin 3 phụ tùng, kho cấp 2, ghi dùng 1 và trả 1. Thử trả hàng hỏng và hoàn tất báo cáo | Hai client thấy cùng tiến độ. Kho ghi thực nhận, hàng hỏng vào cách ly. Khách chỉ thấy kết quả đã công bố và số lượng thực dùng phù hợp | Khương, Minh phối hợp |
| 09 | Đăng nhập lần lượt tám vai trò, mở các số đếm, thử truy cập thẳng URL/API của doanh nghiệp, kho hoặc khách khác | Việc trên trang chủ đúng người xử lý. Danh sách lọc khớp số đếm. Backend chặn truy cập ngoài phạm vi trên cả list/detail/mutation/export | Nguyên điều phối, mỗi người sửa phần mình |
| 10 | So số liệu trước/sau migration, mở phiếu cũ chưa xong, chạy lại seed và các ca gián đoạn sau khi một service đã ghi | Bảo toàn lịch sử, tiền đề cấp/trả cũ, điều khoản đã chốt và lịch đang chạy. Không sinh lại dữ liệu nghiệp vụ khi retry | Cả bốn, Nguyên tổng hợp |

**Bằng chứng bàn giao của từng người.** Gắn mã đầu việc vào PR; kèm API/event đã đổi, migration và cách áp dụng, file mẫu hoặc dữ liệu demo, hướng dẫn theo vai trò, lệnh test đã chạy và kết quả. Với kiểm thử liên chức năng, lưu mã hồ sơ/phiếu/lệnh và ảnh hai phía trên dữ liệu demo để người khác tái hiện. Cập nhật OpenAPI, ERD/ADR liên quan theo [quy trình repository](../../CONTRIBUTING.md). Chỉ đánh dấu hoàn tất khi thao tác qua giao diện hoặc API thực tế đã cho đúng kết quả nghiệp vụ.
