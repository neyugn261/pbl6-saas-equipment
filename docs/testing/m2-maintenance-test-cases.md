# K6 — Bằng chứng tạo WO từ Maintenance Task

Ngày 2026-10-27; baseline develop `988dbe0`, code K6 `d658a56`.
Node 24.20 / pnpm 11.26 / PostgreSQL 17 / RabbitMQ 4 trên local Docker.
[Kế hoạch tuần 3](../planning/m2-khuong-week-3.md).
PR implementation [#26](https://github.com/neyugn261/pbl6-saas-equipment/pull/26),
queue documentation [#27](https://github.com/neyugn261/pbl6-saas-equipment/pull/27),
cùng base develop; CI mới nhất xem Checks từng PR.

## Kết quả đã chạy

| Kiểm tra | Kết quả |
| --- | --- |
| `pnpm lint`, `pnpm typecheck`, `pnpm build` | PASS toàn workspace |
| `pnpm test` với RABBITMQ_TEST_URL | PASS 183 tests, gồm transport broker thật |
| `pnpm --filter workorder-service test:e2e` | PASS 2 bootstrap tests; fake DB |
| `pnpm --filter workorder-service test:e2e:db` | PASS 79 tests: 17 tuần 1 + 41 tuần 2 + 21 K6 |
| `pnpm --filter workorder-service db:check-drift` | PASS, No difference detected; không đổi schema/migration |
| `pnpm smoke:m1` | PASS Gateway/Identity/Organization/Asset/SR regression |
| `pnpm smoke:m2:week1` | PASS profile/SR → WO → SR PROCESSING |
| `pnpm smoke:m2:week2` | PASS workflow/report/summary/confirm/reopen và 2 cancellation intents |
| `node apps/workorder-service/test/maintenance-smoke.cjs` | PASS real RabbitMQ → WO → Gateway workflow → Completed/Cancelled v2; producer Maintenance là fixture |

Các smoke chạy cùng sáu service thật; Gateway dùng LOGIN_RATE_LIMIT=50 riêng
cho stack kiểm thử. Lượt typecheck đầu phát hiện callback trả InboxResult khác
Promise<void>; đã sửa callback await rồi chạy lại lint/typecheck/build đạt.
Không sửa schema hoặc thêm dependency; giữ checksum migration đã merge.

## PostgreSQL suite K6 (21 ca)

- Atomic snapshot/sequence/WO/history/inbox/outbox, correlation ID; null actor,
  không log hệ thống; không gọi HTTP upstream bằng token giả.
- Duplicate cùng event ID chạy đồng thời; nhiều ID cho một task, gồm UUID viết
  hoa/thường; không cấp số/history/outbox thứ hai.
- Replay không ghi đè snapshot/lịch đã có; site/correlation null hợp lệ.
- Due replay sau CANCELLED không tự tạo replacement; COMPLETED vẫn chặn WO mới.
- Constraint thật vẫn cho phép WO thay thế sau CANCELLED, chặn sau COMPLETED;
  ca này thao tác **chỉ DB test**, chưa chứng minh đã có API yêu cầu thay thế.
- Task trùng UUID nhưng khác tenant bị từ chối; inbox rollback rồi retry đúng.
- Tenant null, producer/aggregate sai, payload lỗi, ngày không có thật, non-leap
  day/year zero bị từ chối trước inbox/sequence; leap day hợp lệ lưu đúng +07.
- Ép lỗi outbox kiểm tra rollback inbox/sequence/WO/history và retry cùng event.
- Cấp số WO đồng thời cho nguồn SR và Maintenance trong cùng tenant không trùng.
- Nguồn Maintenance tuân tenant/assignment/customer read scope hiện hành.

DB suite dùng workorder_test_db và requireTestDatabaseUrl; truncate chỉ DB test.
Upstream explicit fake; event đưa trực tiếp vào consumer thật. Không truy cập
maintenance_db, asset_db hoặc service_request_db từ Work Order.

## Smoke broker/Gateway

Fixture script phát MaintenanceTaskDue v1 theo contract trên RabbitMQ thật;
WO service đang chạy tự consume/inbox/create/outbox/relay. Script quan sát
Created v1 và Complete/Cancel v2 qua một queue riêng; xóa queue observer/retry/
DLQ của script sau khi kết thúc, không xóa queue nghiệp vụ.

| Ca | Task ID | WO ID | Số WO |
| --- | --- | --- | --- |
| completed | `ac1bd6dc-b9b6-4d52-a12d-20f2cabe27e1` | `bdb2985a-a6a9-44cf-ac87-a7054ae636f2` | WO-2026-0021 |
| cancelled | `e51b694a-fc4d-4277-a014-668febc93de9` | `1b3e2725-fa61-4fa9-8a59-e133c44962b8` | WO-2026-0022 |

Smoke xác nhận createdBy/history actor null, không log hệ thống, snapshot và
calendar date đúng; technician hoàn thành WO bảo trì, customer không đọc WO.
Sau publish replay, sentinel chứng minh consumer vẫn hoạt động và các WO quan
sát vẫn giữ trạng thái; DB suite mới là bằng chứng chính xác cho inbox/replay.
Record smoke giữ trong local demo DB, không phải fixtures chung của CI.

## Chưa nghiệm thu

- Maintenance scheduler/Task consumer thật: service của Minh còn scaffold ở
  baseline; fixture producer không thay bằng chứng tích hợp với producer thật.
- WO thay thế do Service Manager yêu cầu, thứ tự event cũ/mới trên Task,
  snapshot sau EquipmentMoved, Task COMPLETED/PENDING và Asset history.
- H4 của SR chưa sửa trong PR này; scope và bàn giao giữ nguyên cho Huy.
- UI Web/Android, ngoài bảo hành/Estimate, K8/upload chưa thuộc kiểm thử này.
- Smoke Maintenance riêng hiện chạy local; CI DB suite sẽ tự chạy 21 ca mới.
  Kết quả CI mới theo dõi trong Checks của PR, không suy từ local PASS.
