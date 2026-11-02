# M3 Huy — kiểm thử độc lập và hardening, 01/11/2026

## Git và phạm vi

> Đây là bằng chứng lịch sử của lượt trước. Lượt tiếp tục đã chạy DB/P0/drift
> thành công; xem [báo cáo cập nhật](M3-HUY-CONTINUATION.md).

- Branch `feature/huyM3`, HEAD `a437724` (không thay đổi).
- Trước: 11 tracked files modified và thư mục `src/attachments/` untracked của SR.
  Đã giữ nguyên phần C4, config, service/module, test setup, README và API/matrix đang có.
- Sau: 12 tracked files modified và 3 mục untracked (thư mục attachments có sẵn,
  HTTP E2E mới và báo cáo này). `git diff --stat` không đếm nội dung untracked.
- Lượt này sửa hai file C4 untracked có sẵn:
  `src/attachments/workorder-attachments.client.ts`, `workorder-attachments.client.spec.ts`;
  thêm `test/attachments.e2e-spec.ts`, báo cáo này; bổ sung test tại
  `../notification-service/test/app.e2e-spec.ts`; thêm liên kết báo cáo vào README SR.
- Không commit/push, reset/clean/stash, checkout/merge/rebase, sửa service khác/shared/config/lockfile/migration.
- Tab IDE `docs/plans/m3-task-assignment.md` không tồn tại trong checkout này.
  Đã dùng attachment giao việc, CONTRIBUTING và tài liệu hiện có dưới `docs/planning/`.

## Bằng chứng thực thi

Các lệnh chạy từ repository root bằng `pnpm.cmd` (launcher `pnpm.ps1` bị ExecutionPolicy chặn;
không thay chính sách máy). Baseline đã được chạy lại, không chỉ lấy số liệu lịch sử.

| Kiểm tra / script | Before (chạy lại) | After | Kết luận |
|---|---|---|---|
| `--filter service-request-service test --runInBand` | 42 tests / 5 suites | 48 / 5 | PASS |
| `--filter service-request-service test:e2e` | 6 / 1 | 28 / 2 | PASS, fake DB + fake fetch transport |
| SR `lint`, `typecheck`, `build` | PASS | PASS | Đã chạy từng script |
| `--filter service-request-service test:e2e:db` | Lịch sử P1001 | Global setup migrate deploy lỗi Schema engine | BLOCKED; 0 test nghiệp vụ được chạy |
| `--filter service-request-service test:e2e:db --testRegex=work-order-ordering.repro.ts` | Lịch sử P1001 | Global setup migrate deploy lỗi Schema engine | BLOCKED; không kết luận P0 PASS |
| `--filter service-request-service db:check-drift` | Chưa xác minh | P1001 localhost:5432 | BLOCKED; chưa xác minh schema drift |
| `--filter notification-service test --runInBand` | 5 / 2 | 5 / 2 | PASS scaffold |
| `--filter notification-service test:e2e --runInBand` | 1 / 1 | 5 / 1 | PASS scaffold/negative routes |
| Notification `lint`, `typecheck`, `build` | PASS | PASS | Đã chạy từng script |
| C4 security HTTP | Partial | 22 tests mới | PASS với doubles; không phải WO/DB thật |
| C4 → Work Order thật | Chưa xác minh | NOT RUN | Cần môi trường tích hợp |
| Gateway → SR → WO thật | Chưa xác minh | NOT RUN | Chỉ review source routing |
| OpenAPI YAML parse + local refs | — | SR 21 paths/125 refs; Notification 3 paths/18 refs | PASS |
| `git diff --check` | PASS | PASS | Không có whitespace error |

### Môi trường DB

- `docker info --format '{{.ServerVersion}}'`, `docker compose ps postgres`,
  `docker exec pbl6-postgres pg_isready`: Docker config access denied và pipe
  `docker_engine` không tồn tại trong phiên thực thi.
- `Test-NetConnection localhost -Port 5432`: `TcpTestSucceeded=False`.
- Metadata URL (không in credentials): test `localhost:5432/service_request_test_db`;
  shadow `localhost:5432/service_request_shadow_db`.
- Harness `test/db/support/global-setup.ts` dùng URL đã qua `requireTestDatabaseUrl`,
  migrate deploy trước tests; resetDatabase kiểm tra current_database trước truncate.
- Không chạy tests trên `service_request_db`; không thay cấu hình Docker/WSL, xóa volume
  hay khởi động service nghiệp vụ khác. Không suy ra PostgreSQL trên host người dùng bị hỏng.
- Có lifecycle ledger migration `0005_work_order_lifecycle`, pending terminal,
  reconciliation/replacement và inbox transaction trong source; 4 consumer unit tests PASS.
  Bằng chứng đó không thay thế P0 diagnostic và lifecycle DB regression.

Chạy lại trên PowerShell host sau khi Docker Desktop sẵn sàng:

```powershell
Set-Location E:\pbl6-saas-equipment
docker info --format '{{.ServerVersion}}'
docker compose ps postgres
# Chỉ nếu daemon hoạt động và postgres đang dừng:
docker compose up -d postgres
Test-NetConnection localhost -Port 5432
docker exec pbl6-postgres pg_isready
# Xác nhận test/shadow URL chỉ trỏ DB riêng như trên; không in credentials.
pnpm.cmd --filter service-request-service test:e2e:db
pnpm.cmd --filter service-request-service test:e2e:db --testRegex=work-order-ordering.repro.ts
pnpm.cmd --filter service-request-service db:check-drift
```

## Triage

| ID | Severity / Class | Service | Reproduction | Root cause | Owner | Action |
|---|---|---|---|---|---|---|
| H-M3-01 | P2 CONFIRMED_BUG_OWNED | SR C4 | Source 200 null/string/negative total hoặc invalid download ticket vẫn resolve | Generic TypeScript cast không validate runtime | Huy | FIXED: validate page/item/ticket; trả 502 UPSTREAM_ERROR an toàn |
| H-M3-02 | P1 CONFIRMED_BUG_OWNED | SR C4 | Source 200 thêm storageKey/bucket/internal; public response giữ nguyên | Trả trực tiếp raw object | Huy | FIXED: dựng response từ allowlist, cả download; không chuyển lỗi thành empty |
| H-M3-03 | P2 CONFIRMED_BUG_OWNED | SR C4 | Source 500 có code=signed-url-secret; exception string chứa secret | Shared UpstreamError đưa raw code vào stack được logger ghi | Huy | FIXED tại client SR: bỏ body và code ngoài hai code 404 có ý nghĩa; không sửa shared package |
| H-M3-04 | Blocker ENVIRONMENT_BLOCKER | PostgreSQL/Docker | Các lệnh nêu trên | Docker endpoint không khả dụng trong phiên; TCP 5432 thất bại | Nguyên / người vận hành host | Khôi phục môi trường rồi chạy DB/P0/drift |
| H-M3-05 | P2 TEST_GAP | SR/Notification | Baseline thiếu HTTP scope/error matrix và negative draft routes | Coverage thiếu | Huy | Thêm 22 C4 HTTP + 4 Notification negative tests |
| H-M3-06 | Blocker CONTRACT_DECISION_REQUIRED | Notification C2/C3/C5 | Matrix + draft Q3/Q4 và schema hiện hành | Chưa có customer-context persistence, directory/event, activation boundary được duyệt | Huy + Nguyên và owners | Giữ BLOCKED, không triển khai proposal |
| H-M3-07 | Blocker CROSS_OWNER_DEPENDENCY | Inventory | Catalog có LowStockDetected.v1; không tìm thấy producer trong apps/inventory-service | Producer chưa có trong checkout | Minh | Cần producer và policy threshold/re-alert |
| H-M3-08 | Review CONTRACT_DECISION_REQUIRED | Public C4 | A4 ghi public routes dự kiến; chưa có bằng chứng Accepted trong lượt này | Approval public contract còn thiếu | Huy + Nguyên + Khương | Giữ path hiện có; cần review trước nghiệm thu tích hợp |

Regression đã chạy FAIL trước fix: H-M3-01/02 có 5 failures (42 pass);
H-M3-03 có 1 failure (47 pass). Sau fix tổng 48 unit PASS. Không sửa assertion để che bug.
Không còn confirmed bug thuộc ownership được ghi nhận trong lượt này mà chưa sửa;
điều này không phải chứng minh hệ thống không còn bug khi DB/integration chưa chạy.

## C4 security và compatibility

- Giữ nguyên hai route `/service-requests/{requestId}/result/attachments` và
  `/{attachmentId}/download`; SR authorize trước upstream cho cả list/download.
- HTTP tests qua AppModule/guard/service/client/filter thật, Prisma lookup và fetch là doubles:
  missing token, thiếu permission, thiếu customer membership, khác tenant/customer,
  SR thiếu đều bị chặn trước outbound; staff Service Manager và CUSTOMER hợp lệ PASS.
- Kiểm tra exact tenant/customer trong DB query, original bearer và correlation forwarding;
  không dùng staff token thay customer; cấu hình origin qua WORKORDER_SERVICE_URL.
- List chỉ cho empty khi source 404 WORK_ORDER_NOT_FOUND; generic 404/401/500 →
  shared 502, 403 → sanitized 403, 503/network/timeout rejection → 503. Không thêm retry;
  shared client giới hạn timeout 5000ms, một fetch mỗi request. Test timeout là rejection
  mô phỏng, không phải kiểm tra socket treo hoặc latency thực tế.
- Validate UUID/date/MIME/size/page, allowlist 5 metadata fields; ticket chỉ có
  downloadUrl HTTP(S) không chứa userinfo và expiresAt hợp lệ. Không log payload/signed URL.
- Response thành công có Cache-Control no-store; download chỉ phát sau authorize SR.
  Các mock source 404 INTERNAL/deleted/hidden được giữ 404; không tuyên bố các mocks
  chứng minh truy vấn visibility/count của WO đúng trên DB thật.
- Read-only source WO: controller/projection route khớp client; original caller auth,
  staff thêm work_order:read; SQL lọc tenant/customer, CUSTOMER visibility, deleted_at,
  verified/checksum trước count/page; download recheck sau signing. A4/K8 phù hợp C4.
- Gateway mapping `/api/service-requests` → `/service-requests`; middleware chặn
  segment internal trước proxy, gồm decoded path. Chưa chạy gateway smoke trong lượt này.
- Shared packages/logger không sửa. Chỉ redaction tại adapter thuộc SR; audit này
  không tuyên bố mọi client service khác đều đã được harden.

## Notification và handoff

Notification vẫn scaffold: AppModule chỉ ConfigModule, root Hello World; chưa có
AuthModule/Prisma provider/health endpoint/business controllers/DTO/consumer/outbox wiring.
Schema/migration có notifications và processed_events; chưa có customer context.
Catalog permission có notification:read nhưng chưa có runtime API cần gắn guard.
5 unit tests chỉ xác minh root/config; 5 E2E gồm root và 4 negative checks xác nhận
GET notifications/unread-count/internal-users và PATCH mark-read chưa được mở.
Không tính đây là Notification API hoàn chỉnh; không thêm schema/recipient policy.

| Owner | Handoff còn lại |
|---|---|
| Nguyên | Q3 recipient snapshot/directory, monotonic version/bootstrap/replay/missing-recipient; customer context với Huy; Q4 activation secret/delivery/retry boundary; Q6 Gateway/storage/public integration review và phục hồi test environment |
| Khương | A4 đã có và route/payload khớp qua đọc code; phối hợp real C4 → WO visibility/count/download tests, xác nhận customer audience/events/reassignment; không yêu cầu viết lại projection |
| Minh | LowStockDetected.v1 producer và threshold/re-alert policy; catalog tồn tại chưa chứng minh producer |
| Hatsady | Xác nhận Web deep links SERVICE_REQUEST cho CUSTOMER, màn hình list/download/error, UI/E2E qua Gateway |
| Huy | C1 proposal/C4 partial/C6 partial; C2/C3/C5 BLOCKED theo quyết định chưa duyệt. Chạy DB/P0/drift và tích hợp thật khi môi trường/contract sẵn sàng |

Identity hiện chưa có recipient snapshot event/outbox đầy đủ; không gọi machine API,
không tự tạo token tenant admin. Các việc triển khai recipient/persistence/activation
là NEW_FEATURE bị chặn bởi decision, không được biến thành bug fix trong lượt này.

## Addendum — verification after M3 continuation, 2026-11-02

The preceding status is historical and is superseded by the latest test
results:

| Command | Result | Environment |
|---|---|---|
| `pnpm.cmd --filter notification-service test --runInBand` | 39/39 PASS | Local |
| `pnpm.cmd --filter notification-service test:e2e --runInBand` | 6/6 PASS | Local |
| `pnpm.cmd --filter notification-service test:e2e:db` | 16/16 PASS, 5 suites | PostgreSQL `notification_test_db`; real RabbitMQ |
| `pnpm.cmd --filter notification-service db:migrate` | `0003` applied; `0001`–`0003` present | PostgreSQL `notification_test_db` only |
| `pnpm.cmd --filter notification-service db:check-drift` | PASS, no difference | Notification test/shadow DBs |
| `pnpm.cmd --filter notification-service typecheck` | PASS | Local |
| `pnpm.cmd --filter notification-service lint` | PASS | Local |
| `pnpm.cmd --filter notification-service build` | PASS | Local |
| `pnpm.cmd --filter service-request-service test --runInBand` | 81/81 PASS | Local |
| `pnpm.cmd --filter service-request-service test:e2e --runInBand` | 28/28 PASS | Local |
| `pnpm.cmd --filter service-request-service test:e2e:db` | 69/69 PASS | PostgreSQL `service_request_test_db` |
| `pnpm.cmd --filter service-request-service test:e2e:db --testRegex=work-order-ordering.repro.ts` | P0 regression 1/1 PASS | PostgreSQL `service_request_test_db` |
| `pnpm.cmd --filter service-request-service typecheck` | PASS | Local |
| `pnpm.cmd --filter service-request-service lint` | PASS | Local |
| `pnpm.cmd --filter service-request-service build` | PASS | Local |
| `pnpm.cmd --filter service-request-service db:check-drift` | PASS, no difference | SR test/shadow DBs |
| `pnpm.cmd install --lockfile-only --frozen-lockfile --ignore-scripts` | BLOCKED: six Notification dependency specifiers are absent from `pnpm-lock.yaml` | Lockfile unchanged by ownership rule |

The real Gateway → Service Request → Work Order → MinIO flow and
Identity/Mailpit activation delivery were not run. Notification snapshot and
bootstrap handlers are implemented but not broker-bound until their shared
event definitions and Identity producer are published. Work Order cancellation
is staff-only; customer-facing cancellation comes from Service Request status
events, and `cancelServiceRequest=false` is not treated as an SR cancellation.
The RabbitMQ DB test also confirms an unknown synthetic `activationToken` field
is discarded by the Notification pending-payload allowlist.

`pnpm-lock.yaml` remains unchanged under the explicit ownership restriction.
The Notification manifest/lockfile mismatch must be resolved by the lockfile
owner before frozen CI installation.
