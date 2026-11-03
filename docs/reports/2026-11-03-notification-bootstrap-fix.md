# M3 — Fix recipient bootstrap và build sạch Notification

Nhánh `fix/notification-bootstrap-prisma-build`, base `develop@de0786d` sau PR #59.
Khương yêu cầu sửa hai blocker đã tái hiện trong
[báo cáo baseline](2026-11-03-m3-final-readiness.md). Không thay contract, schema,
migration, role hoặc dependency; không thay dữ liệu demo/`.env` đang có của nhóm.

## Thay đổi

- Consumer dùng `Events.NotificationRecipientBootstrapCompleted` để kiểm tra
  type/version/producer/aggregate type, và bắt buộc `aggregateId` bằng run ID đã
  validate trong payload. Tenant scope vẫn nằm trong `tenantId`; giữ allowlist,
  UUID, count, timestamp và các kiểm tra scope/idempotency hiện hành.
- DB fixtures lấy metadata từ catalog, gồm marker-first và zero-user bootstrap,
  thay cho tự dựng Tenant aggregate sai với Identity producer.
- Unit regression xác nhận catalog marker hợp lệ đi vào transaction và từ chối
  Tenant aggregate, tenant ID thay run ID, run khác, producer/version/tenant/event
  ID/payload sai trước persistence.
- Broker regression phát business event trước bootstrap, nhận snapshot trước
  marker, hoàn thành bootstrap rồi giải phóng pending fan-out, kể cả backlog
  WAITING_FOR_RECIPIENT_BOOTSTRAP đã ở MANUAL_REVIEW với retry time tương lai. Redelivery cùng
  snapshot/marker/business event vẫn giữ hai receipts và hai notification đúng
  manager/requester. Queue/exchange có suffix test riêng và được dọn sau test.
- `notification-service build` chạy `prisma generate --no-hints && nest build`,
  cùng cách các backend khác chuẩn bị Prisma. Dockerfile đang gọi build script
  từng app nên thừa hưởng bước này, không cần sửa Dockerfile hay tạo dependency.

## Kiểm tra thực chạy

| Check | Kết quả |
|---|---|
| Notification lint + typecheck | PASS |
| Notification unit | PASS 57/57 |
| Notification application E2E | PASS 6/6 |
| Notification DB/RabbitMQ E2E | PASS 17/17; broker riêng, không skip transport case |
| Build source sạch | PASS: copy source/schema/config không có generated, dist hoặc tsbuildinfo; gọi đúng package build script, không generate thủ công trước; tạo được src/generated và dist/main.js cùng compiled Prisma client |
| Identity bootstrap CLI thật | PASS: owner seed tạo 8 user DEMO trong Identity DB riêng; CLI → transactional outbox/relay → RabbitMQ → Notification runtime; expected=8, received=8, marker_received=true, status=COMPLETED |
| Marker Identity thật | Outbox dùng RecipientBootstrap và aggregate ID bằng bootstrap run; được consumer runtime chấp nhận |
| Fan-out trên runtime | Phát một ServiceRequestCreated catalog event trên broker riêng, dùng requester DEMO thật; có đúng 3 notification cho requester, SERVICE_MANAGER, DISPATCHER |
| Gateway API | Customer list UNREAD có đúng item SERVICE_REQUEST; unread 1 → 0 sau mark-read; replay PATCH giữ readAt; customer PATCH notification của manager trả 404 |
| Runtime replay | Phát lại snapshot/marker lấy từ outbox Identity thật và business event cùng eventId; số notification không tăng |

Bằng chứng máy đọc: [notification-bootstrap-fix-results.json](../testing/notification-bootstrap-fix-results.json).
Môi trường test là PostgreSQL/RabbitMQ riêng, Identity/Notification/Gateway riêng
ở cổng 14301/14305/14300. Business event runtime là dữ liệu test phát theo catalog;
lượt này không chạy lại toàn bộ quy trình SR/WO/Inventory hoặc trình duyệt/Android.
Không build lại full backend Docker image; clean service build xác nhận script
được Dockerfile gọi đã tự chuẩn bị Prisma. Compose/image và UI vẫn nghiệm thu
riêng theo [runbook](../demo/m3-complete-runbook.md).

## Sau merge — khôi phục stack demo hiện có

1. Dừng backend watch trước khi build; pull code đã merge, build shared packages
   nếu cần và build lại Notification:

   ```bash
   pnpm build:packages
   pnpm --filter notification-service build
   pnpm dev:backend
   ```

   Với Docker, build image backend từ commit mới và recreate Notification theo
   deployment runbook. Không chạy process từ image/dist cũ.
2. Chờ Notification healthy và hai queue recipient có consumer trên broker đúng.
3. Với run cũ đã enqueue marker sai trước fix hoặc vào DLQ, recapture DEMO:

   ```bash
   pnpm --filter identity-service recipient:bootstrap 00000000-0000-4000-8000-000000000001 --new
   ```

   CLI có bước generate client Identity; đây không phải wrapper build/xóa dist.
   Nếu Identity còn một run RUNNING thật, phải xử lý/resume run đó trước khi `--new`.
4. Kiểm tra **Notification DB** có run mới nhất COMPLETED, marker_received=t và
   expected_users=received_users; không chỉ dựa vào CLI Identity báo COMPLETED.
   Không bắt buộc bằng 8 nếu stack đã mời thêm user.
5. Kiểm tra pending WAITING_FOR_RECIPIENT_BOOTSTRAP được reconcile và inbox có
   thông báo đúng người. Một bootstrap mới không xóa run cũ hay message DLQ cũ;
   owner đối soát/replay theo quy trình, không sửa SQL thành COMPLETED hoặc đổi
   metadata/eventId của event cũ để làm nó được chấp nhận.
6. Chạy tiếp rehearsal UI trong runbook M3; việc sửa hai blocker không tự đánh
   dấu các ca browser/API/Android chưa chạy thành PASS.
