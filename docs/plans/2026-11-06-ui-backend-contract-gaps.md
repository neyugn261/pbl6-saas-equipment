# Bàn giao UI và các contract backend cần hoàn thiện

Ngày 06/11/2026. Đi cùng [bản đồ màn hình theo 8 vai trò](2026-11-06-web-experience-by-role.md).
Các đề xuất trong phần 3 chưa được triển khai chỉ vì đã xuất hiện trong tài liệu.

> Cập nhật 08/11/2026: đây là ảnh chụp kế hoạch ngày 06/11, không phải danh sách việc còn thiếu hiện hành. UI Workshop/API đã có các đợt triển khai tiếp theo, merge tại `develop@fbfab28` (PR #65). Dùng [bàn giao ngày 08/11](../reports/2026-11-08-workshop-ui-handoff.md) để phân biệt API đã có, trường/hành vi còn thiếu và việc nối UI. Không triển khai lại lịch sử thiết bị, attachment, xác nhận dùng vật tư, estimate revision hoặc inventory reservation vốn đã có. Phần mobile trong kế hoạch cũ không thuộc bàn giao web lần này.

## 1. Phần UI đã nối API thật trong đợt này

| Khu vực | Dữ liệu và hành vi thực tế |
| --- | --- |
| Trang chủ | Cấu hình theo 8 role, số liệu dùng `total` của truy vấn server đúng scope/status; hồ sơ cần theo dõi tối đa 4 dòng; lỗi hiện chưa tải được, không giả số 0. |
| Điều hướng | Tách `/admin`, `/app`, `/portal`; thêm hồ sơ cá nhân cho nhân viên/platform, trang người dùng Customer Admin; đưa Dispatcher đến bảo trì; mở view đọc phụ tùng/tồn cho Service Manager/Technician theo inventory:read có sẵn. |
| Yêu cầu dịch vụ | Tìm kiếm/trạng thái/ưu tiên và phân trang 20 dòng trên server, giữ query trên URL; bỏ cách tính thống kê từ 100 bản ghi; liên kết từ chỉ số dashboard mang đúng trạng thái. |
| WO | Bộ lọc server, ưu tiên, nhóm trạng thái; bảng thiết bị/khách hàng/người phụ trách/lịch/bước tiếp theo. Technician dùng `mine=true`; hành động chi tiết vẫn thuộc luồng hiện có. |
| Kỹ thuật viên | Tên/mã, chi nhánh, kỹ năng và trạng thái tiếng Việt. Search hiện theo mã nhân viên đúng khả năng backend, chưa quảng bá search theo tên. |
| Bàn giao | Tab trạng thái, tìm kiếm, bảng snapshot thiết bị/khách/địa điểm, hạn và bước tiếp. Customer User đọc; Customer Admin xác nhận trong trang chi tiết hiện có. |
| Bảo trì | Tổng quan từ maintenance-summary, kế hoạch/task, chọn thiết bị theo danh mục có phân trang; tạo plan với nội dung/chu kỳ/ngày đầu. Chống double submit; kết quả mạng chưa rõ không báo đã lưu hoặc tự POST lại. |
| Lịch sử bảo trì | Tìm chọn thiết bị/kế hoạch/task, dropdown hoạt động, ngày Việt Nam có đầu cuối bao gồm cả ngày kết thúc, timeline và thay đổi trước/sau có tên trường. Không đưa actor UUID hoặc reasonInternal vào phần công khai cho customer. |
| Dùng chung | Loading, lỗi có retry, trạng thái rỗng có hướng dẫn, pagination, labels; bảng chuyển thành card có nhãn trên màn hình nhỏ. |

API sử dụng: Identity `/users`; Organization `/tenants`, `/customers/:id`;
Asset `/equipment`, `/equipment/:id`, `/equipment-handovers`, `/my/equipment-handovers`;
WO `/work-orders`, `/technicians`, `/technicians/:id`;
Maintenance `/maintenance-summary`, `/maintenance-plans`, `/maintenance-tasks`,
`/maintenance-history`; Inventory `/parts`, `/stocks`, `/warehouses`, `/inventory-operations`.
Tất cả đi qua API client hiện hành với JWT, không truy cập database từ web.

## 2. Ràng buộc dữ liệu và các giới hạn đang hiển thị

- Chưa có tên từ nguồn: hiển thị tên chưa tải được, không dùng UUID làm tên.
  Snapshot bàn giao ưu tiên dữ liệu lịch sử; không ghi đè bằng tên hiện tại.
- WO COMPLETED không còn current assignment: danh sách hướng người dùng xem lịch
  sử phân công, không kết luận công việc đã xong chưa từng được giao.
- scheduledStart/End chỉ là lịch thực hiện ghi nhận. Chưa có contract xác nhận
  lịch với khách nên không ghi là khách đã xác nhận.
- Stock lowStock đếm cặp phụ tùng/kho, không gọi đó là số SKU duy nhất.
  Link mở khu vực kho; chưa có đường drill-down lọc lowStock hoàn chỉnh ở UI kho cũ.
- Các thao tác thiếu backend như lịch điều phối tuần, yêu cầu đổi lịch, đánh giá
  hài lòng và nhật ký nền tảng không có nút báo gửi/lưu thành công giả.
- Notification local vẫn có thể trả 403 do quyền/projection/bootstrap của nguồn.
  UI giữ thông báo đúng; đợt này không sửa consumer/quyền hoặc giả số chưa đọc.
- Chống gửi trùng tạo plan trong một lần mở form; nếu kết quả chưa xác định thì
  khóa gửi lại và mở danh sách kiểm tra. Đây chưa phải idempotency bền vững sau reload.

## 3. Contract/field cần bổ sung để hoàn thiện hành trình

Tên endpoint dưới đây là đề xuất cho owner review, chưa được web gọi như API có sẵn.
Giữ database per service; web ghép dữ liệu qua API, không yêu cầu transaction xuyên DB.

| Chủ sở hữu | Dữ liệu/chức năng cần có | Quy tắc nghiệm thu |
| --- | --- | --- |
| WO — Khương | `appointment`: PROPOSED/CONFIRMED/CHANGE_REQUESTED/CANCELLED; thời gian bắt đầu/kết thúc, timezone, revision, người/thời điểm xác nhận, lý do đổi. Các lệnh đề xuất/xác nhận/yêu cầu đổi cần contract riêng. | Khách biết lịch đã xác nhận hay chưa; thay đổi cạnh tranh phải kiểm revision; Customer User chỉ thao tác theo quyền được chốt; không sửa lịch bằng GET. |
| WO — Khương | Workload/availability theo khoảng thời gian: assignment/lịch đang giữ, kỹ năng, chi nhánh, nguồn cập nhật; có thể thêm list projection tên thiết bị/khách/current technician. | Không gọi BUSY là quá tải; cảnh báo trùng lịch có căn cứ; backend xác minh lại khi assign; không tin drag-and-drop từ client. |
| WO + SR — Khương/Huy | Public service summary: vấn đề, nguyên nhân/giải pháp được công bố, kết quả, kỹ thuật viên được phép hiển thị, completedAt, report ID và phụ tùng xác nhận. | Không lộ ghi chú nội bộ/giá vốn; kết quả chưa giải quyết được vẫn rõ; không lấy thời điểm ghi nhận xác nhận phụ tùng làm thời điểm lắp. |
| SR — Huy | Estimate revision/line/currency/phạm vi được duyệt, coverage decision/source, changed scope approval; cơ chế phản hồi kết quả hoặc yêu cầu hỗ trợ tiếp có liên kết lần trước. | Null khác miễn phí; không dùng unitCost làm giá khách trả; tăng phạm vi/chi phí phải theo quyết định nghiệp vụ; phản hồi không tự mở lại WO. |
| Maintenance — Minh | Idempotency tạo plan (`Idempotency-Key`, fingerprint, kết quả đọc lại), actor display name công khai phù hợp, search/projection plan/task theo tên/mã và nguồn thiết bị. | Retry sau reload không tạo hai plan; label không cần N+1 nhiều detail API; lịch gốc và task đã sinh giữ đúng ADR. |
| Inventory — Minh | Danh sách cách ly theo phiếu trả, người đang giữ/nhận hàng nếu nghiệp vụ chốt, deep link lowStock/recovery có query lọc và phân trang; quy trình chốt chênh ngoài công trường. | Không hủy/đổi ledger gốc; mất hàng không được giả là đã dùng; same key recovery và proof rõ. |
| Identity/Organization — Nguyên | Tên tenant/customer hiện tại trong principal hoặc scoped directory; projection tên người/nhánh cho các nguồn; thông tin hồ sơ được phép sửa. | Không hardcode tên doanh nghiệp; không cho customer tra toàn bộ nhân viên tenant; role cố định và customer membership vẫn là nguồn quyền. |
| Notification — Huy | Action links theo audience, trạng thái recipient bootstrap và current permissions; tùy chọn kênh chỉ khi có backend thực sự hỗ trợ. | Đúng tenant/customer/người nhận, dedup replay, link không vượt scope; không báo đã nhận/gửi mail khi chưa có bằng chứng. |
| Platform/Identity — Nguyên | Audit query có actor/time/action/target/reason/before-after, quyền đọc theo scope; summary nền tảng nếu bổ sung hơn danh sách tenant. | Chưa có API thì hiển thị chưa khả dụng; không cho Platform Admin mặc định xem nghiệp vụ mọi tenant. |

Không gán owner UI/backend là đã đồng ý contract; các chủ sở hữu còn cần review.

## 4. Những màn hình trong bản đồ còn cần hoàn thiện riêng

Cập nhật sau đợt Service Manager: các màn chi tiết WO, SR, thiết bị, khách hàng,
bảo trì, bàn giao và model/chính sách đã được tổ chức lại. Chi tiết tại
[báo cáo Service Manager](../reports/2026-11-06-service-manager-ui.md). Danh sách
dưới đây vẫn áp dụng cho luồng mở rộng, UAT với dữ liệu đầy đủ và các role còn lại;
không hiểu là các trang con Service Manager chưa được đụng tới.

- Lịch điều phối ngày/tuần, phân công theo năng lực và xác nhận lịch với khách.
- Công việc Technician trên mobile với nhập liệu/báo cáo, bản nháp bền vững và
  xử lý ảnh; UI thực hiện chi tiết hiện có chưa được thiết kế lại toàn bộ ở đợt này.
- Trung tâm chờ xác nhận của Customer Admin gộp bàn giao và dự toán, kết quả sửa
  và phản hồi theo contract; hiện truy cập từ dashboard/danh sách từng nghiệp vụ.
- Quản trị tenant/platform, kho và hồ sơ thiết bị chi tiết cần tiếp tục đồng bộ
  bộ component. Route có sẵn không đồng nghĩa mọi màn hình đã đạt UX/UAT mới.
- Platform audit/settings và mọi tính năng đề xuất ngoài API hiện hành phải được
  đánh dấu đúng trạng thái, chưa được nghiệm thu chỉ từ khung giao diện.

## 5. Thứ tự nghiệm thu xuyên vai trò

1. Tenant Admin thiết lập tài khoản/phạm vi; Service Manager ghi thiết bị và bàn giao.
2. Customer Admin đọc/chấp thuận hoặc từ chối; Customer User chỉ đọc trong scope.
3. Customer User tạo yêu cầu → Service Manager đánh giá → Customer Admin duyệt phí
   nếu cần → Dispatcher phân công → Technician thực hiện/báo cáo → kho đối soát.
4. Khách xem kết quả/lịch sử đúng dữ liệu được công bố; bảo trì tiếp theo rõ nguồn.
5. Thử mạng lỗi, retry, phiên đổi người/tenant, dữ liệu rỗng, bản ghi đã hủy hoặc sửa.

Tiêu chí chung: không phải nhớ ID, không mất ngữ cảnh, không nhầm dữ liệu thiếu
với kết luận nghiệp vụ, không có nút làm thay quyền người khác và không có thành
công giả khi backend chưa xác nhận.
