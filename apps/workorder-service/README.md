# Work Order Service — M2 (K6 tạo WO bảo trì lần đầu)

Work Order sở hữu `workorder_db`, Technician và Skill. Đã triển khai nền
tảng, profile/skill, WO, assignment, thực thi, Service Report và hủy SR/WO. API theo
[OpenAPI](../../docs/api/workorder.yaml); trạng thái/quyền theo
[state machine](../../docs/architecture/state-machines.md) và catalog chung.

## Chạy local

Từ root: cài dependency/build packages theo README, chạy hạ tầng, áp migration
và seed Identity/Organization/Asset theo README của các owner. Không có seed
WO truy cập trực tiếp DB của service khác.

```bash
pnpm infra:up
pnpm build:packages
pnpm --filter workorder-service db:migrate
pnpm dev:workorder
```

Service đọc `.env` riêng rồi `.env` root; port `WORKORDER_SERVICE_PORT` mặc
định 3004. Biến bắt buộc: `WORKORDER_DATABASE_URL`, JWT theo shared auth và
`IDENTITY_SERVICE_URL`, `ORGANIZATION_SERVICE_URL`, `ASSET_SERVICE_URL`,
`SERVICE_REQUEST_SERVICE_URL`. Không có URL hoặc credential thật trong source.

`RABBITMQ_URL` có thể trống ở dev/test: event giữ PENDING trong outbox. Production
bắt buộc cấu hình broker. Relay dùng package chung, hỗ trợ reconnect/retry/DLQ;
health chỉ kiểm tra DB, không chứng minh broker đang hoạt động.

`GET /health` public: DB lên → 200, DB xuống → 503. Các API còn lại cần bearer
token, permission và TENANT_STAFF; CUSTOMER không được đọc WO/report.

## API đã triển khai

Gateway bỏ prefix `/api/workorders`, ví dụ
`POST /api/workorders/work-orders`, `GET /api/workorders/technicians/me`.

| Endpoint trong service | Quyền | Hành vi |
| --- | --- | --- |
| `GET /technicians`, `GET /technicians/{id}` | `work_order:read` | Profile có skill, list hỗ trợ q/branch/status/skill và pagination |
| `GET /technicians/me` | `work_order:execute` | Profile theo user ID của token; thiếu profile → 404 |
| `POST /technicians`, `PATCH /technicians/{id}` | `technician:manage` | Kiểm tra Identity/branch qua HTTP, uniqueness và trạng thái theo D11 |
| `PUT /technicians/{id}/skills` | `technician:manage` | Thay danh sách nguyên tử; tối đa 50 skill khác nhau trong tenant |
| `GET /skills` | `work_order:read` | Catalog của tenant |
| `POST /skills`, `PATCH /skills/{id}` | `technician:manage` | Tạo skill, sửa tên/mô tả; code không đổi |
| `POST /work-orders` | `work_order:manage` | Tạo từ SR ACCEPTED; snapshot equipment/site, sequence, history/log và outbox |
| `GET /work-orders`, `GET /work-orders/{id}` | `work_order:read` | List/filter/sort/pagination và detail theo tenant/assignment scope |
| `PATCH /work-orders/{id}` | `work_order:manage` | Sửa trường cho phép ở WO chưa terminal; validate lịch sau khi ghép với giá trị cũ |
| `GET /work-orders/{id}/history` | `work_order:read` | History cũ nhất trước, cùng scope đọc WO |
| `GET /internal/work-orders/{id}` | `work_order:read` | Reference tối thiểu; Gateway chặn internal |

Technician-only account chỉ đọc WO được hoặc từng được giao; `mine=true` chỉ
lấy assignment hiện tại ASSIGNED/ACCEPTED. Nếu account có thêm role staff với
quyền đọc toàn tenant thì role đó vẫn cấp phạm vi tương ứng. Không dùng filter
`technicianId` hoặc `mine=false` để nới scope. Staff theo catalog hiện tại:
Service Manager quản lý WO; Dispatcher phân công; Tenant Admin
quản lý Technician và chỉ đọc WO.

Tạo profile xác thực account TENANT_STAFF có TECHNICIAN và branch ACTIVE;
token/correlation ID chuyển tiếp qua ServiceHttpClient (timeout 5 giây).
Không chạy client giả ngoài test. `BUSY` không được gán thủ công; đặt AVAILABLE
thành BUSY nếu vẫn có assignment ACCEPTED. Patch khóa dòng technician trước
khi tính trạng thái; sửa trường khác giữ OFF_DUTY/INACTIVE.

List WO có status CSV, type/priority/customer/equipment/SR/technician, mine,
khoảng scheduledStart, q và sort createdAt/scheduledStart/priority. Priority
sort theo LOW → NORMAL → HIGH → URGENT, không theo alphabet; search coi `%`,
`_` là ký tự thường. Có thứ tự ID để pagination ổn định; lịch null nằm cuối.

## Transaction và sự kiện

Create lấy transaction-level advisory lock trên khóa `tenantId:serviceRequestId`
trước khi đọc reference SR, kiểm tra WO đang hiệu lực và ghi dữ liệu. Cùng
transaction: sequence, WO CREATED, status history, work log và
`WorkOrderCreated.v1`. Transaction timeout 20 giây; mỗi HTTP call timeout 5 giây.
Constraint SQL vẫn là lớp chặn tạo trùng cuối cùng. Không sửa migration cũ.

Workflow khóa theo thứ tự SR → WO → technician (ID chuẩn hóa chữ thường,
sắp tăng dần). Tất cả thay đổi assignment/status/report/history/log/outbox
nằm trong một transaction. BUSY tính từ các assignment ACCEPTED còn lại;
OFF_DUTY/INACTIVE được giữ nguyên. `allowedActions` phản ánh các action đã
triển khai; backend luôn kiểm tra lại quyền, assignment và trạng thái dưới khóa.

| Endpoint dưới `/work-orders/{id}` | Quyền và trạng thái |
| --- | --- |
| `POST /assign` | `work_order:assign`; CREATED/ASSIGNED/ACCEPTED; body `{technicianId, note?}` |
| `POST /accept`, `/reject` | Technician hiện được giao; ASSIGNED; reject cần `{reason}` |
| `POST /start-travel` | Technician hiện được giao; ACCEPTED |
| `POST /start` | Technician hiện được giao; ACCEPTED/TRAVELLING |
| `POST /hold`, `/resume` | Manager **hoặc** technician hiện được giao; IN_PROGRESS/ON_HOLD tương ứng; hold cần `{reason}` |
| `POST /complete` | Technician hiện được giao + `service_report:submit`; IN_PROGRESS |
| `POST /cancel` | `work_order:manage`; chưa terminal; `{reason, cancelServiceRequest?: boolean}` |
| `GET /assignments`, `/logs`, `/service-report` | `work_order:read`, cùng tenant/assignment scope đọc WO |
| `POST /logs` | Manager, Dispatcher hoặc technician hiện được giao; chưa terminal; `{note}` |

Các transition trả 200, POST log trả 201. Accept/start-travel/start/resume không
cần body; field lạ bị từ chối. Complete nhận body:

```json
{
  "problemDescription": "Thiết bị không hoạt động",
  "rootCause": "Chẩn đoán nội bộ",
  "solution": "Đã xử lý",
  "result": "RESOLVED",
  "customerSummary": "Thiết bị đã hoạt động bình thường"
}
```

`result`: RESOLVED/PARTIALLY_RESOLVED/UNRESOLVED. Mỗi WO chỉ có một report.
Completed v2 chỉ chứa summary dành cho khách, không sao chép chẩn đoán nội bộ.
Cancelled v2 mặc định `cancelServiceRequest=false`; true chỉ dành cho WO nguồn
SR. Không phát Completed/Cancelled v1. Không có API sửa report hoặc upload.

Queue `workorder-service.service-requests` nhận ServiceRequestStatusChanged v1.
Consumer CANCELLED dùng inbox và cùng source lock với create. WO CREATED/
ASSIGNED/ACCEPTED tự hủy; history changedBy=NULL, không tạo log bằng user giả.
WO TRAVELLING/IN_PROGRESS/ON_HOLD giữ nguyên, ghi cảnh báo cho quản lý; Notification
thuộc M3. Consumer không gọi SR đồng bộ hoặc đọc DB SR.

Queue `workorder-service.maintenance-tasks` nhận MaintenanceTaskDue v1; inbox
handler `workorder-service.maintenance-task-due`. Consumer kiểm tra catalog,
producer/aggregate/tenant/task và ngày lịch; tạo MAINTENANCE/NORMAL từ snapshot,
createdBy/history actor null, không log hệ thống, không gọi HTTP upstream.
Inbox + WO + sequence + history + Created v1 cùng transaction, giữ correlation ID.
Task UUID chuẩn hóa được advisory-lock theo key riêng; cấp số dùng chung với SR.

scheduledDate được biểu diễn tại scheduledStart bằng 00:00 ngày đó ở +07:00,
scheduledEnd null; đây là ngày lịch, chưa phải giờ hẹn khách. Ngày không có thật
bị từ chối. Replay Due (kể cả event ID mới) không tạo thêm WO nếu task đã có WO,
bao gồm CANCELLED/COMPLETED; không tự thay WO khi thiếu ý định Service Manager.
Không đổi schema, permission hoặc contract v1.

**Giới hạn:** yêu cầu WO thay thế chưa có contract kỹ thuật được review với Minh;
Maintenance producer/Task-state consumer còn cần tích hợp thật. [H4 của SR](../../docs/testing/h4-stale-work-order-events.md)
đã giao Huy sửa; chưa nghiệm thu event WO cũ tác động sau WO thay thế.

## Kiểm tra

```bash
pnpm build:packages
pnpm --filter workorder-service lint
pnpm --filter workorder-service typecheck
pnpm --filter workorder-service test
pnpm --filter workorder-service test:e2e
pnpm --filter workorder-service test:e2e:db
pnpm --filter workorder-service build
pnpm --filter workorder-service db:check-drift
```

DB suite yêu cầu `WORKORDER_TEST_DATABASE_URL` có tên DB chứa `test`. Suite áp
migration và **truncate dữ liệu trong DB test**, không chạy trên business DB.
Trên volume cũ, tạo DB test theo root README bằng `dev-databases.sql` mới.
HTTP bootstrap dùng fake DB; DB suite dùng PostgreSQL thật và fake upstream
được khai báo rõ; unit HTTP client kiểm tra forwarding và lỗi upstream.

Smoke tuần 1 cần sáu service Identity/Organization/Asset/SR/WO/Gateway và
RabbitMQ thật, seed DEMO và biến `SEED_DEMO_PASSWORD` trong môi trường shell:

```bash
pnpm smoke:m2:week1
```

Script tạo profile Technician qua API nếu chưa có, dùng DEMO customer/equipment
trong bảo hành, tạo SR → review → accept → tạo WO → chờ SR PROCESSING. Nó kiểm
tra duplicate/auth/customer/technician scope và chặn internal qua Gateway.
Script giữ lại SR/WO mới làm bằng chứng.
Cấu hình tùy chọn: `GATEWAY_URL`, `TENANT_CODE`, `MANAGER_EMAIL`,
`TECHNICIAN_EMAIL`, `CUSTOMER_EMAIL`, `M2_BRANCH_ID`. Không ghi token/password.

Theo dõi quyết định và tiến độ tại [kế hoạch Khương](../../docs/planning/m2-khuong.md)
và [tuần 2](../../docs/planning/m2-khuong-week-2.md).

Smoke tuần 2 dùng cùng stack, thêm Dispatcher fixture:

```bash
pnpm smoke:m2:week2
```

Kiểm tra assign → accept → travel → start → hold/resume → report → Completed v2
→ SR summary → customer confirm/reopen; thêm UNRESOLVED và hai cancellation
intent. Các ca chạy HTTP qua Gateway, PostgreSQL và RabbitMQ thật; chưa phải
kiểm thử UI web/Android. [Bằng chứng tuần 2](../../docs/testing/m2-week2-test-cases.md).

K6 fixture smoke (sau smoke tuần 1/2 để có profile DEMO Technician):

```bash
NODE_ENV=development node apps/workorder-service/test/maintenance-smoke.cjs
```

Chạy từ root với RABBITMQ_URL, SEED_DEMO_PASSWORD và các service như trên.
Script phát event fixture theo contract, kiểm tra WO qua Gateway và event
Created/Completed/Cancelled qua broker thật; không truy cập DB. Script chỉ
cho dev/test, dọn queue observer riêng và giữ record demo làm bằng chứng.
Đây chưa phải scheduler Maintenance thật. CI hiện tự chạy DB cases mới;
smoke K6 riêng chưa có trong job CI. Xem [tuần 3](../../docs/planning/m2-khuong-week-3.md)
và [bằng chứng K6](../../docs/testing/m2-maintenance-test-cases.md).
