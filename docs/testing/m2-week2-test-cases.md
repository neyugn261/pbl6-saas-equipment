# M2 — Bằng chứng kiểm thử tuần 2

Ngày chạy: 2026-10-26, local Linux/Node 24/pnpm 11, PostgreSQL và RabbitMQ
Docker. Code `687d911`, fix UUID `0b9405f`, baseline develop `b8935d1`.
PR/CI mới theo dõi tại [kế hoạch tuần 2](../planning/m2-khuong-week-2.md).

## Kiểm tra đã chạy

| Lệnh | Kết quả và phạm vi |
| --- | --- |
| `pnpm lint` | PASS toàn workspace, không warning |
| `pnpm typecheck` | PASS toàn workspace |
| `pnpm test` với RABBITMQ_TEST_URL | PASS 183 tests, có transport RabbitMQ thật |
| `pnpm build` | PASS toàn workspace |
| `pnpm --filter workorder-service test:e2e` | PASS 2 bootstrap tests; fake DB |
| `pnpm --filter workorder-service test:e2e:db` | PASS 58 (17 tuần 1 + 41 tuần 2); PostgreSQL thật, upstream fake theo contract |
| `pnpm --filter workorder-service db:check-drift` | PASS, No difference detected; không đổi schema/migration |
| `pnpm smoke:m1` | PASS regression Gateway/Identity/Organization/Asset/SR |
| `pnpm smoke:m2:week1` | PASS profile/reference/create/outbox/scope; WO-2026-0009 |
| `pnpm smoke:m2:week2` | PASS năm ca dưới đây, sáu service và RabbitMQ thật |
| `node scripts/repro-h4-stale-workorder.cjs` | KNOWN FAIL exit 1: event WO cũ đổi SR PROCESSING → ACCEPTED; Huy sửa |

Các lệnh dùng env từ file local, không ghi token/password vào bằng chứng.
DB suite áp migration/truncate **chỉ workorder_test_db** với requireTestDatabaseUrl.
Một lượt chạy DB bị ENOENT do chạy cùng lúc typecheck đang build lại packages;
đã chạy lại sau build/typecheck, 58/58 PASS. Không phải lỗi nghiệp vụ được che đi.
Lượt smoke đầu gặp Gateway 429 vì tổng số login vượt 10/15 phút; đã chạy lại
**liên tiếp M1 + tuần 1 + tuần 2** với LOGIN_RATE_LIMIT=50 chỉ ở stack kiểm thử,
cả ba PASS. CI smoke dùng cùng cấu hình; mặc định Gateway không thay đổi.

## Ma trận DB/concurrency quan trọng

- Workflow đầy đủ và direct start; reject/reassign giữ history; management log
  actor đúng, không giả Technician; startedAt không bị ghi lại khi resume.
- Scope tenant/customer/technician: unrelated → 404, customer → 403; technician
  từng được giao đọc được history/report nhưng không thực hiện assignment mới.
- OR hold/resume/log, DTO thiếu/null/field lạ; invalid transition → 409;
  allowedActions theo trạng thái và quyền, backend kiểm tra lại dưới khóa.
- Nhiều WO/technician: BUSY theo ACCEPTED còn lại, giữ OFF_DUTY/INACTIVE;
  concurrent assign/accept/complete; crossed reassignments có UUID mixed-case.
- Complete/cancel race: một terminal result/event; ép lỗi insert outbox kiểm tra
  rollback report/assignment/WO/history/technician.
- Cancel API cả sáu trạng thái chưa terminal; default false; Maintenance true
  bị từ chối; consumer tự cancel ba trạng thái đầu và giữ ba trạng thái underway.
- Duplicate inbox, sai tenant/reference, rollback inbox rồi corrected retry;
  cancel trước/sau create; pg_stat_activity xác nhận consumer đang chờ cùng
  source advisory lock khi create giữ khóa bằng UUID viết hoa; start-travel/cancel race.

Đây là kiểm thử WO với upstream fake, không chứng minh H4 của SR đã hết lỗi.

## Smoke HTTP qua Gateway và broker thật

Identity, Organization, Asset, Service Request, Work Order và Gateway chạy từ
bản build local; event outbox/consumer dùng RabbitMQ thật, mỗi service ghi DB
của mình. Chờ theo trạng thái, không giả định event xử lý tức thì. Có kiểm tra
customer không đọc report và summary không chứa marker chẩn đoán nội bộ.

| Ca | SR ID | WO ID | Số WO |
| --- | --- | --- | --- |
| RESOLVED confirm | `ba2cc8e0-13f2-4e4b-9887-f44df63d9e34` | `7f8ab54d-b696-45be-8269-528bc104c40c` | WO-2026-0010 |
| PARTIALLY_RESOLVED reopen | `c51be589-b458-4454-ae09-1a26d326b2e8` | `ae508639-0d6a-4162-b060-8047cffa6a96` | WO-2026-0011 |
| UNRESOLVED | `96e5e15b-7d1e-4376-a97e-f57215324f53` | `31bad83b-15bf-467a-8b77-5c09e8a762e6` | WO-2026-0012 |
| cancelServiceRequest=false | `99a66809-029a-4217-8933-7d9ed28fb191` | `162e9b63-23c9-4a66-b34f-0d0192e1d5a8` | WO-2026-0013 |
| cancelServiceRequest=true | `40ab033e-c9e6-4f44-a1cd-d5d1533ba2fc` | `b3976cf8-0b01-4625-b7ae-6ea1fea1d450` | WO-2026-0014 |

Technician fixture: `88dbebae-1d53-4f4a-ac85-9b6fd6452763`.
Các record smoke giữ trong local demo DB, không phải fixtures trên CI/máy khác.
Script có thể chạy lại; mỗi lần tạo SR/WO mới bằng API, không truncate business DB.

## Giới hạn nghiệm thu

- [H4](h4-stale-work-order-events.md) là diagnostic consumer thật + persistence
  double; đã tái hiện nhưng chưa sửa, không tính vào 183 hoặc 58 test PASS.
- Reopen smoke dừng ở SR ACCEPTED; **không tạo WO thay thế**. Luồng thay thế và
  event WO cũ phải được Huy sửa, kiểm chứng riêng trước nghiệm thu.
- Consumer SR cancellation kiểm chứng bằng DB suite và wiring chạy broker;
  public SR API không cho cancel khi PROCESSING. Không giả vờ smoke đã có ca
  public API gây auto-cancel một WO underway.
- Chưa chạy Android APK/UI web, ngoài bảo hành/Estimate, Asset history,
  Maintenance K6 hoặc upload K8. API backend đạt không thay các đầu ra này.
- Review/merge PR tuần 2 còn chờ; không tự suy diễn owner đã duyệt.
