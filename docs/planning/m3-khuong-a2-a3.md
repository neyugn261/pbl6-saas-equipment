# M3-A2/A3 — Staff attachments, MinIO và cleanup

Ngày 01/11/2026. Nhánh `feature/khuong-m3-a2-a3-attachments`, tiếp nối A1
`5e64396` trên `feature/khuong-m3-a1-design` (đã push theo yêu cầu Khương).
Khương xác nhận review A1 đã chốt; chưa tạo PR trong lượt làm việc này.

Thiết kế: [ADR 0013](../decisions/0013-workorder-attachment-lifecycle.md).
Contract: [K8](../api/workorder-attachments.md), [OpenAPI](../api/workorder-attachments.yaml).

## Phạm vi đã triển khai

- Prepare cho WO hoặc Service Report, signed PUT staging TTL 300 giây; quota
  chung attached + pending, tối đa 10 mỗi parent và WO/report tách riêng.
- Finalize đọc bytes thật với giới hạn 10 MiB, kiểm tra size/type signature/SHA-256,
  ghi đúng bytes đã verify sang final key bất biến; DB attachment + intent + audit
  commit nguyên tử. Không giữ transaction DB trong storage I/O.
- Idempotency PREPARE/FINALIZE bền vững; key scope xuyên hai loại parent, replay
  không gia hạn TTL; lease fencing và final key riêng cho từng attempt.
- List/count theo tenant/assignment và chỉ verified/live metadata; download HEAD
  kiểm tra object rồi ký GET 60 giây, Content-Disposition an toàn, no-store.
- Manager publish/hide; default INTERNAL, Technician không tự publish CUSTOMER.
- Abort/expire, delete tombstone và audit nội bộ cùng transaction; delete/finalize
  replay không làm sống lại file đã xóa.
- Worker local DB: expire intent, durable claim/retry, fence attempt cũ, tránh
  xóa live final file; reconciliation dọn object đến muộn sau một lần cleanup DONE.
- Sanitized storage/API/worker errors, không log key/URL ký/credentials. Unexpected
  attachment DB errors cũng được đổi thành lỗi sạch trước shared logger.
- Gateway CORS cho phép Idempotency-Key và giữ header khi proxy; bucket/CORS setup
  idempotent, từ chối anonymous policy/ACL và origin wildcard.

Không thay schema/migration sau A1, không thêm quyền/role/event. **Internal SR
projection A4, aggregate báo cáo A5 và UI web/Android chưa thuộc implementation
này**. CUSTOMER vẫn bị cấm ở staff WO/report/file APIs, kể cả visibility CUSTOMER.

## Các route staff

Tất cả yêu cầu TENANT_STAFF + scope WO; permission OR ở policy được kiểm tra lại
dưới khóa, không dựa vào allowedActions phía client. Gateway bỏ `/api/workorders`.

| Method/path trong WO | Hành vi |
| --- | --- |
| POST /work-orders/{id}/attachment-uploads | Manager WO non-terminal hoặc current ACCEPTED Technician ở trạng thái cho phép |
| POST /work-orders/{id}/service-report/attachment-uploads | Report tồn tại, WO COMPLETED; manager hoặc report author có execute/submit |
| POST /attachment-uploads/{id}/complete | Same uploader; state/quyền/assignment được kiểm tra lại; ATTACHED replay dùng read scope hiện tại |
| DELETE /attachment-uploads/{id} | Abort unfinished intent; manager hoặc uploader còn mutation scope; replay theo K8 |
| GET /work-orders/{id}/attachments | Verified live WO file page, historical assignment read scope |
| GET /work-orders/{id}/service-report/attachments | Verified live report file page |
| GET /attachments/{id}/download | Authorize parent rồi kiểm tra storage/ký GET; no-store |
| PATCH /attachments/{id} | work_order:manage, visibility INTERNAL/CUSTOMER, audit |
| DELETE /attachments/{id} | Tombstone + cleanup queue + audit; trạng thái target theo K8 |

Prepare/finalize bắt buộc `Idempotency-Key` UUID; finalize body `{}`. PUT bytes
trực tiếp vào uploadUrl với đúng headers nhận được, **không** gửi API JWT tới
MinIO. Chỉ finalize 200 mới được xem là đính kèm thành công. Report complete
vẫn là thao tác riêng chạy trước upload; không tạo report hoặc phát Completed lần hai.

## Bật runtime local

Migration 0005 cần áp dụng trước khi bật feature. Review A1 đã được Khương xác
nhận; nếu có attachment legacy, thực hiện inventory/verification/cleanup ownership
theo ADR trước khi phục vụ chúng. Không backfill size/hash giả.

Thêm các biến mới từ `.env.example` vào `.env` hiện có, giữ credentials riêng:

| Biến | Ý nghĩa |
| --- | --- |
| WORKORDER_ATTACHMENTS_ENABLED=true | Bật storage adapter; thiếu cấu hình thì service từ chối startup |
| WORKORDER_ATTACHMENT_WORKER_ENABLED=true | Bật expire/cleanup/reconcile; mặc định false trong NODE_ENV=test |
| MINIO_ENDPOINT / MINIO_PORT / MINIO_USE_SSL | Server-side storage host/port/TLS, hostname không chứa scheme/path/credential |
| MINIO_REGION | Region dùng để ký, thống nhất với MinIO |
| MINIO_ACCESS_KEY / MINIO_SECRET_KEY | Credential cấu hình ngoài source; quyền theo bucket/prefix được quản lý |
| WORKORDER_ATTACHMENT_BUCKET | Bucket private riêng của WO |
| MINIO_PUBLIC_ENDPOINT | Origin chứa scheme/host/port mà browser và Android đều truy cập được; không path/query |
| CORS_ORIGINS | Danh sách origin web cụ thể, không wildcard, dùng cho setup bucket CORS |

Internal endpoint dùng server I/O; public endpoint dùng ngay khi ký. Không ký URL
nội bộ rồi thay hostname. Với điện thoại thật/emulator và web cùng dùng, chọn
hostname/IP LAN truy cập được từ cả hai. Production yêu cầu TLS cho cả storage
I/O lẫn signed URLs. Không thay endpoint/credentials đang dùng của service khác.

```sh
pnpm --filter workorder-service db:migrate
pnpm --filter workorder-service attachments:prepare
pnpm dev:workorder
pnpm dev:gateway
```

`attachments:prepare` build WO, tạo bucket nếu thiếu, kiểm tra private policy/ACL
rồi cấu hình CORS PUT/GET/HEAD cho CORS_ORIGINS và Content-Type. Chạy lại an toàn;
không đổi bucket public để né lỗi. Khi runtime bị tắt, storage operations trả 503
ATTACHMENT_STORAGE_UNAVAILABLE; các route không giả upload thành công.

## Worker và phục hồi

Worker chạy mỗi 15 giây; intent expiry/claim theo DB, không giữ JWT hoặc gọi
Identity/SR từ background. Claims có UUID token/lease 120 giây; retry 5 giây
tăng dần tới 1 giờ. Lỗi DB giữ claim để lease recovery; lỗi storage ghi safe code.
STAGING không dọn trước original expiry + 60 giây. FINAL của failed attempt được
ghi cleanup trước storage write, và được fence trước DELETE nếu lease đã hết hạn.

Reconciliation mỗi 10 phút, chỉ với object đủ tuổi và có durable ownership; unknown
objects chỉ được báo count để owner đối soát. Live attachment luôn chặn final
cleanup. Delete hợp lệ requeue retained job; job DONE không bị purge, nên late PUT
có thể được phát hiện và dọn lại. Không tự purge idempotency/intent/tombstone.

Unverified legacy rows không xuất hiện trong list/count/download. Verified legacy
row nhưng chưa có cleanup ownership bị từ chối delete với 503 và không tombstone;
owner phải đối soát thay vì API báo thành công mà không có đường dọn blob.

## Chạy kiểm tra

DB suites chỉ chấp nhận đúng `workorder_test_db`; chọn instance riêng để tránh
đụng lượt test khác. Suite cũ có truncate. Migration/drift cần shadow DB riêng.

```sh
pnpm --filter workorder-service lint
pnpm --filter workorder-service typecheck
pnpm --filter workorder-service test --runInBand
pnpm --filter workorder-service test:e2e
pnpm --filter workorder-service test:e2e:db
pnpm --filter workorder-service test:attachments:storage
pnpm --filter workorder-service test:attachments:gateway
pnpm --filter workorder-service build
pnpm --filter workorder-service db:check-drift
pnpm --filter api-gateway test:e2e --runInBand
```

`test:e2e:db` dùng PostgreSQL thật và explicit memory storage double cho flow file.
`test:attachments:storage` chạy lại flow suite với S3 adapter và MinIO thật, dùng
bucket `pbl6-wo-test-<UUID>` được tạo/dọn trong suite, không xóa bucket application.
Các hook giữ/thay đổi timing ở boundary để kiểm tra race. Storage outage trong
real mode dùng S3 SDK kết nối endpoint loopback không phục vụ, không tắt MinIO
của nhóm. DB commit failure là fault injection tại commit boundary.

`test:attachments:gateway` build Gateway/WO rồi chạy cả hai app thật ở port tạm:
prepare → signed PUT → finalize/replay → list/download → visibility/delete,
customer 403 và internal 404. Token là fixture JWT được backend xác thực thật;
Identity/Organization không phải live upstream của smoke attachment này.
Script chỉ ghi/tự dọn fixture tenant và bucket riêng trong DB test.

## Kết quả kiểm tra thực tế

Môi trường: PostgreSQL 17-alpine và MinIO/Silo trong **hai container tạm riêng**,
port tạm, credentials sinh cho lượt test, DB workorder_test_db/workorder_shadow_db.
Không chạy migration/test vào business DB hoặc tắt storage của nhóm.

| Kiểm tra đã chạy | Kết quả |
| --- | --- |
| WO lint/typecheck/build | PASS |
| WO unit | 22 PASS |
| WO bootstrap E2E | 2 PASS (fake DB) |
| WO DB suite | 177 PASS = 149 regression A1 + 28 flow A2/A3, PostgreSQL thật/storage double |
| WO real storage suite | 28 PASS, S3 adapter + MinIO thật, signed PUT/GET và anonymous GET 403 |
| Storage CORS | PASS, HTTP OPTIONS trả đúng web origin và PUT/header cần thiết |
| Provisioning script | PASS chạy hai lần cùng bucket; private policy/ACL và CORS được kiểm tra trên MinIO thật |
| Gateway lint/typecheck/build | PASS |
| Gateway unit / E2E | 8 / 24 PASS; có case Idempotency-Key preflight/forwarding |
| Migration → Prisma drift | PASS, No difference detected; không thay schema/migration A1 |
| OpenAPI parse/local refs | PASS, attachment YAML 91 refs; WO YAML 123 refs |
| Markdown links và git diff --check | PASS |

Gateway → WO → PostgreSQL → MinIO smoke đã chạy PASS cho prepare/PUT/finalize,
replay, list/download, visibility/delete, customer 403/internal 404 và Gateway CORS.
Script dùng JWT fixture, không nghiệm thu Identity login hoặc toàn bộ SR workflow.
Các warning cleanup trong fault-injection tests là dự kiến. Gateway vẫn có
DEP0060 từ http-proxy dependency hiện hành; không nâng framework trong task này.
Không dùng API/HTTP tests thay nghiệm thu web UI, camera hoặc Android. A4/A5
và consumer/client integration tiếp tục theo owner/task tương ứng.
