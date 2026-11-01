# M3-A1 — Khương: chốt attachment persistence và reporting contract

Ngày 01/11/2026. Baseline `origin/develop@43a7d82`. Khương đã chốt theo phương
án đề xuất trong phiên làm việc; Khương tiếp tục xác nhận **review đã chốt** trước khi push A1. Ghi nhận theo
xác nhận trong phiên làm việc, không tự tạo link hoặc metadata approval trên GitHub. A1 chuẩn bị contract/persistence; A2–A5 triển
khai runtime. Không thay nghiệp vụ SR, Inventory, mobile hoặc web trong A1.

## Đầu ra và trạng thái

| Đầu ra | Artifact | Trạng thái |
| --- | --- | --- |
| Q1 upload/replay/quota/quyền | [K8](../api/workorder-attachments.md), [OpenAPI](../api/workorder-attachments.yaml) | Owner và review đã chốt theo xác nhận của Khương |
| Persistence/lifecycle/recovery | [ADR 0013](../decisions/0013-workorder-attachment-lifecycle.md), WO schema + migration 0005, ERD SQL bổ sung | Review đã chốt; business DB chưa áp dụng |
| Q5 reporting | [workorder.yaml](../api/workorder.yaml), fixture dưới đây | Review đã chốt; A5 chưa triển khai |
| Cấu hình/dependency | Bảng yêu cầu dưới đây | Bàn giao Nguyên; chưa thêm SDK/env/compose |
| Acceptance | K8 matrix và DB constraint suite trong WO | Chỉ persistence được kiểm tra ở A1; không ghi upload/MinIO E2E Pass |

## Đường dẫn cho consumer

Gateway bỏ `/api/workorders`; không lặp prefix. Danh sách đầy đủ ở OpenAPI K8.

| Operation | Trong WO service | Public |
| --- | --- | --- |
| Prepare WO | POST /work-orders/{id}/attachment-uploads | /api/workorders/work-orders/{id}/attachment-uploads |
| Prepare report | POST /work-orders/{id}/service-report/attachment-uploads | /api/workorders/work-orders/{id}/service-report/attachment-uploads |
| Finalize | POST /attachment-uploads/{uploadId}/complete | /api/workorders/attachment-uploads/{uploadId}/complete |
| Abort | DELETE /attachment-uploads/{uploadId} | /api/workorders/attachment-uploads/{uploadId} |
| Download staff | GET /attachments/{id}/download | /api/workorders/attachments/{id}/download |
| SR file list projection | GET /internal/service-request-attachments/{srId} | Không public qua Gateway |
| SR file download projection | GET /internal/service-request-attachments/{srId}/{attachmentId}/download | Không public qua Gateway |
| Reporting | GET /reports/work-orders/summary | /api/workorders/reports/work-orders/summary |

Huy sở hữu public SR routes đề xuất trong K8; A1 không sửa controller hay
service-request.yaml. Staff list/read giữ assignment scope; CUSTOMER chỉ nhận
PublishedAttachment qua SR, không lấy staff metadata.

## Fixture upload cho web/mobile

Ví dụ metadata JPEG; checksum dưới đây chỉ là **placeholder hợp lệ về hình thức**,
client phải tính SHA-256 từ file thật. Không dùng fixture này như bằng chứng verify.

```json
{
  "fileName": "repair-before.jpg",
  "mimeType": "image/jpeg",
  "sizeBytes": 4096,
  "checksumSha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "visibility": "INTERNAL"
}
```

Prepare cần Idempotency-Key UUID; response có uploadId, method PUT, uploadUrl,
headers và expiresAt. Dùng chính headers nhận được khi PUT; không gửi JWT tới
storage. Finalize body `{}` và một FINALIZE key được giữ ổn định qua retry.
Chỉ sau finalize 200 mới refresh list và thông báo đã đính kèm. Không ghi link
ký thật vào fixture, localStorage hoặc log. UploadTicket/Download gửi no-store.

| Fixture/case | Hành vi consumer |
| --- | --- |
| Prepare 201 / finalize 200 | Dùng uploadId và expiresAt trả về; file chỉ được coi là attached sau finalize |
| 409 IDEMPOTENCY_KEY_REUSED | Không tự đổi payload hoặc lặp key; báo xung đột |
| 409 UPLOAD_IN_PROGRESS | Chờ ngắn, retry cùng uploadId/key; không tạo intent thứ hai |
| 409 UPLOAD_ALREADY_ATTACHED | Đọc lại danh sách theo attachmentId, không PUT tiếp |
| 409 UPLOAD_EXPIRED / UPLOAD_ABORTED | Người dùng tạo ý định mới nếu còn quyền |
| 404 ATTACHMENT_NOT_FOUND | File không tồn tại/không còn truy cập; không khôi phục bằng replay |
| 422 UPLOAD_VERIFICATION_FAILED | Không báo thành công; kiểm tra file/hash và tạo intent phù hợp |
| 503 ATTACHMENT_STORAGE_UNAVAILABLE | Giữ file/uploadId/key, cho retry; không đổi thành danh sách rỗng |
| SR projection 404 list | SR authorize trước; chỉ source list 404 mới có thể ánh xạ empty |
| SR projection download 404 | Giữ 404; sai SR/INTERNAL/deleted không lộ metadata |
| Source WO 503/network error | Hiện section unavailable; không giả total=0 |

Report phải hoàn tất trước khi upload report files. Mất phản hồi complete WO:
GET WO/report để đối soát; không tạo report mới. Notification hoàn tất không
cam kết file đã upload/publish. A4 bàn giao fixture HTTP thực sau implementation.

## Q5 — fixture báo cáo có số kỳ vọng

Quyền report:read, TENANT_STAFF; tenant chỉ từ token. Query from/to RFC3339 có
offset, bắt buộc from < to; không nhận tenantId/customerId/timezone/query lạ.
Khoảng `[from,to)`, UTC instants; timezone hiển thị Asia/Ho_Chi_Minh cố định.

Ví dụ kỳ tháng 11 Việt Nam: from `2026-10-31T17:00:00Z`, to
`2026-11-30T17:00:00Z`. Fixture cùng tenant (các dòng độc lập):

| WO | createdAt | status hiện tại | completedAt |
| --- | --- | --- | --- |
| A | bằng from | CREATED | NULL |
| B | 2026-11-01T01:00:00Z | IN_PROGRESS | NULL |
| C | 2026-11-02T01:00:00Z | COMPLETED | 2026-11-03T01:00:00Z |
| D | 2026-11-04T01:00:00Z | CANCELLED | NULL |
| E | 2026-10-01T01:00:00Z | COMPLETED | bằng from |
| F | bằng to | CREATED | NULL |
| G | 2026-10-01T01:00:00Z | COMPLETED | bằng to |

Kỳ vọng createdCount=4; CREATED=1, IN_PROGRESS=1, COMPLETED=1, CANCELLED=1,
các status khác=0; completedCount=2 (C/E). Tenant khác không được tính.
createdByStatus là **trạng thái hiện tại của tập tạo trong kỳ**, không phải
snapshot lịch sử tại to. completedCount là tập độc lập và có thể lớn hơn
createdCount; không tính phần trăm từ hai số này.

A5 tests thêm from==to/from>to, thiếu offset/query lạ, kỳ rỗng (mọi count=0),
role 403, tenant isolation, nhiều hơn một trang dữ liệu và DB failure
(503 REPORT_UNAVAILABLE, không trả 0). Aggregate dùng một query hoặc cùng
repeatable-read snapshot; chỉ đọc workorder_db. Không cần migration cho Q5.

## Yêu cầu bàn giao Nguyên — PR dependency/env riêng

| Thành phần | Yêu cầu đã chốt |
| --- | --- |
| SDK | @aws-sdk/client-s3 + @aws-sdk/s3-request-presigner trong WO; Nguyên chốt version tương thích khi làm PR dependency, không nâng framework |
| Existing env | Tái sử dụng MINIO_ENDPOINT/MINIO_PORT/MINIO_ACCESS_KEY/MINIO_SECRET_KEY hiện có; không ghi credential thật vào docs |
| Env bổ sung đề nghị | MINIO_USE_SSL (boolean), MINIO_REGION (chuỗi bắt buộc), WORKORDER_ATTACHMENT_BUCKET (private bucket), MINIO_PUBLIC_ENDPOINT (absolute http(s) URL browser/Android truy cập được) |
| URL semantics | Endpoint hiện có phục vụ server-side I/O; MINIO_PUBLIC_ENDPOINT là origin ký PUT/GET, bao gồm port, không path/query/credential. Header Host phải giữ đúng lúc ký; không ký internal URL rồi thay hostname |
| Startup A2 | Validate cấu hình storage khi bật runtime attachment; A1 chưa bắt service đang chạy phải có biến mới |
| Bucket | Tạo idempotent, private, WO credential có quyền GET/PUT/DELETE/LIST chỉ trong bucket/prefix được quản lý; không dùng public bucket |
| CORS | Origins web cấu hình theo môi trường; PUT/GET/HEAD, headers theo signed ticket (ít nhất Content-Type); bổ sung checksum headers nếu adapter ký chúng. Không forward Authorization JWT |
| Client access | Xác minh URL từ browser lẫn Android/LAN; hostname hợp lệ cho từng môi trường phải thống nhất khi ký |
| Storage/DB tests | WORKORDER_TEST_DATABASE_URL đúng workorder_test_db; MinIO integration dùng bucket/prefix test riêng và giữ dữ liệu dev |

Giới hạn 10 slots/10 MiB, TTL, finalize lease/timeout và cleanup retry/reconcile
đã chốt trong ADR 0013; chưa thêm nhiều env để tùy chỉnh các invariant. A2/A3
triển khai thông số đó và review thay đổi contract nếu cần điều chỉnh.

## Thứ tự bàn giao và nghiệm thu A1

1. Review K8/Q5 với consumer; Nguyên review ADR/ERD/schema/auth, ghi kết quả thực
   trong PR. Tách dependency/env/shared rollout theo CONTRIBUTING khi mở PR.
2. Kiểm tra migration mới trên DB test, deploy lặp lại và drift; không áp business
   DB trước review/legacy decision. Không rewrite migration cũ hoặc reset demo DB.
3. A2 triển khai upload/read với policy/test; A3 hoàn thiện visibility/cleanup;
   A4 ghép Huy; A5 triển khai aggregate độc lập. A6 xuyên suốt từng PR.

- [x] Owner chốt phương án Q1/Q5 và chuẩn bị artifact.
- [x] Shared/schema/auth/storage review đã chốt theo xác nhận của Khương.
- [x] Consumer web/Q5/mobile review đã chốt theo xác nhận của Khương.
- [x] Projection review đã chốt theo xác nhận của Khương; SR implementation thuộc Huy.
- [ ] Legacy inventory/backfill decision cho môi trường triển khai được ghi nhận.
- [ ] Dependency/env PR được điều phối và liên kết khi bắt đầu A2.

Không tick toàn bộ A1 chỉ vì owner đã chốt hoặc DB tests đạt. Không ghi upload,
signed PUT/GET, cleanup runtime, projection hay báo cáo đã hoạt động trong A1.

## Kết quả kiểm tra — 01/11/2026

PostgreSQL 17-alpine trong container tạm riêng, database `workorder_test_db` và
`workorder_shadow_db`. URL chỉ truyền qua môi trường; không chạy migration/test
vào business DB hoặc DB test đang dùng của nhóm. Container kiểm tra được dọn
sau khi hoàn tất. Không reset/seed lại stack demo.

| Kiểm tra thực tế | Kết quả |
| --- | --- |
| Prisma validate/generate | PASS |
| WO lint, typecheck, build | PASS |
| WO unit | 5 PASS |
| WO bootstrap E2E | 2 PASS; fake DB, không phải upload HTTP test |
| WO DB suite | 149 PASS = 130 regression + 19 persistence cases mới |
| Migration upgrade 0001–0004 → 0005 | PASS trên PostgreSQL thật |
| Deploy lặp lại | PASS, không còn migration pending |
| Migration → schema drift | PASS, No difference detected |
| DB test → schema drift | PASS, No difference detected |
| Legacy upgrade preservation | PASS, hai WO/report attachment giữ nguyên ID/key/name/MIME/visibility/time; bytes/hash/verifiedAt đều NULL |
| Constraint/index preservation | PASS, toàn bộ constraint trước 0005 và partial indexes giữ nguyên định nghĩa |
| YAML parse và local references | PASS, workorder.yaml 123 refs; attachment YAML 90 refs |
| Local Markdown links, migration/ERD và git diff --check | PASS; ERD amendment chứa đúng SQL migration mới, không có DROP |

DB cases kiểm tra metadata tuple/size/hash, actor/time pairs, parent/tenant/report
FK, intent/result/lease shape, idempotency cùng key khác parent dưới hai lệnh
đồng thời, uploader binding và cleanup claim/kind/requeue shape. Đây không phải
bằng chứng quota runtime, upload verify, worker fencing hoặc MinIO E2E đã chạy.

Lệnh service để reviewer chạy lại trên DB test riêng:

```sh
pnpm --filter workorder-service lint
pnpm --filter workorder-service typecheck
pnpm --filter workorder-service test --runInBand
pnpm --filter workorder-service test:e2e
pnpm --filter workorder-service test:e2e:db
pnpm --filter workorder-service build
pnpm --filter workorder-service db:check-drift
```

DB suite dùng `requireTestDatabaseUrl('WORKORDER_TEST_DATABASE_URL')` và tự áp
migration chỉ vào đúng `workorder_test_db`. Các suite cũ truncate DB test, nên
không dùng chung DB test đang phục vụ lượt kiểm thử của người khác. Trong lượt
A1, migrate/drift commands cũng được override cả WORKORDER_DATABASE_URL và
WORKORDER_SHADOW_DATABASE_URL sang container tạm. Để tái hiện kiểm tra preservation:
áp nguyên migrations 0001–0004 vào DB test mới, tạo một attachment mỗi loại,
lưu projection các cột cũ và pg_constraint/partial-index definitions, áp 0005,
rồi đối chiếu projection/định nghĩa và NULL verification tuple trước khi chạy suite.

Chưa thực hiện: MinIO signed PUT/GET, runtime cleanup,
SR composition hay Q5 aggregate HTTP. Trạng thái review ở checklist trên giữ nguyên.
