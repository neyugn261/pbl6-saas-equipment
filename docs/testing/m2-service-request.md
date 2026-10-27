# M2 Service Request — kiểm thử và bàn giao

Kết quả audit, lỗi, quyết định còn mở và phạm vi nghiệm thu:
[m2-service-request-audit.md](m2-service-request-audit.md).
Các lệnh dưới chạy từ root repository bằng PowerShell. Dùng `pnpm.cmd`
để tránh execution policy của `pnpm.ps1`, không cần thay đổi policy máy.

## Kiểm tra tự động

```powershell
pnpm.cmd --filter service-request-service test
pnpm.cmd --filter service-request-service test:e2e
pnpm.cmd --filter service-request-service test:e2e:db
pnpm.cmd --filter service-request-service lint
pnpm.cmd --filter service-request-service typecheck
pnpm.cmd --filter service-request-service build
pnpm.cmd --filter service-request-service db:check-drift
pnpm.cmd --filter api-gateway test:e2e --runInBand
```

Repro riêng cho lỗi chưa sửa vì cần quyết định lifecycle persistence:

```powershell
pnpm.cmd --filter service-request-service test:e2e:db --testRegex=work-order-ordering.repro.ts
```

Lệnh này hiện **FAIL 1/1 có chủ đích chẩn đoán**, desired assertion vẫn là
ACCEPTED/null sau khi replay Created của WO đã kết thúc với eventId mới;
actual PROCESSING/old Work Order ID. Nó không nằm trong suite regression
42 test và không được tính PASS. Sau khi có quyết định và sửa code, chuyển
repro vào regression suite. Không đổi expected thành hành vi sai để làm xanh.

DB E2E chỉ dùng `SERVICE_REQUEST_TEST_DATABASE_URL`, được
`requireTestDatabaseUrl` kiểm tra tên chứa `test`. Trước TRUNCATE, helper đối
chiếu `current_database()` với tên database đã validate. Suite tự apply
0001–0004 trên DB test. Không chạy `db:migrate`, `pnpm db:migrate` hoặc
reset/truncate development để chuẩn bị các test này.

Nếu hạ tầng chưa chạy: `docker compose up -d postgres rabbitmq`.
Kiểm tra transport khi `RABBITMQ_TEST_URL` đã được cấu hình cho broker test:

```powershell
if (-not $env:RABBITMQ_TEST_URL) { throw 'Configure the approved test broker URL first' }
pnpm.cmd --filter @pbl6/event-contracts test --runInBand
```

Test transport có sẵn tạo rồi dọn exchange/queues test riêng. Nó kiểm tra
delivery/retry/DLQ, không chứng minh Work Order producer hoặc lifecycle SR qua
broker. DB E2E dùng FakeAssetClient và gọi consumer bằng fixture. Gateway E2E
dùng upstream echo. Các kết quả này không thay thế kiểm thử full-stack.

## Điều kiện chạy thủ công

- Migration 0004 cần nhóm xác nhận ADR/ERD. Audit chỉ đọc đã thấy nó được áp
  sẵn trong development và test; không áp lại hoặc sửa migration cũ.
- Identity, Organization, Asset và SR phải chạy với dữ liệu demo hợp lệ.
  Chạy `pnpm.cmd dev:identity`, `pnpm.cmd dev:organization`,
  `pnpm.cmd dev:asset`, `pnpm.cmd dev:service-request` ở terminal riêng.
- Dùng CUSTOMER_ADMIN để approve/reject. CUSTOMER_USER không có
  `cost_estimate:respond` trong catalog và phải nhận 403.
- Checkout này chưa có Work Order producer thật. Gateway chưa ánh xạ action
  `/estimates/*`; ví dụ dưới dùng trực tiếp SR để kiểm tra API riêng.
- Không in/lưu password, access token hoặc login response vào báo cáo/log.

## Luồng estimate qua Service Request API thật

Cấu hình `PBL6_IDENTITY_BASE_URL`, `PBL6_SERVICE_REQUEST_BASE_URL` và
`SEED_DEMO_PASSWORD` trong terminal theo môi trường local được duyệt
(port mặc định: Identity 3001, SR 3007).

```powershell
if (-not $env:PBL6_IDENTITY_BASE_URL -or -not $env:PBL6_SERVICE_REQUEST_BASE_URL -or -not $env:SEED_DEMO_PASSWORD) {
  throw 'Configure service base URLs and demo password first'
}
$identityBase = $env:PBL6_IDENTITY_BASE_URL.TrimEnd('/')
$serviceBase = $env:PBL6_SERVICE_REQUEST_BASE_URL.TrimEnd('/')
$requestBase = "$serviceBase/service-requests"
$estimateBase = "$serviceBase/estimates"

function Login-Demo([string]$email) {
  $body = @{ tenantCode = 'DEMO'; email = $email; password = $env:SEED_DEMO_PASSWORD } | ConvertTo-Json
  $login = Invoke-RestMethod -Method Post -Uri "$identityBase/auth/login" -ContentType 'application/json' -Body $body
  return @{ Authorization = "Bearer $($login.accessToken)" }
}
$staffHeaders = Login-Demo 'service.manager@demo.local'
$customerHeaders = Login-Demo 'customer.admin@demo.local'
$input = @{
  equipmentId = '00000000-0000-4000-8000-000000001102' # seeded expired equipment
  type = 'REPAIR'; priority = 'NORMAL'; title = 'M2 manual verification'
  description = 'Customer equipment stopped starting.'
} | ConvertTo-Json
$created = Invoke-RestMethod -Method Post -Uri $requestBase -Headers $customerHeaders -ContentType 'application/json' -Body $input
$reviewed = Invoke-RestMethod -Method Post -Uri "$requestBase/$($created.id)/review" -Headers $staffHeaders
if ($reviewed.warrantyCheck.result -eq 'IN_WARRANTY') { throw 'Use authorized out-of-warranty equipment instead' }
$estimateBody = @{
  currency = 'VND'; notes = 'Customer-visible repair terms'
  items = @(@{ itemType = 'LABOR'; description = 'Repair labor'; quantity = '1.00'; unitPrice = '300000.00' })
} | ConvertTo-Json -Depth 8
$estimate = Invoke-RestMethod -Method Post -Uri "$requestBase/$($created.id)/estimates" -Headers $staffHeaders -ContentType 'application/json' -Body $estimateBody
$sent = Invoke-RestMethod -Method Post -Uri "$estimateBase/$($estimate.id)/send" -Headers $staffHeaders
$approved = Invoke-RestMethod -Method Post -Uri "$estimateBase/$($estimate.id)/approve" -Headers $customerHeaders
$customerRequest = Invoke-RestMethod -Uri "$requestBase/$($created.id)" -Headers $customerHeaders
@{ requestStatus = $customerRequest.status; estimateStatus = $approved.status; total = $approved.totalAmount }
```

Expected: NEW → REVIEWING → AWAITING_CUSTOMER_APPROVAL → ACCEPTED;
estimate DRAFT → SENT → APPROVED; total `300000.00`.
Không gửi `amount`, `totalAmount`, item ID hoặc ownership fields từ client.
Nếu equipment demo không tồn tại/không thuộc customer, thay bằng ID được phép;
không bypass ownership bằng SQL.

Các nhánh dưới dùng SENT estimate mới cho mỗi nhánh, trước customer response:

```powershell
# Reject: estimate REJECTED; SR COST_REJECTED.
$reason = @{ reason = 'Please review the scope' } | ConvertTo-Json
$rejected = Invoke-RestMethod -Method Post -Uri "$estimateBase/$($estimate.id)/reject" -Headers $customerHeaders -ContentType 'application/json' -Body $reason
# Revise: old SUPERSEDED, new DRAFT n+1, SR REVIEWING. Update before resending.
$revision = Invoke-RestMethod -Method Post -Uri "$estimateBase/$($estimate.id)/revise" -Headers $staffHeaders
```

Expiration và race qua nửa đêm được automation M2-CE-04 kiểm chứng trên DB
test. Thủ công: gửi estimate với validUntil là hôm nay và mở/đáp lại sau nửa
đêm Asia/Ho_Chi_Minh; expected EXPIRED, SR giữ AWAITING_CUSTOMER_APPROVAL.
Không sửa ngày bằng SQL trên development và không tự đưa SR về REVIEWING;
recovery chưa được nhóm duyệt.

## Reproduction gửi Gateway owner

Mapping hiện tại: `/api/service-requests/{id}` → `/service-requests/{id}`.
Đường `/api/service-requests/service-requests/...` là sai. Khi Gateway chạy:

```powershell
if (-not $env:PBL6_GATEWAY_BASE_URL) { throw 'Configure the Gateway base URL first' }
$gatewayBase = $env:PBL6_GATEWAY_BASE_URL.TrimEnd('/')
$throughGateway = Invoke-RestMethod -Uri "$gatewayBase/api/service-requests/$($created.id)" -Headers $customerHeaders
# Expected 404; also try encoded %69nternal.
Invoke-WebRequest -Uri "$gatewayBase/api/service-requests/internal/service-requests/$($created.id)" -Headers $staffHeaders
# Use a new DRAFT. Currently rewrites to a missing /service-requests/estimates/... route.
Invoke-WebRequest -Method Post -Uri "$gatewayBase/api/service-requests/estimates/$($estimate.id)/send" -Headers $staffHeaders
```

Owner cần chọn public estimate prefix và thêm proxy/test. Contract SR giữ
`/estimates/{id}/...`; không sửa Gateway trong task này.

## Work Order và broker — BLOCKED tại checkout hiện tại

Sau khi owner đồng bộ implementation và hoàn thiện producer:

```powershell
$workOrderBody = @{ serviceRequestId = $created.id } | ConvertTo-Json
$workOrder = Invoke-RestMethod -Method Post -Uri "$gatewayBase/api/workorders/work-orders" -Headers $staffHeaders -ContentType 'application/json' -Body $workOrderBody
```

Tiếp tục assign → technician accept/start → submit report/complete theo
[Work Order contract](../api/workorder.yaml). Chỉ ghi PASS khi producer thật
phát Created.v1/Completed.v2/Cancelled.v2, SR tiêu thụ từ
`service-request-service.work-orders`, và có bằng chứng delivery/ack.
Lưu eventId/correlationId đã khử dữ liệu nhạy cảm, HTTP status, expected/actual
và các assertions sau trên **SR DB**, không truy vấn database Work Order:

```sql
SELECT status, active_work_order_id, resolution_result,
       resolution_summary, resolved_work_order_no, resolution_completed_at
FROM service_requests WHERE id = '<request-id>'::uuid;
SELECT old_status, new_status, changed_by, changed_at
FROM request_status_history WHERE request_id = '<request-id>'::uuid ORDER BY changed_at;
SELECT id, event_type, status, attempt_count FROM outbox_events
WHERE aggregate_id = '<request-id>'::uuid ORDER BY occurred_at;
SELECT event_id, event_type, processed_at FROM processed_events
WHERE consumer = 'service-request-service.work-order-events'
ORDER BY processed_at DESC LIMIT 20;
```

Expected: Created → PROCESSING; resolved/partially resolved → RESOLVED;
unresolved hoặc cancellation false → ACCEPTED; cancellation true → CANCELLED.
Customer chỉ thấy summary D6a, confirm → CLOSED hoặc reopen → ACCEPTED.
Đối chiếu broker retry/DLQ riêng: fixture DB không phải bằng chứng RabbitMQ ack.
Replay DLQ giữ eventId gốc sau đối soát; không purge queue hoặc giả định retry
luôn khôi phục đúng thứ tự.
