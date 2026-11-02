# M3 — Nguyên bàn giao Q3/Q4/Q6 cho Huy

Ngày đối chiếu: 03/11/2026. Baseline: `origin/develop` tại `53a0a6e` sau
`git fetch origin develop`. **APPROVED** dưới đây nghĩa là Nguyên chấp thuận
thiết kế/contract trong phạm vi sở hữu; không có nghĩa code, migration hoặc PR
chưa tồn tại đã được merge. Contract dùng chung vẫn cần producer và consumer
review theo `docs/architecture/events.md` trước khi triển khai.

## Cập nhật trên nhánh `codex/nguyen-m3-integration` (chưa merge)

Sau baseline, Nguyên đã bổ sung hai event vào `packages/event-contracts`,
Identity outbox/revision/bootstrap, private activation delivery và Mailpit demo
theo [ADR 0017](../decisions/0017-identity-recipient-and-activation-delivery.md).
Migration mới là `20261102090000_notification_recipient_outbox`; ERD delta ở
[`docs/erd/m3-identity-recipient-and-mail.md`](../erd/m3-identity-recipient-and-mail.md).
Commit `b96ae03` trên nhánh tích hợp **chưa merge vào develop** và chưa thay cho
consumer review của Huy. Identity E2E và schema drift chạy trên test DB;
Gateway invite→Identity→Mailpit SMTP đã PASS trên demo stack (mail vào Mailpit,
job SENT và xóa ciphertext). Bootstrap 8 recipient snapshot + 1 marker đã
được Identity outbox publish lên RabbitMQ; bước RabbitMQ→Notification chưa
chạy vì consumer C3 chưa có trên nhánh tích hợp.
Huy có thể review contract ngay; Notification migration/consumer vẫn do Huy.

## Trạng thái ngắn

| Nội dung | Trạng thái | Owner / bước tiếp theo |
| --- | --- | --- |
| Q3 event-driven local recipient projection, không gọi Identity/Organization đồng bộ từ consumer | **APPROVED (thiết kế)** theo ADR 0004; producer đã có ở `b96ae03` | Nguyên: event catalog, Identity outbox/revision/bootstrap. Huy: Notification projection/consumer. |
| Q3 event name, payload và bootstrap protocol bên dưới | **PROPOSED cho consumer review**; đã có trong `packages/event-contracts` ở `b96ae03` | Huy review contract trước merge/bind queue. Thay đổi payload cần phối hợp cả producer và consumer. |
| Notification schema nguyên tắc bên dưới | **APPROVED (phạm vi migration)**; SQL/Prisma cụ thể **BLOCKED** vì `M3-HUY-Q3-REVIEW.md` chưa được cung cấp trên `develop` hoặc nhánh Huy hiện thấy | Huy gửi proposal, cập nhật ERD/API/recipient matrix và test; Nguyên review migration. Không sửa `0001_init`. |
| Q4 Identity sở hữu token, queue và SMTP delivery cho activation | **APPROVED (quyết định owner của Nguyên)**; implementation và demo SMTP đã PASS ở `b96ae03` | Nguyên giữ Identity/Mailpit; Huy không đưa activation token vào Notification. C5 cần cập nhật owner trong kế hoạch nhóm. |
| Q6 Gateway Notification mapping và chặn `/internal/*` | **APPROVED / MERGED** qua PR #53 | Nguyên giữ Gateway; Huy triển khai API ở Notification theo prefix dưới đây. |
| Q6 hai URL SR result attachments | **APPROVED (URL/mapping)**; C4 business route **chưa merge ở baseline** | Huy merge SR C4, Khương duy trì WO A4, Nguyên/Gateway smoke sau merge. |

## Q3 — Contract recipient snapshot

Tên event thống nhất cho PR contract: **`NotificationRecipientSnapshot.v1`**,
producer `identity-service`, aggregate `User`, `aggregateId = userId`.
Envelope ADR 0005 chứa `tenantId` UUID bắt buộc; không nhân bản tenantId trong
payload. Payload v1 bắt buộc:

```json
{
  "userId": "uuid",
  "userType": "TENANT_STAFF | CUSTOMER",
  "accountStatus": "INVITED | ACTIVE | SUSPENDED | DISABLED",
  "roles": ["ROLE_CODE"],
  "customerMembership": null,
  "revision": "positive decimal integer string",
  "bootstrapRunId": null
}
```

Với CUSTOMER đã có liên kết, `customerMembership` là
`{ membershipId: uuid, customerId: uuid, status: ACTIVE|INACTIVE,
sourceChangedAt: ISO-8601 }`; tombstone INACTIVE được giữ, không chuyển
thành null. Với TENANT_STAFF, trường này là null. `roles` là danh sách role
code đã sắp xếp, không trùng và hợp `userType`. Snapshot không chứa email,
tên, token, nội dung thông báo hoặc dữ liệu từ service khác. `bootstrapRunId`
là UUID của đợt bootstrap hoặc null cho live update.

Theo ADR 0003 và unique `customer_user_memberships.user_id`, **mỗi CUSTOMER
account chỉ có một membership ở một thời điểm**. M3 không mở rộng thành nhiều
customer membership. Nếu nghiệp vụ này đổi, cần ADR/schema/token mới thay vì
tự ý đổi payload v1.

Identity tăng `revision` trong transaction của từng user (dạng decimal string
để không mất độ chính xác JSON), cùng transaction với thay đổi account/role,
hoặc với inbox xử lý `CustomerMembershipChanged.v1` và outbox snapshot. Lock
user trước khi tăng revision. Invite, activate, suspend/disable, đổi role và
membership move/revoke đều phát snapshot đầy đủ. Organization vẫn là nguồn
membership và phát `CustomerMembershipChanged.v1`; Identity chỉ phát snapshot
sau khi cập nhật `user_customer_links`. Notification chỉ upsert nếu revision
mới hơn và giữ inactive/disabled snapshot để replay cũ không phục hồi quyền.

Bootstrap: Identity tạo `bootstrapRunId` và trạng thái RUNNING trong DB riêng,
chụp toàn bộ tenant users tồn tại lúc bắt đầu bằng cùng đường ghi snapshot và
tăng revision như live update. Mỗi snapshot bootstrap mang run ID. Sau khi
mọi snapshot được ghi vào outbox, Identity phát
**`NotificationRecipientBootstrapCompleted.v1`** với envelope tenantId,
aggregate `RecipientBootstrap`, aggregateId = bootstrapRunId, payload
`{ bootstrapRunId: uuid, expectedUsers: non-negative safe integer,
startedAt: ISO-8601, completedAt: ISO-8601 }`. Notification chỉ đánh dấu
tenant bootstrap complete khi đã nhận marker **và** đủ số userId khác nhau
gắn run ID; marker có thể đến trước snapshot. Dữ liệu live mới vẫn dùng
revision lớn hơn, không bị snapshot cũ ghi đè. Identity có lệnh bootstrap
idempotent, báo RUNNING/COMPLETED/FAILED và số user đã enqueue; không coi
broker publish là hoàn tất projection phía Notification.

Notification nhận SR/WO/Inventory event trước snapshot hoặc trước SR Created
projection thì ghi `pending_notification_events` theo allowlist và inbox trong
cùng transaction **trước ACK**. Sự kiện snapshot/SR Created và worker quét
định kỳ thử lại; thiếu dữ liệu không được biến thành gửi sai audience hay bỏ
qua im lặng. Pending quá hạn cần trạng thái lỗi và chỉ số để vận hành, không
coi DLQ là đã giao notification. Khi đã đủ dữ liệu, tính danh sách recipient
và ghi toàn bộ fan-out + trạng thái resolved trong **một transaction** (phạm
vi tenant MVP); crash trước commit rollback, crash sau commit retry gặp unique
`(source_event_id, user_id, channel)` và inbox. Nếu sau này chia batch, phải
persist recipient plan/cursor rồi mới chuyển resolved, không tái tính audience
khác sau crash.

## Notification schema, scope và quyền

Huy tạo migration **mới** trong `notification_db` cho: recipient projection
(`user_id` PK, tenant, userType, accountStatus, roles, membershipId/customerId/
status/sourceChangedAt, revision BIGINT và timestamp); bootstrap run receipt
(`bootstrapRunId`, tenant, expected/received users, marker, status); pending
source events (`sourceEventId + consumer` unique, tenant, allowlisted payload,
reason, attempts, retry state); và `notifications.customer_id` nullable cộng
index `(tenant_id, user_id, customer_id, created_at DESC)`. Giữ nguyên partial
unique index hiện có `(source_event_id, user_id, channel)` và các CHECK của
`0001_init`. Huy chọn SQL/Prisma cụ thể, kèm ERD và test constraint; Nguyên
review trước migration. `M3-HUY-Q3-REVIEW.md` chưa có trong baseline nên chưa
thể phê duyệt từng dòng proposal đó.

Với CUSTOMER row, lưu `customerId` của SR context ngay khi tạo. List,
unread-count và mark-read cùng kiểm tra tenantId/userId từ principal,
principal.customerId, và current ACTIVE customerMembership của projection đều
khớp row.customerId; thiếu snapshot, inactive hoặc lệch thì fail closed. ID
ngoài scope trả 404. Token cũ có thể còn hiệu lực tối đa 15 phút theo ADR
0003/0004; projection mới chặn đọc ngay khi event revoke đã tới, nhưng không
hứa chặn trước khi event tới. Khẩn cấp thì disable account tại Identity; chưa
có đồng bộ revocation tức thời xuyên service. Không dùng eventual projection
để cấp quyền rộng hơn token.

`notification:read` hiện có trong catalog và draft API, đủ cho GET list,
GET unread-count và PATCH mark-read; không cần role/permission/seed mới.
Gateway chỉ forward bearer/correlation ID; Notification phải tự dùng
`@pbl6/auth`, kiểm tra scope và idempotent PATCH. M3 business audience loại
PLATFORM_STAFF (dù role PLATFORM_ADMIN hiện có `notification:read` trong
catalog); không tạo tenantId-null business rows. Muốn thông báo nền tảng cần
quyết định và contract riêng.

## Q4 — Activation email

Identity tiếp tục sở hữu token một lần, hash và expiry. Quyết định M3: Identity
sở hữu thêm private activation-delivery job, retry và SMTP adapter; **không
phát token hoặc activation link trong RabbitMQ event, Notification row, log hay
API production**. Tạo job cùng transaction với token; idempotency theo
`account_token.id`, payload link được mã hóa ở trạng thái lưu, worker giải mã
trong bộ nhớ, retry với backoff đến khi SENT/EXPIRED, xóa ciphertext khi xong.
SMTP chỉ bảo đảm at-least-once nên một mail có thể được gửi lại với cùng link;
không tạo token mới khi retry. Key/rotation và giới hạn vận hành nằm trong
ADR 0017; migration và worker có ở commit `b96ae03`.

Không có contract chuyển secret sang Notification vì C5 email adapter chuyển
về Nguyên/Identity. Huy giữ Notification in-app C2/C3/C6, review rằng
Notification không nhận/lưu activation token, và phối hợp test end-to-end C5;
task ownership/acceptance C5 cần cập nhật chính thức trong kế hoạch M3.
`compose.demo.yml` đã có Mailpit. Gateway invite tới một tài khoản demo riêng
ngày 03/11 trả 201; Identity worker ghi job `SENT`, ciphertext `NULL` và
Mailpit nhận một thư. Không đưa token/link vào bằng chứng chia sẻ.

## Q6 — Routes, commits và test environment

Gateway đã merge mapping `/api/notifications[/*]` → Notification Service
`/notifications[/*]`, giữ path/query suffix. Gateway nhận mọi HTTP method;
API công khai M3 theo draft `docs/api/notification.yaml` là
`GET /api/notifications`, `GET /api/notifications/unread-count`,
`PATCH /api/notifications/{notificationId}/read`. Mỗi endpoint cần bearer JWT
và `notification:read` ở Notification; Gateway không thay service auth.
`/internal/*` bị Gateway chặn. Route mapping và E2E nằm trong PR #53,
merge commit `79a4568` (baseline có cả PR #55 tại `53a0a6e`).

Hai URL dự kiến của Huy là
`GET /api/service-requests/{srId}/result/attachments` và
`GET /api/service-requests/{srId}/result/attachments/{attachmentId}/download`.
Gateway map đến cùng suffix dưới `/service-requests` và đã có route test,
nhưng `origin/develop` **chưa có controller C4**. WO A4 internal projection
đã merge PR #48, route `/internal/service-request-attachments/*` chỉ dùng
qua service-to-service token và không public. Huy cần merge C4 và chạy SR→WO
qua Gateway trước khi đánh dấu end-to-end PASS.

`compose.demo.yml` + `docs/deployment/m3-demo.md` dựng Identity, Gateway,
RabbitMQ, Work Order, MinIO và Notification scaffold, giữ DB riêng; seed dev
cô lập theo `docs/api/fixtures.md` với `SEED_DEMO_PASSWORD` tự đặt. Private
MinIO signed PUT/GET qua Gateway đã có smoke 02/11; Notification business
consumer chưa có nên **chưa có Q3 end-to-end tới Notification**. Demo bootstrap
tenant `00000000-0000-4000-8000-000000000001` tạo 8 snapshot và 1 marker;
cả 9 outbox row ở trạng thái `PUBLISHED` ngày 03/11. Q4 Gateway→Mailpit đã
chạy thật. Chạy
trên stack/DB test riêng, không reset volume hay dùng seed trên DB chung.

Huy nên cập nhật tối thiểu `origin/develop` `53a0a6e` (PR #53/#54/#55), rồi
review commit `b96ae03` trên `codex/nguyen-m3-integration` trước khi bật C3.
Không có commit/PR đã merge cho Identity recipient producer, bootstrap,
activation delivery, Notification schema hoặc C4 ở baseline này.
