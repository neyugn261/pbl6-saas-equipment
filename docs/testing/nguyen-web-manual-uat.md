# Kịch bản kiểm tra giao diện Web — phần Nguyên

Áp dụng cho nhánh `feature/nguyen-web-task-completion`, ngày 21/11/2026.

Đây là hướng dẫn để người kiểm thử thực hiện; các ca dưới đây **chưa được đánh dấu đã đạt trên trình duyệt**. Kết quả tự động và phần còn phụ thuộc backend: [báo cáo triển khai](nguyen-web-tasks-2026-11-21.md).

## 1. Khởi động

Terminal 1 tại thư mục dự án:

```powershell
cd D:\BKDN\Nam4\PBL6\pbl6-saas-equipment
git branch --show-current
pnpm infra:up
```

Nhánh phải là `feature/nguyen-web-task-completion`. Giữ `.env` hiện có. Nếu chưa có bộ tài khoản/dữ liệu demo, chạy `pnpm demo:seed` sau khi hạ tầng sẵn sàng và trước khi mở backend. Seed bổ sung dữ liệu và giữ tiến trình cũ; nếu seed lỗi, ghi nhận lỗi chuẩn bị dữ liệu trước khi đánh giá giao diện. Các bước này không yêu cầu `demo:reset`.

Terminal 2, cùng thư mục:

```powershell
pnpm dev:backend
```

Terminal 3, cùng thư mục:

```powershell
pnpm dev:web
```

Chờ backend khởi động thành công rồi mở `http://localhost:5173`. Lệnh backend hiện tự build package dùng chung và áp migration trước khi mở các service. Nếu Vite báo cổng khác do 5173 đã được sử dụng, dùng đúng URL mà terminal in ra. Các đường dẫn bên dưới được nối vào URL Web này.

## 2. Tài khoản và cách ghi kết quả

Tenant code: **MP**. Mật khẩu: giá trị `SEED_DEMO_PASSWORD` trong `.env` của máy đang test; mật khẩu tài khoản cũ có thể đã được người dùng đổi.

| Email | Dùng để kiểm tra |
|---|---|
| `tenant.admin@demo.local` | Chi nhánh mặc định, thiết bị, khách hàng, cột/filter/export |
| `customer.user@demo.local` | Khách Bệnh viện An Phúc gửi yêu cầu và xem dữ liệu của mình |
| `service.manager@demo.local` | SM HCM: tiếp nhận, điều phối nhanh, đội kỹ thuật, KPI, lịch sử sự kiện |
| `inventory@demo.local` | Kho HCM: các nút Thêm, biểu mẫu và giao dịch |
| `service.manager.dn@demo.local` | Đối chiếu phạm vi chi nhánh Đà Nẵng |
| `factory.user@demo.local` | Đối chiếu dữ liệu khách Cơ khí Hòa Long |

Làm theo từng lượt tài khoản để giảm việc đăng nhập qua lại. Nếu gặp 429, chờ theo thông báo rồi tiếp tục; không coi đây là lỗi layout.

Mỗi ca ghi một trong bốn trạng thái: **Đạt / Lỗi / Bị chặn do dữ liệu hoặc API / Chưa thử**. Ghi thêm tài khoản, URL, mã hồ sơ và ảnh nếu có lỗi. Mã yêu cầu/WO thực tế lấy trên màn hình; chúng không cố định giữa các lần seed.

## 3. Lượt nhanh bằng dữ liệu đang có

### T01 — Thanh tìm kiếm dùng chung

**Tài khoản:** TA hoặc SM; Phụ tùng dùng thêm Inventory Staff khi kiểm tra form.

1. Mở `/app/customers`; gõ `BV-AP`, dừng khoảng nửa giây.
2. Kết quả tự cập nhật, không cần bấm Tìm; ô nhập vẫn giữ focus để gõ tiếp.
3. Gõ một chuỗi không tồn tại, rồi dùng Xóa bộ lọc.
4. Thử tương tự ở Request bằng mã SR đang có, WO bằng mã WO và KTV bằng mã nhân viên như `KT001`.
5. Ở `/app/inventory/parts`, tìm `LOC-01`.

**Mong đợi:** tìm sau debounce khoảng 300 ms, trạng thái trống rõ ràng, reset trả lại danh sách. Tổng số/phân trang lấy từ server. Riêng Thiết bị dùng **Áp dụng bộ lọc**, không đánh giá theo cơ chế tự tìm của toolbar chung.

### T02 — Filter, cột và xem chi tiết Thiết bị

**Tài khoản:** TA. **Trang:** `/app/equipment`.

1. Chọn một khách hàng, cơ sở/vị trí và khoảng ngày mua nếu dữ liệu đã có; bấm Áp dụng bộ lọc.
2. Kiểm tra URL có điều kiện tương ứng. Bỏ một chip bằng dấu ×; các điều kiện khác phải còn.
3. Mở Cột hiển thị, ẩn một cột. Nếu đang lọc theo trường trong cột đó, kết quả vẫn phải giữ điều kiện.
4. Mở Thứ tự cột, dùng ←/→ để đổi vị trí. Cột nhận dạng và checkbox giữ ở đầu.
5. Kiểm tra nội dung bảng thiết bị giữ nguyên và không có nút Xem nhanh. Bấm **Xem chi tiết** một máy: tài khoản nội bộ mở `/app/equipment/<id>`, khách mở `/portal/equipment/<id>`.
6. Đọc hồ sơ đầy đủ rồi dùng Back của trình duyệt. Kiểm tra filter, trang và vị trí cuộn; F5 kiểm tra filter/cột được phục hồi trong tab.

**Mong đợi:** đúng máy/serial/ngày ở bảng và trang chi tiết; URL danh sách không mất điều kiện; dữ liệu dài đọc được; cột bị ẩn không làm mất filter. Máy cũ chưa có ngày mua hiển thị chưa ghi nhận, không lấy ngày giao thay thế. Lựa chọn hàng cũ bị bỏ khi đổi tập lọc.

Nếu bộ demo chỉ có sáu máy thì chưa đủ để chứng minh phân trang nhiều trang; dùng lượt đầy đủ T11–T13 bên dưới.

### T03 — Tổng quan khách hàng và cây vị trí

**Tài khoản:** TA/SM. **Trang:** `/app/customers` → mở Bệnh viện An Phúc.

1. Xem các thẻ thiết bị, còn bảo hành, yêu cầu đang mở; đối chiếu bằng các liên kết danh sách của đúng khách.
2. Chi phí dịch vụ lũy kế hiện `—` và thông báo chưa có số liệu là đúng giới hạn hiện tại.
3. Chuyển các tab Tổng quan, Vị trí & thiết bị, Yêu cầu & lệnh, Kế hoạch bảo trì; tab liên hệ được giữ riêng.
4. Trong một site, bấm **Xem cây vị trí & số thiết bị**; đóng/mở từng nhánh có con.
5. Chọn máy trong tab bảo trì; mở kế hoạch của đúng máy nếu có.
6. Đăng nhập Customer User, mở `/portal/locations` và thử cây vị trí của doanh nghiệp mình.

**Mong đợi:** vị trí đúng cha/con; node cha đếm máy trực tiếp tại node cộng máy của các node con, không cộng lại toàn bộ các cấp để tính số máy vật lý. Máy chưa có vị trí chi tiết được nêu riêng. Lỗi đọc số máy không thành `0`. Các danh sách Request/WO/thiết bị của khách phân trang riêng và liên kết đúng hồ sơ.

### T04 — Chi nhánh mặc định trên Header

**Tài khoản:** TA.

1. Ở `/app/service-requests`, xóa các filter chi nhánh riêng nếu đã có.
2. Trên Header, chọn **Chi nhánh mặc định → HCM**; ghi lại một mã SR. Chuyển sang Đà Nẵng, rồi Toàn doanh nghiệp.
3. Thử tương tự ở WO chế độ Danh sách, Đội ngũ kỹ thuật, KPI và danh sách kho.
4. F5 kiểm tra lựa chọn được nhớ cho tài khoản này trong tab.
5. Đăng xuất và vào bằng Customer User/SM; không được thấy dữ liệu hoặc lựa chọn hàng cũ của TA lóe lên.

**Mong đợi:** các list được hỗ trợ thay đổi đúng phạm vi; phản hồi tải chậm của branch trước không chèn vào branch mới. Filter branch riêng trên trang được ưu tiên hơn mặc định trên Header. **Thiết bị, Maintenance và tổng quan WO chưa áp dụng mặc định branch này**; không coi việc các mục đó chưa đổi theo Header là regression của chức năng đã công bố.

### T05 — Bảng Request/Work Order và trang chi tiết

**Tài khoản:** SM hoặc TA; thử thêm Request bằng Customer User.

1. Mở `/app/service-requests`, lọc/tìm một SR. Bảng phải có mã và tiêu đề, mô tả ngắn, khách/thiết bị/địa điểm, ưu tiên, trạng thái, bên xử lý/bước tiếp theo, thời điểm gửi và nút **Xem chi tiết**. Không còn nút Xem nhanh cho SR.
2. Bấm **Xem chi tiết**, đối chiếu mô tả đầy đủ, trao đổi/lịch sử và các thao tác theo quyền. Dùng Back của trình duyệt để quay về danh sách với bộ lọc/trang trước đó.
3. Mở lại danh sách bằng URL cũ có `preview=<id của SR>`; phải hiện bảng, không mở Drawer. Thử SR mô tả dài, đã đóng, xử lý một phần: mô tả dài được rút gọn, đã đóng không hiện tuổi hồ sơ, kết quả một phần được ghi rõ.
4. Mở `/app/work-orders`: chỉ có một danh sách, không có chuyển đổi bảng công việc/Danh sách hoặc Xem nhanh. Kiểm tra mã/tiêu đề/loại lệnh, khách hàng/thiết bị/địa điểm lệnh, ưu tiên, người phụ trách, lịch dự kiến, trạng thái/bước tiếp và nút **Xem chi tiết**.
5. Thử lọc trạng thái, ưu tiên, loại công việc và sắp xếp. Mở từ lịch KTV hoặc KPI để kiểm tra điều kiện bổ sung có nút bỏ riêng; **Xóa bộ lọc** bỏ toàn bộ điều kiện và về trang đầu. KTV vẫn chỉ thấy việc của mình. Bấm **Xem chi tiết** để mở `/app/work-orders/<id>` rồi Back về danh sách; thử URL cũ `view=board&preview=<id của WO>` vẫn chỉ hiện danh sách. Kiểm tra **địa điểm công việc đã ghi nhận**: nếu máy từng chuyển nơi lắp, WO cũ phải giữ địa điểm của lệnh. Lệnh chưa có lịch phải ghi rõ chưa có lịch, không dùng ngày tạo thay thế.
6. Customer User mở `/portal/requests`, kiểm tra bảng và nút **Xem chi tiết** đi đến `/portal/requests/<id>`. Không hiển thị thông tin điều phối nội bộ hay nút Xem nhanh.
7. Trong chi tiết SR, mở **Hồ sơ & chính sách / Bảo hành & dự toán**: kết luận khi xét duyệt và bảo hành theo lịch có nhãn riêng; tóm tắt giữ xuống dòng; mỗi phiên bản dự toán có trạng thái, tổng giá trị, hiệu lực rõ ràng. Thử hồ sơ chưa có dự toán hoặc nguồn bị hạn chế. Mở **Lịch sử xử lý**: khung có tiêu đề, các mốc trạng thái/lý do/thời điểm đọc được; thử lý do dài và màn 375 px. Với SM có quyền thẩm định, ô nguyên nhân/kết luận nằm hai cột trên màn rộng, một cột trên màn hẹp; ô lý do và nút Lưu không tràn khung.
8. Mở **Thông tin & trao đổi** bằng SM và Customer User: cột chính theo thứ tự mô tả → trao đổi → kết quả (nếu có) → tệp đính kèm; cột phụ có thông tin yêu cầu, mã/serial và link thiết bị. SM giữ mục lệnh liên quan; khách không có mục này và link thiết bị phải thuộc Portal. Thử gửi bình luận theo quyền, nội dung nhiều dòng, bình luận nội bộ và tài khoản chỉ xem; đối chiếu kết quả/tệp vẫn đủ. Thu màn về 375 px: các khối thành một cột, nút gửi/tải tệp và tên tệp dài không tràn. Với SM ở luồng tiếp nhận, kiểm tra các nút chuyển bước vẫn đưa đến form thẩm định/dự toán đúng và mô tả sự cố chỉ xuất hiện một lần trong tab.

**Mong đợi:** Request/WO có đủ thông tin sàng lọc trong bảng và nút mở trang chi tiết đầy đủ. Link khách ở `/portal/...`; không đưa khách sang WO nội bộ. Back giữ URL lọc/phân trang; đổi bộ lọc hoặc trang bỏ tham số preview/view cũ. Ở màn hẹp, nhãn/bộ lọc và nút thao tác không đè nhau; nội dung dài xuống dòng được.

### T06 — Tạo yêu cầu của khách và điều phối nhanh

**Dữ liệu gợi ý:** SR seed **Hình ảnh siêu âm bị nhiễu** thuộc HCM, ban đầu NEW. Nếu ca này đã xử lý, dùng Customer User tạo SR UAT mới trên máy còn bảo hành thuộc site HCM; ghi mã SR vừa tạo.

1. Customer User vào `/portal/requests/new`, chọn một máy được phép xem, nhập tiêu đề `UAT – Kiểm tra điều phối nhanh` và mô tả đủ thông tin; gửi một lần.
2. Đăng nhập SM HCM, mở SR vừa ghi mã hoặc ca seed nêu trên.
3. Kiểm tra Stepper có ba giai đoạn: Tiếp nhận & thẩm định / Thống nhất phương án / Điều phối & theo dõi.
4. Làm các thao tác mà hồ sơ cho phép: Xem xét, kiểm tra bảo hành và thẩm định nếu được yêu cầu. Với ca UAT giả định lỗi nhà sản xuất thuộc chính sách, ghi lý do thử nghiệm và lưu kết luận phù hợp; sau đó Tiếp nhận.
5. Khi SR **ACCEPTED và đã có chi nhánh**, bấm **Điều phối nhanh**.
6. Chọn KTV HCM còn khả năng nhận việc; dữ liệu seed có HCM 02 `KT002` / Nguyễn Thảo Vy để tham khảo. Kiểm tra lịch trước khi giao.
7. Nhập Bắt đầu và Kết thúc; thử kết thúc trước bắt đầu. Phải có báo lỗi và chưa tạo WO.
8. Sửa thành khoảng hợp lệ, ví dụ một giờ trong ngày mai; bấm **Tạo lệnh & phân công**. Mở WO từ biên nhận hoặc danh sách lệnh liên quan trong SR.

**Mong đợi:** một WO mới, có KTV và lịch đã chọn; trạng thái ban đầu được phân công, không phải đã hoàn tất. Input/nút gửi bị khóa lúc POST; double-click không tạo hai lệnh. SR có thể sang PROCESSING sau khi event được xử lý; dùng Làm mới trạng thái nếu cần. SR chưa ACCEPTED không có nút Quick Dispatch. Nếu thiếu chi nhánh, cần phân bổ bằng TA trước.

**Không dùng kết quả này để xác nhận:** tiếp nhận SR và tạo WO nguyên tử xuyên service, tự xuất vật tư, hoặc tự chặn lịch trùng. Những hành vi đó không nằm trong API Quick Dispatch hiện tại. Nếu ca ngoài bảo hành, phải hoàn tất luồng dự toán/phê duyệt hiện có trước khi tiếp nhận.

### T07 — Đội ngũ kỹ thuật và hồ sơ chi tiết

**Tài khoản:** SM. **Trang:** `/app/technicians`.

1. Tìm theo mã nhân viên, lọc trạng thái/chi nhánh/kỹ năng; quan sát tổng số toàn tập. Thử đổi điều kiện từ trang sau và **Xóa bộ lọc**; URL/trang phải cập nhật đúng. Mặc định chi nhánh trên Header vẫn áp dụng nếu không có bộ lọc riêng trên trang.
2. Bảng có tên/mã nhân viên, chi nhánh, kỹ năng/mức kỹ năng (nếu đã ghi nhận), trạng thái và nút **Xem chi tiết**. Không còn **Xem nhanh & lịch** hoặc panel bên cạnh. Bấm Xem chi tiết để mở `/app/technicians/<id>`.
3. Đối chiếu tên/mã/chi nhánh/kỹ năng trong hồ sơ. Ngày tạo/cập nhật giữ nhãn riêng; không hiển thị UUID thay tên, không tự điền thông tin liên hệ chưa có. Màn rộng chia thẻ thông tin/kỹ năng thành hai cột; màn nhỏ xếp một cột.
4. Trong bảng công việc, chọn trạng thái và khoảng ngày chứa lịch vừa tạo ở T06, kiểm tra WO/KTV/giờ khớp. Thử khoảng kết thúc trước bắt đầu: có lỗi và không hiện kết quả cũ. Chọn ngày đầu/cuối trùng nhau để kiểm tra lệnh trong cả ngày; đổi sắp xếp, Xóa bộ lọc và Trước/Sau khi có nhiều trang.
5. Mở **Xem chi tiết** của WO rồi Back. Thử hồ sơ không có quyền/không tồn tại và lỗi tải công việc: phải hiện lỗi, không báo 0 lệnh như thể đã tải thành công. Kiểm tra màn 375 px, tên/kỹ năng dài, điều khiển lọc và nút không tràn khung.

**Mong đợi:** kết quả đúng người và khoảng lịch; khoảng sai có lỗi. Không có ca trong kết quả không đồng nghĩa KTV rảnh toàn bộ thời gian; nhãn AVAILABLE không phải xác nhận không trùng lịch.

### T08 — KPI và drilldown

**Tài khoản:** SM/TA. **Trang:** `/app/reports`, phần **KPI kỹ thuật viên**.

1. Chọn khoảng có WO hoàn tất. Có thể thử từ 01/01/2026 đến ngày test để bao phủ dữ liệu seed đã tạo trước đây; bấm Áp dụng trong chính phần KPI.
2. Kiểm tra biểu đồ, bảng so sánh, MTTR và FTFR; hover cột để xem tooltip.
3. Bấm tên một KTV có số ca hoàn tất lớn hơn 0; đối chiếu tổng số và danh sách ca của người đó trong cùng kỳ.
4. Mở một WO từ danh sách; kiểm tra số lệnh, kết quả và ngày hoàn tất.
5. Thử một khoảng không có ca và khoảng ngày ngược nhau.

**Mong đợi:** ca hoàn tất của KTV khớp drilldown, MTTR dùng giờ, FTFR/đúng hạn dùng %. Thiếu mẫu tính phải hiện Chưa đủ dữ liệu, không tự thành 0%. Bộ ngày của phần tổng quan WO phía trên độc lập với phần KPI; muốn so sánh phải áp cùng kỳ ở cả hai nơi. WO vừa phân công ở T06 chưa hoàn tất nên chưa được cộng vào số ca hoàn tất.

### T09 — SM mất lối tạo SR; nhãn Lịch sử sự kiện

**Tài khoản:** SM.

1. Mở dashboard, danh sách SR và trạng thái danh sách trống; không được có nút tạo SR mới.
2. Mở dossier/QR của một máy; không có CTA tạo SR dành cho SM.
3. Nhập trực tiếp `/app/service-requests/new` rồi `/requests/new`.
4. Mở menu **Lịch sử sự kiện**, đường dẫn vẫn `/app/equipment-history`; thử filter thời gian/loại sự kiện và mở hồ sơ nguồn.
5. Xác nhận SM vẫn xem xét/tiếp nhận SR và tạo/điều phối WO được. Customer User vẫn tạo SR ở T06.

**Mong đợi:** URL tạo SR của SM bị chặn, không mở form. Lịch sử sự kiện nêu rõ phạm vi hồ sơ thiết bị/dịch vụ; không phải audit tất cả service. Việc thu hồi quyền tạo SR qua API trực tiếp còn chờ H08 của backend; ca UI này không thay thế kiểm tra quyền backend đó.

### T10 — Form Kho và giao dịch

**Tài khoản:** `inventory@demo.local`. TA/SM không có các nút ghi kho chỉ dành cho Inventory Staff hiện tại.

1. `/app/inventory/parts`: bấm Thêm phụ tùng; điền SKU UAT riêng, tên, đơn vị và mô tả nhiều dòng. Bấm Hủy; mở lại phải còn draft và chưa tạo bản ghi.
2. Lưu hợp lệ: nút/field khóa lúc gửi, form đóng sau thành công, tìm lại SKU vừa lưu. Tạo lại SKU trùng phải báo lỗi và giữ form để sửa.
3. `/app/inventory/warehouses`: làm tương tự với Thêm kho; chọn đúng chi nhánh HCM, dùng mã UAT riêng. Hủy rồi mở lại không làm mất draft.
4. `/app/inventory/transactions`: lúc đầu không trải sẵn form. Bấm Thêm giao dịch, chọn Nhập kho, kho/phụ tùng UAT, số lượng `1`, chứng từ `UAT-001` hoặc ghi chú UAT.
5. Thử số lượng `0`/âm, rồi sửa về `1`. Hủy, mở lại, kiểm tra nội dung còn; cuối cùng ghi nhận đúng một lần.

**Mong đợi:** lỗi không làm mất nội dung; input/nút Hủy khóa trong lúc gửi. Giao dịch thành công có đúng một dòng và tồn tăng đúng một đơn vị. Các thao tác Lưu/Tạo ở ca này sẽ thêm dữ liệu thử nghiệm; ghi mã UAT để đối chiếu riêng với dữ liệu demo.

## 4. Lượt đầy đủ với file 25 máy

File đi kèm:

- [nguyen-ui-uat-25.csv](fixtures/nguyen-ui-uat-25.csv): 25 máy có mã/serial riêng; 10 máy mua ngày 01/11/2026, 15 máy mua ngày 15/11/2026.
- [nguyen-ui-uat-duplicate.csv](fixtures/nguyen-ui-uat-duplicate.csv): hai dòng trùng để thử lỗi trước khi ghi.

Nhập thành công file đầu sẽ thêm **25 thiết bị và hồ sơ đăng ký nháp** vào dữ liệu local. Nếu đã nhập cùng bộ mã, báo trùng là đúng; để chạy lượt khác hãy đổi cả mã máy và serial của file, rồi giữ prefix riêng để lọc.

### T11 — Import CSV, ghép cột và preview

**Tài khoản:** TA hoặc SM. **Trang:** `/app/bulk-handovers`.

1. Chọn Bệnh viện An Phúc, site HCM và model US-100 đang hoạt động làm mặc định. Có thể chọn vị trí lá làm mặc định để test đếm cây sau đó.
2. Chọn file 25 máy. Ghép cột như sau:

| Trường trên UI | Cột trong file |
|---|---|
| Mã thiết bị | `Ma_may` |
| Số sê-ri | `So_serial` |
| Tên máy | `Ten_may` |
| Ngày mua | `Ngay_mua` |
| Model, cơ sở, vị trí | Dùng mặc định đã chọn; file này không có các cột đó |

3. Bấm Kiểm tra danh sách; phải có 25 dòng hợp lệ và chưa tạo máy.
4. Đổi mapping/ngày/file rồi kiểm tra preview cũ bị bỏ, không cho dùng kết quả cũ để ghi.
5. Đổi sang file duplicate và ghép lại các cột; kiểm tra báo trùng, không thêm máy.
6. Chọn lại file hợp lệ, preview lại; bấm Tạo 25 hồ sơ bàn giao để thực hiện phần ghi dữ liệu.

**Mong đợi:** tạo 25 hồ sơ nháp, có liên kết từng hồ sơ. Chưa tự kích hoạt bảo hành/bảo trì hoặc coi khách đã xác nhận. Serial giữ các số 0 ở đầu.

**Thử XLSX:** thực hiện preview XLSX trước bước 6 nếu muốn so sánh cùng bộ mã. Mở file bằng chức năng nhập CSV của Excel, chọn UTF-8 và đặt cột serial là Text; lưu bản `.xlsx`. Chọn lại, ghép cột tương tự. Với dữ liệu/mã chưa tồn tại, kết quả preview phải tương đương CSV; ngày mua vẫn là 01/11 và 15/11 dù ô Excel lưu ngày dạng số. Giữ serial dạng text khi sửa/lưu Excel để không làm mất số 0 ngay trong file nguồn.

### T12 — Phân trang, summary và export toàn kết quả

**Trang:** `/app/equipment`. Xóa filter cũ, tìm `UAT-NGUYEN-20261121-` rồi Áp dụng bộ lọc.

1. Với một lượt import thành công và chưa thêm bộ cùng prefix khác: phải có **25 kết quả**, trang đầu 20, trang sau 5.
2. Lọc Ngày mua từ 01/11/2026 đến 10/11/2026: phải còn **10 máy**. Ẩn cột ngày vẫn còn 10; bỏ chip ngày mua trả lại 25.
3. Giữ 25 kết quả, ẩn một cột và đổi thứ tự các cột khác. Chọn Nội dung xuất → Các cột đang hiển thị; xuất CSV và XLSX.
4. Mở file: có **25 dòng dữ liệu**, không chỉ 20 dòng trang đầu. Cột nghiệp vụ theo lựa chọn/thứ tự; các cột định danh và metadata xuất đi kèm vẫn có thể hiện diện.
5. Chọn hai máy trang 1, qua trang 2 chọn một máy; dùng Xuất 3 dòng đã chọn ở cả hai định dạng.

**Mong đợi:** file có đúng ba mã đã chọn, không trùng. Tên tiếng Việt/ngày đúng; XLSX giữ serial dạng text. CSV nguyên gốc giữ chuỗi serial; khi đọc bằng Excel cần chọn kiểu Text để Excel không tự đổi dữ liệu. Kiểm tra summary theo tập đã lọc, không theo số dòng trang hiện tại.

### T13 — Cập nhật một máy bằng file

1. Chọn đúng một máy UAT; Nội dung xuất → **Mẫu cập nhật thiết bị** → xuất dòng đã chọn bằng XLSX.
2. Giữ nguyên `equipmentId`, `updatedAt`, mã và serial. Để kiểm tra cập nhật có phạm vi nhỏ, chỉ giữ ba cột: `equipmentId`, `updatedAt`, `purchaseDate`; đổi `purchaseDate` thành một ngày hợp lệ khác.
3. Ở danh sách Thiết bị, bấm **Nhập / cập nhật lô**, chọn file vừa sửa → **Kiểm tra dữ liệu** → **Cập nhật lô**.
4. Bấm **Xem chi tiết** để đọc lại máy; kiểm tra mã/serial/ID không đổi và ngày mua đã đổi.
5. Dùng lại file cũ với giá trị `updatedAt` trước lần cập nhật; phải báo xung đột/phiên bản cũ, không ghi đè âm thầm.

**Mong đợi:** không tạo máy mới; chỉ đổi trường được yêu cầu, không lấy ngày mua làm ngày bắt đầu bảo hành. Ô trống trong file giữ nguyên dữ liệu; muốn xóa ngày hoặc location dùng `__CLEAR__` có chủ đích. Nếu muốn cập nhật thêm trường khác, tải mẫu mới để có version mới nhất.

## 5. Trạng thái lỗi, phạm vi và màn hình nhỏ

### T14 — Đóng/mở Drawer, bàn phím, responsive

1. Mở Drawer Thiết bị/Request/WO; dùng Tab/Shift+Tab, Enter và Esc.
2. Focus phải nhìn rõ và không đi vào nền khi modal đang mở; đóng xong tiếp tục dùng danh sách được.
3. F12 → chế độ thiết bị, thử chiều rộng 390 px và 768 px. Đọc bảng bằng cuộn ngang; mở/đóng Drawer, tìm nút xác nhận/đóng.
4. Thử Đội ngũ kỹ thuật, KPI và cây vị trí trên màn hẹp; xem không có chữ/nút bị cắt mất vĩnh viễn hoặc một phần chồng lên phần khác.

**Mong đợi:** Drawer cuộn được, thao tác không bị che; bảng giữ tiêu đề và thông tin nhận dạng. Điều phối nhanh đang gửi có thể chặn Esc/Đóng để tránh người dùng hiểu nhầm đã hủy thao tác đang chạy.

### T15 — Tải chậm, lỗi mạng và đổi tài khoản

**Phần đọc, dễ thực hiện:** F12 → Network → chọn Slow 3G hoặc Offline, rồi mở một danh sách hoặc Drawer chưa tải. Phải thấy đang tải/lỗi, không hiện 0 hoặc danh sách rỗng như thành công. Trả về No throttling/Online, tải lại hoặc mở lại để tiếp tục. Gõ mã không tồn tại phải cho trạng thái không có kết quả, khác lỗi mạng.

**Phạm vi:** ghi lại URL máy của Bệnh viện An Phúc. Đăng nhập `factory.user@demo.local`, mở lại URL Portal đó. Không được đọc hồ sơ hoặc lóe dữ liệu tài khoản trước. Làm tương tự với SR Đà Nẵng khi đăng nhập SM HCM; ghi kết quả từ chối/không tìm thấy. Branch mặc định của TA không cấp thêm quyền cho SM/khách.

**Phần ghi nâng cao:** mất phản hồi sau POST và trước khi UI nhận kết quả khó tái hiện chính xác bằng cách chỉ bật Offline. Để kiểm tra thủ công, bật Preserve log và mạng chậm, gửi Quick Dispatch/giao dịch UAT, ngắt mạng khi request đang chờ. Ghi rõ không biết POST đã được backend xử lý hay chưa; sau khi online lại dùng nút đối soát/khôi phục của đúng thao tác, kiểm tra số WO/giao dịch/tồn thực tế. Không coi việc bật Offline trước khi bấm gửi là bằng chứng đã kiểm tra trường hợp server ghi thành công nhưng mất response. Các ca này đã có test tự động riêng và chưa được thay bằng kết luận UAT.

## 6. Các giới hạn không đánh dấu nhầm thành lỗi UI mới

| Hiện tượng | Trạng thái hiện tại |
|---|---|
| Chi phí lũy kế là `—` | Chưa có nguồn tổng hợp chi phí |
| Chưa có báo cáo khách trong Portal | Chờ API báo cáo đúng customer scope |
| Chưa có chọn phụ tùng liên kết đầy đủ trong báo giá | Chờ `partId`/snapshot/producer từ Service Request |
| Public QR chưa có upload ảnh | Chưa có contract media cho báo lỗi vãng lai; báo lỗi hiện không tự thành SR/WO |
| Import tạo DRAFT, chưa ghi nhận xác nhận ngoài hệ thống | Backend luồng import mới chưa hoàn tất |
| SM vẫn có quyền tạo SR nếu gọi API trực tiếp | H08 backend đang chờ; Web đã bỏ CTA/route. Đây là công việc chưa hoàn thành, không được ghi Q09 đã đạt toàn phần |
| Header không lọc Equipment/Maintenance hoặc tổng quan WO | Mặc định branch hiện chỉ nối các endpoint đã hỗ trợ; filter riêng trên trang được ưu tiên |

## 7. Phiếu ghi kết quả

| Ca | Tài khoản | Kết quả | Mã hồ sơ / ghi chú |
|---|---|---|---|
| T01 Toolbar | | Chưa thử | |
| T02 Thiết bị | | Chưa thử | |
| T03 Khách hàng/cây vị trí | | Chưa thử | |
| T04 Chi nhánh | | Chưa thử | |
| T05 Bảng Request/WO và chi tiết | | Chưa thử | |
| T06 Điều phối nhanh | | Chưa thử | |
| T07 Đội kỹ thuật | | Chưa thử | |
| T08 KPI | | Chưa thử | |
| T09 Role SM/lịch sử | | Chưa thử | |
| T10 Kho | | Chưa thử | |
| T11 Import | | Chưa thử | |
| T12 Export/phân trang | | Chưa thử | |
| T13 Update file | | Chưa thử | |
| T14 Bàn phím/màn nhỏ | | Chưa thử | |
| T15 Lỗi mạng/phạm vi | | Chưa thử | |

Khi báo lỗi, dùng mẫu:

```text
Ca: Txx
Tài khoản / vai trò:
URL và mã hồ sơ:
Các bước vừa làm:
Mong đợi:
Thực tế:
Ảnh màn hình / thông báo lỗi:
```
