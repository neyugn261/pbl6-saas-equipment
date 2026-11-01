# M3-A6 — Regression và bàn giao Work Order

Ngày thực thi: 01/11/2026. Owner: Khương. Base `develop@bb18ded` (PR #49,
A1–A5 đã merge), cộng các script/check của nhánh A6.

**Regression thuộc WO đã đạt. Nghiệm thu public SR composition, web và Android
còn chờ consumer; chưa đóng toàn bộ tiêu chí tích hợp A6/M3.** Không chuyển các
ca này thành Pass từ kết quả API hoặc storage test.

## Đầu ra của nhánh A6

- `pnpm --filter workorder-service test:m3`: chạy tuần tự 17 bước, dừng ở lỗi
  đầu tiên và xuất evidence JSON. Không chạy trên DB demo/dev.
- `test:attachments:restart`: kiểm chứng cleanup sau **SIGKILL tiến trình WO**
  với PostgreSQL và MinIO thật, bổ sung cho các ca khởi tạo lại repository/worker
  trong DB suite A2/A3.
- [Kết quả máy đọc được](m3-khuong-a6-results.json), coverage map và handoff bên
  dưới. JSON ghi source HEAD, dirty working tree, thời điểm và exit code từng
  bước; không chứa URL/credential/token hoặc raw log.
- README service làm rõ DB test/shadow, cách chạy và giới hạn bằng chứng.

Không thay API nghiệp vụ, auth, schema, migration, shared config hoặc code
SR/web/mobile. Contract đã merge vẫn áp dụng:
[attachment](../api/workorder-attachments.yaml),
[report](../api/workorder.yaml), [ADR 0013](../decisions/0013-workorder-attachment-lifecycle.md).

## Môi trường và kết quả

Linux, Node 24.20.0, pnpm 11.26.0. PostgreSQL 17 và MinIO/Silo
`RELEASE.2026-10-18T00-00-00Z` trong container tạm riêng, credentials sinh cho
lượt chạy; HTTP server dùng port tạm. Bucket riêng từng suite/smoke, không
reset volume hoặc DB nghiệp vụ của nhóm. RabbitMQ bị tắt trong bộ 17 bước;
consumer logic ở DB suite dùng event fixture. Kiểm tra broker riêng được nêu
ở mục Maintenance bên dưới.

| Kiểm tra | Kết quả thực thi |
| --- | --- |
| Build 4 shared packages | PASS |
| WO lint / typecheck / build | PASS |
| WO unit | 34 PASS |
| WO bootstrap E2E | 2 PASS; fake DB |
| Deploy 5 migration hiện hành ×2 | PASS, lần hai không có migration pending |
| Migrations → schema drift | PASS, no difference |
| Deployed DB → schema drift | PASS, no difference |
| WO DB regression | 210 PASS; PostgreSQL thật, storage/upstream double được khai báo |
| Attachment + projection với MinIO thật | 45 PASS; gồm fault injection cho lỗi/race |
| Gateway E2E / build | 25 PASS / PASS |
| Gateway → WO → PostgreSQL → MinIO | PASS: upload/download, replay, publish/delete, customer projection, internal blocked |
| Gateway → report → PostgreSQL | 8 kịch bản PASS, fixture 4/2 |
| WO process crash/restart → cleanup | PASS; không dùng storage double |
| Maintenance/Asset/WO/Gateway + RabbitMQ thật | PASS; scheduler/TaskDue, lifecycle, replacement/replay/out-of-order và seed ×2 |

Lượt `test:m3` đạt **17/17 bước**, trạng thái `PASS_OWNER_REGRESSION`.
Không cộng 45 real-storage cases vào 210 như các case khác nhau: đây là chạy
lại cùng các ca attachment/projection với adapter storage thật.

Warning dự kiến khi inject storage outage: `Attachment cleanup will retry`.
Gateway có DEP0060 và MaxListenersExceededWarning từ proxy setup hiện hành;
các suite vẫn pass. Nhánh A6 không đổi dependency/proxy để xử lý warning này.

## Coverage map cho Hatsady

| Nhóm ca A6 | Bằng chứng trong service |
| --- | --- |
| WO create/assign/execute/complete/cancel, report và scope | `test/db/week1.e2e-spec.ts`, `week2.e2e-spec.ts` |
| Maintenance Due, cancel/replacement, replay/race/out-of-order | `test/db/maintenance.e2e-spec.ts`, `maintenance-replacement.e2e-spec.ts` |
| Hash/MIME/actual size, missing bytes, filename và giới hạn | `test/db/attachment-flow.e2e-spec.ts`: verification/DTO/oversized cases |
| Quota 10 slot, attached + pending, concurrent prepare/finalize, durable idempotency | Cùng suite: quota/concurrent/key reuse/replay cases |
| Assignment/state đổi trong storage I/O, uploader/report author | Cùng suite: recheck assignment/parent state/report author |
| Cleanup retry/expired claim/stale ACK/live final/late PUT | Cùng suite: cleanup/reconciliation cases; MinIO mode giữ bytes thật |
| Restart toàn tiến trình và startup worker | `scripts/smoke-attachment-restart.cjs` + `test/support/attachment-worker-process.cjs` |
| Hai tenant/customer, INTERNAL/deleted/legacy/wrong SR không lộ metadata/count/download | `test/db/published-attachments.e2e-spec.ts` |
| Original token/correlation forwarding, source 404/503 | Cùng suite và `scripts/smoke-attachment-gateway.cjs`; caller client thật, chưa phải public SR |
| Cohort createdAt, independent completedAt, 8 status, UTC/[from,to), quyền/tenant/outage | `test/db/reports.e2e-spec.ts`, `src/reports/report-range.spec.ts`, report Gateway smoke |
| SQL verification/tenant/target/idempotency/claim constraints | `test/db/attachment-persistence.e2e-spec.ts`; drift + deploy ×2 |

Smoke restart tạo ba intent với file thật: một final bị tombstone, một final
còn hợp lệ, một staging bỏ dở. Tiến trình thứ nhất claim job rồi bị SIGKILL,
không chạy shutdown hook. Test xác nhận claim còn bền vững trong DB, chỉ đẩy
deadline **fixture** qua hạn để không chờ TTL/lease production, rồi khởi động
tiến trình mới với worker bật. Startup worker phải reclaim job (attempt 1 → 2),
xóa final đã tombstone/staging hết hạn, xử lý job requeue của live final mà vẫn
giữ bytes, và finalize replay trả lại cùng attachment sau restart.
Đây không phải thử hết hạn signed URL theo đồng hồ thực hoặc restart host/container.

## Chạy lại

Sau `pnpm install`/build packages, cung cấp trong shell hoặc `.env` riêng:

| Biến test | Yêu cầu |
| --- | --- |
| `WORKORDER_TEST_DATABASE_URL` | Đúng DB `workorder_test_db`, dành riêng cho lượt chạy |
| `WORKORDER_SHADOW_TEST_DATABASE_URL` | Đúng DB `workorder_shadow_test_db`, bỏ được toàn bộ dữ liệu |
| `MINIO_ENDPOINT`, `MINIO_PORT`, `MINIO_USE_SSL`, `MINIO_REGION` | Storage test đang chạy |
| `MINIO_PUBLIC_ENDPOINT` | Origin mà tiến trình test truy cập được để signed PUT/GET |
| `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY` | Credential test, có quyền tạo/dọn bucket test |
| `WORKORDER_M3_EVIDENCE_PATH` (tùy chọn) | Đường dẫn JSON, relative tính từ `apps/workorder-service` |

```bash
pnpm --filter workorder-service test:m3
```

Runner kiểm tra **đúng tên** cả DB test và shadow bằng helper chung, không sử
dụng URL DB business/shadow dev từ `.env` cho migration/drift. DB suite có
truncate; không chạy song song suite hoặc người khác trên cùng test DB.
Không cần sửa `.env.example`/Compose chung để chạy script này. Runner không tự
khởi tạo PostgreSQL/MinIO và không gọi Identity thật; JWT test theo package chung.

Chạy riêng smoke mới sau khi test DB đã áp migration:

```bash
pnpm --filter workorder-service test:attachments:restart
```

Các bucket/record/child process do smoke tạo được dọn khi kết thúc bình thường
hoặc assertion thất bại. Nếu chính runner bị kill/cúp máy, kiểm tra tài nguyên
test còn sót theo run ID trước khi dọn; không xóa bucket application.

## Maintenance/replacement qua broker thật

Chạy lại script tích hợp đã có của Maintenance để kiểm tra producer/consumer
thật, ngoài bộ 17 bước phía WO:

```bash
pnpm --filter asset-service --filter maintenance-service --filter workorder-service --filter api-gateway build
pnpm --filter maintenance-service test:integration
```

Cần `ASSET_TEST_DATABASE_URL`, `MAINTENANCE_TEST_DATABASE_URL`,
`WORKORDER_TEST_DATABASE_URL` đúng tên DB tương ứng và `RABBITMQ_TEST_URL`.
Script dùng event exchange/queue riêng, DB fixture theo tenant riêng, JWT và
Organization reference fixture; không thay thế login hoặc UI acceptance.

Lượt A6 **PASS**, với PostgreSQL test và RabbitMQ 4 trong container tạm riêng:

- Asset move → snapshot → scheduler → TaskDue → WO → assign/accept/start/complete
  → Task/Asset history qua Gateway và broker thật.
- Dossier đọc report/assignment/history và Maintenance summary, giữ customer scope.
- Cancel → request replacement → WO theo ID producer cấp → Task link → replacement
  tiếp → report/Task/Asset history. Replay Due/cancellation cũ, duplicate request
  và Completed đến trước Created không làm sai Task đã hoàn thành.
- Maintenance seed chạy hai lần, không tạo trùng hoặc reset lịch/Task.

Đây là kiểm tra bổ sung bằng script có sẵn của Minh, không nằm trong 17 bước
của `test:m3`; không sửa Asset/Maintenance để chạy regression này.

## Các ca còn chờ tích hợp — không ghi Pass

| Mã / owner | Đầu vào đã sẵn và điều kiện đóng |
| --- | --- |
| A6-INT-SR / Huy C4 + Khương | [Handoff A4](m3-khuong-a4.md) và [fixture nguồn](../api/workorder-attachment-projection-fixtures.json). SR authorize resource trước → original token/correlation → WO projection → public metadata/download. Kiểm tra hai customer/tenant, INTERNAL/deleted, nguồn 404 đúng mã và outage 503 không thành empty. C4 chưa có trên develop tại mốc A6. |
| A6-INT-WEB / Hatsady E2/E3 | Staff upload → finalize/list → publish; Customer chỉ xem/tải qua SR; hide/delete chặn link mới. Dashboard gọi report theo [fixture A5](m3-khuong-a5.md), loading/empty/error riêng, không suy tỷ lệ 2/4. |
| A6-INT-ANDROID / Nguyên D3–D5 | Endpoint storage dùng được từ Android, ảnh/file thật, mất response retry cùng intent/key, đổi assignment/session và logout. Cần kết quả chạy thiết bị/emulator, không thay bằng HTTP smoke. |
| A6-INT-DEMO / nhóm, Hatsady tổng hợp | Login Identity thật → SR/WO/report/file → Customer qua Gateway, cùng các nhánh Inventory/Notification. Dựng lại môi trường theo runbook, giữ M2/Maintenance/replacement không regression. |

Hatsady đưa các kết quả và pending này vào `docs/testing/m3-test-cases.md` khi
tạo ma trận E5; Khương không sửa đè tài liệu thuộc owner E. Huy/Nguyên/Hatsady
triển khai phần của mình, Khương hỗ trợ fixture/contract và sửa bug WO nếu ca
ghép phát hiện lỗi. Review/merge nhánh A6 không tự đóng các pending ở trên hoặc
đánh dấu M3 hoàn tất.
