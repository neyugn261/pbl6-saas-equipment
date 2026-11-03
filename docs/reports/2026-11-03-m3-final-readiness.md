# Rà soát tích hợp M3 cuối — 03/11/2026

Đây là kết quả lịch sử tại baseline bên dưới. Hai lỗi marker/build đã được sửa
trên nhánh `fix/notification-bootstrap-prisma-build`; xem
[báo cáo fix và kiểm tra lại](2026-11-03-notification-bootstrap-fix.md).
Không dùng kết quả lỗi của baseline làm trạng thái của bản đã deploy fix.

Baseline: `origin/develop@3bcf42f` (merge `fixdemo`, gồm `32583c7` nối recipient và
PR #58 sửa web). Đã kiểm tra lại source, unit/regression, migration và luồng API
thật. **Chưa đủ điều kiện chốt M3/chuyển M4: còn một lỗi chặn Notification bootstrap.**
Ngoài ra có lỗi chuẩn bị build sạch của Notification cần xử lý khi đóng gói;
local có thể khắc phục bằng bước generate Prisma đã đưa vào runbook.

Kịch bản thao tác đầy đủ: [M3 runbook cho Khương](../demo/m3-complete-runbook.md).
Bằng chứng máy đọc được: [m3-final-api-results.json](../testing/m3-final-api-results.json).

## 1. Lỗi chặn — bootstrap marker không khớp contract

Producer/catalog đã merge đúng theo aggregate bootstrap run:

- [`catalog.ts`](../../packages/event-contracts/src/catalog.ts#L339):
  `NotificationRecipientBootstrapCompleted.v1`, `aggregateType=RecipientBootstrap`.
- [`recipient-bootstrap.ts`](../../apps/identity-service/scripts/recipient-bootstrap.ts#L109):
  `aggregateId=run.id`; payload có `bootstrapRunId=run.id`, envelope có tenantId.

Nhưng consumer tại
[`recipient-projection.service.ts`](../../apps/notification-service/src/events/recipient-projection.service.ts#L544)
chỉ chấp nhận `aggregateType=Tenant` và `aggregateId=tenantId`.
Hai điều kiện đều khác event thật. Binding RabbitMQ mới có hoạt động, nhưng
handler từ chối marker trước transaction bằng lỗi
`Invalid Notification recipient bootstrap marker`.

Tái hiện trong lượt này bằng đúng CLI Identity và các service/broker thật:

```text
recipient_snapshots: 8 user
  5 TENANT_STAFF ACTIVE, 1 TENANT_STAFF INVITED, 2 CUSTOMER ACTIVE
Notification recipient_bootstrap_runs:
  received_users = 8
  expected_users = NULL
  marker_received = false
  status = RUNNING
```

Marker được retry vào queue `notification-service.recipient-bootstrap.retry`,
sau đó đến DLQ theo bounded retry. Business event đã được persist nhưng fan-out
chờ `WAITING_FOR_RECIPIENT_BOOTSTRAP`. Sau một luồng SR/WO đã hoàn tất, customer
inbox vẫn 0 notification; có pending event RETRYING/MANUAL_REVIEW. Identity CLI
báo COMPLETED chỉ chứng minh producer đã enqueue đủ, không chứng minh consumer
đã hoàn thành.

**Đề nghị Huy sửa nhỏ trong Notification, giữ nguyên shared contract/producer:**

1. Validate `aggregateType` theo `Events.NotificationRecipientBootstrapCompleted`
   (`RecipientBootstrap`).
2. Sau khi đọc và validate payload, bắt buộc `aggregateId === payload.bootstrapRunId`.
   Giữ kiểm tra tenantId, producer, version, UUID, timestamp, count và allowlist.
   Không đổi event thành Tenant và không bỏ hẳn kiểm tra aggregate identity.
3. Sửa các fixture bootstrap đang dùng Tenant trong
   [`events.e2e-spec.ts`](../../apps/notification-service/test/db/events.e2e-spec.ts#L148)
   (gồm zero-user case gần dòng 705) để lấy metadata từ catalog.
4. Thêm regression dùng producer/CLI → outbox → RabbitMQ → consumer thật. Bao gồm
   marker đến trước snapshot, replay marker, zero users, aggregateId sai và không
   tạo fan-out trùng khi snapshot/marker được redeliver.
5. Sau merge/rebuild/restart, chạy bootstrap `--new` hoặc replay event gốc đúng
   quy trình owner, xác nhận Notification COMPLETED và pending được reconcile.
   Không dùng SQL đánh dấu COMPLETED và không đổi ID của event cũ để né validation.

Code service của Huy **không bị thay đổi trong lượt audit này**; đây là finding
và yêu cầu sửa cụ thể để owner xử lý, không phải bản fix đã merge.

## 2. Vì sao test và CI vẫn xanh

Hai job của [CI baseline](https://github.com/neyugn261/pbl6-saas-equipment/actions/runs/41558887120)
đều `completed/success` lúc kiểm tra. Tại local, Notification có 43 unit, 6 app E2E
và 16 DB/broker tests PASS. Tuy nhiên DB fixture tự tạo marker Tenant giống
consumer, thay vì metadata RecipientBootstrap từ producer. Test mới về dispatch
chứng minh subscribe/handler, chưa chứng minh producer marker được projection chấp nhận.
Do đó CI xanh chưa đủ cho nghiệm thu tích hợp.

## 3. Các phần đã chạy lại và đạt

Môi trường kiểm tra độc lập: một PostgreSQL 17 mới chứa các logical DB riêng,
một RabbitMQ 4 mới, một Mailpit riêng; 8 backend và Gateway chạy cổng 4100–4108.
Các seed chỉ ghi database của chính service; nghiệp vụ liên dịch vụ đi qua
API/event thật. Storage dùng một bucket audit mới trên MinIO local, không dùng
bucket nghiệp vụ của người dùng. Không migration/seed/reset vào các DB dev hiện có,
không ghi đè `.env` của repository.

| Hạng mục | Kết quả thực chạy |
|---|---|
| Build 4 shared packages | PASS; build lại trước dùng event catalog mới |
| Build 8 backend + Gateway | PASS; Notification cần generate Prisma riêng trước build |
| Migration 8 service | PASS; chạy lần hai không có migration chờ |
| Database → schema drift 8 service | PASS 8/8, exit code 0 trên database đã migration |
| Unit 9 backend/Gateway | PASS 268/268: Identity 16, Organization 15, Asset 18, SR 81, WO 44, Maintenance 19, Inventory 24, Notification 43, Gateway 8 |
| Web regression | PASS 27/27, gồm Notification URL và exact replay stock intent |
| Notification lint/typecheck | PASS |
| Notification application E2E | PASS 6/6 |
| Notification DB + real RabbitMQ suite | PASS 16/16; lưu ý contract gap ở mục 2 |
| Web lint/typecheck/build | PASS; Vite vẫn cảnh báo JS chunk lớn |
| Health 8 backend + Gateway | HTTP 200 trên stack audit |
| Demo role login | Cả 7 tài khoản ACTIVE đăng nhập đúng DEMO |
| Customer scope | Asset của customer 02 trả 404; Inventory trả 403 |
| SR → WO | Customer tạo SR, manager review/accept/create WO, dispatcher assign, Technician accept/travel/start: PASS |
| Inventory ↔ WO | ISSUE 6.00, settlement SETTLED, replay cùng key/body trả cùng usage: PASS |
| WO complete → SR | Report hoàn tất, event thật đưa SR về RESOLVED với customerSummary: PASS |
| Part return + actual use | RETURN GOOD 1.00, Technician confirm-use 5.00 gắn đúng report: PASS qua API |
| File kết quả | Technician upload INTERNAL → complete → report upload → manager publish CUSTOMER → customer list/download qua SR → Gateway → MinIO đúng byte: PASS |
| Chặn file nội bộ | INTERNAL không nằm trong customer list; dùng ID INTERNAL tại SR download trả 404; CUSTOMER gọi WO trực tiếp trả 403 |
| Customer confirm | SR CLOSED: PASS |
| A5 summary | Endpoint thật trả created=2, completed=1, status counts đúng. WO thứ hai do Maintenance seed/scheduler tạo; không giả định summary chỉ có WO luồng chính |
| Activation | Invite qua Gateway không lộ token, Identity → SMTP Mailpit → activation ACTIVE: PASS. Delivery SENT và ciphertext đã NULL |
| Notification mới | Snapshot queue nhận đủ; marker FAIL, bootstrap RUNNING, customer fan-out FAIL. Read/mark và LowStock inbox chưa được nghiệm thu trên luồng thật vì blocker |

## 4. Điều kiện vận hành phát hiện trong rehearsal

- **P1 — Notification build từ checkout sạch:** script `build` chỉ chạy
  `nest build`, không generate Prisma như các backend khác. Đã copy source sang
  thư mục kiểm tra không có `src/generated`: build FAIL với TS2307 thiếu
  `generated/prisma/client.js`; chạy `prisma:generate` rồi build thì PASS.
  `backend.Dockerfile` chỉ install rồi build apps, chưa có bước generate toàn bộ.
  Vì generated client không nằm trong Git, suy ra build image từ checkout sạch
  có thể bị lỗi này; lượt audit **không build lại toàn bộ Docker image**.
  Nguyên/Huy nên thêm generate vào build Notification hoặc pipeline image và
  thử lại từ source sạch, tránh phụ thuộc generated file có sẵn trên máy owner.
- Shared packages/dist và Prisma client local có thể cũ sau pull. Lần thử đầu
  Notification unit thiếu event constant do dist cũ; build shared giải quyết.
  Build Notification trước generate Prisma cũng lỗi thiếu model; generate lại
  giải quyết. Đây là bước chuẩn bị môi trường, không phải kết luận source sai.
- `.env` local hiện chưa có đủ activation encryption/SMTP và MINIO_REGION để
  bật toàn bộ demo file/email. Audit dùng env riêng hợp lệ; runbook chỉ rõ cách
  bổ sung, không tự sửa secret/cấu hình của người dùng.
- Mật khẩu activation phải đủ hoa/thường/số/ký tự đặc biệt, 8–128 ký tự. Một
  SEED_DEMO_PASSWORD chỉ thỏa điều kiện seed chưa chắc thỏa policy activation.
- Có unique-key retry khi nhiều snapshot đồng thời tạo bootstrap run đầu tiên;
  shared retry đã phục hồi, cuối cùng nhận đủ 8 snapshot. Đây là điểm hardening
  bổ sung cho Huy (atomic create/upsert/serialization), không phải nguyên nhân
  marker luôn thất bại và không thay thế việc sửa mục 1.
- Một số tài liệu cũ còn nói chưa có catalog/consumer hoặc Inventory/Notification
  chỉ scaffold. Đọc theo commit/code mới và báo cáo này; không dùng mô tả cũ làm
  bằng chứng stage hiện tại.

## 5. Phần chưa thể ghi nhận nghiệm thu

Lượt này chưa chạy browser DOM hoặc Android trên baseline mới. Bảng 27 ca Web
M3 còn NOT RUN; không tự chuyển thành PASS từ API script hoặc Node hook host.
Handover wizard/QR, báo giá ngoài bảo hành và điều hướng Maintenance cần rehearsal
UI theo runbook. Không có bằng chứng mới cho sự cố mạng/session trên thiết bị.

`/app/dashboard` vẫn dùng SampleDashboardPage với số/offset hardcode; phần báo
cáo thật hiện ở `/app/reports`. Đây là giới hạn trình diễn cần nói rõ, không coi
các KPI mẫu là kết quả database. Form Inventory M3 chưa có control confirm-use;
backend confirm-use đã chạy qua API, không tuyên bố đã thao tác được từ UI.

## 6. Thứ tự để chốt

1. **Huy:** sửa marker/fixture, thêm regression từ producer thật và merge.
   **Nguyên/Huy:** hoàn thiện bước generate cho clean build trước khi đóng gói
   stack demo Docker; local dùng generate rõ ràng như runbook.
2. **Khương + Huy/Nguyên:** chạy bootstrap trên stack demo sau khi bind queue;
   xác nhận completed, replay pending, inbox/read/unread, assignment/LowStock và
   customer-safe link. Phần source lỗi không thể xử lý chỉ bằng restart/`--new`.
3. **Khương + Hatsady:** chạy toàn bộ kịch bản UI chính và các nhánh bổ sung;
   cập nhật actual results/ảnh trong acceptance matrix, đặc biệt file CUSTOMER
   và retry sau mất phản hồi. Kiểm tra dashboard/sample giới hạn đã được nhóm chấp nhận.
4. **Nguyên:** xác nhận email, storage origin và Android theo môi trường trình diễn;
   người khác dựng lại runbook, không chỉ owner tự chạy.
5. Nhóm review evidence trên commit cuối, CI xanh, thống nhất các phần chưa chạy
   hoặc chuyển scope trước khi đề nghị `develop → main` và bắt đầu M4.
