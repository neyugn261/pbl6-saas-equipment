# Đề xuất luồng lô thiết bị, bổ sung lắp đặt và bảng tra cứu

> **Điều chỉnh mới nhất theo người dùng:** [So sánh yêu cầu đã chỉnh với code hiện tại](../reports/2026-11-19-user-flow-vs-current-equipment.md) là mốc yêu cầu ưu tiên. Số máy tùy thực tế, không giới hạn nghiệp vụ/file ở 50; xác nhận nhóm đã thực hiện ngoài hệ thống trước upload, không bắt xác nhận lại trên Portal cho luồng import mới; nơi/vị trí lắp phải chi tiết đến từng máy và có thể bổ sung sau theo giai đoạn. Những phần dưới còn mô tả giới hạn 50 dòng hoặc xây xác nhận nhóm trong hệ thống là đề xuất cũ, chưa được triển khai và đã được điều chỉnh; không dùng làm yêu cầu hiện hành.

Ngày: 19/11/2026. Phạm vi: Web, Asset và tham chiếu Organization; không sửa mobile.

Tài liệu mô tả thiết kế cần triển khai theo yêu cầu mới của người dùng. Không phải báo cáo tính năng đã hoàn thành. Lượt này chưa thay schema, API, state machine hoặc dữ liệu local để áp dụng thiết kế mới.

**Rà soát lần hai:** [Đánh giá khắt khe và các điều kiện cần bổ sung](../reports/2026-11-19-equipment-flow-critical-review.md). Các bổ sung dưới đây điều chỉnh cách hiểu của bản đầu; không tự thay đổi những quy tắc nghiệp vụ đã được người dùng chốt.

## 1. Yêu cầu và quyết định đã có

- Tình huống thiết kế là một khách hàng nhận 50 máy thuộc nhiều model/loại máy. Mỗi dòng file là một máy vật lý, có serial riêng. Giới hạn 50 dòng là giới hạn mỗi lần import MVP, không mặc định giới hạn số máy của một lô nghiệp vụ.
- Đăng ký ban đầu bằng CSV hoặc Excel; có thể chưa biết vị trí/địa chỉ lắp đặt từng máy.
- Bàn giao nhận hàng hoàn tất trước khi lắp máy. Sau đó được bổ sung thông tin lắp đặt bằng file cập nhật.
- Nhân viên bên cung cấp và khách hàng cần bảng thiết bị dạng hàng/cột, đủ thông tin theo quyền, tìm kiếm và bộ lọc chi tiết.
- **Đã được người dùng chốt: bảo hành của tất cả máy vẫn bắt đầu từ ngày bàn giao thực tế. Lắp đặt muộn không tự dời ngày bắt đầu/kết thúc bảo hành.** Không đổi sang mốc nghiệm thu lắp đặt theo model.
- Không triển khai đơn hàng, hóa đơn, thanh toán, quản lý kho thành phẩm hoặc ERP. “Lô” ở đây là nhóm hồ sơ thiết bị để đối chiếu việc đăng ký/giao nhận.

## 2. Các điểm code hiện tại chưa đáp ứng

| Hạng mục | Hiện tại | Thay đổi cần thực hiện |
|---|---|---|
| File nhập mới | CSV UTF-8; chỉ một số cột; chưa đọc XLSX | Hỗ trợ CSV và XLSX với cùng quy tắc xác thực, mẫu và preview |
| Nhiều model | Có modelId từng dòng; UI chủ yếu dùng model mặc định; người nhập phải biết UUID khi ghi đè | Dùng mã model/hãng có thể tra cứu; UI ánh xạ tên cột; model mặc định chỉ là tiện ích |
| Nơi lắp đặt | BulkInput và Equipment yêu cầu customerSiteId; locationId có thể trống | Thiết kế lại việc chưa xác định site lắp đặt; không tạo site giả để vượt ràng buộc |
| Địa chỉ | Chủ yếu tham chiếu site hiện tại | Phân biệt địa chỉ khách hàng, nơi nhận hàng và nơi lắp đặt; giữ snapshot địa chỉ của lần bàn giao |
| Cập nhật từ file | Bulk hiện chỉ tạo mới | Luồng riêng để bổ sung/cập nhật, có đối chiếu đúng máy, version và lịch sử |
| Bàn giao/lắp đặt | Có registration, handover và các ngày nhưng chưa thể hiện trọn hành trình nhận hàng trước/lắp sau | Tách trạng thái nhận hàng, lắp đặt và vận hành; không diễn giải IN_SERVICE là đã hoàn tất mọi bước |
| Bảng thiết bị | Có bảng cơ bản; chưa đủ các cột và bộ lọc người dùng yêu cầu | Bảng cấu hình cột, lọc/sắp xếp/phân trang phía server, xuất dữ liệu theo bộ lọc và quyền |
| Tìm kiếm API | Có q, customerId, siteId, status, warranty, operationalStatus, registrationStatus; sort giới hạn | Bổ sung lọc nhiều khách/model/loại máy, khoảng ngày, trạng thái giao/lắp, lô và sắp xếp các cột hỗ trợ |

Bằng chứng: `apps/asset-service/src/registrations/bulk.dto.ts`, `apps/asset-service/prisma/schema.prisma`, `apps/asset-service/src/equipment/dto/equipment.dto.ts`, `apps/asset-service/src/model-policies/model-setup.service.ts`, `apps/web/src/App.tsx`.

ERD SQL và Prisma hiện đều bắt buộc site của Equipment. Cho phép chưa xác định địa điểm lắp đặt là thay đổi dữ liệu/nghiệp vụ, không thể giải quyết chỉ bằng thêm textbox. Cần ADR, migration, contract và kiểm tra các consumer trước khi sửa backend. Không tự nới customerId/tenantId.

## 3. Luồng đề xuất cho lô 50 máy

### Bước 1 — Chọn khách hàng và nhập hồ sơ

Chọn một khách hàng trong tenant, chi nhánh bên cung cấp chịu trách nhiệm, đặt mã lô đăng ký. Tải CSV/XLSX chứa 50 dòng với nhiều model. Một lô thuộc một khách hàng; không tự nhận file chứa máy của nhiều khách khác nhau.

Hệ thống ánh xạ model theo mã; kiểm tra serial/mã máy, khách hàng và các địa điểm đã biết. Dữ liệu chưa rõ được chỉ ra trước khi ghi. Địa chỉ lắp đặt chưa biết được đánh dấu chưa xác định, không điền địa chỉ trụ sở thay thế.

Kết quả là hồ sơ đăng ký nháp của từng máy, không phải bằng chứng đã giao hàng hoặc đã lắp đặt.

### Bước 2 — Chuẩn bị và xác nhận nhận hàng

Nhân viên chọn đúng các máy thực tế giao, ghi nơi nhận hàng, ngày giao thực tế, tình trạng và người nhận/căn cứ giao nhận; kiểm tra chính sách bảo hành/bảo trì trước khi gửi.

Lô nhập và đợt giao nhận là hai khái niệm khác nhau: 50 máy có thể giao 30 máy trước, 20 máy sau. Ngày giao nhận và trạng thái phải có ở từng máy, kể cả khi thao tác nhiều máy cùng lúc. Không đánh dấu cả lô đã giao chỉ vì đã import đủ 50 dòng.

Tại cơ sở khách: khách xem đúng danh sách và nội dung gửi để xác nhận theo quyền hiện hành. Tại cửa hàng: nhân viên ghi hoàn tất và căn cứ theo luồng STORE. Không tự thêm quyền nhân viên xác nhận thay khách ở luồng vốn bắt buộc khách xác nhận. Nhận hàng xác nhận đúng máy/số lượng/tình trạng đã quan sát; không đồng nghĩa đã nghiệm thu lắp đặt hoặc xác nhận máy hoạt động.

Đối với 50 máy, thiết kế mới cần thao tác xác nhận nhóm để không buộc khách bấm 50 lần, nhưng vẫn lưu bằng chứng/kết quả theo từng máy. Phải thấy rõ các máy trong phạm vi xác nhận; máy thiếu/sai/hỏng tách ngoại lệ, không chốt cả lô là đã nhận đủ. Không coi bulk import hiện có là bulk acceptance đã được triển khai; đây là phần contract/UI cần bổ sung.

Sau giao nhận, máy hiển thị “Đã bàn giao · Chưa lắp đặt” nếu chưa có thông tin lắp. Bảo hành dùng ngày bàn giao thực tế đã xác nhận, không dùng ngày import hoặc ngày bấm xác nhận muộn hơn.

### Bước 3 — Bổ sung lắp đặt

Xuất file từ chính danh sách máy cần cập nhật. File có mã thiết bị, model, serial, version và các cột lắp đặt được phép sửa. Nhân viên điền địa điểm/vị trí, ngày lắp thực tế, thông tin người thực hiện nếu có rồi import ở chế độ cập nhật.

Có thể bổ sung địa điểm dự kiến trước khi đi lắp; phải gắn nhãn dự kiến. Chỉ ghi “đã lắp đặt” khi có ngày thực tế và thông tin phù hợp. Không dùng địa chỉ dự kiến như bằng chứng lắp đặt.

Theo quy trình người dùng yêu cầu, giao nhận phải diễn ra trước lắp đặt. Cần phân biệt thời điểm thực tế và thời điểm nhập dữ liệu để xử lý khai báo muộn có căn cứ; không tự tạo ngoại lệ bỏ xác nhận. Ngày lắp thực tế không trước ngày bàn giao, không nằm trong tương lai. Ngày dự kiến dùng trường riêng. Máy không cần lắp có trạng thái riêng, không dùng ngày lắp giả. Chạy thử/nghiệm thu được ghi riêng nếu có, không bắt mọi máy phải có một quy trình nghiệm thu mới.

Đổi địa điểm lắp sang chi nhánh phục vụ khác cần xác định lại trách nhiệm và ghi lịch sử; không tự cấp quyền cho nhân viên chi nhánh khác từ nội dung một ô Excel.

### Bước 4 — Tra cứu và phục vụ sau bán hàng

Cùng một equipmentId tiếp tục chứa lịch sử giao nhận, lắp đặt, chuyển vị trí, bảo hành, bảo trì và sửa chữa. Lần import bổ sung không tạo máy mới, không xóa phiếu bàn giao cũ và không kéo dài bảo hành.

Trước khi triển khai phải bổ sung: phạm vi công bố nháp cho khách; quy tắc hiệu chỉnh ngày giao đã xác nhận; đơn vị thực hiện lắp/nguồn kiểm chứng; trường hợp máy thiếu/sai/hỏng; trách nhiệm khi chờ lắp; điều kiện lịch bảo trì cho máy chưa sẵn sàng. Mốc bảo trì không tự bị buộc giống bảo hành hoặc đổi khỏi ADR hiện hành. Chi tiết và ca nghiệm thu ở bản rà soát lần hai.

## 4. Ba địa chỉ cần phân biệt

| Thông tin | Ý nghĩa | Chủ sở hữu dữ liệu và quy tắc |
|---|---|---|
| Địa chỉ doanh nghiệp khách hàng | Trụ sở/thông tin liên hệ của bên mua | Organization; không ghi đè từ một file máy |
| Địa chỉ nhận hàng | Kho, văn phòng, công trình hoặc nơi nhận lô/đợt giao | Thông tin giao nhận; snapshot giữ nguyên trong hồ sơ đã xác nhận |
| Địa chỉ lắp đặt | Cơ sở và vị trí thực tế của từng máy | Customer Site/Location trong Organization; Asset giữ logical reference và lịch sử |

Ba địa chỉ có thể giống nhau, nhưng không mặc định là một. “Chi nhánh bên cung cấp” là Branch nội bộ của tenant; “cơ sở khách hàng” là Customer Site. Không dùng hai khái niệm thay nhau.

Khi chưa có site lắp đặt, trách nhiệm dịch vụ phải vẫn xác định được từ chi nhánh được giao quản lý hồ sơ. Cần thiết kế tham chiếu rõ ràng thay vì dựa bắt buộc vào site chưa tồn tại. Không tạo foreign key hoặc JOIN xuyên database.

## 5. File nhập và cập nhật

### 5.1 Trường nhập mới

| Nhóm | Cột gợi ý | Quy tắc |
|---|---|---|
| Nhận dạng | Mã lô, mã thiết bị, serial, mã model, hãng, tên hiển thị | Mã model phân giải được; không bắt người dùng nhập UUID. Serial là text, giữ số 0 đầu |
| Khách hàng | Mã khách, tên khách | Khớp khách đã chọn; tên để đối chiếu, không tự đổi master data |
| Giao nhận | Phương thức, nơi nhận dự kiến, ghi chú | Ngày thực tế chỉ ghi khi đã diễn ra; không import thành xác nhận khách |
| Lắp đặt | Mã cơ sở, tên cơ sở, địa chỉ, mã/vị trí, ngày dự kiến | Có thể trống. Cơ sở đã tồn tại phải thuộc đúng khách |
| Thiết bị | Loại mặt hàng, nhóm model, cấu hình/thông số, ghi chú | Loại/hãng/thông số chuẩn kế thừa model; chỉ ghi override được phép, không tạo dữ liệu chuẩn mâu thuẫn |
| Liên hệ | Người nhận, người liên hệ lắp đặt và điện thoại công việc | Chỉ theo quyền và mục đích phục vụ; tránh lặp lại ở mọi dòng nếu dùng chung |

Địa chỉ/tên khách hoặc site trong file dùng để đối chiếu. Nếu lệch mã tham chiếu, báo lỗi/cảnh báo để người có quyền xử lý; không âm thầm sửa địa chỉ Organization hoặc tự tạo nhiều site trùng tên.

### 5.2 Chế độ cập nhật lắp đặt

- Tách rõ “Tạo thiết bị mới” và “Cập nhật thiết bị đã có”. Không tự đoán rồi upsert.
- Khóa đối chiếu là mã thiết bị trong tenant; kiểm tra thêm model/serial. ID/version từ file xuất giúp chống cập nhật nhầm và xung đột.
- Cột mã/serial/model/khách hàng là thông tin kiểm tra, không tự đổi chủ sở hữu hoặc nhận dạng từ luồng cập nhật lắp đặt.
- Chỉ sửa các trường người dùng chọn. Ô trống mặc định là giữ nguyên; muốn xóa phải chọn thao tác xóa rõ ràng và qua kiểm tra điều kiện.
- Preview hiển thị từng dòng: máy khớp, dữ liệu trước/sau, trường giữ nguyên, cảnh báo/lỗi, version thay đổi.
- Dòng sai bị chặn. Mặc định cần sửa hết lỗi rồi xác nhận cả lô tối đa 50 máy; nếu hỗ trợ chỉ ghi các dòng hợp lệ, phải là lựa chọn rõ ràng và có báo cáo kết quả từng dòng.
- Phân giải tham chiếu qua API trước khi giữ transaction local. Không hứa transaction nguyên tử giữa nhiều database. Không tự tạo Customer/Site/Model trong transaction Asset.
- Gửi lại cùng lệnh không ghi hai lần. Lỗi/mất phản hồi có mã lô để tra cứu kết quả, không tự tạo key mới và gửi lại mù.
- Audit giữ người cập nhật, thời gian, file/lô, máy, dữ liệu trước/sau và lý do. Không thay nội dung snapshot bàn giao đã được khách xác nhận.

XLSX: đọc dữ liệu ô theo schema, không chạy macro/công thức. CSV xuất phải xử lý giá trị có thể bị ứng dụng bảng tính coi là công thức. Giới hạn file/dòng và cảnh báo serial đã mất số 0 vì Excel; hệ thống không thể khôi phục số đã bị người soạn file làm mất.

## 6. Bảng thiết bị dạng grid

Mỗi hàng là một máy vật lý. Mọi trường có cấu trúc phải có cột tương ứng hoặc nhóm cột tùy chọn theo quyền; không ép người dùng mở từng máy chỉ để tìm serial/địa chỉ/ngày bàn giao.

Không bật toàn bộ 30–40 cột cùng lúc. Cho phép bật/tắt, đổi thứ tự, lưu chế độ xem theo người dùng và cuộn ngang; cố định nhận dạng để không mất dấu hàng. Chi tiết dài có tooltip/mở rộng ô; chọn hàng mở hồ sơ/drawer, không tự thực hiện mutation.

### 6.1 Cột mặc định

| Cột | Nội dung |
|---|---|
| Mã thiết bị | Mã nghiệp vụ, mở hồ sơ đúng máy |
| Serial | Hiện đầy đủ theo quyền trong grid có đăng nhập |
| Tên máy | Tên hiển thị thực tế, không chỉ tên model |
| Hãng / model | Nhận dạng đúng dòng sản phẩm |
| Loại thiết bị | Nhóm mặt hàng để phân loại và lọc |
| Khách hàng | Tên và mã; phía khách có thể ẩn vì đã nằm trong phạm vi của mình |
| Cơ sở lắp đặt | Tên/mã hoặc “Chưa xác định”; phân biệt dự kiến/thực tế |
| Địa chỉ lắp đặt | Đầy đủ theo quyền, không thay bằng trụ sở khách |
| Vị trí trong cơ sở | Tòa nhà/tầng/phòng/khu vực, có đường dẫn phân cấp |
| Ngày bàn giao thực tế | Có thể khác nhau giữa các máy của cùng lô |
| Giao nhận / lắp đặt | Hai trạng thái riêng, không gom thành một “Hoàn tất” |
| Bảo hành | Trạng thái và ngày hết hạn; không có ngày chưa được diễn giải là hết bảo hành |

### 6.2 Các cột mở rộng cần có

| Nhóm | Các cột |
|---|---|
| Lô và hồ sơ | Mã lô đăng ký, mã đợt giao/phiếu bàn giao, trạng thái đăng ký, thời điểm/người xác nhận |
| Địa chỉ/liên hệ | Địa chỉ khách hàng, địa chỉ nhận hàng, người nhận, người liên hệ lắp đặt, điện thoại theo quyền |
| Lắp đặt | Yêu cầu lắp đặt hay không, ngày dự kiến, ngày thực tế, ngày chạy thử/nghiệm thu nếu có, người/đơn vị thực hiện |
| Chính sách | Ngày bắt đầu/kết thúc bảo hành, tên/phiên bản chính sách, lý do không áp dụng, trạng thái thiết lập bảo trì |
| Vận hành | Tình trạng vận hành xác nhận gần nhất, thời điểm xác nhận, ngày dịch vụ gần nhất, kỳ bảo trì tiếp theo |
| Trách nhiệm | Chi nhánh bên cung cấp phụ trách, người liên hệ dịch vụ theo dữ liệu có thật |
| Dữ liệu | Thông số đặc thù được chọn làm cột, thông tin còn thiếu, ghi chú được công bố, ngày cập nhật cuối |

Lịch sử sửa chữa/thay linh kiện có nhiều dòng theo thời gian: grid hiển thị tóm tắt/lần gần nhất và mở lịch sử chi tiết theo máy; không gộp toàn bộ lịch sử thành một ô dài và gọi là “đủ thông tin”. Ghi chú nội bộ, giá vốn hoặc dữ liệu người dùng không được phép xem không xuất hiện qua tùy chọn cột hay export.

## 7. Bộ lọc, tìm kiếm và xuất dữ liệu

### 7.1 Bộ lọc cần cung cấp

- Khách hàng: một hoặc nhiều công ty trong phạm vi được phép; mã/tên.
- Cơ sở khách hàng: nhiều cơ sở; vùng/tỉnh thành nếu có dữ liệu chuẩn; vị trí phân cấp.
- Chi nhánh bên cung cấp phụ trách: theo scope, không mở phạm vi chỉ vì sửa query.
- Loại thiết bị, hãng, một hoặc nhiều model.
- Mã máy/serial: tìm chính xác, chứa, hoặc dán danh sách nhiều serial từ Excel.
- Mã lô, phiếu/đợt giao nhận.
- Khoảng ngày bàn giao, ngày lắp đặt, ngày dự kiến; hỗ trợ “chưa có ngày”.
- Chưa giao/đang chờ xác nhận/đã giao; không cần lắp/chưa xác định nơi lắp/chờ lắp/đã lắp.
- Còn bảo hành, sắp hết trong N ngày, hết bảo hành, không áp dụng, chưa thiết lập; không gộp các trạng thái này.
- Tình trạng vận hành, đang có yêu cầu/WO, bảo trì sắp đến hạn nếu endpoint cung cấp được dữ liệu thật.
- Thông tin còn thiếu: địa điểm/vị trí/ngày thực tế/liên hệ/chính sách.

Các filter khác nhóm kết hợp AND; nhiều giá trị trong cùng nhóm dùng OR. Ví dụ `(khách A hoặc B) AND model X AND bàn giao trong tháng 11 AND chưa lắp`.

### 7.2 Hành vi UI/API

- Tìm nhanh theo mã/serial/tên/model; tìm chính xác không được âm thầm chuyển thành chứa khi không có kết quả.
- Filter, sort, phân trang và tổng số xử lý phía server cho toàn bộ tập dữ liệu, không lọc 20 dòng đang tải rồi gọi là kết quả toàn hệ thống.
- Chips hiển thị điều kiện, nút xóa từng điều kiện/xóa tất cả; đưa điều kiện vào URL để mở lại. Chế độ xem lưu riêng theo người dùng, vẫn áp scope hiện tại.
- Sắp xếp có thứ tự ổn định khi trùng giá trị; ngày null có quy tắc rõ; sắp xếp nhiều cột chỉ khi API hỗ trợ.
- Chọn nhiều dòng phải ghi rõ chọn trang này hay toàn bộ kết quả. Preview phạm vi trước khi export/cập nhật. Không xuất thêm những hồ sơ ngoài scope.
- Xuất trang này/toàn bộ kết quả đã lọc; cột theo quyền và có lựa chọn xuất mẫu cập nhật. Không gọi file export thông thường là lệnh cập nhật tự động.
- Tổng số/lượng còn thiếu/bảo hành sắp hết phải có endpoint tổng hợp đúng filter; nếu chỉ thống kê trang hiện tại phải ghi rõ.
- Lỗi tải khác với không có kết quả; kết quả của phiên/khách hàng trước không được lóe lại khi đổi scope.

## 8. Phạm vi người dùng

| Người dùng | Phạm vi |
|---|---|
| Tenant Admin bên cung cấp | Khách hàng và thiết bị của tenant theo quyền quản trị hiện hành |
| Service Manager / nhân viên bên cung cấp | Khách hàng A/B/C trong phạm vi được cấp; hồ sơ có ràng buộc chi nhánh phải giữ đúng scope |
| Customer Admin / Customer User bên mua | Thiết bị của chính khách hàng đã liên kết, theo quyền hiện hành; có thể lọc các cơ sở của mình |
| Technician / Inventory Staff | Cột và thao tác phục vụ công việc theo RBAC, không mặc định được import/cập nhật hoặc xem ghi chú/giá nhạy cảm |

Nếu “nhân viên dịch vụ bên mua” là nhân viên của khách A, họ không được lọc xem dữ liệu của khách B/C độc lập. Muốn một tài khoản đại diện nhiều công ty cần yêu cầu phân quyền riêng được nhóm chốt; bản đề xuất không tự mở rộng mô hình đó.

Nhân viên khách hàng có thể xem và xác nhận theo quyền hiện tại. Quyền tự sửa/import vị trí lắp đặt của khách chưa được coi là đã cấp; đề xuất dùng quyền hiện có của bên cung cấp trước, tránh vô tình tạo đường đổi dữ liệu hoặc vượt phạm vi.

## 9. Thứ tự triển khai

1. Chốt ADR về nhận hàng trước/lắp sau, địa điểm chưa xác định, trách nhiệm chi nhánh khi chưa có site; giữ mốc bảo hành ngày bàn giao đã được người dùng quyết định.
2. Thiết kế UI grid, nhóm cột, filter, trạng thái trống/lỗi/thiếu dữ liệu và hai chế độ import. Gắn rõ trạng thái chưa có API, không làm nút báo thành công giả.
3. Asset + Organization: contract/migration cho các địa chỉ/ngày/trạng thái và tham chiếu chưa xác định; đối chiếu ERD, gateway, data scope và consumers. Model/customer/site lookup dùng API, không đọc DB service khác.
4. API list/filter/sort/export và tổng hợp; sau đó nối grid bằng dữ liệu thật. Không dùng tải toàn tenant về browser để giả lập lọc server.
5. Nhập mới CSV/XLSX nhiều model và nhiều nơi lắp trong cùng khách; preview, idempotency và audit.
6. Cập nhật lắp đặt từ file xuất; whitelist trường, version, đối soát, giữ lịch sử và các snapshot đã xác nhận.
7. Rà soát luồng giao nhận/kích hoạt bảo hành/lịch bảo trì hiện có để không buộc hoàn tất lắp đặt trước nhận hàng và không tự dời lịch khi bổ sung dữ liệu sau này.
8. Nghiệm thu trên Web với hai chi nhánh, hai khách hàng và 50 máy; không thay source Flutter trong phạm vi này.

## 10. Các ca nghiệm thu bắt buộc

1. 50 máy/5 model/1 khách, chưa biết địa điểm lắp: tạo được nháp, không sinh địa điểm giả, không tự có ngày bàn giao/bảo hành.
2. Serial có số 0 đầu, model chưa tồn tại, serial trùng trong file hoặc trong hệ thống, khách/site không khớp: preview giải thích đúng từng dòng.
3. Nhận 30 máy trước, 20 máy sau: trạng thái và ngày bàn giao riêng; bảo hành mỗi máy đúng ngày thực tế.
4. Import bổ sung nơi/ngày lắp cho 10 máy: đúng 10 máy cũ được cập nhật, tổng số vẫn 50.
5. File có ô trống không xóa dữ liệu; thao tác xóa có chủ đích có kiểm tra và lịch sử.
6. Hai nhân viên xuất cùng version rồi sửa: bản sau phát hiện xung đột, không ghi đè âm thầm.
7. Gửi lại lệnh do mất mạng: không thêm thiết bị, giao dịch hoặc lịch sử thành công trùng.
8. Ghi lắp thực tế trước khi giao nhận hoàn tất hoặc ngày lắp trước ngày giao: bị chặn; ngày dự kiến vẫn có thể ghi trước.
9. Thay site hiện tại không sửa địa chỉ đã được xác nhận trong phiếu bàn giao cũ; không đổi ngày bảo hành.
10. Lọc A/B + model + khoảng ngày + chưa lắp cho ra đúng toàn tập trên nhiều trang; export khớp kết quả và quyền.
11. Khách A sửa URL/filter/file để tham chiếu máy B: backend từ chối; export và tùy chọn cột không làm lộ dữ liệu.
12. Đổi vị trí sang chi nhánh khác: xử lý trách nhiệm/quyền, QR và dữ liệu lịch sử đúng contract hiện hành, không chỉ thay địa chỉ trên grid.
13. CSV/XLSX có công thức, file sai định dạng/quá giới hạn: không thực thi nội dung và không ghi một phần ngoài chế độ đã chọn.
14. Bảo trì/nguồn lịch sử chưa tải được: hiển thị chưa tải được, không kết luận “không có” hoặc tạo kế hoạch thay thế tự động.
