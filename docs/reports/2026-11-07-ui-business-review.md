# Rà soát UI và nghiệp vụ hiện tại

Ngày: 07/11/2026. Baseline: working tree nhánh `codex/service-manager-field-desk`, gồm phần Workshop UI chưa commit.

> Đây là baseline tại thời điểm rà soát 07/11, không phải trạng thái Git hiện tại. Các đợt sửa tiếp theo đã merge qua PR #65 (`develop@fbfab28`); xem [bàn giao hiện hành](2026-11-08-workshop-ui-handoff.md) và [nghiệm thu V2](2026-11-08-workshop-ui-v2-acceptance.md) trước khi nhận lại một phát hiện.

## 1. Phạm vi và kết luận

Đối chiếu giao diện Service Manager đang mở, code web, state machine và các nhánh xử lý liên quan của Asset, Service Request, Work Order, Maintenance, Inventory. Đây là đánh giá source và giao diện; không phải nghiệm thu lại toàn bộ luồng trên backend thật. Trang `/tmp/workshop-preview/index.html` dùng fixture QA chỉ đọc và không chứng minh các luồng ghi/tích hợp đang hoạt động.

**Kết luận:** Workshop phù hợp bối cảnh dịch vụ thiết bị, bố cục và ngôn ngữ thiết kế đã có hướng riêng. Nền nghiệp vụ có nhiều ranh giới được thiết kế đúng. Tuy nhiên chưa đủ để chốt trải nghiệm vận hành hoàn chỉnh: còn công việc bị khuất, thông tin đã có ở backend chưa hiện trên UI và một số nhãn/thao tác chưa phản ánh đủ ý nghĩa nghiệp vụ.

Các khoảng trống bên dưới được phân biệt thành: lỗi/thiếu ở UI đã xác định, khả năng backend đã có nhưng chưa khai thác, và quyết định nghiệp vụ còn cần thống nhất. Không coi tài liệu bàn giao lịch sử là bằng chứng chức năng vẫn chưa được triển khai nếu code mới đã có.

## 2. Sản phẩm làm cho ai?

Tenant là doanh nghiệp cung cấp thiết bị, sử dụng hệ thống để phục vụ khách sau bán hàng. Customer là doanh nghiệp mua/sử dụng thiết bị của Tenant, không tự trở thành Tenant. Đơn vị cốt lõi để theo dõi dịch vụ là **từng thiết bị có serial**, gắn với khách hàng, địa điểm và lịch sử.

| Người dùng | Điều họ cần biết/quyết định | Vì sao phải thấy |
|---|---|---|
| Chủ doanh nghiệp / Tenant Admin | Việc đang tồn, khách bị ảnh hưởng, ca kéo dài, xử lý lại, tồn kho thiếu | Kiểm soát chất lượng phục vụ và nguồn lực. Không cần thêm role “chủ doanh nghiệp”; dùng RBAC hiện có |
| Service Manager | Yêu cầu nào cần quyết định; bảo hành/chi phí; ai đang phụ trách; điều gì chặn; điều kiện khép hồ sơ | Chịu trách nhiệm xuyên suốt việc phục vụ, kể cả các bước chờ người khác |
| Dispatcher | Địa điểm công việc, giờ dự kiến, kỹ năng, tải công việc, người liên hệ | Chọn người có thể thực hiện và phối hợp lịch thực tế |
| Technician | Đúng máy, đúng nơi, mô tả sự cố, lịch sử gần nhất, checklist, vật tư, cách báo kết quả | Giảm hỏi lại, đi nhầm và bỏ sót bằng chứng |
| Inventory Staff | Tồn khả dụng/cách ly, lượng xuất/trả/dùng, người giữ, giao dịch chưa rõ kết quả | Đối soát phụ tùng và giải quyết giao dịch treo có căn cứ |
| Customer Admin | Thiết bị, thời hạn/điều kiện bảo hành, nội dung bàn giao, phiên bản dự toán, kết quả để xác nhận | Biết mình đang đồng ý điều gì và các chi phí/phạm vi nào đã được chấp thuận |
| Customer User | Gửi sự cố đúng máy, biết đã tiếp nhận chưa, đang chờ ai, phản hồi và kết quả công bố | Có thể theo dõi việc phục vụ mà không hiểu hệ thống nội bộ |
| Platform Admin | Tenant, tài khoản và vận hành nền tảng trong quyền được cấp | Quản lý SaaS; không mặc định cần xem nội dung sửa chữa của mọi khách hàng |

Chưa đánh giá trực quan toàn bộ giao diện các role còn lại trong lượt này. Bảng trên là yêu cầu nghiệp vụ để đối chiếu; trọng tâm UI hiện tại vẫn là Service Manager.

## 3. Những phần đang có nền tảng đúng

- Request thể hiện nhu cầu và phản hồi của khách; Work Order thể hiện công việc kỹ thuật. Hoàn tất WO không tự đóng Request.
- Có kết quả RESOLVED/PARTIALLY_RESOLVED/UNRESOLVED, báo cáo và nội dung công bố riêng cho khách.
- Bảo hành theo thời hạn tách khỏi đánh giá nguyên nhân/điều khoản cho từng sự cố. Chính sách Model và quyết định áp dụng có snapshot/version.
- Đăng ký thiết bị/thiết lập bảo hành, bảo trì khác với việc khách xác nhận bàn giao. Acceptance và activation được ghi cùng transaction Asset.
- Tình trạng vận hành được xác nhận riêng; sự kiện hoàn tất WO không tự chứng minh máy đang dùng tốt.
- Kho tách lượng đã xuất, đã trả, đã xác nhận sử dụng, chưa đối soát. Phụ tùng cách ly không bị coi là tồn khả dụng.
- Reservation thực đã có phía Work Order, chặn complete/cancel khi còn HELD. Đây không còn chỉ là phần bàn giao dự kiến của tài liệu M3 cũ.
- Có cơ chế giữ nguyên intent khi mất phản hồi; dữ liệu nhiều service có trạng thái unavailable/restricted, không mặc định lỗi thành số 0.
- Menu theo quyền hiện có; Customer không cần được cấp quyền kho hay Work Order nội bộ để theo dõi dịch vụ đã công bố.

## 4. Những điểm cần sửa trước nghiệm thu trải nghiệm thực tế

### A. Bàn dịch vụ chưa bao quát công việc dễ bị bỏ sót

**Đã xác định:** dashboard chỉ đọc NEW, REVIEWING, WO CREATED và ON_HOLD. Request ACCEPTED đang chờ tạo WO, RESOLVED chờ khách xác nhận, AWAITING_INFO, AWAITING_CUSTOMER_APPROVAL/COST_REJECTED; bàn giao chờ xác nhận và bảo trì cần chú ý không có hàng chờ tại đây. Các chức năng này có ở những trang khác; thiếu là khả năng phát hiện và điều phối trên bàn làm việc.

**Ai cần:** Service Manager và chủ doanh nghiệp.

**Đề xuất:** nhóm theo trách nhiệm “Cần tôi xử lý / Chờ khách / Chờ đội kỹ thuật-kho / Cần xem lại kết quả”. Trong mỗi nhóm vẫn hiện trạng thái thật. Không phải mỗi trạng thái đều trở thành một ô số mới. Khi bổ sung ACCEPTED, phải phân biệt trường hợp chờ event sau khi WO vừa tạo với trường hợp thực sự chưa có lệnh đang hoạt động.

**Nguồn:** `ServiceManagerDashboard.tsx:23`, `App.tsx:1240`, `state-machines.md`.

### B. “Việc cần quyết định” đang chọn theo bản ghi mới nhất

**Đã xác định:** các query dashboard và board không truyền sort; DTO mặc định `-createdAt`. Chỉ đọc 6/4 hồ sơ mỗi nhóm nên một yêu cầu cũ hoặc khẩn cấp có thể nằm ngoài phần nhìn đầu tiên. Số tổng đúng chưa đủ để người dùng phát hiện ca cần làm trước.

**Đề xuất:** hiển thị tuổi yêu cầu, cập nhật gần nhất, ưu tiên và lý do cần chú ý; cung cấp thứ tự cũ nhất/ưu tiên theo khả năng API. Có quy tắc rõ về nhóm được chọn. Không gắn nhãn vi phạm SLA khi chưa có cam kết và cách tính được thống nhất.

**Phạm vi:** UI đã có thể khai thác các sort server hiện có; xếp hạng kết hợp nhiều yếu tố là thay đổi contract nếu cần.

### C. Work Order có thể hiển thị nhầm địa điểm phục vụ

**Đã xác định:** backend lưu `customerSiteId` và `locationId` khi tạo lệnh; trang chi tiết lại lấy địa điểm từ `equipment.data.customerSiteId` hiện tại. Nếu thiết bị đã chuyển nơi, màn hình công việc cũ có thể hiện nơi mới.

**Ai cần:** Dispatcher, Technician và người đối soát lịch sử.

**Đề xuất:** ưu tiên địa điểm gắn với Work Order, ghi nhãn riêng cho vị trí hiện tại của thiết bị nếu khác. Bổ sung địa chỉ, vị trí cụ thể và người liên hệ theo nguồn có quyền truy cập. Thiếu dữ liệu lịch sử phải ghi thiếu; không tự coi tên/địa chỉ hiện tại là snapshot lịch sử.

**Nguồn:** `ServiceManagerWorkOrder.tsx:704`, `work-orders.repository.ts:239`.

### D. Hồ sơ thiết bị chưa hiển thị lịch sử phụ tùng đã xác nhận

**Đã xác định:** Asset dossier trả `serviceParts`; Inventory và Asset có API đọc lịch sử phụ tùng an toàn theo equipment/customer. Type Dossier và các mục hiện tại của web chưa sử dụng `serviceParts`.

**Ai cần:** khách mua thiết bị, Service Manager và kỹ thuật viên xem lịch sử máy.

**Đề xuất:** mục “Phụ tùng đã thay / đã xác nhận dùng”: tên/mã, lượng, WO/report liên quan, người/thời điểm xác nhận khi được phép, lý do thay, xử lý linh kiện cũ và các lần sửa sai. Phân biệt thời gian hoàn tất công việc với thời gian hệ thống nhận xác nhận. Không gọi ngày ghi nhận là ngày lắp nếu nguồn không chứng minh.

**Phạm vi:** phần đáng kể là nối UI với API hiện có. Không lấy giá vốn làm giá bán; không coi chưa có giá là miễn phí hoặc tự cấp bảo hành mới cho phụ tùng.

**Nguồn:** `dossier.service.ts:151`, `dossier.service.ts:462`, `M2Pages.tsx:29`, `inventory.controller.ts:265`.

### E. Lỗi chờ đối soát kho không cho người dùng biết cách giải quyết

**Đã xác định:** Work Order trả 409 `INVENTORY_RESERVATION_HELD`; action UI gom mọi lỗi 409 thành “Hồ sơ vừa thay đổi. Làm mới…”. Làm mới không tự giải quyết giao dịch Inventory đang HELD.

**Đề xuất:** thông báo theo mã lỗi: đang bị chặn vì giao dịch kho nào chưa rõ kết quả, cần bộ phận kho đối soát, thời điểm chờ và đường dẫn có quyền đọc. Service Manager được biết nguyên nhân và người cần phối hợp; retry/abort chỉ người có quyền kho thực hiện. Giữ nguyên key/proof và quy tắc reservation; không tạo thao tác mới để né lỗi.

**Nguồn:** `ServiceManagerWorkOrder.tsx:307`, `inventory-reservations.repository.ts:18`.

### F. Kết thúc công việc, kết quả sửa chữa và tình trạng máy chưa đủ nổi bật

**Đã xác định:** summary/progress WO chủ yếu cho thấy COMPLETED; kết quả kỹ thuật nằm ở tab báo cáo. Equipment ACTIVE còn được gắn nhãn “Hoạt động/Đang hoạt động”, trong khi operationalCondition là trường riêng và có thể UNKNOWN.

**Đề xuất:** đầu hồ sơ phải phân biệt:

1. Lệnh công việc: đã hoàn tất thao tác kỹ thuật.
2. Kết quả: đã xử lý / xử lý một phần / chưa xử lý được.
3. Tình trạng vận hành: xác nhận nào, bởi ai, lúc nào.
4. Request: chờ khách xác nhận / tiếp tục xử lý / đã đóng.

Đặc biệt PARTIALLY_RESOLVED hiện có thể dẫn tới RESOLVED và cho confirm. Cần cho khách thấy phần đã làm, phần chưa làm và ý nghĩa của việc đồng ý kết quả một phần; không dùng một nút “hoàn tất” chung làm mất thông tin này. Đây là quyết định nghiệm thu kết quả, không đề xuất thêm trạng thái WO tùy ý.

### G. Xác nhận thay khách chưa có bằng chứng đủ rõ

**Đã xác định:** backend cho reviewer confirm RESOLVED → CLOSED, ghi người và thời điểm; endpoint confirm không nhận lý do/căn cứ. UI dùng cùng nhãn “Xác nhận hoàn tất”. Quyền này đã có trong thiết kế; vấn đề là bằng chứng và cách diễn đạt trách nhiệm.

**Đề xuất:** khách tự xác nhận và nhân viên xác nhận thay phải hiện khác nhau. Với xác nhận thay, cần ghi người đồng ý, kênh xác nhận, lý do và minh chứng thích hợp. Không coi nhân viên bấm nút là khách đã tự nghiệm thu.

**Phạm vi:** nhãn và cảnh báo làm ở UI; trường bằng chứng/quy tắc bắt buộc cần Huy và owner nghiệp vụ chốt, sau đó cập nhật API/audit.

**Nguồn:** `service-requests.service.ts:1514`, `App.tsx` action dialog.

### H. Phạm vi/chi phí và đối soát khi khép hồ sơ chưa liền mạch

**Đã xác định:** có estimate revision và xác nhận sử dụng phụ tùng; chưa thấy trong luồng confirm Request hiện tại một bước đối chiếu phạm vi đã duyệt, thay đổi thực tế và lượng phụ tùng chưa đối soát. Các tài liệu bàn giao M3 cũng nêu đây là phần phối hợp SR/WO/Inventory.

**Đề xuất:** trước khi khép hồ sơ, một khối tóm tắt “Đã được khách đồng ý / Đã thực hiện / Còn cần làm rõ”. Phát sinh ngoài phạm vi/chi phí đã duyệt cần quy tắc chấp thuận trước khi thực hiện; không tự suy ra từ giao dịch xuất kho.

**Lưu ý thiết kế:** xác nhận dùng phụ tùng hiện diễn ra sau khi report được tạo. Không chặn WO hoàn tất bằng yêu cầu phải có xác nhận sau-report trước đó, vì gây vòng chờ. Nếu muốn chặn cuối ở SR, cần contract và cơ chế đối soát giữa owner; một lần GET trước khi đóng không phải transaction nguyên tử giữa DB.

### I. Phân công chưa cho thấy đầy đủ khả năng thực hiện

**Đã xác định:** assignment cho phép cả AVAILABLE/BUSY, không có kiểm tra lịch trùng trong nhánh assign đã đọc. Danh sách/form hiện chưa trình bày lịch và tải công việc cạnh lựa chọn. API Technician đã hỗ trợ lọc branch/skill nhưng UI chủ yếu dùng tìm kiếm/status.

**Đề xuất:** thêm bộ lọc kỹ năng/chi nhánh, công việc đang nhận, khoảng giờ dự kiến và cảnh báo giao chồng. BUSY không có nghĩa luôn bị cấm giao; AVAILABLE không bảo đảm rảnh trong giờ tương lai. MVP có thể cho điều phối ghi nhận ngoại lệ rõ, chưa cần quản lý ca nghỉ hay tối ưu tuyến đường.

**Phạm vi:** một phần khai thác API sẵn có; kiểm tra xung đột lịch có hiệu lực ở backend cần thiết kế thêm, không chỉ thêm cảnh báo tại frontend.

### J. Request thiếu người chịu trách nhiệm xuyên suốt

**Đã xác định:** schema Request có requester, người kiểm tra bảo hành, thời điểm review và người confirm; chưa có owner dịch vụ riêng cho từng ca. Người từng bấm review không mặc định là người đang chịu trách nhiệm hiện tại.

**Đề xuất:** nếu nhiều Service Manager cùng làm việc, cần một quy tắc nhận phụ trách/chuyển phụ trách tối giản và lịch sử. Tại UI luôn ghi “Ai đang cần hành động” trước; không tự gán owner từ `warrantyCheckedBy`. Bổ sung trường owner là thay đổi schema/API cần review, chưa triển khai trong lượt đánh giá này.

### K. Bàn giao chưa đưa đầy đủ điều khách cần đồng ý vào cùng hồ sơ

**Đã xác định:** snapshot bàn giao hiện gồm định danh máy, đích bàn giao, thời gian, tình trạng và ghi chú. Snapshot không chứa điều khoản/thời hạn bảo hành, checklist phụ kiện/tài liệu riêng. Acceptance kích hoạt lifecycle, không tự điều chỉnh ngày bảo hành đã thiết lập.

**Đề xuất:** cho thấy rõ thời điểm giao thực tế, khách xác nhận, hiệu lực bảo hành và kỳ bảo trì đầu tiên. Nếu khách phải đồng ý các điều khoản này trong bàn giao, cần tham chiếu phiên bản/snapshot cố định, không chỉ link đến dữ liệu hiện tại có thể đã đổi. Hiện tại có thể bổ sung phụ kiện/tài liệu qua mô tả; quản lý checklist có cấu trúc là đề xuất tiếp theo.

Cần chốt rõ căn cứ bắt đầu bảo hành: ngày giao, ngày nghiệm thu hay ngày chạy máy. Không tự thay quy tắc ngày đã lưu sau acceptance. Phân biệt “đăng ký/thiết lập dịch vụ” và “gửi khách xác nhận bàn giao” bằng lời giải thích và liên kết tiếp tục cùng hành trình.

### L. “Toàn bộ lịch sử” và “hiệu quả” cần diễn đạt đúng phạm vi

**Đã xác định:** Asset công bố `historyCoverage`, `consistency` và metadata các nguồn; lịch sử tổng không chứa mọi chi tiết assignment/log từ WO. UI đã có một số nhãn dữ liệu cũ chưa đầy đủ, nhưng chưa diễn đạt đầy đủ phạm vi tổng hợp. Footer còn ghi “Tra cứu lịch sử dịch vụ” trong khi link chỉ vào maintenance-history.

**Đề xuất:** “Toàn bộ lịch sử đã ghi nhận”, kèm phạm vi nguồn và link vào từng hồ sơ gốc; ghi rõ dữ liệu nguồn chưa phản hồi/có thể cập nhật chậm. Đổi footer đúng nghĩa hoặc mở đúng trang tra cứu tổng hợp.

Báo cáo hiện chủ yếu đếm WO tạo/hoàn tất/trạng thái nhưng tiêu đề là “Hiệu quả xử lý công việc”. Những số này phản ánh khối lượng, chưa chứng minh sửa thành công hay khách hài lòng. Khi bổ sung KPI, ưu tiên tuổi hồ sơ, ca quay lại, kết quả chưa xử lý/một phần, trễ giờ dự kiến và chờ xác nhận; quy định mẫu số và cách tính. Không gắn chỉ số hài lòng nếu chưa thu thập.

## 5. Đánh giá riêng về UI

- **Giữ:** phong cách Workshop; số liệu có nghĩa; queue/reading pane; hồ sơ thiết bị có khối nhận dạng; tab nội dung và nhãn trạng thái có chữ.
- **Cần chỉnh:** trên màn hình nhỏ, hai cấp menu và bốn ô số đẩy công việc xuống sâu. Ưu tiên một nhóm việc đang chọn, phần còn lại thu gọn nhưng truy cập được; không chỉ kiểm tra không tràn ngang.
- **Cần chỉnh:** nhãn “Tối đa 6 hồ sơ”, “kế hoạch đến hạn chờ sinh việc” còn thiên về cách triển khai. Có thể dùng “Đang xem 6 trong N hồ sơ”, “Đến hạn nhưng chưa tạo công việc”.
- **Cần chỉnh:** danh sách Request thiếu khách hàng/thiết bị/địa điểm để phân biệt các sự cố có tiêu đề giống nhau. Card WO cần mã/serial ngắn và địa điểm công việc; không phải thêm mọi trường vào mọi card.
- **Cần chỉnh:** pane bảo hành hiện luôn nhắc mở hồ sơ, chưa đưa ra tóm tắt đánh giá thật. Khi dữ liệu đủ, hiển thị kết luận, lý do ngắn, người/thời điểm đánh giá và nguồn; khi chưa có, giữ nhãn chưa đánh giá.
- **Cần chỉnh:** tài khoản/tenant/chi nhánh hiện tại cần rõ hơn phần generic “Không gian quản lý dịch vụ”, đặc biệt khi demo nhiều doanh nghiệp. Chỉ hiển thị context được backend xác thực, không coi chọn bộ lọc frontend là đổi quyền dữ liệu.
- **Cần chỉnh:** mỗi pane/form có một hành động chính theo trạng thái; các thao tác phụ và nguy hiểm có mức nhấn thích hợp. Request hiện vẫn có nhiều nút hành động đặt cùng hàng dù đã có modal.

## 6. Thứ tự hoàn thiện đề xuất

### Đợt 1 — sửa sai nghĩa và đưa dữ liệu đã có ra đúng chỗ

1. Địa điểm Work Order theo chính lệnh; ngữ nghĩa trạng thái máy/kết quả sửa chữa.
2. Lỗi reservation có lý do, người cần phối hợp và đường đối soát đúng quyền.
3. Các nhóm việc bị khuất trên dashboard; thứ tự/tuổi hồ sơ và lý do cần chú ý.
4. Lịch sử phụ tùng đã xác nhận trong hồ sơ thiết bị; lịch sử tổng có phạm vi rõ.
5. Nhận dạng khách/máy/địa điểm trong danh sách; sửa footer và nhãn còn mang tính kỹ thuật.

Chủ yếu Web/Hatsady, đối chiếu nguồn Asset/Maintenance/Inventory của Minh và WO của Khương. Một số field tổng hợp cần API hỗ trợ; không bù bằng fixture sản phẩm.

### Đợt 2 — chốt các quy tắc có ảnh hưởng đến khách hàng

- Huy + Khương + Minh: kết quả một phần, bằng chứng xác nhận thay, phát sinh ngoài dự toán, điều kiện đối soát khi khép SR.
- Huy: người phụ trách ca và nhu cầu reminder tối thiểu, nếu được chọn cho MVP.
- Minh + Web: căn cứ hiệu lực bảo hành/bàn giao, nội dung khách thực sự xác nhận và snapshot tương ứng.
- Khương + Web: tải công việc, lịch trùng và quy tắc điều phối ngoại lệ tối giản.

Các đề xuất này chưa phải quyết định đã được người dùng phê duyệt. Giữ các quy tắc đã chốt: lịch bảo trì neo ngày gốc; ISSUE phải có reservation; RETURN/LowStock theo ADR hiện hành.

### Đợt 3 — nghiệm thu luồng thật và báo cáo quản trị

Kiểm tra thông báo/deep-link, dữ liệu thiếu/quyền lỗi, ảnh/tài liệu, luồng khách xác nhận và đối soát kho trên service/broker/DB thật. Mở rộng báo cáo dựa trên số liệu có định nghĩa. Không coi build/test component hoặc trang QA là bằng chứng nghiệm thu tích hợp.

## 7. Các tình huống nghiệm thu bắt buộc nên có

1. Một yêu cầu cũ khẩn cấp nằm sau hơn 6 bản ghi mới: vẫn có cách phát hiện và xử lý ưu tiên.
2. Request ACCEPTED nhưng chưa có WO; trường hợp WO vừa tạo nhưng event đến chậm: UI không kết luận giống nhau.
3. Hai máy cùng model nhưng khác serial/địa điểm; máy chuyển vị trí sau khi lập WO: không đi nhầm nơi.
4. Còn hạn bảo hành nhưng sự cố thuộc loại trừ: không tiếp nhận miễn phí chỉ dựa trên ngày.
5. WO COMPLETED/UNRESOLVED hoặc PARTIALLY_RESOLVED: không trình bày như đã sửa xong toàn bộ máy.
6. Nhân viên xác nhận thay khách: thể hiện đúng actor, căn cứ và phạm vi đồng ý.
7. ISSUE đã commit nhưng phản hồi/settlement bị mất: giữ thao tác gốc và giải quyết HELD bằng bằng chứng, không bỏ khóa do timeout.
8. Xuất 2, xác nhận dùng 1, phần còn lại đang giữ hoặc trả hỏng: hồ sơ không ghi đã thay cả 2 hay tăng tồn khả dụng sai.
9. Khách chấp thuận dự toán một phạm vi nhưng công việc thực tế phát sinh thêm: có quy tắc và bằng chứng trước khi tính cho khách.
10. Bảo hành đã chạy trước khi khách xác nhận bàn giao: nội dung ngày hiệu lực phải hiện rõ, không âm thầm đổi.
11. Asset/Inventory/WO một nguồn unavailable: các phần còn lại vẫn xem được, không ghi “không có lịch sử”.
12. Tài khoản customer khác tenant/customer, user bị thu hồi quyền, file nội bộ: không đọc được bằng cách sửa URL; bản công bố cho khách vẫn dễ tìm trong phạm vi hợp lệ.

## 8. Trạng thái sau đánh giá

Lượt này chỉ thêm báo cáo đánh giá. Không sửa code sản phẩm, không commit, push hoặc merge. Các thay đổi Workshop local trước đó được giữ nguyên để review tiếp.
