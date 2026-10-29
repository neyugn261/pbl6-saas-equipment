# M2 web — ma trận quyền và ca kiểm thử

Mốc đối chiếu: `develop` tại `4a041fe` (29/10/2026). Trang M2 gọi Gateway thật theo `apps/web/src/api/config.ts`; kết quả kiểm tra bên dưới chỉ ghi sau khi thực sự chạy. Quyền backend được kiểm tra độc lập; việc ẩn nút trên web không thay thế 403/404 từ service.

## Lần chạy local 29/10/2026

Môi trường: Windows, Docker PostgreSQL/RabbitMQ/Redis/MinIO, các service Node local và Gateway. Đã áp migration Service Request `0005_work_order_lifecycle`; các database service còn lại không có migration chờ. Gateway tạm đặt `LOGIN_RATE_LIMIT=50` theo hướng dẫn README để chạy nhiều smoke liên tiếp. Identity chỉ bật trả activation token trong lần chạy smoke M1 rồi trả về cấu hình local ban đầu.

| Kiểm tra | Kết quả | Bằng chứng |
| --- | --- | --- |
| `scripts/smoke-test-m1.mjs` | Pass | Gateway/M1 vertical slice, mời và kích hoạt user, SR `ACCEPTED` |
| `scripts/smoke-test-m2-week1.mjs` | Pass | SR → WO `CREATED` → event thật → SR `PROCESSING`; quyền customer/technician |
| `scripts/smoke-test-m2-week2.mjs` | Pass | Assignment/report, `RESOLVED` confirm, `PARTIALLY_RESOLVED` reopen, `UNRESOLVED`, hai nhánh cancel |
| `apps/web/scripts/verify-m2-issue33.mjs` | Pass | Dossier, history, scope tenant/customer, WO/maintenance qua Gateway |
| `apps/web/scripts/verify-m2-cost-estimate.mjs` | Pass | Draft/edit, tổng server tính, DRAFT ẩn với customer, send, Customer Admin approve/reject và phản hồi cũ 409 |
| `apps/web/scripts/verify-m2-maintenance-plan.mjs` | Pass | Plan create/edit/pause/resume/inactive; Customer User bị từ chối |
| Web TypeScript, ESLint, build, menu 8 vai trò | Pass | Build có cảnh báo bundle lớn hơn 500 kB |

Lần thử đầu của M2 tuần 1 thất bại do DB local thiếu migration `0005`; chạy lại sau migration đạt. Lần thử đầu của smoke M1 thiếu activation token theo cấu hình local; chạy lại với token dev/test bật tạm thời đạt. Lần thử đầu của smoke tuần 2 bị rate limit 429; chạy lại với giới hạn kiểm thử 50 đạt. Lần thử đầu của kịch bản Cost Estimate tìm thấy đường dẫn Gateway sai `/api/estimates/{id}` trong web; đã sửa thành `/api/service-requests/estimates/{id}` và chạy lại đạt. Các lần chạy tạo dữ liệu DEMO mới, không đụng production.

## Vai trò → màn hình → thao tác

| Vai trò | Work Order | Maintenance | Cost Estimate | Kết quả SR |
| --- | --- | --- | --- | --- |
| Tenant Admin | Xem | Xem | Xem, không chỉnh sửa | Xem |
| Service Manager | Xem, tạo, phân công, đổi lịch, hủy | Xem, tạo, sửa, tạm dừng/tiếp tục/ngừng | Lập, sửa, gửi, thay revision | Xem |
| Dispatcher | Xem, phân công | Xem | Không | Xem |
| Technician | Xem WO được/đã phân công; thao tác thực hiện ở Android | Không | Không | Xem |
| Inventory Staff | Xem WO theo quyền backend | Không | Không | Không có route SR trong web M2 |
| Customer Admin | Không đọc WO trực tiếp | Xem trong customer của mình | Xem bản đã gửi, chấp nhận/từ chối | Xem, xác nhận hoặc mở lại theo `allowedActions` |
| Customer User | Không đọc WO trực tiếp | Không | Không có quyền phản hồi báo giá | Xem, xác nhận hoặc mở lại theo `allowedActions` |

Route trái quyền trả `/403`; service vẫn quyết định scope theo token. Tại giao diện SR, nút hành động lấy từ `allowedActions` của backend. Customer không gọi endpoint WO hay Service Report; phần kết quả chỉ đọc từ SR.

## Ca cần chạy trên stack thật

| ID | Bước | Kết quả mong đợi | Trạng thái |
| --- | --- | --- | --- |
| M2-WEB-01 | Đăng nhập 8 vai trò DEMO, kiểm tra menu và URL trái quyền | Menu/403 đúng ma trận | Chưa chạy |
| M2-WEB-02 | Customer User tạo SR, Service Manager review/accept | SR `ACCEPTED` qua Gateway | API Pass; UI chưa chạy |
| M2-WEB-03 | Từ SR `ACCEPTED`, tạo WO, Dispatcher phân công kỹ thuật viên | WO `CREATED` → `ASSIGNED`; SR chuyển `PROCESSING` sau event | API Pass; UI chưa chạy |
| M2-WEB-04 | Đổi lịch, phân công lại, hủy WO | API trả trạng thái mới; 409 hiện lỗi và trang làm mới | Chưa chạy |
| M2-WEB-05 | Tạo plan cho Equipment đang hoạt động, sửa lịch, pause/resume/inactive | API quyết định lịch và 409; Equipment RETIRED bị từ chối | API create/edit/status Pass; UI, RETIRED và lịch biên chưa chạy |
| M2-WEB-06 | Service Manager lập/sửa/gửi dự toán ngoài bảo hành; Customer Admin duyệt/từ chối | Tổng lấy từ server; DRAFT không hiện với customer; revision cũ không phản hồi được | API Pass các nhánh chính; UI chưa chạy |
| M2-WEB-07 | Technician hoàn tất WO từ Android; Customer mở SR và làm mới | SR hiển thị result, customer summary, WO number, completion time; confirm/reopen đúng quyền | API report/confirm/reopen Pass; Android/UI chưa chạy |
| M2-WEB-08 | Mất kết nối Work Order/Maintenance và đăng nhập tenant/customer khác | Lỗi nguồn rõ ràng; không lộ dữ liệu tenant/customer khác | API scope bằng token thử nghiệm Pass; outage/tài khoản thật chưa chạy |
| M2-WEB-09 | Chạy lại `docs/testing/m1-test-cases.md` trên API thật | Ghi riêng Pass/Fail từng ca và bằng chứng | Smoke M1 Pass; ma trận từng ca chưa chạy |

## Bằng chứng và giới hạn

Điền commit, môi trường, tài khoản thử, thời điểm, request/response đã lược secret và Pass/Fail sau khi chạy. `docs/testing/m2-web-issue33.md` là bằng chứng cũ của một phần dossier/history/replacement tại mốc trước; không coi là kết quả cho các ca mới ở đây. Không dùng mock để ghi Pass cho end-to-end hoặc Android.

Request mẫu qua Gateway (thay UUID và token bằng dữ liệu kiểm thử):

```http
POST /api/workorders/work-orders
Authorization: Bearer <token-service-manager>
Content-Type: application/json

{"serviceRequestId":"<accepted-service-request-uuid>"}
```

```http
POST /api/workorders/work-orders/<work-order-uuid>/assign
Authorization: Bearer <token-dispatcher>
Content-Type: application/json

{"technicianId":"<available-technician-uuid>"}
```

```http
POST /api/service-requests/<service-request-uuid>/estimates
Authorization: Bearer <token-service-manager>
Content-Type: application/json

{"currency":"VND","items":[{"itemType":"LABOR","description":"Kiểm tra thiết bị","quantity":"1","unitPrice":"100000"}]}
```
