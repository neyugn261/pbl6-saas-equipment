# Rà soát mức độ đầy đủ của UI theo vai trò và hành trình

Ngày: 08/11/2026. Phạm vi: web; không sửa hay đánh giá lại Flutter/mobile.

> Đây là rà soát trước lượt triển khai UI V2. Các lỗi F01–F06 đã được xử lý trong [báo cáo nghiệm thu V2](2026-11-08-workshop-ui-v2-acceptance.md), merge qua PR #65. Danh sách công việc tiếp theo hiện hành: [bàn giao Workshop](2026-11-08-workshop-ui-handoff.md). Không dùng các phát hiện lịch sử dưới đây để kết luận lỗi vẫn còn nguyên.

## 1. Kết luận

**UI hiện có nền thiết kế nhất quán và nhiều nghiệp vụ cốt lõi, nhưng chưa đủ để chốt thiết kế sản phẩm cho toàn bộ người dùng.** Cần hoàn thiện nội dung, bước ra quyết định, xử lý ngoại lệ và hành vi của form. Có cả thiếu sót thiết kế lẫn lỗi trạng thái UI cụ thể.

Đánh giá dựa trên code route/component hiện tại, nội dung bàn giao Workshop và DOM trang QA đang mở. Các phát hiện từ điều kiện code được ghi là phân tích tĩnh; không coi fixture QA là nghiệm thu backend hoặc nghiên cứu trực tiếp với người dùng.

Theo yêu cầu UI đi trước backend: các trường, trạng thái và màn hình đề xuất dưới đây phải được thiết kế đầy đủ dù API chưa có. Có thể review bằng fixture tách biệt; route sản phẩm không được báo lưu/duyệt thành công giả. Dữ liệu và hành động của bản thiết kế sẽ trở thành đầu vào cho contract backend sau.

Không dùng tỷ lệ phần trăm hoàn thiện vì chưa có danh mục màn hình/trạng thái được nghiệm thu làm mẫu số.

## 2. Các phần đã có và nên giữ

- Workshop chung, menu theo vai trò, portal khách hàng tách khỏi vận hành nội bộ.
- Nhận dạng thiết bị/serial, lịch sử và hồ sơ liên quan; vòng đời hồ sơ tách tình trạng vận hành.
- Request, WO, báo cáo, dự toán, bảo trì và bàn giao được trình bày thành các hồ sơ riêng.
- Kết luận bảo hành sự cố tách khỏi thời hạn bảo hành; có lý do và chính sách đã áp dụng.
- Có revision dự toán, hạn hiệu lực, dòng hạng mục, tổng tiền và phản hồi khách.
- Có checklist, tài liệu đính kèm, công bố nội bộ/khách, báo cáo kết quả một phần/chưa xử lý được.
- Có nhập/xuất/trả/điều chỉnh, tồn khả dụng/cách ly, đối soát, xác nhận dùng phụ tùng và điều chỉnh lịch sử.
- Có loading, lỗi, trạng thái chưa rõ kết quả và nhiều biện pháp chống thao tác trùng.

Các mục dưới đây là phần bổ sung/hoàn thiện; không coi các chức năng vừa nêu là chưa tồn tại.

## 3. Lỗi UI và điểm chưa hợp lý cụ thể

### F01 — P1: Nút khôi phục dự toán bị khóa khi cần dùng

**Bằng chứng:** `apps/web/src/routes/EstimatePanel.tsx:233–242`. Nút “Kiểm tra phiên bản đã lưu” nằm trong nhánh `uncertain`, nhưng lại có `disabled={busy || uncertain}`.

**Tác động:** khi kết quả thao tác chưa rõ, người dùng thấy hướng xử lý nhưng không bấm được.

**Thiết kế cần có:** khóa các lệnh ghi mới, cho phép đọc lại/đối soát. Hiển thị rõ chưa gửi, đang gửi, chưa rõ kết quả, đã tìm thấy và cần người hỗ trợ.

**Nghiệm thu UI:** mô phỏng mất phản hồi; nút kiểm tra hoạt động, giữ nội dung đang nhập, không tạo bản mới tự động. Đây là phát hiện từ code, chưa tái hiện qua backend thật trong lượt rà soát này.

### F02 — P1: Yêu cầu mới có thể không gửi được dù đã chọn máy hợp lệ

**Bằng chứng:** `apps/web/src/App.tsx:1381–1690`. Thiết bị đã chọn được tải riêng theo ID, nhưng nút gửi lại bị khóa theo `!data.value?.items.length` của kết quả tìm kiếm hiện tại.

**Tình huống:** chọn máy A, tìm tiếp một từ khóa không có kết quả; A vẫn là máy đã chọn và có dữ liệu hợp lệ nhưng nút gửi bị vô hiệu hóa.

**Thiết kế cần có:** trạng thái thiết bị đã chọn độc lập với danh sách đang tìm. Chỉ khóa gửi vì hồ sơ được chọn không hợp lệ, thiếu thông tin, đang gửi hoặc kết quả thao tác chưa rõ.

**Nghiệm thu UI:** danh sách tìm kiếm rỗng không làm mất lựa chọn hợp lệ; lựa chọn ngoài trang hiện tại vẫn hiển thị đủ tên, mã, serial, khách hàng và địa điểm. Phát hiện từ code.

### F03 — P1: Cách nhập/đọc số lượng kho còn dễ nhầm

**Bằng chứng:** `InventoryPages.tsx:475,495,526,528,537–545`. Có hướng dẫn “Nhập decimal string”, input yêu cầu dấu chấm, nhiều số lượng được hiển thị trực tiếp từ chuỗi; enum và UUID xuất hiện ở bảng/chọn giao dịch.

**Tác động:** `2.000 bộ` có thể được người dùng Việt Nam đọc thành hai nghìn thay vì hai; không rõ có cho phép số lượng lẻ hay cần nhập kiểu nào.

**Thiết kế cần có:** định dạng số lượng thống nhất tiếng Việt, đơn vị luôn đi kèm, ví dụ nhập rõ ràng, quy tắc số lẻ theo phụ tùng, lỗi ngay cạnh trường. Chuẩn hóa dữ liệu nội bộ phải giữ chính xác số thập phân. Mã kỹ thuật nằm trong mục chi tiết hỗ trợ sao chép; màn chính dùng mã phiếu/tên nghiệp vụ.

**Nghiệm thu UI:** phân biệt rõ `2 bộ`, `2,5 mét`, `2.000 bộ`; phụ tùng chỉ cho số nguyên không gợi ý nhập lẻ; không biến chuỗi số tiền/số lượng lớn thành số thực mất chính xác.

### F04 — P2: Nhánh form lịch cũ cần dùng chung quy ước múi giờ

**Bằng chứng:** ManagerOrderActions dùng offset `+07:00` khi lưu lịch; WorkOrderControls trong `M2Pages.tsx:1737` dùng `new Date(start).toISOString()`, phụ thuộc múi giờ trình duyệt.

**Tác động có điều kiện:** nhánh form cũ chỉ hiện khi có `allowedActions.update`. Route chung hiện chọn component mới cho Service Manager/Tenant Admin/Dispatcher; chưa kết luận đây là lỗi đang tác động mọi vai trò. Nếu nhánh cũ được bật hoặc tái sử dụng, trình duyệt ngoài UTC+7 có thể hiểu cùng giờ nhập khác với component mới.

**Thiết kế cần có:** một quy ước múi giờ có nhãn trên mọi màn hình, chung thành phần nhập/hiển thị lịch. Tách ngày đến hạn không có giờ, lịch dự kiến và lịch khách đã xác nhận.

**Nghiệm thu UI:** cùng dữ liệu mẫu hiển thị/nhập nhất quán trên hai múi giờ trình duyệt. Chưa thực hiện ca đổi múi giờ trong lượt này.

### F05 — P1: Chấp thuận chi phí chưa có bước đọc lại quyết định đủ rõ

**Bằng chứng:** `EstimatePanel.tsx:355–385`: khách bấm Chấp nhận gọi hành động trực tiếp; từ chối dùng `window.prompt`. Danh sách revision và hạng mục đã có, nhưng chưa có màn tổng kết chấp thuận/so sánh thay đổi.

**Thiết kế cần có:** modal có số yêu cầu, serial, revision, tổng, hạn hiệu lực, phạm vi bao gồm/không bao gồm; nút “Chấp thuận dự toán phiên bản …”. Từ chối bằng form lý do rõ ràng. Có so sánh bản cũ/bản mới và biên nhận sau hành động.

### F06 — P1: Báo cáo kỹ thuật dài vẫn dùng ô nhập một dòng và chưa có luồng bản nháp hoàn chỉnh

**Bằng chứng:** WorkOrderControls trong `M2Pages.tsx` dùng `input` cho mô tả/giải pháp tối đa 5.000 ký tự và tóm tắt 2.000 ký tự; form giữ dữ liệu bằng state. Luồng lỗi gọi refresh; cần kiểm tra nguy cơ unmount form khi tải lại dữ liệu.

**Thiết kế cần có:** textarea phù hợp; lưu nháp với trạng thái “chưa lưu/đang lưu/đã lưu”; xem trước phần nội bộ và phần khách được đọc; khôi phục sau reload/phiên hết hạn trong đúng phạm vi người dùng. Không suy ra cơ chế lưu nháp chung từ cơ chế khôi phục giao dịch kho hoặc registration vốn phục vụ luồng khác.

**Nghiệm thu UI:** báo cáo một phần bắt buộc chỉ rõ việc còn lại; refresh sau lỗi không xóa nội dung; đổi tài khoản không lộ nháp của tài khoản trước.

## 4. Mỗi vai trò còn cần gì?

| Vai trò | Đã có nền tảng | Phần UI cần hoàn thiện | Quyết định được hỗ trợ |
| --- | --- | --- | --- |
| Chủ doanh nghiệp / Tenant Admin | Số yêu cầu, WO, thiết bị, người dùng; quản trị tổ chức | Trang tổng quan theo chi nhánh/kỳ: việc kéo dài, sự cố lặp, khách/máy ảnh hưởng, ca đang bị chặn và người phụ trách; bấm số mở đúng danh sách | Cần can thiệp vào đâu và ai đang xử lý? |
| Service Manager | Bàn quyết định, bảo hành, chi phí, WO, kết quả | Chủ hồ sơ cụ thể, người cần phản hồi, thời điểm bắt đầu chờ, mốc cập nhật kế tiếp, việc còn lại; tổng kết trước khép hồ sơ | Bước nào cần quyết định và ai chịu trách nhiệm tiếp theo? |
| Dispatcher | Bảng WO, kỹ năng/chi nhánh, xem trước việc của người được chọn | Lịch ngày/tuần, việc chưa có lịch, tải theo thời lượng, cảnh báo trùng, liên hệ/giờ có thể tiếp cận site, trạng thái khách xác nhận lịch, lý do phân công lại | Giao người nào vào giờ nào, tại nơi nào? |
| Technician web | Việc của mình, nhận dạng máy, địa điểm, checklist, báo cáo, tệp | Một chuỗi bước công việc; thông tin vào hiện trường, người liên hệ, lịch sử gần nhất, nhu cầu vật tư; nháp và xem trước báo cáo; liên kết ảnh trước/sau vào đúng bước | Tôi có đủ thông tin để làm và chứng minh kết quả chưa? |
| Inventory Staff | Tồn, giao dịch, trả, cách ly, khôi phục và xác nhận sử dụng | Phiếu giao nhận với người giao/nhận, WO/máy, tồn trước/sau, số lượng tối đa được thao tác; bộ lọc thực dụng; đối soát bằng ngôn ngữ nghiệp vụ | Xuất/trả cho ai, còn phải giải trình lượng nào? |
| Customer Admin | Bàn giao, dự toán, lịch bảo trì, người dùng | Hộp quyết định chờ tôi; so sánh revision; xem đúng bản điều khoản; chấp thuận kết quả một phần với phạm vi rõ; người thay thế khi người duyệt vắng | Tôi đang đồng ý điều gì, còn phát sinh hay trách nhiệm gì? |
| Customer User | Hồ sơ máy, tạo yêu cầu, theo dõi và trao đổi | Form sự cố hướng dẫn, ảnh/mã lỗi/mức ảnh hưởng, người liên hệ và giờ thuận tiện; timeline dễ hiểu, mốc cập nhật, người liên hệ hỗ trợ; gửi bổ sung, báo chưa hài lòng/sự cố tái diễn | Đã tiếp nhận chưa, ai đang làm, tôi cần làm gì? |
| Platform Admin | Tenant, trạng thái, tạo tenant/mời admin | Hồ sơ vòng đời tenant: mới tạo/chờ admin kích hoạt/đang dùng/tạm khóa; lời mời hết hạn; lịch sử thao tác quản trị và ảnh hưởng trước khi đổi trạng thái | Tenant đang vướng gì và thao tác quản trị sẽ ảnh hưởng ai? |

Người có nhiều role cần nhìn thấy mình đang thao tác với tư cách nào, đặc biệt khi xác nhận thay khách, sửa quyền hoặc điều phối. Dùng role cố định, không tạo bộ máy role tùy chỉnh.

## 5. Các hành trình cần thiết kế đủ từ đầu đến cuối

### A. Khách gửi sự cố

**Cần thấy:** ảnh/nhận dạng máy, serial, nơi đặt, người liên hệ, mã lỗi, khi bắt đầu xảy ra, mức ảnh hưởng, có tiếp tục sử dụng được không, ảnh/video hoặc tài liệu được hỗ trợ, giờ có thể liên hệ.

**Cần làm rõ:** khách mô tả mức ảnh hưởng; bộ phận dịch vụ xác nhận mức ưu tiên xử lý. Loại yêu cầu có lựa chọn “Chưa rõ, cần kiểm tra”; khách không cần tự kết luận lỗi có được bảo hành.

**Ngoại lệ phải có UI:** không tìm thấy máy; máy đổi địa điểm; nghi trùng yêu cầu đang mở; gửi chưa rõ kết quả; file lỗi; cần sửa thông tin trước khi tiếp nhận. Không cho khách tự nhận máy của doanh nghiệp khác.

**Sau khi gửi:** biên nhận có mã, giờ gửi, máy, bên tiếp nhận, cách theo dõi và mốc phản hồi dự kiến nếu có. Không tự tạo một cam kết SLA chưa được chốt.

### B. Xét bảo hành và chi phí

Trình bày liên tục: điều khoản áp dụng → kết luận sự cố và căn cứ → phạm vi sẽ xử lý → khoản khách cần chấp thuận → bản đã chấp thuận → thực tế thực hiện.

UI cần hiển thị rõ lý do không bảo hành, tài liệu liên quan, phần nhân công/phụ tùng/đi lại, khoản phát sinh cần duyệt thêm, hạn hiệu lực và lý do thay revision. Có thông báo cho Customer User khi cần Customer Admin quyết định. Không thêm thanh toán/hóa đơn.

### C. Điều phối và thực hiện

Tách ba mốc: hạn cần xử lý, lịch kỹ thuật dự kiến, lịch khách đã đồng ý. Khi đổi lịch/địa điểm/phân công, có màn trước/sau, lý do, người liên quan và bước báo lại cho khách.

Kỹ thuật viên đọc thông tin liên hệ/điều kiện tiếp cận, việc còn lại của lần trước và vật tư. Khi tạm dừng, chọn nguyên nhân nghiệp vụ và bước cần hỗ trợ; không chỉ điền một lý do rồi mất dấu trách nhiệm.

### D. Kết thúc và theo dõi lại

Trang tổng kết cần trả lời: đã làm gì; kết quả kỹ thuật; tình trạng máy do ai xác nhận, khi nào; phụ tùng nào thực sự dùng; phạm vi chi phí đã đồng ý; phần chưa làm; ai xác nhận kết quả qua kênh nào; việc tiếp theo và người phụ trách.

Thiết kế riêng cho đã sửa hoàn toàn, một phần, chưa sửa được, khách không đồng ý, khách chưa phản hồi, xác nhận thay, lỗi tái diễn và hủy WO nhưng còn yêu cầu. Có biên bản có thể in/tải, ghi ngày và phiên bản. Không mặc định số tiền phải trả, tình trạng máy hoặc sự hài lòng.

### E. Bảo trì

Khi lập/sửa plan, xem trước các kỳ tiếp theo, giải thích lịch giữ ngày gốc, ví dụ 31/1 → 28/2 → 31/3. Hiển thị nội dung/checklist, thời lượng dự kiến và nhu cầu phối hợp site.

Trước tạm dừng/chấm dứt/sửa chu kỳ, hiển thị tác động tới kỳ chưa sinh và các task/WO đã có. Ngoại lệ: quá hạn, khách xin dời, không tiếp cận được máy, task thất bại và lệnh thay thế. Dời lịch làm việc không tự biến thành đổi hạn bảo trì.

### F. Bàn giao và hồ sơ thiết bị

Biên bản để khách xác nhận phải gom nhận dạng, site, tình trạng, ảnh/phụ kiện bàn giao nếu có, tài liệu, điều khoản/ngày bảo hành và nội dung cần khách xác nhận. Hiển thị bản cố định đã gửi và thay đổi khi gửi lại. Thẻ bảo hành tham chiếu hiện tại đã có nhưng chưa thay thế bản điều khoản được chấp thuận.

Dossier cần mục tài liệu rõ ràng: hướng dẫn, biên bản, bảo hành, hình ảnh nhận dạng và hồ sơ dịch vụ liên quan; bộ lọc lịch sử theo nguồn/sự kiện/thời gian và bản in khi cần. Tách phạm vi tài liệu nội bộ/công bố.

### G. Kho và quản trị tài khoản

Kho cần xem trước giao dịch, biên nhận, tồn trước/sau, đúng kho đã xuất, lượng còn có thể trả/xác nhận dùng, ai giao/nhận và vì sao điều chỉnh. Giao dịch chưa rõ kết quả có hướng kiểm tra rõ, không gợi ý tạo một giao dịch mới.

Tài khoản cần thiết kế quên mật khẩu, lời mời hết hạn/đã dùng/gửi lại, trạng thái hồ sơ liên hệ, thông báo khi quyền thay đổi và ảnh hưởng trước tạm khóa/gỡ role. Mục nhật ký quản trị nên được thiết kế trong prototype với dữ liệu mẫu, dù chưa bật ở sản phẩm thật.

## 6. Góc nhìn kỹ thuật frontend và khả năng sử dụng

### 6.1 Bảo toàn công việc đang làm

Lưu trạng thái bộ lọc, trang và mục hồ sơ trong URL phù hợp; nút Back trở lại đúng ngữ cảnh. `ServiceSections` hiện dùng state cho mục đang chọn nên chưa có deep link trực tiếp tới mục đó.

Thiết kế nháp/khôi phục thống nhất cho yêu cầu, dự toán, báo cáo và các form dài; cảnh báo trước khi rời nếu chưa lưu. Nháp phải phân tách tenant/người dùng, không giữ dữ liệu nhạy cảm bừa bãi trên thiết bị dùng chung.

### 6.2 Đầy đủ trạng thái giao diện

Mỗi khối cần: đang tải, có dữ liệu, chưa từng có, không có theo bộ lọc, nguồn lỗi, không được xem, dữ liệu cũ, đang lưu, đã lưu, chưa rõ kết quả và hồ sơ đã bị người khác thay đổi. Khi xung đột phải giữ phần nhập của người dùng và cho so sánh/đọc lại, tránh chỉ hiện “Làm mới”.

Nút không được phép có lời giải thích phù hợp theo role và trạng thái. Phân biệt “tôi không có quyền” với “chưa đủ điều kiện để làm”.

### 6.3 Nội dung và ngôn ngữ

Loại `decimal string`, `operation`, `commit`, raw enum và UUID khỏi phần hướng dẫn chính. Mã hỗ trợ nằm trong chi tiết có thể sao chép. Chuẩn hóa cách gọi yêu cầu, lệnh công việc, bàn giao, xác nhận sử dụng, lịch dự kiến và hạn bảo trì.

Không đặt các trạng thái “không có”, “chưa ghi nhận”, “chưa tải được” và “không được xem” thành cùng dấu gạch trống. Nói rõ số liệu đếm hồ sơ hay máy/khách bị ảnh hưởng.

### 6.4 Tiếp cận và thao tác an toàn

Kiểm tra bàn phím, thứ tự focus, focus sau lỗi/đóng dialog, nhãn trường, hướng dẫn và lỗi cạnh trường; không truyền ý nghĩa chỉ bằng màu. Form dài có tóm tắt lỗi và nhảy đến trường cần sửa. Thao tác nhiều hậu quả có tên đối tượng và kết quả sẽ xảy ra trước khi xác nhận.

Đây là yêu cầu nghiệm thu; chưa có chứng cứ để tuyên bố toàn app đạt tiêu chuẩn tiếp cận trong lượt rà soát này.

### 6.5 Hiệu năng và tổ chức component

`ServiceSections` render toàn bộ các panel rồi dùng `hidden`; các component con vẫn có thể đọc dữ liệu dù mục chưa được mở. Bảng có nhiều tra cứu tên/thiết bị theo từng hàng; cần cache dùng chung và tránh đọc trùng. Đây là đánh giá cấu trúc, chưa đo số request hoặc thời gian tải thực tế.

Đề xuất tải panel khi mở lần đầu, giữ nháp sau khi đã mở; cache theo phiên/phạm vi; tách bundle theo route, có skeleton và không dồn lại layout khi dữ liệu đến. Build gần nhất còn cảnh báo bundle JS chính vượt 500 kB. Không giải quyết bằng cách chỉ tăng ngưỡng cảnh báo.

Chuẩn hóa các component form, chọn đối tượng, ngày/giờ, số lượng/tiền, dialog xác nhận, timeline và trang tóm tắt. Việc dùng chung theme cần đi cùng hành vi chung; hiện vẫn có hai cách tổ chức thao tác WO và nhiều loại form cũ/mới.

## 7. Thứ tự thiết kế tiếp theo

### P1 — Trước khi chốt UI nghiệp vụ

1. Sửa trạng thái khóa nút/khôi phục, định dạng số lượng và quy ước ngày giờ.
2. Hoàn thiện hành trình tạo Request và trang theo dõi dành cho khách.
3. Thiết kế chủ hồ sơ, trở ngại, mốc phản hồi và việc còn lại.
4. Thiết kế duyệt dự toán có so sánh revision và bước xác nhận rõ.
5. Thiết kế tổng kết kết quả, kết quả một phần, xác nhận thay và phát sinh.
6. Thiết kế luồng kỹ thuật viên web có nháp và xem trước báo cáo.
7. Hoàn thiện phiếu giao nhận/đối soát kho bằng ngôn ngữ nghiệp vụ.

### P2 — Trước nghiệm thu sử dụng đầy đủ theo vai trò

8. Lịch điều phối ngày/tuần và xác nhận lịch với khách.
9. Xem trước lịch bảo trì và tác động thay đổi plan.
10. Biên bản bàn giao/bảo hành đúng bản, hồ sơ tài liệu và lịch sử dễ tra cứu.
11. Dashboard quản trị chất lượng phục vụ, nhật ký quản trị, vòng đời tenant/tài khoản.
12. Bộ lọc sâu, xuất/in hồ sơ, thông báo có ngữ cảnh và trạng thái lỗi/khôi phục đồng nhất.

Phân mức là đề xuất thiết kế; phạm vi demo có thể chọn một hành trình đủ sâu trước. Không mở rộng sang bán hàng, mua hàng phức tạp, ERP, kế toán, thanh toán, GPS hoặc IoT.

## 8. Hồ sơ thiết kế cần bàn giao trước khi làm backend

Mỗi màn hình cần có: đối tượng sử dụng và mục tiêu; entry/exit; bố cục; trường và định nghĩa; bắt buộc/tùy chọn/điều kiện; dữ liệu nội bộ/công bố; hành động theo role/trạng thái; loading/empty/error/readonly/uncertain/conflict; nội dung xác nhận và biên nhận; cách giữ nháp/khôi phục; các ca nghiệm thu.

Với dữ liệu mới, lập bảng dữ liệu UI và ý nghĩa nghiệp vụ trước. Bản prototype phải ghi dữ liệu minh họa và hành động chưa kết nối; contract/backend sẽ triển khai theo thiết kế đã chốt.

### Các kịch bản phải xem được trên UI

1. Khách không biết loại lỗi, có ảnh/mã lỗi, tạo yêu cầu đúng máy và nhận biên nhận.
2. Cần bổ sung thông tin; Customer User biết nội dung gì và Customer Admin biết việc cần duyệt.
3. Dự toán đổi revision; khách nhìn thấy thay đổi và xác nhận đúng bản.
4. Máy đổi địa điểm hoặc thiếu site trong lệnh; điều phối/kỹ thuật viên không đi nhầm.
5. Kỹ thuật viên sửa một phần, có phần còn lại và bản nháp báo cáo không mất sau lỗi.
6. Phụ tùng xuất nhiều lần, trả một phần/cách ly, dùng thực tế và sửa sai lịch sử được giải thích rõ.
7. Giao dịch chưa rõ kết quả; người dùng có thể đối soát và không thao tác lặp.
8. Khách từ chối kết quả, chưa phản hồi, nhân viên xác nhận thay hoặc sự cố tái diễn.
9. Bảo trì vào cuối tháng, trễ lịch, khách xin dời, plan thay đổi và task cần lệnh thay thế.
10. Lời mời hết hạn, tài khoản bị khóa/đổi quyền và người dùng có nhiều role.
11. Mất quyền/nguồn dữ liệu lỗi/phiên hết hạn ngay khi đang nhập form.
12. Mở hồ sơ từ thông báo, đi vào mục chi tiết rồi Back về đúng nhóm/bộ lọc.

**Điều kiện chốt:** người dùng nhìn mỗi màn hình trả lời được “đây là hồ sơ nào, đang chờ ai, tôi cần làm gì, hành động sẽ ảnh hưởng gì và sau đó chuyện gì xảy ra?”. Chỉ khi các hành trình và trạng thái thiết kế trên được review mới nên dùng UI làm đặc tả đầy đủ cho backend.

## 9. Thay đổi trong lượt rà soát này

Chỉ tạo báo cáo này. Không sửa code sản phẩm, backend, mobile, Git branch hoặc commit. Không chạy lại test/build vì đây là lượt đánh giá và không thay đổi implementation; kết quả 85 test ở báo cáo triển khai trước không được dùng để kết luận UI đã đầy đủ chức năng.
