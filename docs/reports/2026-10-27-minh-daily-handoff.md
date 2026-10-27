# Báo cáo bàn giao toàn bộ công việc Minh — 27/10/2026

Phạm vi: **Minh — Member B, Asset/Maintenance ở M2**, bổ sung hồ sơ thiết bị và lịch sử
chi tiết theo quyết định đã được chủ dự án đồng ý. Múi giờ: Asia/Bangkok.
File này là đầu mối bàn giao cuối ngày; các báo cáo chi tiết trước đó là ảnh chụp
theo từng thời điểm, không dùng câu “chưa commit” trong báo cáo cũ để kết luận trạng thái mới.

## 1. Kết quả Git và ranh giới phần việc

- Đã fetch remote, phát hiện `develop` cập nhật từ `780f8bc` lên `6620555`
  (Huy M2), tích hợp vào nhánh Minh bằng `b774ada` trước khi kiểm tra lại.
- Giữ nguyên source mới của Huy/Web và các owner khác; diff của Minh không sửa
  code Work Order, Service Request, Identity, Organization, Gateway hoặc Web.
- Tách contract dùng chung, implementation backend, CI/báo cáo thành PR riêng.
- [PR #29 — contract/event/ADR/ERD và bàn giao](https://github.com/neyugn261/pbl6-saas-equipment/pull/29):
  **đã merge**, commit `69b3a96`; cả hai job CI thành công,
  [run 40522719059](https://github.com/neyugn261/pbl6-saas-equipment/actions/runs/40522719059).
- [PR #30 — backend Minh](https://github.com/neyugn261/pbl6-saas-equipment/pull/30):
  **đã merge**, commit `5fccb35`; cả hai job CI thành công,
  [run 40524013535](https://github.com/neyugn261/pbl6-saas-equipment/actions/runs/40524013535).
- Commit implementation: `45cd205`; merge cập nhật contract vào nhánh backend: `ed77f6d`.
- Backend đã nằm trên develop trước khi xuất bản báo cáo này. PR cuối chứa báo cáo,
  cập nhật README/gitignore và CI step real Maintenance vertical slice. Trạng thái
  CI/merge của bản báo cáo xem trực tiếp PR/lịch sử file; không ghi trước kết quả chưa chạy.
- `.env` thật, token, output test, generated client/dist, pnpm store và công cụ GitHub
  tạm nằm ngoài commit. Không force push, không bypass branch protection hoặc giả lập approval.

Các tài liệu M1 ngày 23–24/10 được đưa vào repo để lưu lịch sử; không tính là phần
implementation mới của ngày 27/10. Nền tảng Maintenance từ ngày 26/10 được tiếp nối,
không nhận lại là toàn bộ code đều được viết mới hôm nay.

## 2. Toàn bộ phần Minh đã làm

| Nhóm/task | Công việc và kết quả |
| --- | --- |
| M2-M1 — Nền tảng | Maintenance NestJS + Prisma + auth/validation/health; dependency riêng; database test; additive migrations và schema/ERD đồng bộ |
| M2-M2 — Plan API | List/create/detail/patch, status, pagination/filter, validation, tenant/customer scope; xác thực Equipment qua Asset API bằng token/correlation người gọi |
| M2-M3 — Snapshot | Asset move tăng snapshotVersion; history/outbox nguyên tử; EquipmentMoved v1; Maintenance cursor/advisory lock, chống stale/duplicate/reorder và race create/move |
| M2-M4 — Scheduler/Task | Lịch ngày/tuần/tháng/năm theo ngày gốc, month-end/leap-year; PAUSED/resume/INACTIVE; downtime bù một kỳ gần nhất; khóa concurrent tick; Task + outbox + nextDue cùng transaction; Task reads |
| M2-M5 — WO liên kết | Inbox Created v1/Completed–Cancelled v2; per-WO terminal tombstone; không để event cũ ghi đè WO thay thế; UNRESOLVED → FAILED, lastCompletedAt không lùi; replacement request + WO ID mới bền vững và idempotent |
| M2-M6 — Asset event history | SR status/WO completion → lịch sử thiết bị + inbox nguyên tử; customerSummary allowlist; không lưu lý do SR nội bộ thành nội dung công khai |
| M2-M7 — Vận hành/tích hợp | Operator tick; seed idempotent; queue/outbox/replay docs; real PostgreSQL/RabbitMQ/Gateway/WO integration; CI step tích hợp bổ sung trong PR CI riêng |
| M2-M8 — M3 prep | inventory.yaml draft cho Part/Warehouse/Stock/receive/adjust/issue/return; decimal/F09/return/low-stock và câu hỏi idempotency/race đã bàn giao; chưa triển khai Inventory API vì thuộc M3 |
| Hồ sơ thiết bị | displayName/description/specifications theo từng đơn vị, commissionedDate; model/serial/customer/site/location/ngày bàn giao/lắp đặt; completeness và dữ liệu còn thiếu |
| Tình trạng vận hành | UNKNOWN/OPERATIONAL/DEGRADED/NOT_OPERATIONAL; manager xác nhận riêng kèm reason nội bộ/customerNote; WO completed không tự khẳng định máy hoạt động tốt |
| Audit chi tiết | Before/after, user ID/role hoặc system, occurred/recorded time, context và source reference; ledger Model riêng; Warranty thêm/hủy và QR issue/revoke có lịch sử |
| Tra cứu | Asset global feed, equipment timeline, từng history entry, Model/Warranty histories; Maintenance global/Plan history và Task journey với các WO/lần thay thế |
| Tổng quan | Maintenance counts trên toàn bộ phạm vi, next due, overdue, attention preview giới hạn 5 + tổng số; phân biệt lịch dự kiến với hẹn xác nhận |
| Dossier/drill-down | Read composition Organization/SR/WO/Maintenance theo token người gọi; kiểm tra equipment/customer trước child reads; history/comments/assignments/logs/report; source lỗi/thiếu quyền được trả rõ |
| Tích hợp cập nhật Huy | Sửa waitingFor theo SR PROCESSING đúng contract; đọc các revision báo giá qua API source mới; giữ warrantyCheck snapshot riêng với calendarCoverage hiện tại |
| Quyền và riêng tư | Customer không đọc WO raw; Customer Admin Maintenance read theo catalog, Customer User không có quyền này; che internal reasons/actor IDs; legacy metadata allowlist; không đọc DB của service khác |
| Tài liệu | ADR 0009/0010, OpenAPI Asset/Maintenance và 2 supplement, ERD SQL, fixtures, READMEs, kế hoạch 5 người, demo, payload/acceptance bàn giao và báo cáo |

## 3. Quyết định nghiệp vụ đã được chủ dự án xác nhận

1. Lịch MONTH/YEAR giữ ngày gốc; hoàn thành muộn không dời kỳ kế tiếp.
2. INACTIVE là cuối; sửa lịch chỉ ảnh hưởng kỳ chưa sinh, Task cũ được giữ nguyên.
3. WO UNRESOLVED làm Task FAILED, không cập nhật lastCompletedAt.
4. Minh làm producer/request/consumer thuộc Asset/Maintenance; Khương làm consumer
   tạo WO thay thế. Không tự sửa service người khác để làm test xanh.
5. Bảo hành theo lịch và kết luận cho từng yêu cầu là hai thông tin khác nhau.
6. Kết quả sửa chữa và tình trạng vận hành được xác nhận là hai thông tin khác nhau.

## 4. Kiểm tra thực tế trước commit/merge

| Lệnh/phạm vi | Kết quả local sau tích hợp Huy |
| --- | --- |
| pnpm lint | PASS toàn repository |
| pnpm typecheck | PASS toàn repository |
| pnpm build | PASS toàn repository; web có cảnh báo bundle size, không phải lỗi build |
| pnpm test + RabbitMQ thật | **213 PASS**, gồm package và backend unit/transport tests |
| Bootstrap/HTTP Organization + Asset + SR + Maintenance + WO | **26 PASS** |
| Gateway E2E | **9 PASS**, có route action estimate; không nhận echo routing là full-stack estimate |
| Asset PostgreSQL | **21 PASS**, gồm 9 ca dossier mới |
| Maintenance PostgreSQL | **18 PASS** |
| SR PostgreSQL regression | **42 PASS** trên code Huy đã merge, không sửa source |
| Asset/Maintenance migration drift | Không khác biệt migration ↔ Prisma |
| Real Maintenance vertical slice | PASS move → snapshot → TaskDue → WO → assign/accept/start/complete → report/Task/Asset history |
| Real dossier và quyền | PASS WO/report/assignment/history + Maintenance summary; customer restriction; published summary; completion vẫn giữ UNKNOWN |
| Cancel/replacement request | PASS WO thật hủy → Task PENDING → durable request; producer tạo replacement WO chưa có |
| Seed hai lần | PASS, không duplicate/reset Plan/Task |
| API YAML/references và git diff --check | PASS; 5 API contracts, 356 tham chiếu và CI YAML được parse/kiểm tra |

Các suite trên có **329 ca PASS** tổng cộng; riêng hai service Minh có **93 ca PASS**.
Script tích hợp tính riêng, không cộng các bước trong script thành số test tùy ý.
DB tests dùng database test, không chạy reset/truncate lên database phát triển.

**Diagnostic riêng còn FAIL:**

```powershell
pnpm --filter service-request-service test:e2e:db -- --testRegex=work-order-ordering.repro.ts
```

Kết quả ngày 27/10: **FAIL 1/1**, F09/M2-WO-D01. Created(A,e1) → Cancelled(A,false,e2)
→ Created(A,e3 mới) làm SR từ ACCEPTED/null về PROCESSING/A sai. Lỗi có sẵn trong code
Huy trên develop; 42 regression mặc định vẫn PASS. Không sửa assertion hoặc gọi toàn
bộ M2 đã nghiệm thu. Đã giao Huy phối hợp Khương/Nguyên tại issue #32.

## 5. Bàn giao thực tế cho từng người

Các issue đã được mở trên GitHub, có dữ liệu đầu vào và checklist nghiệm thu.

| Người chịu trách nhiệm | Việc còn thiếu và tiêu chí chính | Issue/assignment |
| --- | --- | --- |
| **Khương** | Consumer replacement: validate source/tenant/task/WO cũ CANCELLED; tạo đúng WO ID đã cấp, inbox/history/outbox nguyên tử; chống trùng/reorder; chứng minh cancel → replacement WO → complete thật | [#31](https://github.com/neyugn261/pbl6-saas-equipment/issues/31), đã assign **khuong23** |
| **Huy**, phối hợp Khương/Nguyên | F09 lifecycle/reorder, recovery EXPIRED, review migration/reconciliation; giữ dữ liệu cũ và regression; full-stack SR/Estimate/WO. Estimate APIs và Notification draft đã có, không giao lại như chưa viết | [#32](https://github.com/neyugn261/pbl6-saas-equipment/issues/32), đã assign **hurzpoet261** |
| **Hatsady** | UI hồ sơ/timeline/global history/Plan/Task/journey; filter/pagination/availability; source allowedActions; warranty/health riêng; chứng minh web thật và test tenant/customer/outage; chỉ bật replacement khi consumer sẵn sàng | [#33](https://github.com/neyugn261/pbl6-saas-equipment/issues/33), owner ghi rõ trong issue; **chưa assign GitHub vì chưa xác minh tài khoản riêng** |
| **Nguyên** | Shared contract/schema review; Android My Jobs/actions/report/APK + tích hợp thật; CODEOWNERS/branch protection theo quyền admin; phối hợp Hatsady nghiệm thu. Không nhận lại Gateway/RBAC/test DB đã có ở #28 là chưa làm | [#34](https://github.com/neyugn261/pbl6-saas-equipment/issues/34), đã assign **neyugn261** |

Thông báo/recipient implementation M3 thuộc Huy; attachment/upload/report thống kê
M3 thuộc các owner theo kế hoạch. Không mở rộng thành billing/payment/ERP.

**Vẫn thuộc Minh ở giai đoạn sau:** triển khai Inventory M3 sau khi nhóm chốt
idempotency, race WO terminal, RETURN/INACTIVE và LowStock policy. Đây không phải
việc chuyển cho người khác hoặc thiếu implementation M2-M8 (M2 chỉ cần draft).

## 6. Các giới hạn phải giữ khi demo/nghiệm thu

- Backend Minh hoàn thành và có kiểm thử không có nghĩa UI web/Android mới đã hoàn thành.
- Khương chưa nối replacement producer thì nhánh thay thế đầy đủ chưa là E2E.
- Asset feed có local mutations, SR status và WO completion đã consume; Maintenance
  có feed riêng. Assignment/log đầy đủ đọc per WO tại source, chưa có một feed hợp nhất mọi log.
- Context event AT_EVENT_PROCESSING không chứng minh vị trí/model tại lúc sửa nếu source
  event không mang dữ liệu đó; không dựng lại lịch sử cũ không từng được lưu.
- Actor lịch sử có ID/role, chưa có snapshot tên Identity. Scope customer dựa quyền hiện tại.
- Phần SR F09 còn lỗi; phải xử lý trước khi nghiệm thu mọi tình huống replay/replacement M2.
- CODEOWNERS còn placeholder tại lần kiểm tra; không có quyền admin từ tài khoản Minh
  để cấu hình branch protection. CI xanh không thay approval/biên bản nghiệm thu/tag m2.

## 7. Cách tiếp nhận và kiểm tra sau khi lấy develop

Máy thành viên phải giữ nguyên .env riêng, không dùng database test thay database phát triển:

```powershell
git switch develop
git pull --ff-only origin develop
pnpm install --frozen-lockfile
pnpm db:migrate
pnpm dev:backend
# Terminal khác
pnpm dev:web
```

Database Asset/Maintenance trên máy Minh đã áp dụng các additive migration thành công,
không reset dữ liệu. Máy khác cần chạy migration sau khi lấy code. Gateway dossier:
`GET /api/assets/equipment/{id}/dossier` với token người dùng hợp lệ.

Tài liệu tiếp nhận:

- [Bàn giao payload/WO replacement, Inventory review](../plans/minh-m2-handoff.md).
- [Hồ sơ thiết bị: màn hình/API/luồng demo và visibility](../plans/equipment-dossier-handoff.md).
- [Kế hoạch M2 5 người](../plans/m2-task-assignment.md).
- [Báo cáo implementation M2](2026-10-27-minh-m2.md).
- [Báo cáo hồ sơ/lịch sử](2026-10-27-equipment-dossier.md).
- [Audit SR của Huy](../testing/m2-service-request-audit.md), đọc cùng cập nhật develop
  mới: Gateway estimate route và producer WO hiện đã có, không dùng F13/F14 cũ để kết luận ngược.
