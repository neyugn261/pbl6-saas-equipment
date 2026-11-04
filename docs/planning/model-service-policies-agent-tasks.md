# Gói công việc giao AI Agent — Chính sách dịch vụ theo Model

Ngày: 2026-11-04. Đây là backlog có dependency/acceptance, không phải kết quả
đã triển khai. Baseline local `ae0f4ee`; cập nhật base thực tế trước khi bắt đầu.
Nguồn thiết kế: [master plan](../plans/model-service-policies-plan.md).

## Cách giao việc

1. Giao MP-00 trước. MP-01 chỉ bắt đầu sau khi contract MP-00 đã thống nhất.
2. Một Agent nhận một task; mỗi task một nhánh/PR từ develop hoặc nhánh
   dependency cụ thể. Không merge/push thẳng develop. Tên ví dụ
   `feature/model-policy-mp02-asset`.
3. Dependency nghĩa là Agent đã có code/contract của task trước trong checkout;
   không chỉ biết task trước đang được làm. Branch stacked phải ghi base rõ.
4. Không chạy nhiều Agent viết cùng file/service trong một worktree. Dùng
   checkout/worktree riêng; thống nhất integration owner cho shared files.
5. Human ownership và quy trình review theo CONTRIBUTING.md vẫn áp dụng;
   các track bên dưới là cách phân chia Agent, không đổi CODEOWNERS.
6. Task có thể làm contract fixture để phát triển trước, nhưng nghiệm thu phải
   ghi rõ phần nào dùng fixture và phần nào đã chạy với dependency thật.
7. Các quyết định business đã ghi trong master plan là baseline. MP-00 phải
   chốt những lựa chọn cụ thể trước khi giao backend. Agent sau không tự thay
   enums/hash/date/state/API vì khó triển khai; đưa thay đổi về contract owner.

Prompt chung: thay `MP-XX` bằng task cần giao. Gửi prompt này cùng ID là đủ,
không cần chép lại toàn bộ repository vào hội thoại.

```text
Bạn phụ trách task MP-XX trong
 docs/planning/model-service-policies-agent-tasks.md.
Đọc AGENTS.md, CONTRIBUTING.md, README liên quan,
 docs/plans/model-service-policies-plan.md,
 ADR/OpenAPI/event contract đã được MP-00/MP-01 chốt và code thực tế.

Trước khi sửa, kiểm tra branch/status và xác nhận code của các dependency đã
có trong checkout. Nếu dependency chưa có, báo đúng dependency và hoàn thiện
những phần không phụ thuộc; không bịa endpoint hoặc business rule thay thế.

Thực hiện đầy đủ phạm vi và tiêu chí nghiệm thu của MP-XX, kèm migration,
contract/types/docs/test thuộc task. Dùng nhánh riêng. Giữ thay đổi của người
khác. Không sửa migration đã merge, không prisma db push, không truy cập DB
service khác, không mở quyền/role mới hoặc mở rộng nghiệp vụ ngoài thiết kế.
Không reset/seed database dùng chung. Test DB phải đúng service_test_db.

Chạy kiểm tra phù hợp và kiểm tra lỗi/permission/idempotency quan trọng.
Các root commands cùng build/clean packages chạy tuần tự. Không ghi PASS nếu
chưa chạy; fixture test không phải acceptance trên stack thật.

Bàn giao: commit/branch, file thay đổi, API/schema/event ảnh hưởng, migration
và cách rollout, kết quả test đã chạy, phần NOT RUN, rủi ro còn lại và đầu ra
cho task tiếp theo. Mục tiêu là hoàn tất task có thể review, không chỉ lập kế
hoạch. Không tự làm task khác hoặc merge/publish khi chưa được giao.
```

## Bảng tổng hợp

| ID | Gói công việc | Dependency | Track/phạm vi chính |
| --- | --- | --- | --- |
| MP-00 | Chốt nghiệp vụ, ADR, ERD và API contract | — | Thiết kế dùng chung |
| MP-01 | Types, schema payload, event versions và fixture contract | MP-00 | Shared contract |
| MP-02 | Asset: chính sách bảo hành theo Model có phiên bản | MP-01 | Asset |
| MP-03 | Maintenance: chương trình theo Model và các lịch/checklist | MP-01 | Maintenance |
| MP-04 | Asset: preview, chọn phiên bản, đóng băng input bàn giao | MP-02,03 | Asset |
| MP-05 | Maintenance: tạo/giữ nhóm nhiều Plan chống trùng | MP-04 | Maintenance |
| MP-06 | Asset: điều phối, nhận đủ receipt và phục hồi nhiều Plan | MP-05 | Asset |
| MP-07 | Maintenance: snapshot Task, scheduler, event mới/replacement | MP-05 | Maintenance |
| MP-08 | Work Order: checklist thực hiện và complete an toàn | MP-01 | Work Order |
| MP-09 | Service Request: đánh giá phạm vi bảo hành, Cost Estimate | MP-02 | Service Request |
| MP-10 | Web: quản lý Model và editor chính sách/phiên bản | MP-02,03 | Web |
| MP-11 | Web: bàn giao tự lấy chính sách và nhóm Plan | MP-06,10 | Web |
| MP-12 | Web: xét bảo hành và thực hiện checklist WO | MP-08,09 | Web |
| MP-13 | Portal/dossier/history: chính sách và kết quả được công bố | MP-06,07,08,09 | Asset/Maintenance/SR/WO projections + Web |
| MP-14 | Mobile: checklist, báo cáo và xử lý phiên/lỗi | MP-08 | Mobile |
| MP-15 | Gateway, CI và chuẩn bị deployment tương thích | MP-01; hoàn tất sau backend | Hạ tầng dùng chung |
| MP-16 | Integration backend trên DB/broker thật | MP-06,07,08,09 | QA integration |
| MP-17 | Browser/Android UAT và security regression toàn luồng | MP-10..14,16 | QA giao diện |
| MP-18 | Rollout, demo, tài liệu và nghiệm thu phát hành | MP-15,16,17 | Integration/release |

## MP-00 — Chốt thiết kế trước khi code

**Phạm vi:** `docs/decisions/`, `docs/api/`, `docs/architecture/`,
`docs/erd/`; chưa chạy migration hoặc sửa nghiệp vụ runtime.

**Đầu việc:**

- Đối chiếu master plan với develop mới nhất; bổ sung ADR số mới tiếp theo,
  không sửa nghĩa của ADR cũ mà không ghi rõ supersede/amend.
- Chốt ownership Model/default binding, policy/profile revisions, rule/item
  identity, immutable published content, retire và expectedVersion.
- Chốt schema Warranty/Plan/Task snapshots, registration group/link/receipt,
  checklist results và SR assessment/history. Rà local constraints/tenant refs.
- Chốt công thức ngày bảo hành inclusive/exclusive, ngày đầu bảo trì, cuối tháng,
  leap year, offset, overlap nhiều lịch, pause/resume/downtime.
- Chốt hành vi legacy/current PENDING, policy publish/retire khi draft đang mở,
  duplicate create/publish/submit và nguồn snapshot được pin lúc nào.
- Chốt assessment UNKNOWN/diagnostic scope, coverage→estimate state matrix,
  sửa assessment khi có estimate, cách xử lý request legacy đang ACCEPTED/PROCESSING.
- Chốt checklist allowed results, required/N/A, permission, assignment change,
  completion/replacement và customer projection.
- Viết OpenAPI đủ endpoint/DTO/errors/examples cho model detail, policy/profile
  revisions, preview, setup group, applied policy, assessment và checklist.
- Viết specification event mới cho TaskDue và Replacement, version compatibility,
  stable business identity, maximum payload/number of rules/items/text length.
- Lập permission matrix dùng catalog hiện tại. Nếu cần quyền mới, tạo subtask
  Identity riêng trước phụ thuộc đó; không cho implementation tự tăng quyền.
- Cập nhật ERD SQL amendment và state-machine spec; SQL schema thực tế từng
  service phải có migration tương ứng ở task owner, không chạy SQL thiết kế
  thay migration. Ghi rõ invariant nào chỉ service layer bảo đảm được.

**Nghiệm thu:** không còn TBD về cardinality, date, hash, API shape, event version,
coverage hoặc legacy. Mỗi consumer có request/response/payload fixture, mã lỗi
và testcase mẫu. ADR/contract được review theo CONTRIBUTING.md trước khi dùng
làm hợp đồng giữa các Agent. Nếu phát hiện mâu thuẫn, giải quyết ở bước này.

## MP-01 — Contract dùng chung và phiên bản event

**Phạm vi:** `packages/event-contracts/**`, tài liệu event/API fixtures; tránh
đưa rule DB/scheduler vào package dùng chung.

**Đầu việc:**

- Implement đúng contract MP-00: types/schema validation, canonical payload
  identity/hash specification, checklist items, rule identity, version fields.
- Thêm event version mới TaskDue/Replacement, validator chặt cả nested fields,
  unknown fields/limits/UUID/date/tenant provenance theo quy ước package hiện tại.
- Giữ version cũ; thêm fixture valid/invalid/legacy, cùng task replay nhiều
  eventId và nhiều version để consumer có cùng business identity.
- Cập nhật contract tests/docs. Nếu types REST cần chia sẻ, đặt đúng package
  hiện có theo quyết định MP-00, không tự tạo thư viện framework mới.

**Nghiệm thu:** package build/typecheck/test đạt; events v1 còn parse được,
payload mới không rò internal data ngoài audience cho phép; event mới không
được phát ra chỉ vì package vừa được nâng. Bàn giao fixture cho MP-07/08/15.

## MP-02 — Asset: phiên bản chính sách bảo hành theo Model

**Phạm vi:** `apps/asset-service/**`, Asset OpenAPI/README/migration.

**Đầu việc:**

- Thêm schema/migration policy family/revision/default binding theo MP-00,
  tenant-safe unique/index, lifecycle và audit.
- API get Model detail; list/get/create/update draft, publish/retire/default
  warranty revision. Published content bất biến, concurrency under lock.
- Validate duration/date basis/coverage/exclusions/limits; model thuộc tenant,
  active khi áp dụng mới. Không hardcode LIQUID_INGRESS luôn bị loại trừ.
- Tạo helper backend tính ngày theo contract và dữ liệu ngày thực tế.
- Thêm source version/snapshot vào Warranty API, giữ source null cho legacy.
  API internal scoped để SR đọc exact applied terms/coverage an toàn.
- Các API cũ vẫn dùng được; customer không đọc draft policy hoặc raw authoring.

**Nghiệm thu:** unit date/validation, DB revision+publish race, A/B tenant,
legacy/source snapshot tests. POL-01/02 và phần Warranty của POL-04/05/20 đạt.
Publish v2 không sửa Warranty đã có. Không sửa registration coordinator trong task.

## MP-03 — Maintenance: profile Model, lịch và checklist mẫu

**Phạm vi:** `apps/maintenance-service/**`, Maintenance OpenAPI/README/migration.

**Đầu việc:**

- Schema/API profile family/revision/default binding theo tenant+logical modelId.
  Validate Model qua Asset API, không query asset_db.
- Một revision có nhiều schedule rules và checklist riêng; validate frequency,
  offset, nội dung, item identity/order/required/N/A/action và limits.
- Draft/publish/retire/default switch/concurrency/history; published immutability.
- Preview lịch theo ngày căn cứ qua backend; reused calendar helpers theo ADR.
- Read by exact version kể cả version cũ dùng cho receipt/snapshot; authority
  apply-new khác authority read historical. Kiểm tra actor thiếu permission.
- Ghi rõ vật tư text là dự kiến; không gọi ISSUE hoặc tạo stock row.

**Nghiệm thu:** unit calendar+rule, DB concurrency, Model khác tenant/inactive,
ngày biên/offset và snapshots fixture; API trả đủ cho editor/preview. Không tự
thêm new role hoặc machine token. Bàn giao immutable profile contract cho MP-04.

## MP-04 — Asset: preview và đóng băng chính sách bàn giao

**Phạm vi:** `apps/asset-service/src/registrations/**`, modules/client liên quan,
Asset schema/migration/OpenAPI/tests. Chưa thay coordinator legacy một cách phá vỡ.

**Đầu việc:**

- Add new request codec/version để chọn policy/profile của Model, mode NONE có
  lý do hoặc KEEP hiện có. Legacy input vẫn parse theo nhánh riêng rõ ràng.
- Backend preview lấy immutable versions qua API, kiểm tra tenant/model,
  tính Warranty dates, hiển thị N schedule/checklist/warnings và fingerprint.
- Pin exact version IDs và resolved contents; phân biệt NO_DEFAULT/NONE/UNKNOWN.
- Draft PATCH theo expectedVersion; khi đổi Model/ngày nguồn phải invalidate
  preview phù hợp, không giữ checklist của Model cũ.
- Submit dưới lock kiểm tra version/permission/model/date/override/source/hash,
  ghi Warranty + frozen input + audit local. Không tin client-computed dates.
- Add group/item identities và projection nội bộ phục vụ nhiều Plan; token
  forwarding, network calls ngoài DB transaction.
- PENDING bất biến, legacy PENDING không bị chuyển codec/hash; không fake COMPLETE
  khi integration group chưa được xác nhận ở MP-06.

**Nghiệm thu:** DB tests override/permissions/stale draft/policy retire/publish
race; dependency error giữ draft; frozen replay không resolve latest; tạo một
Warranty kể cả concurrent submit. POL-03/05/06/21/22 phần Asset đạt.

## MP-05 — Maintenance: ensure nhóm nhiều Plan

**Phạm vi:** `apps/maintenance-service/src/registrations/**`, Plan repository,
schema/migration/OpenAPI và DB/integration tests Maintenance.

**Đầu việc:**

- Nâng constraint unique setupRegistrationId đơn theo thiết kế group/item;
  migrate Plan setup cũ giữ identity/hash đã có, không mất liên kết hoặc history.
- Endpoint group ensure/lookup bổ sung nhận registration identity, fetch frozen
  projection qua Asset API, verify exact group/item identities/hash.
- Tạo N Plan từ N rules trong một transaction local; Plan lưu profile/rule source
  và applied checklist snapshot. KEEP kiểm tra Plan đúng equipment/tenant.
- Atomic group creation, same-key replay mapping cũ; different payload cùng
  identity→409. Chặn duplicate item/missing item và parallel ensure.
- Trả receipt complete với mapping itemId→planId và hash; không suy diễn group
  hoàn tất chỉ vì tìm thấy một Plan. Giữ singular endpoint cho legacy.

**Nghiệm thu:** test lỗi ở rule thứ hai rollback toàn nhóm; concurrent ensure,
crash/response loss sau commit; resume sau Plan đổi status/lịch vẫn receipt cũ;
setup legacy hợp lệ. POL-09/10/22 phần Maintenance đạt. Có integration với
projection Asset thật, không chỉ stub handler.

## MP-06 — Asset: coordinator nhiều Plan và phục hồi

**Phạm vi:** registration coordinator/client/response/schema liên quan ở Asset,
OpenAPI và biên bản bàn giao; không tự ghi maintenance_db.

**Đầu việc:**

- Điều phối group ensure sau local commit; nhận/validate toàn bộ receipt và
  persist links mapping đúng N items rồi mới COMPLETED.
- Kiểm tra tenant/equipment/group hash/item set/ID trùng/receipt replay.
- PENDING response trung thực về Warranty đã lưu và bảo trì chưa xác nhận;
  timeout/auth error/network/schema mismatch có mã lỗi phù hợp.
- Resume cùng identity/input, không tạo key mới hoặc Warranty mới. Lookup 404
  không mở khóa input. No HTTP while holding Asset TX/locks.
- New response collection và singular field compatibility đúng MP-00; không
  fake một Plan đại diện cho nhiều Plan. Legacy resume vẫn giữ semantics cũ.

**Nghiệm thu:** real Asset↔Maintenance/Gateway tests, hai resume đồng thời,
crash trước HTTP/sau Maintenance commit/trước Asset receipt commit, fake receipt
sai hash/thiếu item. POL-03/09/10/11/22 đạt. Đây là gate cho bàn giao mới.

## MP-07 — Maintenance: scheduler, Task snapshot và event mới

**Phạm vi:** scheduler/Plan/Task/replacement/history trong Maintenance.

**Đầu việc:**

- Scheduler copy checklist từ Plan áp dụng vào Task cùng transaction với outbox.
  Task không đọc Profile latest; Plan edit chỉ ảnh hưởng task tương lai nếu
  thiết kế cho phép, không sửa task/WO đã phát.
- Tính kỳ đầu/offset/anchor, cuối tháng, leap year, pause/resume và downtime;
  nhiều schedule rules không tạo trùng Plan/date. Giữ rule legacy theo ADR 0009.
- Emit TaskDue mới đủ nội dung; replacement mới giữ cùng Task snapshot, source
  identity. Không dual-publish v1/v2 tạo hai WO; flag/version rollout theo MP-15.
- Duy trì cancel/completion ordering, replacement idempotency và equipment
  snapshotVersion hiện có; history đúng nguồn phiên bản.

**Nghiệm thu:** unit lịch, DB concurrent tick/rollback, task snapshot trước/sau
publish/edit, real broker new+legacy/replacement với WO MP-08. POL-04/07/08/12.

## MP-08 — Work Order: checklist và kết quả thực hiện

**Phạm vi:** `apps/workorder-service/**`, Work Order OpenAPI/migration/tests.
Có thể triển khai theo contract fixture sau MP-01, nghiệm thu broker thật sau MP-07.

**Đầu việc:**

- Consumer nhận old/new TaskDue/Replacement; validate provenance/tenant/source,
  chống duplicate business key qua event versions. Snapshot checklist thuộc WO.
- Schema checklist definitions/results/history, endpoint đọc/cập nhật kết quả
  theo expectedVersion; từ chối itemId lạ, sửa definition và stale assignment.
- Validate NOT_DONE/DONE/N/A+reason theo item; không sửa nội dung published template
  qua endpoint kết quả. Lưu bằng chứng/ghi chú dùng hạ tầng attachment hiện có.
- Complete kiểm tra required items cùng TX/WO lock với inventory hold guard,
  assignment, report/outbox/history. Bất kỳ lỗi nào không ghi report/status partial.
- Legacy WO không checklist tiếp tục contract cũ; client cũ không bypass WO mới.
- Replacement dùng definitions nguồn Task, results mới; không copy DONE từ WO hủy.
- Projection staff/customer đúng visibility; response allowedActions/checklist
  edit capabilities hỗ trợ UI. Không auto trừ kho hoặc reserve vật tư dự kiến.

**Nghiệm thu:** DB auth/assignment races/version/complete rollback, broker duplicate
v1/v2+restart, inventory reservation regression, legacy/new payload. POL-12..15/23.

## MP-09 — Service Request: assessment và Cost Estimate

**Phạm vi:** `apps/service-request-service/**`, Asset client, state machine/API,
SR migration/history/tests. Tham chiếu policy snapshot MP-02.

**Đầu việc:**

- Add assessment UNASSESSED/COVERED/NOT_COVERED và history/source snapshot.
  Giữ temporal result hiện có, validate cause/exclusion belongs applied policy.
- Service Manager ghi kết luận/lý do/bằng chứng, optimistic revision và state
  under lock. Không suy ra từ từ khóa hoặc model latest.
- Update review/check/accept và mọi estimate create/edit/send/revise/approve/reject,
  expiry, allowedActions/detail/customer projection bằng rule thống nhất.
- Còn hạn nhưng loại trừ có thể báo giá, UNKNOWN không auto accept; không VOID
  Warranty vì một assessment NOT_COVERED.
- Handle assessment changes và estimate đang hoạt động/approved đúng MP-00,
  audit quyết định trước; legacy accepted/processing không bị kẹt hoặc auto đổi giá.
- Giữ consumer WO lifecycle, close/reopen/cancel; định nghĩa khi reopen có cần
  assessment mới hay giữ source cũ, theo rule MP-00.

**Nghiệm thu:** unit+DB coverage matrix, bad scope/cause/version, conflict giữa
approve và reassess; event consumer regression. POL-16..19/20/22; test luồng còn
hạn+NOT_COVERED→approved estimate→WO với service thật ở MP-16.

## MP-10 — Web: Model và editor chính sách

**Phạm vi:** `apps/web/**`, docs Web. Không làm backend từ PR frontend.

**Đầu việc:**

- Model list/detail/editor dùng API thật; các tab Thông tin/Bảo hành/Bảo trì/
  Phiên bản. Bổ sung route detail dựa trên API mới, giữ alias hợp lý.
- Warranty editor duration/terms/coverage/exclusions; profile editor nhiều
  schedule rules, checklist thứ tự/action/required/N/A/hướng dẫn/vật tư dự kiến.
- Draft/save/publish/retire/new revision theo allowedActions; published readonly.
- Save hai service hiển thị thành công/lỗi riêng; không báo toàn bộ đã lưu khi
  một bên thất bại. Không giả publish transaction xuyên service.
- Tenant Admin không có maintenance:manage thấy quyền đúng, không gọi mutation
  trái quyền. Model chưa có default có nhãn rõ; dirty form/session change/stale
  version giữ dữ liệu và cho đối soát.

**Nghiệm thu:** lint/typecheck/test/build; component tests validation/partial save/
409/session; browser desktop/mobile với API thật cho create/edit/publish v1/v2.
UI không tự đặt policy source bằng dữ liệu mẫu hoặc hardcoded durations.

## MP-11 — Web: bàn giao tự lấy chính sách

**Phạm vi:** registration wizard/types/API, dossier links, docs/tests Web.

**Đầu việc:**

- Chọn Model + ngày bàn giao gọi preview backend; hiển thị policy version,
  Warranty dates, N schedules/checklists và điều khoản áp dụng.
- Default áp chính sách Model; override/NONE/KEEP đúng quyền, có lý do; chưa
  cấu hình chặn hoàn tất và dẫn đúng màn editor, không tự đánh NONE.
- Model/date thay đổi invalidate preview và lựa chọn phụ thuộc. Chỉ submit
  exact versions/fingerprint theo contract, không tự tính thay server.
- Multi Plan receipt, PENDING/resume, source snapshot/overrides, exact key sau
  response loss, 409/stale session; không tạo registration lần hai.
- Giữ legacy draft/PENDING/COMPLETED và KEEP; QR vẫn là thao tác sau khi đủ điều kiện.

**Nghiệm thu:** component+real browser: empty model policy, date boundaries,
v2 publish giữa preview/submit, override, timeout sau commit/reload/resume và
Tenant Admin không complete. POL-03..06/09..11/21/22/26 trên giao diện.

## MP-12 — Web: xét bảo hành và checklist WO

**Phạm vi:** SR review/detail/estimate panel, WO detail/report/checklist, tests Web.

**Đầu việc:**

- Hiển thị riêng thời hạn bảo hành và kết luận phạm vi sự cố, exact applied terms.
- Form assessment cause/clause/reason/evidence, UNASSESSED rõ, chỉ action hợp lệ.
- NOT_COVERED còn hạn mở luồng estimate thật, không render accept sai chỉ vì
  temporal IN_WARRANTY. 409 giữ input và yêu cầu tải lại.
- WO checklist thực hiện theo snapshot server, lưu từng item/N/A reason, progress,
  assignment/version; form report hiển thị mục bắt buộc còn thiếu trước complete.
- Không auto complete item/issue stock, không gửi mutation stale sau đổi phiên.
  Giữ attachments và inventory recovery hiện có.

**Nghiệm thu:** browser Service Manager/Technician khác nhau, unknown/covered/
excluded, estimate approve, required checklist/N/A, reassignment và 409. API
backend vẫn chặn bypass kể cả nếu nút được gọi trực tiếp.

## MP-13 — Customer Portal, dossier và lịch sử áp dụng

**Phạm vi:** customer projections trong service sở hữu và `apps/web/**`.
Đây là task tích hợp nhiều owner; chia PR nhỏ theo service trước PR UI.

**Đầu việc:**

- Dossier hiển thị chính sách đã áp dụng, version/date/terms, nhiều Plan và lịch
  sử; v2 của Model không thay màn máy v1. Model authoring staff-only vẫn giữ.
- Customer nhận coverage explanation và customer-safe results; ẩn internal
  diagnosis/checklist notes, drafts, hashes, idempotency keys và raw errors.
- History phân biệt template revision, bàn giao áp dụng, override và execution;
  không sao chép audit kỹ thuật vào thông báo khách hàng.
- Check Notification payload/link và report/history projections còn hoạt động
  khi event version mới; không cần notification nghiệp vụ mới chỉ để hoàn tất task.
- Đúng customer role hiện có: Customer User không tự nhận quyền maintenance:read
  như Customer Admin; hiện phần được phép qua equipment-safe projection.

**Nghiệm thu:** API negative tests hai customer/tenant, browser customer dossier
v1/v2+legacy, published/internal attachment regression; POL-20/24 và no mock.

## MP-14 — Mobile Technician: checklist và báo cáo

**Phạm vi:** `apps/mobile/**`, docs/mobile tests. Backend thuộc MP-08.

**Đầu việc:**

- Parse new checklist/version/allowedActions và legacy WO không checklist.
- List/detail item, instruction, result, N/A reason, progress và report complete.
- Lưu kết quả qua API, xử lý required còn thiếu theo server; không lấy template
  latest hoặc tự gán DONE cho legacy payload.
- Mất mạng/timeout/conflict/reassignment/account switch giữ thông tin rõ và
  đối soát server trước gửi lại. MVP không xây đồng bộ offline mới; nếu không
  lưu được thì báo chưa lưu, không giả thành công.
- Giữ attachment camera/file/report flows và inventory semantics; trường hợp
  app phiên bản cũ không gửi được checklist phải có hướng dẫn cập nhật.

**Nghiệm thu:** flutter analyze/test/build, emulator/device luồng thực checklist
→report; assignment đổi giữa thao tác, mất mạng/retry, phiên thay, legacy/new WO.
POL-13/14/21/23/26; ghi rõ Android runtime nào chưa chạy.

## MP-15 — Gateway, CI và deployment compatibility

**Phạm vi:** `apps/api-gateway/**`, `.github/**`, compose/runbook/scripts/env nếu
thật sự cần; không đưa business orchestration vào Gateway.

**Đầu việc:**

- Kiểm tra public mapping các endpoint mới, internal blocked, auth forwarding,
  CORS/correlation/error/no-store và body-size/payload limits nếu cần.
- CI áp migration+drift trên đúng test DB các service thay đổi, legacy/new DB
  suites và broker consumers. Wire live integration scripts MP-16 sau khi có.
- Flutter checks/build theo khả năng runner; không báo runtime acceptance từ build.
- Flags/version readiness: deploy consumers old/new trước bật producer mới và
  checklist-required feature; seed demo policy v1/v2 idempotent trong env riêng.
- Kế hoạch rollback tắt producer mới, giữ consumers/schema/receipt để xử lý pending.
- Test stack Compose/config và script không làm install/clean packages race.

**Nghiệm thu:** Gateway route/security tests, CI smoke trên code tích hợp, config
validation, build image từ checkout sạch. Không chỉ thêm YAML nhưng để suite
quan trọng silently skip. Shared changes review theo CONTRIBUTING.md.

## MP-16 — Integration backend và failure injection

**Phạm vi:** scripts/tests integration mới, docs evidence, fixture test của đúng
service; sửa lỗi được phát hiện qua PR owner thay vì lách assertion.

**Đầu việc:**

- Dựng Identity/Gateway/Asset/Maintenance/WO/SR/RabbitMQ thật trên DB test riêng;
  Inventory/MinIO/Notification chạy khi suite đụng đường tương ứng.
- Seed hai tenant/customer, hai Model, policy/profile v1/v2 và technician thật.
- Test toàn tuyến tạo policy→handover→N Plan→Task/WO→checklist→report→history.
- Test còn hạn+excluded→estimate/customer approve→WO; old/new event/readiness.
- Response loss sau commit, process restart, parallel submit/resume/publish/tick,
  malformed/forged receipts, duplicate/out-of-order events, broker restart.
- Assert số Warranty/Plan/Task/WO/report/ledger và nguồn version qua API/service
  owner; test DB trực tiếp chỉ trong suite service sở hữu, không thêm runtime join.
- Run legacy pending/WO completion, inventory holds/recovery và M1/M2 regression.

**Nghiệm thu:** POL-01..23 thuộc backend có evidence commit/env/actual result,
script có exit code fail đúng, cleanup chỉ DB test; không dùng fixture network
để tuyên bố integration thật đã đạt.

## MP-17 — Browser/Android UAT và security regression

**Phạm vi:** UI acceptance automation/manual matrix, evidence, lỗi owner fix.

**Đầu việc:**

- Chạy luồng MP-10..14 với Gateway/DB/broker thật, hai tenant/customer và đầy đủ
  role; ghi nhận request IDs/policy versions/Plan IDs để đối chiếu.
- Kiểm tra route thật không dùng sample, permissions từ server, 401/403/404/409/
  422/503, response loss/reload/session change và partial success.
- Thử sửa modelId/policyVersionId/profileVersionId/PlanId/itemId/equipmentId
  bằng API; kiểm tra ownership/assignment/visibility thực sự tại backend.
- Desktop/mobile responsive; Web Technician và Android cùng hoàn thành WO theo
  quy tắc; app cũ không bypass checklist mới. Internal notes không vào portal.
- Dùng acceptance matrix POL-01..26, phân biệt PASS/FAIL/NOT RUN và platform.

**Nghiệm thu:** không còn failure chặn luồng chính; tất cả scenario bắt buộc có
kết quả thực, không gán PASS bằng ảnh UI tĩnh, unit hoặc curl riêng lẻ. Lỗi được
sửa phải có regression phù hợp trước chốt.

## MP-18 — Rollout, demo và bàn giao cuối

**Phạm vi:** docs/runbook/demo/seed/config và tích hợp commit đã review.
Không merge/deploy môi trường người dùng khi chưa được giao hành động đó.

**Đầu việc:**

- Rà lần cuối ADR/OpenAPI/events/state machines/ERD/Prisma/migrations/clients.
- Migrate x2 và drift trên test env; seed demo x2; kiểm tra upgrade từ snapshot
  legacy có DRAFT/PENDING/COMPLETED/Warranty/Plan/SR/WO thực tế.
- Build từ checkout sạch, deploy thử theo thứ tự MP-15, giữ source exact commit.
  Một thành viên khác chạy runbook từ đầu được; test rollback flag và pending.
- Viết user guide Model/editor/handover/assessment/checklist; demo hai thiết bị
  nhận hai version khác nhau, excluded case, nhiều chu kỳ và phục hồi timeout.
- Tổng hợp kết quả MP-16/17, giới hạn đã chấp nhận và phần chưa hỗ trợ. Chỉ chốt
  tính năng khi các gate của master plan và quy trình review repo đều đạt.

**Nghiệm thu:** bảng release gắn exact commit, checklist deploy/rollback,
ma trận test, hướng dẫn demo, không còn dependency hoặc blocker bị che bằng
NOT RUN nhưng vẫn ghi hoàn tất. Không tự backfill policy vào thiết bị cũ.

## Thứ tự giao Agent thực tế

- Đợt 1: MP-00; sau đó MP-01. Một contract owner kiểm soát thay đổi chung.
- Đợt 2: có thể giao song song MP-02, MP-03, MP-08, MP-15 phần chuẩn bị.
- Đợt 3: Asset làm MP-04; SR làm MP-09; Web làm MP-10; Mobile làm MP-14 khi
  MP-08 sẵn sàng. Không để các Agent cùng sửa Asset Model/Warranty file.
- Đợt 4: MP-05, rồi MP-06; Maintenance tiếp MP-07. Web tiếp MP-11/12/13 theo
  backend dependency và tuần tự hóa các thay đổi App.tsx/types chung.
- Đợt 5: MP-16 → MP-17 → MP-18, hoàn tất MP-15 với các script thực tế.

Có thể dùng lại một Agent cho các task nối tiếp trong cùng service. Nếu chỉ
có một Agent, làm MP-00→01→02→03→04→05→06→07→08→09→10→11→12→13→14→15→16→17→18.
Không yêu cầu mọi task có một Agent riêng chạy đồng thời.

## Mẫu đầu ra bắt buộc cho mỗi task

```text
Task: MP-XX
Base commit / branch:
Commit / PR kết quả:
Đã hoàn thành:
File/API/schema/event thay đổi:
Migration và deployment ordering:
Test đã thực chạy (lệnh, số pass/fail/skip):
NOT RUN và lý do:
Dependency/contract chuyển cho task kế tiếp:
Rủi ro hoặc quyết định còn phải xử lý:
```
