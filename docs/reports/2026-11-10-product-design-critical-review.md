# Phản biện thiết kế và đề xuất nâng chất lượng trải nghiệm PBL6

Ngày: 10/11/2026. Đối chiếu code tại `develop@48f86d5` và working tree đang có ba diff Web chưa commit. Đây là đánh giá thiết kế sản phẩm từ nhu cầu người dùng, không lấy kế hoạch dự án cũ làm tiêu chuẩn đúng/sai.

**Kết luận:** hệ thống có nền chức năng đủ để thực hiện nhiều nghiệp vụ chính, nhưng chưa có đủ bằng chứng để khẳng định phục vụ xuất sắc mọi nhóm người dùng. Khoảng cách quan trọng nhất nằm ở trách nhiệm xử lý, phạm vi khách chấp thuận, cách giải quyết ngoại lệ và khả năng hiểu kết quả. Thêm màn hình hoặc thêm field tự nó không giải quyết những khoảng cách này.

Tài liệu này phản biện cả nhận xét trước của người viết. Các luồng mới là **đề xuất cần quyết định và kiểm chứng**, không phải mô tả toàn bộ tính năng đã có, không tự cho phép đổi role/schema hay sửa Mobile. Chưa tiến hành UAT mới hoặc phỏng vấn người dùng thật trong lượt đánh giá này. “Xuất sắc” được dùng như mục tiêu trải nghiệm có tiêu chí đo, không phải lời đảm bảo sự hài lòng.

## 1. Nhận xét trước của mình còn thiếu gì?

| Điểm phải tự điều chỉnh | Vì sao nhận xét trước chưa đủ tốt? | Quan điểm sửa lại |
|---|---|---|
| Nói nhiều về việc thêm owner, waiting, next action | Có thể tạo thêm các field để người dùng cập nhật thủ công, rồi sai lệch với trạng thái thật | Trạng thái suy ra được phải do server tính; người dùng chỉ nhập điều không thể suy ra như nguyên nhân, người phụ trách, lời hẹn cập nhật |
| Đề xuất “một hồ sơ thống nhất” | Nếu hiểu thành một trang nhét mọi thứ, kỹ thuật viên và khách sẽ phải đọc quá nhiều | Thống nhất điểm tra cứu và liên kết nguồn; mỗi vai trò thấy bản tóm tắt phù hợp và mở sâu khi cần |
| Đề xuất người giao/nhận và xác nhận sử dụng | Chưa phân biệt ghi nhận thực tế với chữ ký chấp thuận; thêm quá nhiều xác nhận dễ làm người dùng bỏ bước | Mỗi lần xác nhận phải trả lời được trách nhiệm gì, có hậu quả gì; không bắt một người xác nhận lại cùng sự việc trên nhiều màn hình |
| Đề xuất cảnh báo lịch chồng | Nếu lịch thiếu duration/khoảng trống/địa điểm thì cảnh báo dễ sai và bị bỏ qua | Bắt đầu bằng lịch dự kiến có dữ liệu đủ; hiển thị chất lượng dữ liệu, không hứa hệ thống tối ưu hoặc đảm bảo đúng giờ |
| Đề xuất khép hồ sơ cùng đối soát vật tư | Có thể tạo vòng chờ: phải có report hoàn tất mới confirm-use, nhưng lại đòi confirm-use trước complete | Tách kết thúc kỹ thuật, đối soát nội bộ và khách xác nhận. Mỗi phần có điều kiện đóng riêng và vẫn liên kết với nhau |
| Nói chủ doanh nghiệp có thể có thêm role nghiệp vụ | Dễ bị hiểu là admin tự cấp quyền cho chính mình hoặc union role bỏ qua scope | Việc cấp quyền phải qua hành động được phép và audit; vai trò và scope cùng có hiệu lực, không có bypass ngầm |
| Giảm menu và gộp chức năng | Có thể khiến nhân viên xử lý hàng loạt khó tìm danh sách chuyên dụng | Giữ danh sách công việc theo nghiệp vụ; bổ sung điểm vào theo máy/ca/khách. Không ép mọi thao tác qua wizard dài |
| Muốn hỗ trợ mọi người ngay một lần | Không biết tần suất sử dụng, quy mô doanh nghiệp và thiết bị; thêm tính năng đồng loạt sẽ làm MVP nặng | Ưu tiên hành trình dùng thường xuyên và hậu quả sai cao; kiểm với người dùng đại diện trước khi nhân rộng |
| Gọi tổng quan/next-action là phần thiếu | Code đã có nhóm việc theo hành động và phần đối chiếu kết quả | Bổ sung dữ liệu, trách nhiệm và ngoại lệ cho thành phần đang có; không xây dashboard thứ hai |

## 2. Chuẩn đánh giá: người dùng phải hiểu và làm được gì?

Trên một hồ sơ, người dùng cần trả lời được năm câu mà không phải đọc mã lỗi hoặc hiểu microservices:

1. Đây là máy/ca/khách hàng nào? Tôi có đang ở đúng doanh nghiệp và phạm vi không?
2. Việc gì đã được xác nhận là xảy ra, việc gì đang dự kiến hoặc chưa rõ?
3. Ai đang chịu trách nhiệm bước tiếp theo, và tôi có cần làm gì không?
4. Nếu tôi bấm nút này, điều gì sẽ thay đổi; nội dung/chi phí nào được chấp thuận?
5. Nếu lỗi, sai dữ liệu hoặc chưa hài lòng, tôi có thể sửa, phản hồi hoặc nhờ ai xử lý?

Không đánh giá bằng số lượng màn hình, số API hay phần trăm task hoàn thành. Đánh giá bằng khả năng hoàn thành công việc đúng, hiểu đúng cam kết và phục hồi khi gặp lỗi.

### Bằng chứng code đã kiểm trực tiếp

| Điểm đã thấy | Nguồn | Ý nghĩa khi đề xuất |
|---|---|---|
| Dashboard đã có nhóm cần xử lý/chờ khách/chờ đội/kết quả | [decision-queues.ts](../../apps/web/src/features/workspace/decision-queues.ts) | Cần tăng chất lượng thứ tự ưu tiên và trách nhiệm, không coi toàn bộ work queue chưa tồn tại |
| Có phần xem dự toán đã duyệt và kết quả; phần “còn cần đối chiếu” chủ yếu là lời hướng dẫn và link | [RequestCloseoutSummary](../../apps/web/src/features/workspace/RequestCloseoutSummary.tsx) | Nên tiến tới đối chiếu theo từng nội dung thay vì chỉ nhắc người dùng tự so |
| Confirm ghi principal/time; reopen có nhánh assessment và legacy | [Service Requests service](../../apps/service-request-service/src/service-requests/service-requests.service.ts) | Cần căn cứ xác nhận thay và phản hồi theo đúng nhánh hiện có |
| SR create chủ yếu title/description; report có result/customerSummary | [SR DTO](../../apps/service-request-service/src/service-requests/dto.ts), [WO DTO](../../apps/workorder-service/src/work-orders/workflow.dto.ts) | Nhu cầu trách nhiệm/liên hệ/phần còn lại chưa được giải quyết chỉ bằng việc thêm ô trên UI |
| Maintenance journey đã suy ra waitingFor và allowedActions | [Journey service](../../apps/maintenance-service/src/plans/journey.service.ts) | Tận dụng suy diễn có nguồn; không thêm một waiting state thủ công trùng lặp |
| Return có GOOD/DAMAGED/PENDING_INSPECTION; usage có lý do và xử lý linh kiện cũ | [Inventory DTO](../../apps/inventory-service/src/inventory/dto.ts) | Không gọi mọi xử lý hỏng/cách ly là chưa có; làm rõ lỗ hổng hàng mất ngoài hiện trường |
| Navigation nhiều danh sách theo miền và role | [role-workspace.ts](../../apps/web/src/features/workspace/role-workspace.ts) | Cải thiện điểm vào và thứ bậc nội dung; không xóa tất cả danh sách chuyên dụng |

Đây là bằng chứng về hình dạng code, chưa phải xác nhận mọi đường chạy đúng trong trình duyệt hoặc backend thật.

## 3. Đánh giá nghiêm khắc theo người dùng

| Người dùng | Công việc họ thực sự muốn hoàn thành | Mức đáp ứng qua phần code đã rà | Thiếu gì để phục vụ tốt hơn? |
|---|---|---|---|
| Chủ doanh nghiệp / Tenant Admin | Biết khách nào bị ảnh hưởng, đội nào cần hỗ trợ và doanh nghiệp đang giữ cam kết ra sao | Có quản trị và giám sát cơ bản; chưa đủ căn cứ kết luận đo được chất lượng dịch vụ | Dashboard ngoại lệ có drill-down, lý do chậm, người phụ trách, chỉ số có định nghĩa; onboarding không cần người kỹ thuật hỗ trợ |
| Service Manager | Một ca có đầu mối, quyết định đúng bảo hành/chi phí và không bị bỏ quên | Luồng xử lý chính và bàn điều hành đã có | Owner cấp ca, mốc cập nhật, xử lý phát sinh/không đồng ý, handoff trách nhiệm, bảo vệ thao tác đồng thời |
| Dispatcher / người chuyên điều phối | Xếp đúng người, đúng nơi, đúng khả năng và biết lịch có thay đổi | Có assignment, kỹ thuật viên và lịch dự kiến | Ngữ cảnh workload/địa điểm, thông báo đổi lịch, cách giải quyết xung đột; không cần hệ điều phối thứ hai |
| Technician | Đến đúng máy, làm đúng việc, chứng minh kết quả nhanh kể cả mạng yếu | Có workflow/checklist/report/file/nháp | Thông tin hiện trường gọn, đường yêu cầu hỗ trợ và vật tư, phần việc còn lại, không nhập lặp; compatibility phải kiểm trên thiết bị thật |
| Inventory Staff | Giao/nhận đúng, biết vật tư đang ở đâu và giải thích được số dư | Cơ chế giao dịch mạnh hơn phần giải thích trách nhiệm giao nhận | Phiếu nguồn, giao nhận có căn cứ, xử lý thiếu/mất, danh sách chưa đối soát, recovery có người chịu trách nhiệm |
| Customer Admin | Đọc và quyết định đúng chi phí/điều khoản/kết quả cho doanh nghiệp mình | Có các quyết định chính và scope | Tóm tắt dễ hiểu, đúng phiên bản, phần phát sinh riêng, không bị ép đồng ý thay cho “đã nhận thông tin” |
| Customer User | Báo vấn đề nhanh và biết khi nào có thông tin mới | Gửi/theo dõi được yêu cầu, lịch sử công khai | Không biết serial vẫn tìm máy được; đính kèm bằng chứng khi được hỗ trợ; người liên hệ; chỉ dẫn khi phải chờ admin phê duyệt |
| Platform Admin | Tenant hoạt động bình thường, hỗ trợ lỗi truy cập/khởi tạo mà không xâm phạm dữ liệu khách | Có nền quản trị tenant | Quan sát provisioning, audit quản trị, phân loại sự cố; không cần quyền xem toàn bộ hồ sơ tenant để làm công việc này |

“Toàn bộ người dùng” còn bao gồm người mới, người ít dùng, người dùng bàn phím/cỡ chữ lớn, nhân viên thay ca và khách có nhiều địa điểm. Các biến thể này phải được kiểm thử trải nghiệm, không chỉ đủ tám tên role trong menu.

## 4. Bảng hướng phát triển đề xuất

**U1:** cần trước khi sử dụng thực tế thường xuyên. **U2:** nâng chất lượng sau khi U1 ổn. **U3:** chỉ làm khi kiểm chứng có nhu cầu. Đây là thứ tự giá trị sản phẩm, không phải nhãn lỗi đã tái hiện.

| Mã | Giữ | Bỏ/gộp/đơn giản hóa | Hướng phát triển | Vì sao cần sửa? | Lợi ích cụ thể | Ưu tiên |
|---|---|---|---|---|---|---|
| D01 | SR/WO/Task và ownership service riêng | Người dùng phải tự nối ID qua nhiều trang | Hồ sơ ca dịch vụ có nguồn và người phụ trách, các bước đọc chung nhưng quyền khác nhau | Một yêu cầu có thể đi qua nhiều WO, không có đầu mối thì khách phải kể lại sự cố | SM theo được toàn ca; khách nhận một dòng tiến độ dễ hiểu; không tạo thêm aggregate ghi trùng | U1 |
| D02 | Ngày và trạng thái nguồn | Field “đang chờ” trùng trạng thái do người dùng tự cập nhật | Việc cần làm được suy ra; owner/lý do/mốc cập nhật lưu khi thật sự cần | Thêm field không đồng bộ sẽ làm dashboard đẹp nhưng sai | Nhìn được việc nào đang bị bỏ quên và ai cần hành động | U1 |
| D03 | Chọn máy, serial/QR và public history | Biểu mẫu bắt buộc hiểu thuật ngữ kỹ thuật | Gửi yêu cầu có hướng dẫn, lưu ngữ cảnh máy, ảnh khi có API, phát hiện ca đang mở | Khách ít dùng không biết loại lỗi và dễ gửi trùng | Gửi đúng máy nhanh, ít hỏi lại và ít ca trùng | U1 |
| D04 | Policy snapshot, bàn giao và revision | Nhiều điểm bắt đầu không phân biệt mục đích | Một điểm vào “Ghi nhận bàn giao”, vẫn giữ danh sách nháp/chờ/xong cho xử lý nhiều hồ sơ | Gộp thành wizard duy nhất sẽ làm nhân viên thường xuyên thao tác chậm | Người mới được dẫn từng bước; người quen tiếp tục hồ sơ ngay | U1 |
| D05 | Dự toán và quyền chấp thuận | Sửa bản đã duyệt hoặc coi report là chấp thuận phát sinh | Chấp thuận phạm vi cụ thể; đề nghị phần phát sinh có liên kết và review riêng | Tranh chấp thường nằm ở phạm vi được đồng ý, không chỉ tổng tiền | Khách hiểu chi phí; SM có căn cứ; kỹ thuật viên biết phần được phép làm | U1 |
| D06 | Báo cáo ba kết quả; SR confirm/reopen | Một nút “xong” đại diện cho tất cả | Kết quả kỹ thuật, tình trạng máy, phản hồi khách và đối soát nội bộ có nghĩa riêng | Máy chưa chạy tốt có thể có WO đã kết thúc; khách có thể không phản hồi | Không đóng ca sai nghĩa, vẫn xử lý được phần còn lại | U1 |
| D07 | Một cơ chế assignment, kỹ năng/branch | Hai lịch điều phối trùng nhau hoặc hứa giờ chính xác từ BUSY/AVAILABLE | Lịch dự kiến có workload, thay đổi có lý do và người nhận cập nhật | Người điều phối cần biết hệ quả khi đổi lịch | Ít giao sai người/sai nơi, giảm cuộc gọi hỏi lại | U2; đúng địa điểm là U1 |
| D08 | Checklist/report/ảnh/nháp | Nhập lại định danh, ca trước, vật tư trên nhiều form | Màn hình thực hiện theo bước, điền sẵn tham chiếu và preview công bố | Kỹ thuật viên dễ nhập đối phó khi biểu mẫu dài | Ghi nhận nhanh hơn nhưng vẫn có bằng chứng | U1 |
| D09 | Ledger, reservation, usage/correction/cách ly | “Đã xuất = đã dùng”; status kỹ thuật không có giải thích | Đối soát vật tư theo trách nhiệm, xử lý thiếu/mất có nguồn | Có tồn đúng nhưng không rõ ai đang giữ hàng vẫn khó vận hành | Kho giải thích được số dư, kỹ thuật viên/SM biết cần trả hay ghi dùng | U1 |
| D10 | Dossier/timeline/tài liệu nguồn | Timeline lẫn dữ liệu hiện tại với snapshot lịch sử | Hồ sơ máy theo câu hỏi: cam kết gì, đã làm gì, đang cần gì | Người dùng cần câu trả lời, không cần danh sách event dài vô hạn | Tra được toàn lịch sử và từng lần sửa, không hiểu sai chứng cứ | U1 |
| D11 | Inbox, event và kiểm scope | Thông báo lặp không có hành động; “đã đọc” như “đã duyệt” | Thông báo theo việc cần làm, nguồn và trạng thái hiện tại | Chuông nhiều nhưng không giúp giải quyết việc | Giảm bỏ sót quyết định, giảm nhiễu | U2 |
| D12 | Role cố định, scope tenant/customer/branch | Onboarding đòi biết mô hình DB; admin tự bypass quyền | Hướng dẫn thiết lập và phục hồi tài khoản, phép thử “đăng nhập thấy gì” có kiểm soát | Người mới không nên cần developer sửa dữ liệu | Doanh nghiệp tự đưa nhân viên vào dùng; ít lỗi cấu hình | U1 |
| D13 | Receipt/proof ở nơi đã có | Thông báo timeout chắc chắn thất bại; nút retry chung cho mọi lỗi | Kết quả thao tác có thể kiểm tra, hướng dẫn phục hồi theo lỗi | Người dùng không thể biết server đã ghi hay chưa | Ít gửi trùng, không mất dữ liệu vì hiểu sai | U1 |
| D14 | Báo cáo nguồn thật và bộ lọc | Chỉ số đẹp nhưng không có định nghĩa; xếp hạng người bằng số WO | Báo cáo chất lượng/ngoại lệ giải thích được và drill-down | Đếm khối lượng chưa nói được kết quả phục vụ | Chủ doanh nghiệp can thiệp đúng, tránh đánh giá bất công | U2 |
| D15 | Thiết kế Workshop và component chung | Màn hình dài, nhiều trạng thái ngang hàng, thao tác chỉ dựa vào màu | Nội dung theo vai trò, bàn phím/cỡ chữ lớn, nhất quán điều hướng | Đẹp chưa đồng nghĩa dễ hoàn thành việc | Người mới và người ít dùng đều thao tác được | U1 cho cản trở thao tác; U2 cho tiện dụng |

## 5. Logic đề xuất cho từng hành trình

### D01–D02. Một ca có trách nhiệm rõ, không sinh hệ thống trạng thái thứ hai

**Luồng:** khách gửi SR → SR vào nhóm tiếp nhận của branch → SM nhận/chuyển chủ ca → quyết định bảo hành/phương án → liên kết WO → theo dõi thực hiện → phản hồi khách → kết thúc hoặc theo dõi tiếp.

- SR là điểm vào ca sửa chữa; bảo trì chủ động vẫn từ Plan/Task. Không buộc tạo SR giả cho mọi lần bảo trì.
- Một ca sửa chữa có thể có nhiều WO kế tiếp; hiển thị WO hiện hành và WO cũ, không trộn kết quả của hai lần.
- Branch có trách nhiệm tiếp nhận ngay cả khi chưa gán một cá nhân. Nếu chủ ca nghỉ/khóa tài khoản, đưa ca vào hàng chờ người quản lý thay thế; không làm dữ liệu mất quyền truy cập.
- “Chờ khách duyệt dự toán” suy ra từ bản SENT hiện hành; “chờ hỗ trợ kỹ thuật” cần người ghi lý do và đầu mối. Không cho hai nguồn mâu thuẫn mà không giải thích.
- Mốc hẹn cập nhật là lời hẹn thông tin, không tự thành SLA hoàn tất sửa chữa. Quá mốc làm ca nổi bật; không tự phạt hoặc đóng hồ sơ.
- Đổi chủ ca/đổi lịch dùng kiểm version và audit. Nhận trách nhiệm không đồng nghĩa người khác mất toàn bộ quyền phối hợp.

**Đánh giá logic:** hợp lý nếu suy ra được phần trạng thái tự động, còn dữ liệu thủ công tối thiểu. Chưa nên triển khai như một workflow engine mới. Đạt khi SM khác tiếp quản được ca mà không cần hỏi lại toàn bộ lịch sử và khách biết đầu mối hiện tại.

### D03. Báo sự cố dễ nhưng không tạo dữ liệu sai

**Luồng:** tìm máy bằng mã/tên/địa điểm/QR trong phạm vi cho phép → xem tóm tắt để xác nhận đúng máy → mô tả hiện tượng, mức ảnh hưởng, liên hệ → xem lại → gửi → nhận mã theo dõi.

- Khách không biết serial vẫn tìm được bằng tên/địa điểm; không cần public lookup lộ máy của khách khác.
- “Mức ảnh hưởng khách báo” khác “mức ưu tiên xử lý SM quyết định”. SM thay ưu tiên cần lý do; không âm thầm coi mọi báo khẩn là mức cao nhất.
- Nếu máy có ca mở, hiển thị ca đó và đề nghị bổ sung. Vẫn cho báo sự cố khác có lý do; không tự merge hai ca chỉ vì cùng máy.
- Không tìm thấy máy: trước mắt chỉ đường liên hệ rõ; mở rộng phiếu hỗ trợ chưa gắn máy là quyết định riêng có nơi tiếp nhận, không tạo equipment giả.
- Ảnh/video chỉ xuất hiện như chức năng gửi khi có API upload, quyền đọc, giới hạn và cleanup thật. Nếu upload ảnh lỗi, khách được chọn gửi mô tả trước; không mất toàn bộ form.
- Khi mất response sau gửi, giữ định danh thao tác và kiểm kết quả; không đề nghị gửi lại thành yêu cầu mới.

**Lợi ích:** bớt nhập sai thiết bị, ít yêu cầu bổ sung và ít request trùng. Đạt khi người không biết thuật ngữ kỹ thuật gửi đúng một yêu cầu và tìm lại được sau reload.

### D04. Bàn giao là một cam kết có nội dung đọc lại được

**Luồng:** chọn khách/site/máy → hình thức bàn giao → ngày và chính sách → preview phần khách nhận → hoàn tất STORE hoặc gửi CUSTOMER_SITE → theo dõi kết quả/đồng bộ.

- Giữ hai hình thức nếu doanh nghiệp thực sự cần; “hoàn tất tại cửa hàng” không được giả thành chữ ký điện tử của khách.
- Tóm tắt gồm serial, nơi đặt, tình trạng, phụ kiện/tài liệu đã giao nếu được chốt, điều khoản/ngoại lệ và ngày hiệu lực. Không bắt người dùng đọc JSON policy.
- Chỉ thông tin quyết định mới bắt buộc; tài liệu hoặc phụ kiện không liên quan có lựa chọn không áp dụng, không ép nhập “không”.
- Chỉnh nội dung ảnh hưởng cam kết sau khi gửi phải có phiên bản mới. Khách đã đồng ý bản nào thì truy cập lại bản đó; policy mới không viết lại bản cũ.
- Khách từ chối/hết hạn là trạng thái cần hành động, không tự kích hoạt máy. Khách đã đồng ý nhưng tạo Plan còn chậm phải diễn giải “đã xác nhận, đang hoàn tất lịch”, không bắt khách ký lại.
- Thay địa điểm hiện tại của máy không đổi site trong hồ sơ công việc/bàn giao lịch sử. Thay máy vật lý cần liên kết máy cũ–mới; không đổi serial để giả thành cùng một tài sản.

**Đánh giá logic:** đủ rõ khi phân biệt giao nhận vật lý, chấp thuận nội dung và đồng bộ nội bộ. Chức năng transfer/replace chỉ thêm sau khi chốt cách bảo hành và lịch bảo trì đi theo máy nào.

### D05. Phê duyệt chi phí dựa trên phạm vi, không chỉ một con số

**Luồng:** đánh giá → phương án gồm việc làm/phụ tùng/dự kiến chi phí/ngoại lệ → khách duyệt đúng bản → thực hiện phần được phép → nếu cần thêm thì gửi đề nghị bổ sung → tiếp tục hoặc giữ phần chưa được phép.

- Mỗi dòng cần hiểu được làm gì, số lượng, đơn vị, đơn giá và tổng; không lấy unitCost kho làm giá khách trả.
- Phần bổ sung liên kết với bản đã duyệt, giữ bản cũ nguyên vẹn. Chủ nghiệp vụ phải chốt amendment riêng hay revision thay thế; không âm thầm cho sửa APPROVED.
- Đề nghị mới giải thích lý do phát sinh, khoản tăng/giảm và ảnh hưởng thời gian. Nếu khách từ chối, ghi rõ còn làm được phần nào và tình trạng máy dự kiến.
- Chờ duyệt phần phát sinh chỉ chặn phần công việc phụ thuộc quyết định đó. Không mặc định dừng mọi công việc độc lập đã được duyệt, cũng không cho thực hiện phần tính phí chưa được phép.
- Khách chưa trả lời không đồng nghĩa đồng ý. Hai tab duyệt hai bản phải bị kiểm version ở server.
- Trường hợp kiểm tra/chẩn đoán trước dự toán: phải chốt rõ có phí hay miễn phí và điều kiện khách đồng ý; không mở “ngoại lệ SM” chung chung để bỏ quy trình.

**Lợi ích:** tránh tranh chấp khi sửa thật khác phương án ban đầu. Chưa thể coi logic hoàn chỉnh trước khi nhóm chốt phạm vi amendment và ảnh hưởng đến WO đang chạy.

### D06. Kết thúc công việc, khách phản hồi và việc còn lại

**Ba trục cần đọc riêng:** (1) WO đã kết thúc kỹ thuật chưa; (2) kết quả và tình trạng máy là gì; (3) khách đã xác nhận nội dung nào. Đối soát vật tư nội bộ là phần thứ tư liên quan, không được biến thành “máy chưa sửa” chỉ vì chưa làm xong giấy tờ.

**Luồng:** Technician nộp report → SM/khách đọc kết quả công bố → đối chiếu việc còn lại và phạm vi duyệt → khách xác nhận hoặc không đồng ý → xử lý tiếp theo theo quyền/state hiện có.

- RESOLVED cần mô tả cách kiểm tra kết quả. PARTIALLY_RESOLVED cần mô tả phần còn lại, ảnh hưởng vận hành và hướng xử lý; UNRESOLVED cần nguyên nhân/đề xuất tiếp theo. Không yêu cầu mọi ngành dùng chung một checklist kỹ thuật chuyên sâu.
- Tình trạng máy phải có nguồn, người ghi nhận và thời điểm; không mặc định ảnh chụp hay completedAt chứng minh máy đang hoạt động ở hiện tại.
- “Đã nhận báo cáo” khác “Đồng ý kết quả”. Có thể thêm chức năng nhận biết đã đọc mà không thay consent; không đặt tên nút mơ hồ.
- Với kết quả một phần, chỉ đóng khi phần khách đồng ý và cách xử lý phần còn lại rõ. Nếu còn nghĩa vụ xử lý, cần hồ sơ theo dõi có chủ trách nhiệm và liên kết; không dùng nút đồng ý để làm biến mất phần chưa xong.
- Nhân viên xác nhận thay lưu người phản hồi/kênh/thời điểm/căn cứ; nhân viên vẫn là actor. Không lấy tên nhân viên điền vào tên khách.
- Không phản hồi: nhắc hợp lý, đưa SM theo dõi, giữ trạng thái chờ. Việc đóng hành chính nếu muốn có phải là quyết định riêng và không giả là khách đã hài lòng.
- Ca đã CLOSED rồi sự cố tái diễn: đề xuất yêu cầu mới có liên kết ca trước, không sửa lịch sử terminal. Ca RESOLVED chưa đóng sử dụng reopen hiện có, bao gồm đánh giá lại bảo hành khi cần.
- Xác nhận dùng phụ tùng diễn ra sau báo cáo theo contract hiện tại. Reservation HELD chặn complete là kiểm soát giao dịch; không được thêm điều kiện “phải confirm-use trước report”.

**Đạt khi:** cả khách lẫn SM giải thích giống nhau về phần đã xong/chưa xong, khách chưa đồng ý không bị hiển thị là đã đồng ý, và không có vòng chờ giữa report–usage–closure.

### D07–D08. Điều phối và thực hiện dựa trên bối cảnh thật

- Một lịch công việc dùng chung nguồn; role quyết định quyền thao tác và góc nhìn. SM và Dispatcher cùng có quyền không tự là lỗi; cần owner và kiểm concurrency.
- Khi phân công, thấy địa điểm công việc, liên hệ, kỹ năng, lịch đã có, thời lượng dự kiến và việc chưa xếp lịch. Cảnh báo “chưa đủ dữ liệu để đánh giá trùng” khi thiếu giờ kết thúc.
- Lịch dự kiến và khách đồng ý lịch là hai thông tin. Đổi giờ sau khi đã hẹn khách cần ghi ai đổi, lý do và thông báo cho bên bị ảnh hưởng.
- MVP không tự tính đường đi tối ưu. Thời gian di chuyển/buffer có thể do người điều phối nhập; không đưa ra ETA chắc chắn từ dữ liệu thiếu.
- Technician mở WO thấy “đúng máy/đúng nơi/liên hệ/việc cần làm/lưu ý”, rồi mới đến lịch sử sâu. Dữ liệu có sẵn được tham chiếu, không chép lại thủ công.
- Xin hỗ trợ hoặc báo thiếu vật tư là yêu cầu có người nhận/trạng thái, không tự trừ kho hoặc tự thêm chi phí khách.
- Nháp có thể lưu khi mất mạng, nhưng không báo “đã gửi báo cáo” khi chỉ lưu trên máy. Bản cũ bị đổi assignment phải revalidate trước gửi.

**Ranh giới:** thiết kế Web và contract tương thích có thể triển khai; các thay đổi trải nghiệm Android là bàn giao đề xuất riêng, không tự sửa app trong lượt này.

### D09. Vật tư có trách nhiệm và các trường hợp ngoại lệ

**Luồng bình thường:** đề nghị/chuẩn bị vật tư nếu có → kho xác nhận xuất cho WO → ghi giao nhận → report → xác nhận dùng phần thực tế → trả phần thừa → xử lý phần còn chưa đối soát.

- “Đề nghị” không trừ tồn. “Xuất kho” có transaction và proof. “Ghi người nhận” có thể là metadata giao nhận; nếu doanh nghiệp muốn người nhận phải ký thì cần rule riêng, không đổi giao dịch đã commit thành chưa xuất.
- Hàng DAMAGED/PENDING_INSPECTION trả kho đã có xử lý: giữ và làm rõ khả dụng/cách ly. Hàng thực sự đã mất ngoài hiện trường không thể được RETURN như đã nhập về.
- Đề xuất ghi nhận mất/tiêu hủy ngoài hiện trường liên kết đúng lần xuất, số lượng, người báo, căn cứ và người có quyền xác nhận. Đây là phát triển mới cần owner quyết định; không đồng nhất với LOSS điều chỉnh số dư kho.
- Hàng đã ISSUE đã trừ tồn kho: xử lý mất ở hiện trường phải giải quyết trách nhiệm lượng đã xuất, không trừ kho lần thứ hai.
- Khi mở rộng disposition, đối soát theo lượng ròng sau correction: `đã xuất = đã trả + đã xác nhận dùng + đã xử lý mất/tiêu hủy hợp lệ + chưa đối soát`. Mỗi lượng chỉ thuộc một nhóm; tồn cách ly sau Return là chiều quản lý riêng, không cộng thêm vào vế phải lần nữa.
- Nếu cần duyệt tổn thất/correction, đề xuất người có quyền phù hợp trong các role hiện hữu; không tự tạo role “Supervisor” hay cấp quyền ghi kho cho TA. Thay permission là quyết định riêng có audit.
- Mọi đính chính append-only, lý do rõ, không xóa ledger. Phiếu kho không được gọi là hóa đơn khách.

**Đạt khi:** một ca xuất 3, dùng 1, trả 1, mất 1 giải thích được đầy đủ; kho không tăng hàng chưa nhận hoặc giảm hai lần; khách chỉ thấy vật tư thực sự dùng và nội dung công bố phù hợp.

### D10. Hồ sơ thiết bị trả lời câu hỏi thay vì chỉ hiển thị event

Đề xuất đầu hồ sơ có ba phần: **hiện tại** (máy ở đâu, trạng thái xác nhận khi nào), **cam kết** (bảo hành/chính sách bảo trì đúng bản), **việc đang mở** (SR/WO/Task liên quan theo quyền). Bên dưới là lịch sử có lọc.

- Mỗi dòng lịch sử hiển thị ngày sự việc, nguồn, nội dung người dùng hiểu được và đường tới hồ sơ gốc. Ngày nhận event muộn không thay ngày thực tế xảy ra.
- “Toàn bộ lịch sử” phải được diễn giải là toàn bộ dữ liệu hệ thống đã ghi nhận trong phạm vi quyền. Hồ sơ legacy, nguồn lỗi hoặc trang chưa tải có nhãn rõ; không khẳng định biết các sửa chữa ngoài hệ thống.
- Khi service nguồn lỗi, các phần khác vẫn đọc được và phần lỗi có retry; không biến mất cả dossier hoặc giả lịch sử trống.
- Khách không cần tên microservice/correlationId; nhân viên hỗ trợ có thể mở phần kỹ thuật khi xử lý lỗi.
- Tải/in hồ sơ cần nêu thời điểm xuất, bộ lọc và phạm vi nội dung; không xuất internal file cho customer dù cùng máy.

**Đạt khi:** tra được “máy này thay gì trong lần sửa nào”, “khách đã duyệt chính sách nào” và “hiện còn việc gì” mà không cần đọc toàn bộ timeline.

### D11–D12. Nhắc đúng việc và giúp doanh nghiệp tự sử dụng

- Thông báo nêu người nhận cần làm gì, hồ sơ nào, thời điểm nào. Mở notification đọc trạng thái mới nhất; việc đã giải quyết không hiện CTA cũ có thể thực hiện lại.
- Gộp thông báo liên quan nếu không làm mất quyết định cần xác nhận; việc khẩn không bị quiet hours làm mất hoàn toàn mà chưa có rule. Chưa cần xây tùy chọn kênh phức tạp.
- “Đã gửi thông báo” không có nghĩa khách đã nhận/đọc/đồng ý. Chỉ hiện trạng thái delivery khi có dữ liệu chứng minh.
- Onboarding cho TA gồm branch, nhân viên/role, khách/site, model/policy và thử một ca mẫu có kiểm soát. Mỗi bước có trạng thái hoàn tất/thiếu/lỗi và nút tiếp tục.
- Tạo user thành công nhưng tạo Technician lỗi chỉ retry bước Technician, không mời lại user.
- Phục hồi mật khẩu/resend invite cần link một lần, TTL và phản hồi phù hợp; không hiện “email tồn tại” cho người chưa được xác thực nếu không cần.
- Customer Admin quản lý người trong customer mình; người dùng chỉ thuộc một địa điểm có thể cần hạn chế theo site ở doanh nghiệp lớn. Đó là đề xuất U3 cần khảo sát, không tự áp làm mất quyền khách đang dùng.

### D13. Phục hồi lỗi có thể hiểu và có người chịu trách nhiệm

UI nên nói bằng hành động: “Đang kiểm tra lần gửi trước”, “Đã xuất 2 bộ; đang hoàn tất đối soát”, “Chưa đủ quyền để tiếp tục; liên hệ quản trị”. Mã kỹ thuật nằm trong chi tiết hỗ trợ, không thay lời giải thích.

- Tách trạng thái nghiệp vụ server khỏi hiểu biết client. Client không nhận response vẫn có thể có transaction COMMITTED; không tự chuyển DB sang UNCERTAIN vì timeout phía client.
- Với thao tác cần receipt, giữ key + payload gốc, lookup có scope, retry đúng intent; server vẫn kiểm quyền hiện tại. correlationId hỗ trợ điều tra, không thay khóa idempotency hoặc quyền truy cập.
- Hai tab/người khác nhau: kiểm version/unique constraint ở server; khóa nút chỉ giúp UX, không bảo đảm concurrency.
- Nếu mất quyền giữa chừng, chỉ đường cho người có quyền đối soát; không tiết lộ dữ liệu trái scope để “giúp recovery”.
- Có danh sách việc lỗi dành đúng vai trò: kho giải quyết inventory operation; SM xử lý ca thiếu quyết định; vận hành xử lý broker. Không đưa mọi lỗi nội bộ cho khách tự retry.

**Đạt khi:** người dùng không tạo hồ sơ/giao dịch thứ hai để chữa timeout, dữ liệu có thể đối soát và lỗi không làm họ phải đoán đã thành công hay chưa.

### D14–D15. Đo chất lượng và thiết kế dễ tiếp cận

- Chỉ số đầu tiên nên là số ca cần can thiệp, tuổi ca, thời gian chờ theo bên, ca quay lại và máy còn bị ảnh hưởng. Chốt rõ mốc bắt đầu/kết thúc, timezone, mẫu số và dữ liệu thiếu.
- Không xếp hạng Technician chỉ bằng số WO hoàn tất: loại máy, độ khó và vật tư chờ khác nhau. Báo cáo dùng tìm điểm nghẽn trước khi dùng đánh giá con người.
- Nếu thu phản hồi hài lòng, để tự nguyện, ghi số người phản hồi/tổng đủ điều kiện; không coi người không trả lời là hài lòng, không chặn đóng ca vì thiếu đánh giá sao.
- Giao diện dùng cùng hệ thống thiết kế nhưng nội dung theo công việc. Khách nhìn tiến độ/cam kết; Technician nhìn việc hôm nay; admin nhìn ngoại lệ. Không nhân bản tám bản của cùng một form.
- Trạng thái có chữ, nút có động từ cụ thể, field có nhãn/lỗi liên kết; modal giữ focus và đóng được bằng bàn phím khi an toàn. Ngày/đơn vị/tiền tệ luôn rõ.
- Sau Back vẫn giữ bộ lọc/trang; cập nhật dữ liệu không làm mất phần đang nhập. Với đơn vị nguyên/lẻ, input không dùng dấu phân nhóm dễ gây nhầm; không tự sửa số mà không báo.

## 6. Những thứ nên bỏ hoặc hoãn có chủ đích

| Đề xuất bỏ/hoãn | Lý do | Điều kiện xem lại |
|---|---|---|
| Viết lại toàn bộ state machine/role hoặc thêm workflow engine | Chi phí chuyển đổi cao, dễ phá dữ liệu và client đang chạy, chưa giải quyết được nhu cầu cụ thể | Có quy trình thực không biểu diễn được và đã được kiểm chứng |
| Thêm hàng loạt status DB chỉ để UI dễ đọc | Trùng với result/waiting/projection và làm quá nhiều tổ hợp trạng thái | Có ý nghĩa nghiệp vụ riêng với transition/invariant rõ |
| Một màn hình lớn chứa mọi chi tiết máy/ca/kho | Người dùng khó thấy hành động chính | Thay bằng tóm tắt và mở sâu theo nhu cầu |
| Bắt khách làm mọi bước nội bộ để “quy trình đủ” | Tăng thời gian, dễ gây xác nhận không hiểu | Chỉ yêu cầu việc có quyền quyết định hoặc dữ liệu khách thực sự nắm |
| Platform Admin mặc định xem hồ sơ tenant / nút impersonate | Không cần cho quản trị cơ bản, rủi ro riêng tư và trách nhiệm lớn | Nhu cầu hỗ trợ được xác thực và có thiết kế quyền/audit riêng |
| Approval nhiều tầng cho mọi điều chỉnh kho | Có thể làm doanh nghiệp nhỏ không vận hành được | Có dữ liệu rủi ro và hạn mức/quy tắc người duyệt thực tế |
| GPS/ETA tự động, thanh toán, procurement, nhân sự | Kéo sản phẩm ra khỏi bài toán phục vụ sau bán hàng hiện tại | Dự án mở rộng riêng với nguồn lực và nhu cầu rõ |
| Đổi mobile để đồng bộ màu sắc ngay | Chưa chứng minh cải thiện công việc, đi ngược phạm vi người dùng đã giới hạn | Có yêu cầu riêng và kiểm chứng trải nghiệm trên thiết bị |

## 7. Các tình huống bắt buộc dùng để phản biện thiết kế trước khi code

| Tình huống | Nếu thiết kế tốt thì phải giải quyết được | Sai lầm cần tránh |
|---|---|---|
| Hai SM nhận cùng một ca | Một kết quả phân công có version; người còn lại thấy thay đổi và vẫn phối hợp đúng quyền | Hai owner mà không ai biết; hoặc khóa cả ca không cho hỗ trợ |
| Khách không biết serial và báo máy ngừng chạy | Tìm bằng địa điểm/tên trong phạm vi; nhận diện lại trước gửi; chuyển hỗ trợ nếu không thấy | Tạo máy giả hoặc bắt khách hiểu Model ID |
| Máy có ca mở nhưng phát sinh sự cố khác | Cho bổ sung ca cũ hoặc gửi ca liên quan có lý do; SM phân loại | Tự gộp hết hoặc cho tạo hàng loạt ca giống nhau |
| Duyệt thay một bộ, cần thêm một bộ | Giữ bản duyệt gốc; khách hiểu phần tăng; phần chưa được phép được chặn đúng phạm vi | Sửa tổng tiền cũ hoặc dùng report làm bằng chứng khách đồng ý |
| Xuất vật tư thành công, response mất | Tra receipt trả đúng giao dịch; tồn không trừ lần hai | Đổi key và issue lại để thử |
| Report hoàn tất, vật tư chưa đối soát | Kết quả kỹ thuật đọc được; còn nhiệm vụ đối soát nội bộ; không tạo vòng chờ | Buộc confirm-use trước complete trong khi API cần report COMPLETED |
| Sửa được một phần, khách chưa trả lời | Ghi phần còn lại/ảnh hưởng; có owner theo dõi và nhắc phù hợp | Hiện “máy đã sửa xong” hoặc tự ghi khách đồng ý |
| Đã đóng ca rồi lỗi tái diễn | Ca mới liên kết ca trước, lịch sử cũ nguyên vẹn | Sửa báo cáo cũ hoặc reset terminal status không kiểm soát |
| Xuất 3, dùng 1, trả 1, mất 1 | Đối soát trách nhiệm lượng mất bằng nguồn xuất; không trừ tồn lần hai | RETURN số mất hoặc confirm-use giả |
| Chủ ca nghỉ việc, khách vẫn chờ | Nhóm/branch tiếp nhận lại; lịch sử owner được giữ | Ca biến mất khỏi mọi hàng chờ |
| Dữ liệu policy mới nhưng khách đang xem bàn giao cũ | Khách quyết định đúng snapshot đang gửi; đổi cam kết bằng bản mới | Tự thay nội dung ngay trước nút xác nhận |
| Một service lịch sử lỗi | Đọc được nguồn khác, nguồn lỗi có nhãn/retry | Hiện “chưa có lịch sử” hoặc trang trắng |
| Người dùng cũ logout, người mới login khi response chậm | Không lẫn dữ liệu/nháp/receipt; quyền của người mới được kiểm | Response cũ cập nhật UI tài khoản mới |

## 8. Cách chứng minh trải nghiệm sau sửa tốt hơn

Không cần đo tất cả chỉ số ngay. Chọn một luồng chuẩn và một luồng ngoại lệ cho mỗi nhóm người dùng; ghi baseline trước sửa rồi dùng cùng độ khó dữ liệu để so sau sửa. Người thiết kế không được dẫn từng cú bấm khi đo khả năng tự sử dụng.

| Nhóm | Bài kiểm trải nghiệm | Tiêu chí chấp nhận đề xuất |
|---|---|---|
| Customer User | Tìm máy, gửi yêu cầu và chỉ ra nơi theo dõi | Hoàn thành không cần giải thích SR/WO; không gửi trùng; nói đúng người/bên đang xử lý |
| Customer Admin | Xem hai bản dự toán, từ chối phần thêm và giải thích kết quả | Xác định đúng bản/tổng/phạm vi; không hiểu từ chối phát sinh là hủy mọi dịch vụ |
| SM | Tiếp quản một ca người khác đang làm, tìm điểm chặn và bước tiếp theo | Tìm được owner/lý do/nguồn quyết định mà không gọi hỏi người cũ; không bỏ qua khách chưa duyệt |
| Dispatcher | Phân công khi có lịch giao nhau và dữ liệu giờ thiếu | Nhận ra xung đột hoặc thiếu dữ liệu; không hiểu hệ thống đã đảm bảo giờ tới |
| Technician | Báo cáo kết quả một phần trong điều kiện mất mạng | Nội dung không mất; phân biệt nháp với đã gửi; mô tả được việc còn lại; không thực thi WO mất quyền |
| Inventory Staff | Đối soát xuất–trả–dùng và một giao dịch mất response | Số dư đúng tuyệt đối; giải thích được nguồn; không xuất lại hoặc trừ hai lần |
| TA/chủ doanh nghiệp | Thiết lập nhân viên và tìm ca cần can thiệp | Không cần sửa DB; biết nhân viên thiếu cấu hình gì; số dashboard mở ra đúng hồ sơ |
| Platform Admin | Tìm tenant onboarding lỗi và hướng xử lý | Xác định lỗi nguồn/người phụ trách mà không phải xem dữ liệu nghiệp vụ khách trái quyền |

Đề xuất thử ban đầu với 1–2 người đại diện mỗi nhóm công việc, có người mới dùng và người quen nghiệp vụ. Đây chỉ là kiểm thử định tính để tìm lỗi, không chứng minh thống kê rằng mọi người đều hài lòng. Nếu chưa có người dùng thật, đánh dấu kết quả là đánh giá nội bộ.

Ghi thời gian hoàn thành, số lần cần trợ giúp, số lần nhập lại, quyết định sai, số bước và mức hiểu đúng trước/sau. Mục tiêu bắt buộc là **không có lỗi nghiêm trọng về quyền, số lượng, chấp thuận và nghĩa trạng thái**. Mục tiêu thời gian/giảm bước sẽ chốt từ baseline đo được, không tự tuyên bố giảm 30% khi chưa đo.

## 9. Thứ tự triển khai được khuyến nghị từ đánh giá này

1. **Kiểm chứng hiện trạng:** lấy dữ liệu thật, chạy các tình huống mục 7 và xác định vấn đề thật. Phân biệt bug, thiếu API, nội dung khó hiểu và đề xuất chưa được quyết định.
2. **Làm đúng trước:** D05/D06/D09/D13 phần chấp thuận, số tồn và phục hồi; quyền/scope trên mọi API. Những phần đã có thì nghiệm thu, không viết lại.
3. **Làm rõ trách nhiệm:** D01/D02 và hàng chờ của từng role. Hoàn thiện chủ ca và next action trước khi thêm nhiều dashboard metric.
4. **Làm hành trình liền mạch:** D03/D04/D08/D10/D12/D15. UI có thể thiết kế trước contract, nhưng phần chưa có API phải ghi rõ là prototype và không báo lưu giả.
5. **Nâng chất lượng phục vụ:** D07/D11/D14 dựa trên dữ liệu đã thu; chỉ thêm appointment/nhắc nâng cao/metric mới khi có định nghĩa và đầu vào đủ.

Các quyết định cần chủ sản phẩm review trước code: phạm vi duyệt phát sinh; điều kiện khách chấp nhận kết quả một phần; cách xử lý ca không phản hồi; trách nhiệm hàng mất ngoài hiện trường; quyền người xác nhận thay; mức lịch hẹn khách được cam kết. Đây là nơi cần cân bằng tiện lợi và trách nhiệm, không nên để frontend tự quyết bằng một nút.

## 10. Kết luận đánh giá logic

**Có thể giữ làm nền:** mô hình máy–cam kết–yêu cầu–công việc–báo cáo–vật tư–lịch sử, role cố định, quyền server, snapshot/revision, outbox/inbox và ledger. Không cần thay kiến trúc chỉ để tạo cảm giác mới.

**Chưa đủ rõ để gọi là trải nghiệm xuất sắc:** các bước phối hợp giữa người dùng và cách khép ngoại lệ. Một hồ sơ có đủ field vẫn có thể khiến khách hiểu sai, nhân viên nhập lặp hoặc không ai xử lý tiếp.

**Thiết kế đề xuất hợp lý khi đáp ứng đồng thời:** thông tin tự suy ra không phải nhập lại; quyết định có nguồn và version; trạng thái kỹ thuật không giả thành sự đồng ý của khách; không có vòng chờ; mất mạng có đường đối soát; thao tác trong scope; dữ liệu lịch sử giữ nguyên; công việc chưa xong luôn có đầu mối.

Chỉ sau khi các hành trình bình thường và ngoại lệ được người dùng đại diện thực hiện, có bằng chứng hiểu đúng và giảm khó khăn so với baseline, mới có cơ sở kết luận việc sửa đã đem lại trải nghiệm tốt hơn.
