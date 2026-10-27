# Hồ sơ thiết bị và lịch sử chi tiết — bàn giao sau phần Minh

Quyết định nghiệp vụ được chủ dự án đồng ý ngày 27/10/2026. Thiết kế: ADR 0010.
Phần thực hiện tại đây là backend Asset/Maintenance, migration, contract và kiểm thử.
Giao diện web/mobile và quy trình do service khác sở hữu cần được chủ phần việc nối tiếp.

## 1. Những màn hình cần nối API

| Màn hình | API qua Gateway | Yêu cầu hiển thị |
| --- | --- | --- |
| Hồ sơ một thiết bị | `GET /api/assets/equipment/:id/dossier` | Nhận diện/model/serial/thông số; khách hàng/site/contact; ngày bàn giao/lắp/đưa vào sử dụng; bảo hành; tình trạng; việc liên quan; phần dữ liệu thiếu |
| Lịch sử Asset tổng | `GET /api/assets/equipment-history` | Lọc thiết bị/khách hàng/site hiện tại/người thực hiện/sự kiện/tham chiếu/thời gian, phân trang |
| Timeline thiết bị | `GET /api/assets/equipment/:id/timeline` | Lịch sử Asset có filter; phần Maintenance lấy feed riêng; chỉ rõ nguồn của từng phần |
| Một dòng lịch sử | `GET /api/assets/equipment-history/:id` | Trước/sau, actor, thời gian xảy ra/ghi nhận, lý do được phép xem, bối cảnh lúc ghi |
| Bảo hành cụ thể | `GET /api/assets/warranties/:id/history` | Điều khoản/ngày/trạng thái và lịch sử thêm/hủy; không suy ra kết luận tiếp nhận từ ngày bảo hành |
| Model cụ thể, staff | `GET /api/assets/equipment-models/:id/history` | Model hiện tại và nhật ký thay đổi model |
| Danh sách SR/WO theo thiết bị | `GET /api/assets/equipment/:id/service-requests` hoặc `/work-orders` | Phân trang + tổng số; không coi 5 dòng preview là toàn bộ |
| Một SR theo thiết bị | `GET /api/assets/equipment/:id/service-requests/:requestId` | Tiến độ, kết quả công bố, warrantyCheck đã chốt tại SR, ước tính hiện hành nếu được xem, bình luận/lịch sử, allowedActions |
| Một WO, staff | `GET /api/assets/equipment/:id/work-orders/:workOrderId` | Phân công hiện tại/các lần phân công, lịch sử, log, Service Report; từng phần có trạng thái truy cập |
| Plan/Task của thiết bị | `GET /api/assets/equipment/:id/maintenance-plans` hoặc `/maintenance-tasks` | Phân trang; drill-down sang API Maintenance |
| Lịch sử Maintenance tổng/thiết bị | `GET /api/maintenance/maintenance-history?equipmentId=...` | Lọc plan/task/event/from/to, phân trang |
| Lịch sử một Plan | `GET /api/maintenance/maintenance-plans/:id/history` | Bao gồm các Task/sự kiện WO thuộc Plan |
| Hành trình một Task | `GET /api/maintenance/maintenance-tasks/:id/journey` | Tất cả WO cũ/mới, lần hủy/thay thế, ai đang cần xử lý, lịch sử riêng |
| Tổng quan Maintenance | `GET /api/maintenance/maintenance-summary?equipmentId=...` | Tổng theo trạng thái, kỳ gần nhất, số Task quá hạn, preview cần chú ý + tổng số |

Các đường dẫn `links` trong dossier là đường dẫn tương đối theo service sở hữu.
Asset dùng `/api/assets`, Maintenance dùng `/api/maintenance`. Không lấy URL nội bộ để gọi từ browser.

## 2. Quy tắc trải nghiệm bắt buộc

- `AVAILABLE` với `items: []` là chưa có dữ liệu; `UNAVAILABLE` là nguồn đang lỗi;
  `RESTRICTED` là tài khoản không được xem; `NOT_CONFIGURED` là thiếu cấu hình;
  `NOT_FOUND` là bản ghi chưa có/không còn xem được. Không biến các trạng thái này thành “0 công việc”.
- `operationalStatus=UNKNOWN` phải hiển thị “Chưa xác nhận tình trạng vận hành”.
  WO `COMPLETED/RESOLVED` vẫn có thể tồn tại cùng tình trạng UNKNOWN/DEGRADED.
- Xác nhận vận hành dùng PATCH Equipment: `operationalStatus`, `reason` bắt buộc,
  `customerNote` tùy chọn. `reason` chỉ cho nội bộ. Có thể xác nhận lại cùng trạng thái
  để ghi thời điểm kiểm tra mới. Thiết bị RETIRED vẫn khóa chỉnh sửa như trước.
- `calendarCoverage` chỉ là khoảng ngày; kết luận cho từng yêu cầu là `warrantyCheck`
  từ SR. Hai kết quả có thể khác vì khác thời điểm. Không gộp chúng thành một nhãn.
- `waitingFor` là lời giải thích tình trạng, không cấp quyền. Các nút SR/WO theo
  `allowedActions` của service gốc. Không tự dựng endpoint estimate/approval/billing mới.
- Ngày đến hạn Plan và thời gian WO dự kiến không phải lịch hẹn đã được khách xác nhận.
- Actor được lưu bằng user ID/role. Chưa có tên lịch sử được xác thực từ Identity;
  UI có thể tra tên theo quyền nhưng không coi tên hiện tại là tên đã lưu tại thời điểm cũ.
- Dữ liệu lịch sử trước khi triển khai audit có thể chỉ có tóm tắt hoặc không có.
  `LEGACY_SUMMARY` không được mô tả là một bản audit đầy đủ.
- Context sự kiện nhận từ ngoài là `AT_EVENT_PROCESSING`: vị trí/model hiện tại khi
  Asset ghi nhận event. Event hiện hành thiếu vị trí gốc nên không khẳng định đây là
  vị trí tại lúc kỹ thuật viên sửa. Nhật ký thao tác tại Asset có context `LOCAL_WRITE`.
- Dữ liệu có thể lệch tạm giữa các service; `asOf/fetchedAt/recordedAt` và
  `latestRecordedService.mayLagSourceService` làm rõ thời điểm/độ trễ.
- Customer User không được đọc WO thô hoặc Maintenance theo RBAC hiện tại.
  Dùng tiến độ SR và kết quả `customerSummary` đã được công bố. Customer Admin được
  đọc Maintenance theo scope; không cấp quyền thay thế WO cho khách hàng.

## 3. Bàn giao theo service

| Chủ phần việc | Phần tiếp theo |
| --- | --- |
| Web/Mobile owner | Dựng các màn hình ở bảng trên, map trạng thái section, filter/pagination, safe labels và action buttons |
| Khương — Work Order | Consumer replacement đã bàn giao tại `minh-m2-handoff.md`; nếu cần timeline toàn hệ thống chứa mọi assignment/log, phải thống nhất contract mới. Hiện audit WO đầy đủ được đọc trực tiếp theo từng WO |
| Huy — Service Request | Estimate APIs và Notification draft đã có trong develop `6620555`; tiếp tục xử lý lifecycle/reorder WO, quyết định recovery EXPIRED và tích hợp theo audit F09–F12, không làm lại phần đã merge |
| Identity/Organization owner | Nếu muốn tên actor lịch sử/địa chỉ bàn giao tại thời điểm sửa: bổ sung contract snapshot có nguồn xác thực, không suy từ dữ liệu hiện tại |
| Notification owner | Các thông báo chủ động theo milestone và visibility đã thống nhất |
| Minh | Backend dossier/history/journey và contract đã có; không tuyên bố UI/consumer replacement của người khác hoàn thành |

## 4. Demo kiểm tra sau khi nối UI

1. Mở một thiết bị thiếu ngày commissioning/thông số: thấy cảnh báo hồ sơ thiếu và tình trạng UNKNOWN.
2. Manager bổ sung hồ sơ, xác nhận DEGRADED kèm lý do nội bộ và ghi chú khách hàng.
3. Tạo/tiếp nhận SR tại service gốc; đọc dossier để thấy tiến độ và kết luận bảo hành riêng.
4. WO phân công → tiếp nhận → thực hiện → hoàn thành/report tại service gốc.
   Staff mở WO detail thấy phân công/log/report; khách chỉ thấy nội dung công bố.
5. WO hoàn thành không tự đổi DEGRADED thành OPERATIONAL. Manager kiểm tra thực tế rồi xác nhận riêng.
6. Đổi site/chỉnh lịch Plan; kiểm tra các dòng lịch sử cũ vẫn giữ context/trước-sau đã ghi.
7. Hủy WO bảo trì, mở Task journey: giữ WO cũ, cho manager yêu cầu thay thế; chờ consumer Khương xử lý.
8. Tắt một service: dossier còn hồ sơ cục bộ và section nguồn đó hiển thị UNAVAILABLE.
9. Đăng nhập customer khác/tenant khác: không xem được thiết bị, lịch sử hay bản ghi liên kết.

## 5. Phạm vi lịch sử thực sự có

- Asset: mọi thao tác Equipment/Warranty/QR mới qua API; event thay đổi trạng thái SR và hoàn thành WO đã consume.
- Model: ledger riêng, không sao chép một lần đổi model thành hàng nghìn dòng Equipment.
- Maintenance: tạo/sửa Plan, đồng bộ snapshot, sinh Task/đẩy kỳ, link/kết quả/hủy WO, yêu cầu thay thế, cập nhật lần hoàn thành.
- Request/WO: lịch sử chi tiết đọc từ service sở hữu bằng token người gọi. Chưa có một feed phân trang duy nhất hợp nhất mọi log của tất cả service.
- Phụ tùng/chi phí chi tiết ngoài contract hiện có, file đính kèm, xác nhận lịch hẹn và thông báo mới thuộc các phần bàn giao; chưa được ghi là hoàn thành ở đợt này.
