# M2 tuần 1 — Kết quả kiểm tra Work Order

- Ngày chạy: **2026-10-26**.
- Code nghiệp vụ: **`2aecbe7`**, dependency: **`cf54470`**.
- Môi trường: local, Node **24.20.0**, PostgreSQL **17** và RabbitMQ **4** qua
  Docker Compose; sáu service NestJS chạy bản build thật.
- Trạng thái: **kiểm tra local và hai job CI GitHub đã đạt**; chưa phải nghiệm
  thu M2 toàn nhóm. Không có kết quả assignment/complete/Maintenance.
- PR: [dependency #20](https://github.com/neyugn261/pbl6-saas-equipment/pull/20),
  [implementation #21](https://github.com/neyugn261/pbl6-saas-equipment/pull/21),
  đều draft; implementation dựa trên nhánh dependency, chưa merge.

## 1. Lệnh và kết quả

| Phạm vi | Lệnh | Kết quả |
| --- | --- | --- |
| Lint toàn repo | `pnpm lint` | Pass |
| Typecheck toàn repo | `pnpm typecheck` | Pass |
| Test toàn repo | `pnpm test`, có `RABBITMQ_TEST_URL` trỏ broker local | Pass: 183 test, gồm publish/retry/DLQ trên exchange test riêng |
| Build toàn repo | `pnpm build` | Pass |
| Bootstrap WO | `pnpm --filter workorder-service test:e2e` | Pass: 2 test |
| DB WO | `pnpm --filter workorder-service test:e2e:db`, có `WORKORDER_TEST_DATABASE_URL` | Pass: 16 test, migrate/truncate chỉ trên `workorder_test_db` |
| Migration | `pnpm db:migrate` | Pass: cả 8 service không còn migration chờ áp dụng |
| Drift WO | `pnpm --filter workorder-service db:check-drift` | Pass: No difference detected |
| Regression M1 | `pnpm smoke:m1` | Pass: account flows, Gateway và luồng SR tới ACCEPTED |
| Luồng tuần 1 | `pnpm smoke:m2:week1` | Pass: profile + create WO + event thật + scope |
| CI dependency | [Run 40332043876](https://github.com/neyugn261/pbl6-saas-equipment/actions/runs/40332043876), commit `cf54470` | Pass cả hai job |
| CI implementation | [Run 40332441109](https://github.com/neyugn261/pbl6-saas-equipment/actions/runs/40332441109), commit `7e4aa75` (code nghiệp vụ `2aecbe7`) | Pass cả hai job, gồm WO DB suite và smoke M1 + M2 tuần 1 |

Trong phiên local, lệnh test/smoke được gọi qua wrapper tạm đọc `.env` vào
process env mà không in credential. Wrapper đặt test URL về `workorder_test_db`
và `RABBITMQ_TEST_URL` theo broker local. Không commit wrapper hoặc secret;
khi chạy lại, đặt các biến tương ứng trong shell/CI theo `.env.example`.

DB suite dùng upstream giả được khai báo rõ qua DI, còn DB là thật. Chỉ smoke
ở mục 3 xác nhận đường gọi liên service và RabbitMQ thật; không nhầm hai mức
kiểm chứng. Unit WO có 5 test về env và HTTP forwarding/lỗi upstream, đã nằm
trong tổng 183 test ở trên.

## 2. Các nhóm ca được bao phủ

| ID | Ca kiểm tra | Bằng chứng | Kết quả |
| --- | --- | --- | --- |
| W1-BOOT | Health public, DB down → 503, correlation ID, global auth và quyền write | `apps/workorder-service/test/app.e2e-spec.ts` | Pass |
| W1-ENV | Thiếu/sai URL, secret/port không hợp lệ, production thiếu broker | `src/config/env.validation.spec.ts` trong WO | Pass |
| W1-HTTP | Forward bearer/correlation ID tới đúng internal API, 404 → null, outage không fallback | `src/references/references.client.spec.ts` trong WO | Pass |
| W1-TECH | Tạo/list/me; user sai tenant/role, branch không active, uniqueness, null/field lạ, sai quyền | DB suite | Pass |
| W1-SKILL | Thay skill nguyên tử, skill tenant khác, trùng skill, level sai kiểu/phạm vi, không mất danh sách cũ khi lỗi | DB suite | Pass |
| W1-CREATE | Snapshot đúng, số WO, history/work log và outbox hợp lệ, giữ correlation ID | DB suite | Pass |
| W1-CONCURRENT | Ba request cùng SR → 1×201 và 2×409; các SR khác nhau cấp số WO không trùng | DB suite | Pass |
| W1-ROLLBACK | Ép ghi outbox thất bại bằng CHECK tạm trong test DB; WO/sequence/history/log đều rollback; constraint test được gỡ trong finally | DB suite | Pass |
| W1-REF | SR không tồn tại/chưa ACCEPTED, Equipment sai customer, upstream outage → lỗi đúng và không ghi dở dang | DB suite | Pass |
| W1-SCHEDULE | End ≤ start, lịch khi patch một phần, date thiếu timezone, null sai trường; terminal WO không sửa được | DB suite | Pass |
| W1-SCOPE | Tenant khác 404; Customer 403; Technician đọc theo assignment cũ/hiện tại; mine và filter không nới scope; internal reference tối thiểu | DB suite và smoke | Pass |
| W1-LIST | Status/filter/pagination, priority sort theo nghiệp vụ và q coi `%` là ký tự thường | DB suite | Pass |
| W1-D11 | AVAILABLE đổi thành BUSY khi còn ACCEPTED assignment; không gán BUSY trực tiếp; patch trường khác giữ OFF_DUTY | DB suite | Pass |
| W1-GATEWAY | Chặn internal; thiếu token 401; Customer 403; Technician chưa được giao 404 | Smoke Gateway thật | Pass |
| W1-EVENT | SR ACCEPTED → WO CREATED → outbox/RabbitMQ → consumer SR → PROCESSING | Smoke sáu service thật | Pass |

DB suite đầy đủ: [week1.e2e-spec.ts](../../apps/workorder-service/test/db/week1.e2e-spec.ts).

## 3. Smoke thật gần nhất

Chạy sau khi build toàn repo và khởi động lại stack từ code cuối. Các bước:

1. Đăng nhập Service Manager, Technician và Customer qua Identity/Gateway.
2. Xác thực profile Technician; tạo qua API với Identity/Organization reference
   thật khi chưa có, lần chạy sau dùng lại profile.
3. Customer chọn equipment trong bảo hành; tạo SR, manager review rồi accept.
4. Tạo WO qua `/api/workorders/work-orders`, đọc detail/history; tạo lặp bị 409.
5. Poll SR qua API đến khi PROCESSING: xác nhận Created v1 đi qua broker thật.
6. Kiểm tra auth/customer/technician scope và chặn internal qua Gateway.

| Entity | Giá trị của lần chạy cuối |
| --- | --- |
| Service Request | `9fc72550-f5a6-4526-9ac9-974061897f62` |
| Work Order | `c27d3161-c7ed-4c25-bced-40fcac5daef6` |
| Số WO | `WO-2026-0002` |
| Technician profile | `88dbebae-1d53-4f4a-ac85-9b6fd6452763` |
| Kết quả | WO CREATED; SR PROCESSING; profile được dùng lại khi chạy smoke lần hai |

Các ID là dữ liệu demo local, không phải fixture cố định cho máy/CI khác.
Script giữ SR/WO làm bằng chứng. Không có token/password trong tài liệu.

## 4. Chưa được kiểm chứng trong tuần 1

- Consumer hủy SR và race create/cancel (K5); helper khóa và thứ tự thực hiện
  đã chuẩn bị, chưa có cancel consumer để kiểm thử end-to-end.
- Workflow assignment/execute/complete/report (K4), WO bảo trì và thay thế (K6).
- Event cũ của WO trước không ghi đè trạng thái WO mới ở consumer SR; còn phối
  hợp Huy trước nghiệm thu nhánh thay thế.
- Review Nguyên/consumer và merge cho thay đổi dùng chung còn chờ. CI đã được
  xác minh qua các run ở mục 1, không suy ra từ test local; trạng thái head mới
  nhất tiếp tục xem trong Checks của PR.

## 5. Chạy lại và bàn giao

Xem [README WO](../../apps/workorder-service/README.md) để cấu hình/test/smoke.
Đặt `SEED_DEMO_PASSWORD` từ local `.env` vào shell, không chép giá trị vào log
hoặc source. Các owner seed DB của mình; WO không đọc trực tiếp DB của họ.

Mỗi lần chạy lại bổ sung commit, môi trường và kết quả mới thay vì ghi đè
bằng chứng cũ. Kết quả CI remote ghi riêng với URL của run tương ứng.
