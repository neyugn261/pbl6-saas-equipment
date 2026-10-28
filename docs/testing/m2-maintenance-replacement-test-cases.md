# M2-K6 — Maintenance Work Order replacement (issue #31)

Ngày kiểm tra: 28/10/2026. Owner: Khương.
Baseline: `origin/develop 76c179b`; implementation trên
`feature/khuong-maintenance-replacement`. Trạng thái push/issue xem GitHub;
không đồng nghĩa đã merge vào develop hoặc toàn nhóm đã nghiệm thu M2.

## Phạm vi đã triển khai

- Queue `workorder-service.maintenance-tasks` nhận thêm
  `MaintenanceWorkOrderReplacementRequested.v1` theo contract đã có.
- Validate envelope/catalog/producer/aggregate, ngày lịch và predecessor đúng
  tenant/task/equipment/customer/site, nguồn MAINTENANCE và trạng thái CANCELLED.
- Tạo đúng `replacementWorkOrderId`, giữ snapshot/ngày lịch; createdBy/changedBy
  NULL, requestedBy lưu audit reason, không tạo token/work log hệ thống giả.
- Migration WO `0004_maintenance_replacement_reference`: request/predecessor
  nullable và unique; CHECK chỉ cho metadata pair hợp lệ của nguồn Maintenance.
  Không đổi migration đã merge hoặc backfill lịch sử chưa xác minh.
- Inbox + business request/predecessor claims + sequence + WO/history/Created
  outbox nguyên tử. Replay khác eventId sau cancel/complete không tạo thêm WO.
- Initial Due/replacement/WO workflow cùng khóa task UUID chuẩn hóa. Một WO cũ
  chỉ có một successor; yêu cầu tiếp theo tham chiếu successor vừa hủy.
- Mở rộng integration hiện có của Minh đến các replacement WO thật, report,
  Task và Asset history. Không sửa logic Service Request hoặc Maintenance.

Thiết kế/schema: [ADR 0011](../decisions/0011-workorder-maintenance-replacement.md),
cần owner/shared review trước merge. Event/RBAC/HTTP contract giữ nguyên.

## Môi trường và kết quả

Node v24.20.0, pnpm 11.26.0. PostgreSQL 17 và RabbitMQ 4 trong các container
review riêng `pbl6-k6-postgres`/`pbl6-k6-rabbit`, cổng loopback 15432/15673.
Các suite này không dùng/truncate DB phát triển có sẵn. Sau kiểm thử, migration
local/dev được áp riêng theo yêu cầu người dùng ở mục dưới.

| Kiểm tra | Kết quả |
| --- | --- |
| Frozen dependency install | PASS, không đổi package/lockfile |
| Root lint/typecheck/build | PASS; web có cảnh báo kích thước bundle có sẵn |
| Root unit/transport, RabbitMQ thật | 213 PASS |
| WO DB suite | 111 PASS = 79 regression + 32 replacement/constraint cases |
| WO bootstrap E2E | 2 PASS |
| Maintenance DB regression | 18 PASS |
| WO migration deploy ×2 trên test DB | PASS |
| WO migration → Prisma drift | PASS, No difference detected |
| WO database → Prisma drift | PASS, No difference detected |
| Real Maintenance integration | PASS, các bước bên dưới |

Các bộ Jest trên có tổng 344 ca PASS. Bước integration được báo cáo riêng,
không cộng từng assertion thành ca Jest. Chưa có kết quả GitHub Actions cho nhánh
triển khai tại thời điểm ghi kiểm thử; không dùng CI xanh của baseline thay bằng
chứng code mới.

Một lượt typecheck đầu phát hiện kiểu tham số helper test không nhận Error;
đã sửa và chạy lại đạt. Một lượt DB bị thiếu dist package vì build packages
chạy đồng thời; đã tách build khỏi test và chạy tuần tự lại đạt. Các lượt lỗi
đó không được tính PASS và không dẫn đến sửa logic service khác.

## Ma trận DB tests mới

File: `apps/workorder-service/test/db/maintenance-replacement.e2e-spec.ts`.

| Nhóm | Hành vi được kiểm chứng |
| --- | --- |
| Create | Supplied WO ID, source snapshot, leap-day +07:00, sequence dùng chung, hệ thống actor NULL, requestedBy audit, Created v1/correlation/inbox |
| Duplicate | Cùng eventId đồng thời; khác eventId cùng request; UUID viết hoa; null site/correlation; replay sau complete |
| Chain | A cancelled → B; B rescheduled/cancelled → C; replay A/B hoặc Due không tạo thêm; không branch lại từ A |
| Intent conflict | Hai request khác nhau cùng predecessor chạy đồng thời chỉ một request tạo WO; requestId cũ không dùng cho predecessor khác |
| Source isolation | Sai tenant/task/equipment/customer/site/type hoặc predecessor thuộc SR bị từ chối, inbox rollback |
| Metadata | Sai aggregate/producer/aggregateType, UUID request/actor không hợp lệ, ngày không có thật, target=predecessor bị từ chối |
| Retry/reference | Predecessor chưa có làm inbox rollback; retry cùng event khi reference đã đúng tạo được WO |
| Terminal/live guards | Không thay predecessor CREATED/COMPLETED; WO COMPLETED khác của cùng task vẫn chặn |
| Target collision | WO ID đã thuộc request/source khác không được chiếm hoặc đổi quan hệ |
| Concurrency | Replacement chờ cùng task lock khi cancellation chưa commit |
| Atomicity | Lỗi outbox thật tại SQL CHECK rollback WO/request/predecessor/sequence/history/inbox; retry cùng event thành công |
| Database invariants | Unique request/predecessor; CHECK thiếu pair, nguồn SR, type sai và self-reference |

## Real vertical slice

Chạy `apps/maintenance-service/test/vertical-slice.cjs` bằng Gateway,
Asset/Maintenance/WO apps, PostgreSQL và RabbitMQ thật; test JWT và Organization
reference fixture được khai báo trong script. Subscription WO dùng chính
`MAINTENANCE_EVENTS` của production để tránh một binding riêng chỉ có trong test.

1. Asset move → snapshot; scheduler → Due → WO đầu tiên; assign/accept/start/
   complete → Task/Asset history và dossier. Giữ regression có sẵn.
2. Kỳ kế tiếp sinh WO A; cancel qua Gateway → Task PENDING.
3. API Maintenance tạo request R1 và retry cùng requestId: WO ID cấp không đổi.
   Outbox qua broker → consumer tạo WO B đúng ID → Task link B, request LINKED.
4. Gửi lại request event cùng/khác eventId, replay Due và cancellation A cũ;
   chờ inbox xử lý rồi xác minh vẫn chỉ A/B, Task trỏ B.
5. Cancel B → Task PENDING; API tạo R2 tham chiếu B → WO C đúng ID/ngày lịch.
6. Fault injection giữ **Created C thật** chưa chuyển cho Maintenance handler;
   assign/accept/start/complete C qua Gateway. Completed C đến trước Created C,
   Task vẫn COMPLETED và request R2 LINKED.
7. Gửi lại Created C gốc, replay R1/Due/cancellation A bằng event IDs mới;
   chờ các inbox xử lý. Task vẫn COMPLETED/C, đúng ba WO A/B/C cho task; report
   và Asset history có kết quả C. Không giả lập WO replacement bằng fixture.
8. Seed Maintenance hai lần không nhân đôi/reset Plan/Task, giữ regression.

Đây là kiểm thử đảo thứ tự bằng delivery fault có chủ đích, không phải bằng
chứng mọi lỗi mạng/crash có thể xảy ra đều đã được fault-injection test.

## Chạy lại và triển khai

Đặt WORKORDER/ASSET/MAINTENANCE_TEST_DATABASE_URL tới đúng DB test, cấu hình
WORKORDER_SHADOW_DATABASE_URL riêng và RABBITMQ_TEST_URL. Build packages trước
test; không chạy lệnh clean/build package song song với suite đang dùng dist.

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm build
pnpm test
pnpm --filter workorder-service test:e2e:db
pnpm --filter workorder-service test:e2e
pnpm --filter maintenance-service test:db
pnpm --filter maintenance-service test:integration
pnpm --filter workorder-service db:check-drift
```

Migration production/development **không được chạy tự động bởi test**. Khi
triển khai bản đã review, owner cấu hình URL WO đúng môi trường rồi chạy
`pnpm --filter workorder-service db:migrate` trước khi start consumer. Giữ các
DB test tách khỏi DB nghiệp vụ.

Deploy binding trước bật UI. Request cũ còn PENDING: xác minh request/predecessor/
allocated WO ID trong Maintenance, rồi replay outbox gốc giữ nguyên eventId,
requestId và replacementWorkOrderId; không tạo UUID mới để thử lại. Nếu payload
tham chiếu sai hoặc WO trước chưa hợp lệ, xử lý nguyên nhân trước retry/DLQ.

## Áp migration local/dev theo yêu cầu người dùng — 28/10/2026

Sau khi người dùng yêu cầu commit/push, đóng issue và áp migration local/dev,
đã đọc cấu hình service/root env và xác định hai target trong container
`pbl6-postgres` có sẵn. Không có URL dev remote riêng trong cấu hình hiện tại.

| Biến cấu hình / target | Kết quả migration 0004 | Dữ liệu WO cũ |
| --- | --- | --- |
| WORKORDER_DATABASE_URL — localhost:5432/workorder_db | PASS; deploy lặp lại không có pending migration, DB → Prisma không drift | Giữ nguyên 37 WO và fingerprint tất cả cột cũ |
| WORKORDER_TEST_DATABASE_URL — localhost:5432/workorder_test_db | PASS; deploy lặp lại không có pending migration, DB → Prisma không drift | Giữ nguyên 0 WO |

Trước deploy đã đối chiếu checksum migration 0001–0003 với Git. Sau deploy xác
nhận 0004 finished, hai cột UUID, hai unique indexes và CHECK đã tồn tại.
Không reset/truncate, không thay đổi dữ liệu nghiệp vụ cũ hoặc migration cũ.
Việc áp local theo yêu cầu người dùng không thay thế shared review trước merge.
Bằng chứng local: `/tmp/pbl6-k6-local-migration-results.json` và
`/tmp/pbl6-k6-local-*.log` (không chứa URL credential).

F09/F10/F11 của SR, K8 upload, UI/Android và nghiệm thu toàn M2 vẫn là các phần
riêng; kết quả K6 không đóng các mục đó. Log local: `/tmp/pbl6-k6-*.log`.
