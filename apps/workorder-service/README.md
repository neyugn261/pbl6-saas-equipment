# Work Order Service — M2 tuần 1

Work Order sở hữu `workorder_db`, Technician và Skill. Tuần 1 triển khai nền
tảng, API profile/skill, tạo/đọc/sửa WO và history/internal reference. API theo
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
Service Manager quản lý WO; Dispatcher phân công (API tuần 2); Tenant Admin
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

Consumer hủy SR trong K5 phải dùng cùng helper `lockServiceRequest`, cùng khóa
và thứ tự đọc. **Tuần 1 chưa có cancel consumer/API hoặc workflow assignment/
execute/complete/Service Report.** `allowedActions` hiện chỉ quảng bá `update`
khi được phép; không quảng bá transition chưa triển khai. Phạm vi cuối M2 vẫn
theo OpenAPI; tuần 1 không phải triển khai toàn contract. Race create/cancel
chưa được nghiệm thu cho tới K5.

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
Script giữ lại SR/WO mới làm bằng chứng, không tự hủy vì K5 chưa triển khai.
Cấu hình tùy chọn: `GATEWAY_URL`, `TENANT_CODE`, `MANAGER_EMAIL`,
`TECHNICIAN_EMAIL`, `CUSTOMER_EMAIL`, `M2_BRANCH_ID`. Không ghi token/password.

Theo dõi quyết định và tiến độ tại [kế hoạch Khương](../../docs/planning/m2-khuong.md)
và [tuần 1](../../docs/planning/m2-khuong-week-1.md).
