# Nghiệm thu chính sách dịch vụ theo Model

Ngày: 2026-11-04. Branch: `feature/model-service-policies`.
Base `b19ce17` (`origin/develop`, PR #61); implementation commits `cff656f` và `3f1229e` (sửa phạm vi nguyên nhân bảo hành).
Bản sửa được kiểm qua API: nguyên nhân ngoài `coveredCauses` có thể được kết luận
NOT_COVERED kèm bằng chứng, kể cả khi không có thêm điều khoản loại trừ riêng. Không thực hiện merge hoặc deploy môi trường người dùng.

## Kết quả local đã xác nhận

| Kiểm tra | Kết quả |
| --- | --- |
| `pnpm build` | PASS toàn workspace; Web có cảnh báo chunk >500 KB |
| `pnpm lint` | PASS toàn workspace |
| `pnpm typecheck` toàn workspace | PASS |
| `pnpm -r --if-present test` với RabbitMQ test thật | 426 PASS, 0 FAIL, 0 SKIP |
| Asset DB integration | 34 PASS |
| Maintenance DB integration | 18 PASS |
| Work Order DB integration | 231 PASS |
| Service Request DB integration | 69 PASS |
| Inventory DB integration | 33 PASS |
| Notification DB integration | 17 PASS |
| Migration 8 service, chạy hai lần trên DB test | PASS, lần hai không có pending |
| Identity permission seed, chạy hai lần trên DB test | PASS |
| Drift migration → schema, 4 service thay đổi | PASS |
| Drift live test DB → schema, 4 service thay đổi | PASS |
| `flutter analyze` | PASS, không còn issue |
| `flutter test` | 109 PASS, 2 SKIP, 0 FAIL |
| `pnpm test:model-policies` + backend failure injection | PASS trên `3f1229e` |
| Chromium desktop + viewport 390px, Identity/Gateway/DB/broker thật | PASS |
| Android emulator API 36, app debug + Gateway thật | PASS lưu checklist và hoàn tất Service Report |

Sau bản sửa phạm vi nguyên nhân, Service Request đã chạy lại typecheck/lint,
85 unit test và toàn tuyến API bằng root integration command. Web/Android UAT
được chạy trên phần giao diện/nghiệp vụ của `cff656f`; bản sửa bổ sung không thay UI.

Hai Flutter test bỏ qua là `backend_reads_smoke_test.dart` và
`n5_backend_smoke_test.dart`: thiếu biến môi trường của fixture N5/N6 cũ.
Suite Android mới vẫn thực chạy đăng nhập Identity, nhận/bắt đầu WO bảo trì,
lưu checklist, gửi báo cáo và đối chiếu trạng thái COMPLETED ở backend.

Môi trường: Node 24.20.0, pnpm 11.26, PostgreSQL 17, RabbitMQ 4,
Flutter 3.47.4 / Dart 3.13.3. Không reset/seed DB demo/chung. Test script chặn tên
DB ngoài phạm vi test. Fixture ngẫu nhiên còn lại chỉ trong DB test; RabbitMQ
exchange/queues của suite được dọn sau khi chạy.

## Bằng chứng theo nhóm task

| Task | Kết quả trong repository |
| --- | --- |
| MP-00 | ADR 0018 chốt policy ownership, thời gian, legacy, N Plan và assessment; ERD additive cập nhật |
| MP-01 | Validator/payload shared, Maintenance v2 và consumer v1/v2, contract tests |
| MP-02/03 | CRUD draft/revision, publish/default/retire, optimistic version, audit và quyền theo service |
| MP-04 | Preview server, pin hai revision, lịch từ handover, override có lý do và fingerprint |
| MP-05/06 | Atomic group receipt, rollback rule thứ hai, response loss, parallel resume, restart Asset app, complete audit một lần |
| MP-07 | Snapshot checklist/title Task, independent calendars, source version, replacement v2 |
| MP-08 | Assigned-tech checklist/results/version/history; complete guard trong transaction report/outbox/inventory hold |
| MP-09 | Temporal validity tách incident coverage, evidence/audit, excluded → estimate → customer approval, không VOID Warranty |
| MP-10/11 | Model editor thực, revision readonly sau publish, registration preview/submit/resume/N Plan; summary dùng snapshot |
| MP-12/13 | Web assessment/checklist, customer applied versions/terms, sanitized completion summary và tenant/customer isolation |
| MP-14 | Android checklist thực, read-only khi sai assignment/terminal, conflict/reload bảo toàn dữ liệu nháp |
| MP-15 | Root integration command, CI broker/DB step và Flutter analyze/widget job; rollback flag kiểm thử |
| MP-16 | Real Identity + 6 Nest/Gateway apps + PostgreSQL + scoped RabbitMQ; regression DB và failure injection |
| MP-17 | Browser desktop/mobile viewport + Android emulator; source forgery, assignment và tenant/customer tests |
| MP-18 | User guide, deployment ordering, rollback runbook, migration x2/seed x2/drift, evidence và screenshots |

## Ma trận POL-01..26

PASS dưới đây chỉ nói đến các biến thể local được nêu rõ. Không coi các biến thể
chưa chạy hoặc review của người khác là đã đạt.

| Case | Bằng chứng thực chạy |
| --- | --- |
| POL-01 | Tạo/publish policy/profile qua API; editor browser tạo/publish; model/audit được lưu |
| POL-02 | Ba publish cùng expectedVersion: một 201, hai 409; đúng một default |
| POL-03 | Handover 31/01 → một Warranty, hai Plan, nguồn đúng và kỳ đầu 30/04 |
| POL-04 | A giữ v1 sau publish v2; draft B lấy v2; task/WO A giữ profile nguồn |
| POL-05 | Preview v1 trước publish v2 vẫn áp dụng v1; retire bản đã preview làm submit 409 |
| POL-06 | Override thiếu lý do 400; override hợp lệ tính ngày đúng; NONE hoàn tất không sinh Warranty/Plan; thiếu cấu hình 409 |
| POL-07 | Unit tháng cuối/leap-year; calendar/scheduler/preview; DB pause/downtime/repeated/concurrent tick |
| POL-08 | Hai rule của cùng máy cùng ngày kỷ niệm tạo hai Task/WO riêng |
| POL-09 | Inject CHECK làm lỗi rule thứ hai: không Plan/receipt dở dang; Asset PENDING; resume đủ nhóm |
| POL-10 | Lost response sau remote commit + 4 resume đồng thời; restart Nest Asset app trước resume, không duplicate |
| POL-11 | Receipt sai inputHash không COMPLETED; receipt hợp lệ phục hồi; so khớp đầy đủ rule/Plan IDs tại backend |
| POL-12 | Real RabbitMQ v2, replay replacement; legacy v1 DB suite; duplicate/out-of-order DB tests; transport retry/DLQ thật |
| POL-13 | Complete thiếu required 409; item giả 400; stale result 409; N/A sai bị validator/complete guard chặn |
| POL-14 | Lưu với tech cũ, reassign, tech cũ 403; audit actor/version vẫn còn |
| POL-15 | Checklist không gọi xuất kho; 33 Inventory DB test + WO inventory-hold/recovery regression đạt |
| POL-16 | Manufacturing fault COVERED → accept; không tạo estimate; accidental damage ngoài phạm vi không thể COVERED nhưng có thể NOT_COVERED để báo giá |
| POL-17 | Liquid ingress còn hạn → NOT_COVERED → estimate/send/customer approve → WO; Warranty vẫn ACTIVE |
| POL-18 | Unassessed không accept; UNKNOWN 400; temporal/coverage helper và legacy out-of-term regression |
| POL-19 | Live-estimate/state guards; client không có allowedAction để thay coverage sau khi gửi/duyệt; assertion API bổ sung trong harness |
| POL-20 | Tenant B 404, Customer B cùng tenant 404, customer không đọc draft/assessment audit; forged source/item bị chặn |
| POL-21 | Backend permission/assignment kiểm tại mutation; web session-generation regression, mobile stale-session tests |
| POL-22 | 34 Asset DB test gồm pending hash/replay, KEEP/NONE/overlap và lịch cũ; không backfill |
| POL-23 | Complete payload cũ không có checklist vẫn 409 trên WO mới; unknown fields/source bị từ chối |
| POL-24 | Customer dossier v1/terms và assessment thật; completion summary không có internal notes; Notification baseline 17 DB test |
| POL-25 | Migrate x2, seed permission x2, drift hai hướng, full workspace build local; CI được cập nhật |
| POL-26 | Response-loss integration, Flutter conflict/discard tests và workflow timeout tests; UI không fake success |

## Giới hạn và gate phát hành còn ở môi trường ngoài local

- Chưa restart container RabbitMQ đang dùng chung hoặc gây crash tiến trình OS;
  đã kiểm retry/DLQ thật, outbox khi broker unavailable và restart Nest app.
- Chưa chạy Android trên điện thoại vật lý hoặc iOS; đã chạy emulator API 36.
- Chưa kiểm boot/redeploy staging từ image sạch, restore backup production hoặc
  chạy runbook bằng người thứ hai; local build không thay thế các bước đó.
- Browser suite tập trung policy/editor/handover/dossier/checklist/assessment;
  Notification Service không nằm trong stack UAT mới nên badge báo unavailable.
  Notification persistence/privacy dùng suite DB riêng, không tuyên bố gửi notification
  end-to-end mới đã được nghiệm thu trên browser.
- Chưa có CI run trên remote hay Code Owner/Member D approval. Theo CONTRIBUTING.md,
  schema/auth/shared contract cần review ngoài tác giả trước khi merge/release.

Không tự merge hoặc tự tuyên bố release-ready chỉ dựa trên kết quả local.
Quy trình chạy lại và rollback: [runbook](../planning/model-service-policies-rollout.md).
Hướng dẫn thao tác: [user guide](../user-guide/model-service-policies.md).
Ảnh UAT: [artifact index](artifacts/model-service-policies/README.md).
