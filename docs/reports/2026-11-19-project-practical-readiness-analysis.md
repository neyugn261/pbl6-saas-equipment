# Phân tích mức đáp ứng thực tế của PBL6 và hướng triển khai

Ngày đánh giá: 19/11/2026
Phạm vi: repository PBL6, backlog [2026-11-19-web-equipment-import-filter-export-task-assignment.md](../plans/2026-11-19-web-equipment-import-filter-export-task-assignment.md), tài liệu so sánh luồng thiết bị hiện tại và các yêu cầu quản lý Web.

## 1. Tóm tắt điều hành

PBL6 có nền tảng kỹ thuật và nhiều mảnh nghiệp vụ quan trọng: Asset, Equipment Model, Registration, Handover, Warranty, QR, lịch sử, Request, Work Order, Maintenance và Inventory. Phân quyền, tenant scope, API service và event contract là những nền tảng có ích cho mục tiêu SaaS.

Tuy nhiên, dựa trên code hiện có, tài liệu và backlog ngày 19/11, **chưa đủ bằng chứng để kết luận hệ thống đã là công cụ vận hành dễ dùng, liền mạch và đáng tin cho nhân viên hoặc khách hàng**. Điểm yếu chính là sự liên kết giữa dữ liệu và hành động: người dùng vẫn phải đi qua nhiều hồ sơ/màn hình để hiểu một tình huống, danh sách thiết bị chưa đủ thông tin để xử lý công việc, và các luồng nhập liệu chưa khớp cách doanh nghiệp ghi nhận bàn giao thực tế.

| Năng lực | Đánh giá hiện tại | Căn cứ / giới hạn |
|---|---|---|
| Nền tảng quản lý thiết bị | Có cơ sở | Có model, thiết bị, khách/site/location reference, ngày bàn giao/lắp, trạng thái, warranty, QR và history. |
| Xem danh sách thiết bị để làm việc | Yếu | Màn hiện tại có tìm kiếm cơ bản, vài filter và một số cột; chưa thể hiện phần lớn dữ liệu ra quyết định. |
| Tìm, lọc và đếm trên toàn tập | Một phần | API có phân trang và một số filter; summary Web đang đếm một số trạng thái từ trang hiện tại. |
| Nhập/cập nhật thiết bị theo lô | Chưa khớp yêu cầu mới | Bulk hiện tạo draft, CSV, giới hạn 50 dòng/100 KB, khách/site chung; chưa có XLSX và cập nhật lô theo file. |
| Bàn giao và bảo hành | Có luồng, cần hợp nhất ý nghĩa | Có các thực thể và luồng bàn giao/xác nhận; import mới cần ghi nhận xác nhận ngoài hệ thống mà không giả actor Portal. |
| Phân quyền và phân tách tenant | Có nền tảng tốt | API kiểm permission/user type; cần nghiệm thu xuyên list/filter/summary/import/export/download theo scope. |
| Trải nghiệm đầu cuối theo vai trò | Chưa được chứng minh | Code và tài liệu chưa thay thế được UAT trên browser với dữ liệu và tài khoản đại diện. |

Đánh giá này **không phải phần trăm hoàn thành**. Repository có nhiều thay đổi chưa commit; nhánh đang mở là `codex/minh-ux-20261119`, HEAD hiển thị `f0751a4` (17/11/2026), nhưng working tree chứa nhiều file đã sửa và chưa theo dõi, bao gồm Asset, Inventory, Web, migration và tài liệu ngày 19/11. Vì vậy, nhận định mô tả snapshot làm việc đang thấy, không chứng nhận riêng commit HEAD hoặc một bản release ổn định. Các task trong backlog đều là yêu cầu/chưa nghiệm thu trừ khi có bằng chứng code và kiểm tra phù hợp.

## 2. Người dùng cần thấy và làm được gì

Người dùng không cần mọi trường dữ liệu trên cùng một màn. Họ cần nhận diện đúng hồ sơ, biết tình trạng có ý nghĩa gì và xử lý được việc tiếp theo theo vai trò.

| Vai trò | Câu hỏi họ cần được trả lời nhanh |
|---|---|
| Customer Admin / Customer User | Thiết bị nào thuộc doanh nghiệp tôi? Đang ở cơ sở nào? Bảo hành đến khi nào? Yêu cầu, lịch sửa chữa/bảo trì đang ở đâu? Tôi có thể gửi yêu cầu hoặc xem kết quả nào? |
| Service Manager | Thiết bị nào thiếu dữ liệu, đang chờ bàn giao/lắp, có yêu cầu cần xử lý, sắp hết bảo hành hoặc đang bị chặn? Ai cần làm bước tiếp theo? |
| Dispatcher | Công việc nào cần phân công, nơi làm việc chính xác ở đâu, kỹ thuật viên nào phù hợp với lịch/chi nhánh? |
| Technician | Hôm nay làm gì, tại đâu, gặp ai, thiết bị nào, checklist/phụ tùng cần gì, phải ghi lại kết quả nào? |
| Inventory Staff | Phụ tùng nào còn khả dụng, đã giữ/cấp/trả cho công việc nào, tồn kho nào cần xử lý? |

Đối với Thiết bị, bộ thông tin tối thiểu để quản lý thường gồm mã/serial/model, khách hàng, site và vị trí lắp; ngày bàn giao và ngày lắp; tình trạng hồ sơ/vận hành; hiệu lực bảo hành; việc Request/Work Order đang mở; thông tin còn thiếu và bước cần làm tiếp. Ngày mua hữu ích để đối soát khi có nguồn, nhưng phải là trường độc lập, không suy ra từ ngày bàn giao hoặc ngày tạo hồ sơ.

## 3. Những gì code hiện tại đã có

### Asset và hồ sơ thiết bị

Schema Equipment hiện có model, customer/site/location logical reference, asset code, serial, ngày lắp, ngày bàn giao, trạng thái vòng đời, ngày đưa vào vận hành, thông số kỹ thuật và operational status. Có quan hệ với Registration, Handover, Warranty, QR và History. Đây là nền móng phù hợp cho nghiệp vụ hậu mãi. Xem [schema Asset](../../apps/asset-service/prisma/schema.prisma#L58).

API có list/detail/patch/history và kiểm tra `equipment:read` / `equipment:manage`, đồng thời áp dụng user type và data scope. List hỗ trợ q, customer, site, status, operational status, registration status, warranty, sort và pagination. Search hiện thấy trong repository gồm asset code, serial và tên model; chưa thể hiện một query tổng hợp cho mọi nguồn dịch vụ. Xem [DTO filter](../../apps/asset-service/src/equipment/dto/equipment.dto.ts#L126), [repository list](../../apps/asset-service/src/equipment/equipment.repository.ts#L68) và [controller](../../apps/asset-service/src/equipment/equipment.controller.ts#L1).

Màn Web `/app/equipment` và Portal dùng chung có ô tìm, lọc trạng thái, lọc tình trạng hồ sơ cho nhân viên, các cột mã/model/serial/bảo hành/trạng thái và phân trang. Hồ sơ chi tiết và các route history/service có để tra cứu sâu hơn. Nhưng một số số liệu ở summary strip được tính từ `items` của trang hiện tại, nên không thể coi đó là tổng đúng toàn tập. Xem [EquipmentPage](../../apps/web/src/App.tsx#L651).

### Bulk hiện có và khoảng cách với luồng mới

Bulk service đã có preview, kiểm tra trùng trong lô, idempotency key, lưu kết quả và transaction tạo các draft Registration. Đây là thành phần có thể tái sử dụng. Tuy nhiên DTO/parser chặn 1–50 dòng và CSV tối đa 100.000 ký tự; mỗi request dùng chung customer/site và delivery method, trong khi model có thể mặc định hoặc ghi theo dòng, location là tùy chọn. Kết quả preview nói bước kế tiếp là tạo draft rồi cấu hình/xác nhận policy theo từng thiết bị. Xem [Bulk DTO/parser](../../apps/asset-service/src/registrations/bulk.dto.ts#L1) và [Bulk service](../../apps/asset-service/src/registrations/bulk.service.ts#L1).

Backlog và báo cáo so sánh hiện trạng xác định thêm khoảng trống: XLSX, schema theo mã nghiệp vụ, nhiều model/site/location theo từng dòng, import kết quả đã xác nhận ngoài hệ thống, cập nhật thiết bị cũ, tiến độ/kết quả lô lớn và export toàn bộ kết quả lọc. Xem [báo cáo so sánh luồng](2026-11-19-user-flow-vs-current-equipment.md) và [task assignment](../plans/2026-11-19-web-equipment-import-filter-export-task-assignment.md).

### Phần đã được bổ sung trong working tree local

Snapshot local không chỉ có code của HEAD. Tài liệu bàn giao local ghi nhận các thay đổi chưa commit sau đây; chúng làm tăng mức đáp ứng một số luồng hẹp, nhưng không đồng nghĩa backlog 75 task đã xong:

| Bổ sung local | Giá trị thực tế | Phần còn thiếu / chưa được chứng minh |
|---|---|---|
| Bulk handover wizard, preview, kết quả và retry theo key | Giảm nhập từng thiết bị; có API và UI cho luồng CSV/JSON hiện tại | Vẫn 1–50 máy, CSV, draft và hậu xử lý theo từng thiết bị; chưa XLSX, create/update theo template mới, import xác nhận ngoài hệ thống. |
| Public QR inquiry | Có thể nhận yêu cầu liên hệ/báo lỗi theo QR với projection công khai hạn chế và hàng chờ nội bộ | Inquiry chưa tự thành Service Request/Work Order; còn việc vận hành Internet, limiter/retention/notification và xác minh trên môi trường triển khai. |
| Inventory pricing và estimate-parts snapshot consumer | Có giá nullable/version/audit, redaction giá vốn và consumer idempotent cho snapshot | Handoff ghi rõ producer từ Service Request còn thiếu; chưa thể demo trọn chuỗi duyệt báo giá → snapshot → Work Order/Part Request như một luồng đã nối thật. |
| Thay đổi Web cho các trang trên | Hỗ trợ thao tác/demo các API local mới | Đây chưa phải grid Thiết bị tổng quan với filter/summary/export toàn tập, cũng chưa phải nghiệm thu browser đầy đủ. |

Nguồn chi tiết: [bàn giao UX local ngày 19/11](2026-11-19-minh-ux-handoff.md), [evidence local](2026-11-19-minh-ux-evidence.txt) và các file source đang hiện diện trong working tree. Handoff tự ghi nhận các thay đổi là chưa commit/PR/merge; số lượng test trong handoff không được xem là UAT browser hoặc CI toàn repository.

## 4. Các điểm chết và rủi ro thực tế

### P0 — Người dùng không nhìn thấy “việc gì tiếp theo”

Hệ thống lưu nhiều trạng thái ở các entity riêng: lifecycle thiết bị, operational status, registration, handover, warranty, Request, Work Order và Maintenance. Mô hình này có thể cần thiết, nhưng nếu UI không quy về một bản tóm tắt công việc và chủ thể đang chờ thì nhân viên phải tự ghép dữ liệu. Các nhãn như `ACTIVE` và `IN_SERVICE` có thể gây hiểu nhầm nếu không được định nghĩa bằng ngôn ngữ thao tác. Hậu quả là nhiều trạng thái nhưng ít khả năng ra quyết định.

**Cần làm:** với từng role, xác định một “trạng thái làm việc” và “bước tiếp theo/đang chờ ai”, đồng thời vẫn giữ trạng thái nghiệp vụ chi tiết trong hồ sơ. Không gộp dữ liệu nguồn thành trạng thái giả.

### P0 — Màn danh sách chưa phải màn làm việc

Thiết bị là danh sách rất quan trọng nhưng hiện thiếu các cột nhận biết khách/vị trí/ngày và công việc đang mở; thiếu trạng thái dữ liệu chưa đủ; không có quick view gắn với filter; summary một phần dựa trên trang hiện tại. Người dùng phải mở từng hồ sơ hoặc chuyển nhiều menu để trả lời câu hỏi cơ bản.

**Cần làm:** ưu tiên list có cột lõi theo role, filter server-side, trạng thái “chưa ghi nhận/không áp dụng/lỗi nguồn”, summary cùng điều kiện lọc, và panel xem nhanh. Không nhồi mọi trường model thành cột mặc định.

### P0 — Import có thể tạo dữ liệu nhưng chưa phản ánh đúng thực tế bàn giao

Bulk hiện tạo draft và dựa vào luồng Registration/Handover đang có. Yêu cầu mới mô tả nguồn xác nhận ngoài hệ thống trước upload. Nếu dùng luồng cũ như thể đã đáp ứng, có thể bắt khách xác nhận lại trên Portal, gán nhầm actor, hoặc đánh đồng import thành máy đã lắp/vận hành. Giới hạn 50 và một site chung không phù hợp với lô thực tế có nhiều model/địa điểm.

**Cần làm:** chốt contract nguồn, actor, bằng chứng, ngày thực tế, mức đầy đủ và các trạng thái trước thay parser/schema. Giữ Portal cũ cho các kịch bản khác cho đến khi có phương án chuyển đổi được review.

### P0 — Thiếu một số dữ liệu chủ chốt và phân biệt “chưa biết” với “không áp dụng”

Schema Equipment hiện chưa có ngày mua. Site là bắt buộc trong DTO/schema trong khi location có thể null. Nếu chưa xác định được cơ sở hoặc máy không cần lắp đặt, cần biểu diễn đúng hai trường hợp đó; không dùng site/location giả hoặc ngày giả để vượt validation. Thông tin địa chỉ, vị trí phân cấp và nơi nhận/nơi lắp thuộc các khái niệm khác nhau.

**Cần làm:** data dictionary, policy về null/unknown/not-applicable và ownership dữ liệu Organization/Asset; sau đó mới migration/backfill. Không copy handover date sang purchase date.

### P1 — Tìm kiếm, summary và export có thể tạo niềm tin sai

Tìm theo serial/mã/model không đáp ứng lọc theo khoảng ngày, vị trí chi tiết, nhiều mã, thiếu thông tin, lô hoặc lịch sử. Summary chỉ tính trên trang sẽ không khớp với tổng đã lọc. Khi bổ sung export, nếu dùng dữ liệu browser đang giữ hoặc quyền cũ của preview thì có nguy cơ file sai/thiếu hoặc vượt scope.

**Cần làm:** một contract query chung cho list/filter/sort/summary/export; backend là nguồn kết quả và kiểm tra scope lại lúc preview, ghi, export và download. File cần ghi rõ thời điểm dữ liệu, số dòng và điều kiện đã áp dụng.

### P1 — Phân rã microservice khiến trải nghiệm tổng hợp tốn kém

Thiết bị có dữ liệu tham chiếu sang Organization; Request, Work Order, Inventory và Maintenance thuộc service khác. Database per service và không JOIN xuyên DB là nguyên tắc đúng, nhưng màn tổng hợp cần API/projection/event đáng tin, xử lý dữ liệu cũ/chậm/lỗi. Nếu chưa thiết kế read model, Web dễ gọi API từng dòng hoặc hiển thị 0 khi service phụ lỗi.

**Cần làm:** xác định nguồn sở hữu mỗi trường, cách batch lookup/projection và freshness; UI phải phân biệt số 0 với chưa tải được/lỗi nguồn. Tránh thêm field tổng hợp không có producer thật.

### P1 — Role/action mismatch có thể khiến quyền sai hoặc màn hình tự mâu thuẫn

Backlog bổ sung rõ yêu cầu Service Manager không tạo Service Request, trong khi vẫn xử lý yêu cầu và tạo Work Order theo quyền. Đây là thay đổi cần rà soát catalog, backend, seed/demo, route, shortcut, alias và session cũ. Chỉ ẩn nút là chưa đủ. Tương tự, báo cáo khách hàng phải lấy scope từ principal, chỉ trả dữ liệu được công bố.

**Cần làm:** ma trận role × route × action × API × field/export; nghiệm thu deny/allow thực tế cho Service Manager và ít nhất hai khách hàng khác nhau.

### P2 — Nhiều tính năng có thể vượt khả năng duy trì của nhóm

Scope hiện gồm nhiều service, event, policies/version snapshots, registration/handover, maintenance, inventory, pricing, reports, import/export, dashboard và customer portal. Mỗi tính năng riêng lẻ có lý do; rủi ro là làm song song quá rộng trước khi một luồng end-to-end ổn định. Với nhóm sinh viên, chi phí migration liên service, seed, test data, event compatibility và demo setup có thể lấn át thời gian cải thiện người dùng.

**Cần làm:** không bỏ các quyết định kiến trúc đã thống nhất, nhưng đóng băng mở rộng tính năng phụ cho đến khi một luồng ưu tiên chạy ổn định, có dữ liệu demo tái lập và UAT. Mỗi dashboard/field mới phải có người dùng, quyết định hoặc hành động cụ thể mà nó hỗ trợ.

### P2 — Rủi ro UI biến thành “bảng Excel trong web”

Task về cột tùy chọn, sort, multi-select, filter, quick view và export dễ dẫn đến một grid quá dày. Khách, Service Manager, Dispatcher và Technician không cần cùng một bảng. Cột tùy chọn cũng không thay thế thiết kế theo công việc; mobile hiện ngoài phạm vi đợt này nhưng layout Web vẫn cần bàn phím, cuộn ngang có chủ đích và thông tin dài xem được.

**Cần làm:** đặt cột mặc định theo nhiệm vụ phổ biến; phần còn lại nằm trong quick view/chi tiết; filter hiện rõ chip và URL; thao tác hàng loạt nêu rõ phạm vi và kết quả.

## 5. Hướng triển khai đề xuất

### Giai đoạn 0 — Chốt nghĩa trước khi thêm UI/API

1. Hoàn tất C01–C06 trong backlog: data dictionary; actor/source cho xác nhận ngoài hệ thống; unknown/not-applicable; schema query chung; contract file/version/update; đối chiếu ERD/SQL/Prisma/consumer và migration plan.
2. Lập ma trận theo persona: câu hỏi cần trả lời, dữ liệu/nguồn, quyền xem/sửa/tìm/xuất, hành động kế tiếp.
3. Chốt cách diễn giải Registration, Handover, Installation, Operational, Warranty và trạng thái chờ. Chỉ thêm trạng thái mới khi có quy tắc chuyển và hành động rõ.
4. Ghi nhận feature matrix: đã có trong code, đang làm, chỉ có tài liệu, còn thiếu, đã kiểm thử trên browser. Không đánh dấu xong chỉ dựa trên thiết kế.

### Giai đoạn 1 — Làm Thiết bị thành màn mẫu có thể vận hành

1. Bổ sung ngày mua như dữ liệu riêng sau khi chốt nguồn và migration; giữ null cho máy cũ chưa có thông tin.
2. Mở rộng list API với filter theo schema đã duyệt: identity, customer/site/location, các ngày riêng, trạng thái, warranty và completeness; sort ổn định và pagination rõ.
3. Tạo summary phía server dùng cùng filter/scope với list. Summary không được biến lỗi service nguồn thành 0.
4. Tạo grid mặc định gọn theo role, quick view và giữ query/page/scroll khi quay lại. Cho biết thông tin thiếu và việc đang chờ.
5. Bổ sung export CSV/XLSX của toàn bộ filter và tập chọn sau khi API/export quyền đã chốt. Không triển khai nút giả hoặc export dữ liệu browser.

### Giai đoạn 2 — Hoàn thiện import mới và cập nhật theo file

1. Reuse parser/uniqueness/idempotency/audit hiện có khi phù hợp; định nghĩa version template, mã nghiệp vụ, quy tắc giữ text serial/zero và ngày.
2. Hỗ trợ per-row model/site/location và phân biệt nơi nhận/nơi lắp; lookup theo batch trong đúng scope, không yêu cầu UUID người dùng.
3. Preview toàn file không ghi DB; preview gắn với hash file, mapping, customer/scope và hết hiệu lực khi các yếu tố đó đổi.
4. Có create và update với quy tắc ô trống giữ nguyên, xóa có chủ đích, nhận dạng/chủ sở hữu bất biến theo luồng; trả kết quả từng dòng và lỗi tải xuống.
5. Thiết kế xử lý lô lớn theo giới hạn tài nguyên đo được, theo khối/checkpoint và retry an toàn; không biến 50 thành giới hạn nghiệp vụ.
6. Xác thực quyền và dữ liệu lại lúc commit; audit người nhập, nguồn, thời điểm, trước/sau và lý do hiệu chỉnh.

### Giai đoạn 3 — Chỉ mở rộng sang list theo service có nhu cầu thật

Áp dụng cùng tiêu chuẩn cho Request, Work Order, KTV, Inventory và Maintenance theo mức độ cấp thiết. Với từng tab, làm rõ query/summary/export backend và quyền trước UI. Đặc biệt, báo cáo khách hàng phải tách khỏi KPI nội bộ và không dựa trên lọc phía browser.

### Giai đoạn 4 — UAT và quyết định phạm vi tiếp theo

UAT theo persona với dữ liệu nhiều khách, chi nhánh, model, site, vị trí, nhiều trang và thiếu dữ liệu. Kiểm tra scope khi đổi URL/query/session; đối chiếu list, summary, export; thử dependency chậm/lỗi; đánh giá số bước để xử lý một tình huống thật. Sau đó mới quyết định thêm dashboard, báo cáo hoặc tính năng phụ.

## 6. Cập nhật triển khai màn Thiết bị

Sau khi lập báo cáo, đã bắt đầu triển khai giai đoạn làm màn Thiết bị thành màn mẫu:

- API list bổ sung model projection, cùng customer/site/location display projections theo lô từ Organization; filter ngày bàn giao/ngày lắp theo khoảng bao gồm hai đầu, filter theo việc có ghi nhận ngày lắp hay chưa và summary trên toàn bộ tập kết quả đã lọc. Các tên hiển thị là dữ liệu bổ trợ, không thay logical reference hay quyền scope; chỉ số ngày lắp null không khẳng định thiết bị cần lắp.
- Organization có internal batch lookup customer/site/location, giới hạn và lọc theo tenant/customer scope. Web được bố cục lại theo thứ tự tổng quan → tìm/lọc → điều kiện đang áp dụng → danh sách. Bổ sung filter trạng thái thiết bị, vận hành, hiệu lực bảo hành, hồ sơ dịch vụ và khoảng ngày; bảng hiển thị model, khách/cơ sở/vị trí, serial, ngày bàn giao/lắp, bảo hành, trạng thái kép và hồ sơ dịch vụ. Bảng cuộn ngang, giữ cột nhận dạng và co filter trên màn nhỏ.
- Cập nhật contract `docs/api/asset.yaml` và `docs/api/organization.yaml` cho query, display lookup, model list projection và summary.

Phần này chưa hoàn tất toàn bộ hướng đề xuất: ngày mua chưa có schema/nguồn; filter vị trí phân cấp và nhớ điều kiện qua URL chưa có; export toàn tập/chọn dòng chưa có; import vẫn theo giới hạn/luồng hiện tại. Tên Organization là lookup phụ trợ fail-soft, nên browser UAT cần kiểm tra và phân biệt được tên chưa sẵn sàng với dữ liệu thật sự thiếu. Chưa chạy UAT browser hoặc test/build cho thay đổi vừa làm.

## 7. Tiêu chí “đáp ứng thực tế” đề xuất

Một hạng mục chỉ được coi là sẵn sàng cho người dùng khi có đủ:

- Hành động/người dùng mục tiêu được nêu rõ.
- Trường và nguồn dữ liệu có nghĩa nghiệp vụ; null/unknown/not-applicable được phân biệt.
- Backend hỗ trợ query/permission/scope; UI không mô phỏng năng lực mà API chưa có.
- List, summary, detail và export nhất quán về filter, sort, thời điểm và quyền.
- Lỗi nguồn/thiếu dữ liệu/chờ xử lý khác nhau rõ ràng.
- Có test ở service và UAT browser với role/dữ liệu đại diện, kèm evidence tái lập.
- Migration có compatibility/backfill/rollback; consumer và demo không bị gãy.

## 8. Kết luận

Dự án **không thiếu mô hình nghiệp vụ hay thành phần kỹ thuật**. Rủi ro là số lượng thành phần và trạng thái đang lớn hơn mức độ liền mạch mà người dùng có thể cảm nhận. Trọng tâm tiếp theo nên là dữ liệu đáng tin, danh sách có thể xử lý công việc, import/export khớp quyền và một luồng từ bàn giao đến xử lý dịch vụ chạy được đầu cuối.

Không nên đánh giá thành công bằng số service, số API, số route hoặc số checklist đã viết. Nên đo bằng việc một Service Manager, Dispatcher, Technician và Customer có trả lời được câu hỏi công việc của mình nhanh, đúng scope và không phải tự ghép dữ liệu thủ công hay không.

## Tài liệu và mã nguồn tham chiếu

- [Task assignment import/filter/export ngày 19/11](../plans/2026-11-19-web-equipment-import-filter-export-task-assignment.md)
- [So sánh luồng người dùng với hiện trạng thiết bị](2026-11-19-user-flow-vs-current-equipment.md)
- [Yêu cầu màn tổng quan và tra cứu Web](../plans/2026-11-19-web-management-overview-and-search.md)
- [Schema Asset](../../apps/asset-service/prisma/schema.prisma)
- [Equipment API DTO](../../apps/asset-service/src/equipment/dto/equipment.dto.ts)
- [Equipment Repository](../../apps/asset-service/src/equipment/equipment.repository.ts)
- [Equipment Web page](../../apps/web/src/App.tsx)
- [Bulk import DTO/parser](../../apps/asset-service/src/registrations/bulk.dto.ts)
- [Bulk handover service](../../apps/asset-service/src/registrations/bulk.service.ts)
