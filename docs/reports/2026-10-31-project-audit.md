# Đánh giá dự án và điều kiện chốt M2 — 31/10/2026

Baseline: nhánh `develop`, commit `ca22f09e29ce1ab1f1593db62902f2bc5057494a`.
Working tree sạch khi bắt đầu. Đây là báo cáo rà soát, không phải quyết định
nghiệm thu hoặc phê duyệt thay owner. Lượt này không sửa code nghiệp vụ.

## 1. Kết luận

**Dự án đang ở cuối M2, giai đoạn tích hợp và ổn định. Chưa đủ điều kiện
chốt M2 chính thức theo checklist đang có. Có thể chuẩn bị M3 song song.**

Nền tảng và backend tiến xa hơn nhiều mô tả cũ trong README/report: Identity,
Organization, Asset, Service Request, Cost Estimate, Work Order, Service Report,
Maintenance, dossier/history và mobile Technician đều đã có implementation.
Các bộ kiểm tra đã chạy trong lượt này đều đạt sau khi xử lý một lần chạy
test chồng với build thư viện. Tuy vậy, đã tái hiện hai lỗi cạnh tranh liên
quan quyền/session; nhánh báo giá hết hạn thiếu đường phục hồi; bằng chứng
nghiệm thu web–Android cùng một luồng/commit chưa đầy đủ.

Không cần xây lại kiến trúc hoặc hoàn thành Inventory/Notification trước khi
chốt M2. Cần sửa các lỗi cụ thể, đồng bộ baseline thiết kế, rồi nghiệm thu
đúng luồng đã thống nhất.

## 2. Phạm vi và cách đánh giá

Đã đối chiếu AGENTS, root/service README, CONTRIBUTING, scripts/package
configuration, CI, SQL/Prisma/migrations, shared auth/event/service-kit/testing,
controller/service/repository/DTO và test của các service nghiệp vụ; web route,
API/session và các form M2; Flutter session/workspace/workflow/report; ADR,
OpenAPI, state machine, phân công M2 và các báo cáo/test case hiện có.
Đã trích nội dung `docs/PBL6_SRS_v1.0.docx` để đối chiếu mô hình nghiệp vụ.

Rà soát này không chứng minh mọi nhánh runtime đều đúng. Test có fixture/fake
được phân biệt với tích hợp thật. Không dùng kết quả lịch sử thay cho test
chạy hôm nay. Không kiểm tra trạng thái GitHub Actions/branch protection trên
remote, không chạy lại toàn bộ UAT trình duyệt/emulator hoặc smoke M1/M2 bằng
tài khoản thật trong lượt này. Không áp migration lên database dev.

## 3. Dự án đã làm được gì?

| Thành phần | Trạng thái thực tế | Đánh giá |
| --- | --- | --- |
| Monorepo và shared packages | pnpm workspace; Nest bootstrap, validation, JSON error/log, correlation ID, auth/RBAC/scope, outbox/inbox, RabbitMQ | Nền tảng có cấu trúc rõ; tránh lặp logic giữa service |
| Identity | Login/refresh rotation/logout/me, invite/activate, user/role/status, Platform Admin onboarding, tenant/customer read model | Đủ nền cho luồng hiện tại; web session còn race A02 |
| Organization | Tenant, Branch, Customer/Site/Location/Contact, membership, scope, outbox | Có API và DB tests; race membership A01 cần sửa |
| Asset | Model, Equipment, Warranty, QR, hồ sơ chi tiết, tình trạng vận hành, lịch sử, composition và EquipmentMoved | Có implementation và tích hợp; đã tách tình trạng thiết bị khỏi kết quả WO |
| Service Request | Review/bảo hành, trạng thái, comment/history, customer summary, estimate revision/decimal, WO lifecycle ledger | Nghiệp vụ chính đã có; báo giá EXPIRED chưa phục hồi được |
| Work Order | Technician/Skill, tạo/phân công/thực thi/hủy, report nguyên tử, events v2, Maintenance replacement | Backend M2 đã khá đầy đủ; 130 DB tests đạt |
| Maintenance | Plan/Task, calendar anchor, scheduler, snapshots, WO ordering/replacement, history | Tích hợp Gateway/PostgreSQL/RabbitMQ thật đã chạy đạt |
| Web | M1 API thật, dossier/history và các form WO/Plan/Estimate M2; một số trang sample vẫn có | Cần sửa lỗi form/session và UAT các thao tác mới |
| Mobile | Identity thật, secure storage, đọc API, accept/reject/travel/start/hold/resume/log/report/complete, đối soát lỗi | Analyze/test/APK đạt; chưa chạy lại thiết bị trong lượt audit này |
| Inventory | Schema/migration và OpenAPI draft; runtime còn Hello World | Công việc M3, chưa có chức năng kho |
| Notification | Schema/migration, draft API và recipient matrix; runtime còn Hello World | Công việc M3, chưa có gửi/đọc thông báo thực |
| Deploy/vận hành | Compose hạ tầng local, CI backend khá rộng | Chưa có Dockerfile/compose ứng dụng staging/nginx config trong repository |

Không nên quy đổi số thư mục, API hoặc test thành phần trăm hoàn thành toàn
dự án: các phần deploy, upload, tồn kho và notification chưa triển khai vẫn
có khối lượng đáng kể.

## 4. Các phát hiện cần xử lý

P1: ưu tiên trước nghiệm thu M2; P2: lỗi/thiếu sót cần xử lý theo phạm vi cụ
thể. Không có kết luận P0 từ bằng chứng của lượt này.

### A01 — P1: Customer Admin có thể sửa membership ngoài customer khi có cạnh tranh

Nguồn: `apps/organization-service/src/memberships/memberships.service.ts:72`
và `memberships.repository.ts:69`.

Service kiểm tra membership thuộc customer của caller trước khi gọi Identity.
Sau HTTP lookup, repository khóa và cập nhật theo `id`, không kiểm tra lại
tenant/customer hiện tại dưới khóa. Tenant Admin được phép chuyển cùng
membership sang customer khác trong khoảng đó.

Đã tái hiện bằng service/repository build hiện tại và PostgreSQL
`organization_test_db`; Identity lookup là fake để điều khiển chính xác điểm
interleave, không phải một cuộc tấn công HTTP end-to-end:

1. Membership của CUSTOMER_USER đang ACTIVE ở customer A.
2. Customer Admin A bắt đầu đổi membership sang INACTIVE, qua kiểm tra scope.
3. Trong lúc lookup Identity, Tenant Admin chuyển membership sang B bằng
   chính `MembershipsRepository.link(..., allowMove=true)`.
4. Request cũ của A tiếp tục và đổi membership của B sang INACTIVE thành công.

Kết quả: `error=null`, `finalCustomerIsB=true`, `finalStatus=INACTIVE`.
Fixture được xóa sau phép thử. Đây là vi phạm phạm vi customer khi ghi dữ liệu,
khác với các negative test chỉ đổi ID tuần tự đã có.

Đề xuất: truyền scope/identity kỳ vọng vào thao tác repository; sau khi lấy
row lock, kiểm tra lại tenant/customer/user và điều kiện customer còn hợp lệ
trước update/outbox. Scope đổi thì trả 404/409 theo contract. Thêm regression
điều khiển cạnh tranh move/status và chứng minh không ghi event trái quyền.
Owner: Organization + reviewer auth/scope.

### A02 — P1: Refresh trả về muộn có thể khôi phục token sau logout

Nguồn: `apps/web/src/auth/session.tsx:85` và `:122`.

`logout()` xóa token nhưng không vô hiệu hóa refresh đang chạy. Callback
refresh luôn gọi `store(result)`; callback lỗi cũng luôn xóa phiên hiện tại.
Do đó response của phiên cũ có thể ghi đè phiên sau logout/login tài khoản khác.

Đã tái hiện trực tiếp từ TSX hiện tại sau transpile trong Node VM, dùng fake
fetch/sessionStorage và Promise trì hoãn response. Không cần đổi source:

```text
login → refresh pending → await logout → resolve refresh → await refresh
clearedImmediately: true
accessTokenRestoredAfterLogout: true
refreshTokenRestoredAfterLogout: true
```

Tình huống thực tế tương ứng: server đã rotate nhưng response chưa tới browser;
logout vẫn gửi refresh token cũ. Identity logout chỉ revoke session của token
được gửi (`auth.repository.ts:121`), nên không tự bảo đảm revoke replacement.

Đề xuất: session generation/epoch, bỏ kết quả và side effect của mọi request
không còn thuộc phiên hiện tại; xử lý token đã rotate khi logout theo contract.
Không chỉ đặt `refreshPromise=null`, vì Promise cũ vẫn có thể hoàn tất.
Test logout/refresh, đổi tài khoản, refresh cũ thất bại sau login mới và restore.
Mobile đã có cơ chế epoch; không cần đổi kiến trúc auth để xử lý lỗi web này.
Owner: Web, phối hợp Identity nếu sửa semantics logout.

### A03 — P1: Báo giá EXPIRED làm SR thiếu đường tiếp tục xử lý

Nguồn: `service-requests.service.ts:478`, `:649`, `:830` và state machine.

SENT hết hạn được chuyển EXPIRED nhưng SR vẫn AWAITING_CUSTOMER_APPROVAL.
Create estimate chỉ cho REVIEWING/COST_REJECTED; revise chỉ nhận SENT.
Approve/reject cũng không xử lý tiếp EXPIRED. Vì vậy manager không thể gửi
revision mới cho cùng SR bằng luồng hiện hành, chỉ còn các nhánh như hủy yêu cầu.

DB suite hôm nay đạt nhưng có test chủ động xác nhận trạng thái chờ này.
Test xanh đang chứng minh implementation theo draft API, chưa chứng minh
nhánh nghiệp vụ hết hạn hoàn chỉnh. State machine lại mô tả revision mới
từ EXPIRED; đây là khoảng trống contract đã được báo cáo F12 trước đây.

Đề xuất nhóm chốt một đường recovery cụ thể, ví dụ staff đưa SR về REVIEWING
và tạo revision mới, rồi cập nhật state machine/OpenAPI/allowedActions/history/
outbox và test cạnh tranh với approve/expire. Không tự thêm transition trong
lượt review này. Owner: Service Request + API/state-machine reviewers.

### A04 — P2: Tạo Maintenance Plan lỗi vẫn đóng form và mất dữ liệu nhập

Nguồn: `apps/web/src/routes/M2Pages.tsx:1466` và `:1517`.

Catch của form gọi `setError(...)` rồi `onSaved()`. Parent của form tạo mới
thực hiện `setShowCreate(false)` trong onSaved, nên component chứa lỗi/draft bị
unmount ngay cả khi backend trả lỗi. Đã gọi handler hiện tại bằng harness
transpile với API reject: `onSavedCalledOnError=1`. Phần đóng form được xác
định trực tiếp từ callback parent; chưa chạy ca này trên browser.

Đề xuất chỉ gọi callback thành công sau mutation thành công; lỗi giữ form,
input và message. Nếu 409 cần refresh nguồn, dùng callback refresh riêng.
Thêm một kiểm tra UI cho 400/409/503; không chỉ gọi API bằng script.
Owner: Web.

### A05 — P1 về nghiệm thu: Chưa có bằng chứng chung chốt 9/9 tại baseline mới

`docs/testing/m2-test-cases.md` vẫn ghi các thao tác tạo/assign WO, Estimate,
Plan, confirm/reopen trên UI chưa chạy; `mobile-n5-n6.md` ghi bước 5 chờ web.
Code web mới đã có assign và create WO, nên đây là thiếu bằng chứng nghiệm
thu hiện tại, không phải kết luận tính năng đó chưa được viết.

Các script `apps/web/scripts/verify-m2-*.mjs` dùng fetch API; API PASS không
chứng minh event handler, form, navigation hoặc Android cùng luồng đều đúng.
Lỗi A04 minh họa khác biệt này. Cần UAT một kịch bản xuyên web–Android dùng
cùng request/order và ghi commit/môi trường/kết quả từng bước.
Owner: Web + Mobile + các owner backend.

### A06 — P1 về baseline: SRS trong repo mô tả một mô hình nghiệp vụ khác

`PBL6_SRS_v1.0.docx` mục 1.4/2.1 mô tả tenant quản lý tài sản thuộc sở hữu
của mình, vendor là danh bạ, có Asset Manager/Maintenance Manager và sửa chữa
bên ngoài. AGENTS/ADR/code hiện tại dùng tenant là doanh nghiệp cung cấp thiết
bị, customer/site riêng, Customer Portal và luồng Service Request trung tâm.

Không nên dùng SRS đó để kết luận cần bổ sung Vendor/External Technician vào
code hiện tại. Cần xác nhận baseline nộp đồ án và cập nhật SRS hoặc đánh dấu
bản cũ superseded, có mapping requirement → API/UI/test theo mô hình mới.
Ví dụ change-password là MUST trong SRS cũ nhưng hiện không thấy API tương
ứng; cần đưa vào backlog sau khi thống nhất scope, không tự coi toàn bộ SRS
cũ là tiêu chí M2. Owner: nhóm trưởng/BA + các owner.

### A07 — P2, bắt buộc đối chiếu trước chốt: ERD/ADR và tài liệu bị lệch implementation

- SQL ERD phần `service_requests` chưa có các trường customer result summary,
  `active_work_order_id`, `work_order_lifecycles` và conflict table đã có trong
  migration/Prisma hiện tại. Drift check 8 service PASS chỉ chứng minh
  migration ↔ Prisma, không chứng minh khớp file ERD hay được owner phê duyệt.
- SR README ghi migration 0005 pending review. ADR 0009/0010/0011 vẫn dùng
  trạng thái proposal/local/pending review dù code tương ứng đã ở develop.
  Cần đối chiếu approval trong PR; không suy diễn rằng chắc chắn chưa ai duyệt.
- Audit SR cũ vẫn ghi F09 FAIL, nhưng diagnostic hôm nay PASS 1/1 và DB
  lifecycle suite PASS. Không tiếp tục dùng kết luận cũ để chặn bằng lỗi đã sửa.
- SR README vẫn ghi Gateway chưa map estimate actions; Gateway hiện có
  `EstimateProxyMiddleware`. README Maintenance vẫn ghi replacement consumer
  chưa xong; tích hợp replacement producer thật hôm nay đã PASS.
- Root README còn gọi mobile là Flutter template, Gateway là scaffold;
  current-stage-demo-flow và FRONTEND_IMPLEMENTATION còn mô tả các mốc cũ.

Đề xuất cập nhật bảng trạng thái duy nhất theo commit và ghi rõ report lịch sử;
hoàn tất ERD amendment/ADR status qua review. Không sửa migration đã áp dụng.

### A08 — P2: CI chưa bảo vệ mobile và thao tác UI web

CI có lint/typecheck/unit/build, migration/drift, DB suites và API smoke khá
rộng. Không thấy job Flutter analyze/test/APK hoặc browser interaction tests.
Web package không có test script; API verification mới của web chưa nằm trong
CI hiện tại. CODEOWNERS hoàn toàn là comment nên không tự gán reviewer.
Không xác minh remote branch protection trong lượt này.

Đề xuất thêm checks mobile, một smoke UI cho luồng quan trọng và ca lỗi A04;
gán CODEOWNERS thật. Không cần viết hàng loạt test cho mọi chi tiết giao diện.

### A09 — P2 về sản phẩm: Web còn pha trộn các tuyến thật và sample

`/customers`, `/tenants`, `/dashboard` có API thật; một số tuyến `/app/customers`,
`/admin/tenants`, dashboard sample và trang tổ chức/kho/báo cáo/portal vẫn
import dữ liệu mẫu. Layout có banner nói rõ sample; không có bằng chứng rò
dữ liệu tenant thật từ các fixture này. Tuy nhiên link từ sample dùng ID
`eq-*`/`sr-*` sang trang M2 thật không tạo được hành trình dữ liệu nhất quán.

Đây là phần cần hoàn thiện theo M3, và cần ghi route inventory rõ ràng khi
demo M2. Bảo đảm route M1 được nghiệm thu luôn dùng API thật; không đánh dấu
trang sample là chức năng đã hoàn thành. Hợp nhất các route trùng chức năng
khi chuyển web sang API đầy đủ.

## 5. Kết quả kiểm tra đã chạy trong lượt này

Môi trường: Linux, Node 24.20.0, pnpm 11.26.0; PostgreSQL 17/RabbitMQ của
Compose đang chạy. Các suite DB dùng tên DB test được helper kiểm tra.

| Lệnh/phạm vi | Kết quả thực tế |
| --- | --- |
| `pnpm lint` | PASS toàn workspace |
| `pnpm typecheck` | PASS toàn workspace |
| `pnpm test` | 211 PASS, 3 broker tests skipped vì chưa truyền URL |
| Event-contracts test với `RABBITMQ_TEST_URL` lấy từ cấu hình local | 25/25 PASS, gồm 3 broker tests vừa bị skip |
| `pnpm build` | PASS; web có cảnh báo chunk lớn hơn 500 kB |
| `pnpm db:check-drift` | 8/8 service: No difference detected, migrations ↔ schema |
| Identity `test:e2e` | 90/90 PASS trên identity_test_db |
| Organization `test:e2e:db` | 45/45 PASS |
| Asset `test:db` | 21/21 PASS |
| Service Request `test:e2e:db` | 50/50 PASS |
| Work Order `test:e2e:db` | 130/130 PASS |
| Maintenance `test:db` | 18/18 PASS |
| Bootstrap/API e2e Gateway/Organization/Asset/SR/Maintenance/WO | 49/49 PASS; gồm Gateway 23 và Asset 15 |
| SR diagnostic `--testRegex=work-order-ordering.repro.ts` | 1/1 PASS; F09 repro cũ không còn thất bại |
| Maintenance `test:integration` | PASS dossier/WO report; move/snapshot/scheduler/Task/WO/complete/history; cancel/replacement chain/replay/reorder; seed hai lần |
| `flutter analyze` | PASS, no issues |
| `flutter test` | 102 PASS, 2 opt-in backend smoke skipped |
| `flutter build apk --debug --no-pub` | PASS; có warning SDK XML version; tạo app-debug.apk |
| Harness membership race A01 | Tái hiện được thay đổi ngoài customer, PostgreSQL test thật |
| Harness web session A02 | Tái hiện token được lưu lại sau logout, fake network/storage |
| Harness Maintenance form A04 | Tái hiện callback success chạy khi API reject; parent đóng form theo source |

Giới hạn của tích hợp Maintenance: Gateway/Asset/Maintenance/WO/PostgreSQL/
RabbitMQ thật, token test và fixture thay Identity/Organization; không gọi
đây là nghiệm thu toàn bộ web–Android bằng người dùng thật.

Một lượt DB Organization/Asset/Maintenance ban đầu lỗi không tìm được shared
dist vì audit chạy test đồng thời với `pnpm build` đang clean thư viện. Sau
khi build hoàn tất, chạy lại cả ba suite đạt như bảng. Đây là lỗi điều phối
lệnh của lượt audit, không được tính thành bug nghiệp vụ của dự án.

Log local: `/tmp/pbl6-audit-{lint,typecheck,unit,broker,build,drift,bootstrap,
db-identity,db-org,db-asset,db-sr,db-wo,db-maint,f09,maint-integration,
flutter-analyze,flutter-test,apk}.log`. Log ở `/tmp` không phải artifact CI
bền vững. Không lưu password/token trong báo cáo.

## 6. Điều kiện cụ thể để chốt M2

| Điều kiện | Hiện tại | Việc còn lại |
| --- | --- | --- |
| Backend/shared build và kiểm tra tự động | Đạt các lệnh local đã nêu | Xác nhận CI tại commit release sau sửa |
| Quyền tenant/customer/session | Negative suites đạt nhưng có A01/A02 | Sửa hai race và thêm regression có ý nghĩa |
| Estimate đầy đủ nhánh hết hạn | Chưa đạt | Chốt recovery, sửa code/contract/UI/test A03 |
| Web forms M2 và lỗi API | Có implementation, có A04 | Sửa mất form, thử lại lỗi thật trên browser |
| SR → WO → dispatcher web → technician Android → kết quả customer | Bằng chứng từng phần có, 9/9 baseline mới chưa chốt | Chạy UAT chung, lưu evidence từng bước |
| Maintenance và replacement/event ordering | Integration thật hôm nay đạt | Review thiết kế và ghi bằng chứng vào bảng nghiệm thu |
| Mobile analyze/test/APK | Đạt local | Xác nhận APK đúng cấu hình và UAT chung trên thiết bị |
| Thiết kế/ERD/SRS và review | Còn lệch/pending trong repo | Đồng bộ baseline, kiểm chứng owner approval |
| K8/M8/H7 chuẩn bị M3 | Có contract/draft/handoff | Review câu hỏi mở; không đòi implementation M3 |
| Release/tag | Chưa thấy tag trong local refs | Chỉ thực hiện sau bảng nghiệm thu nhóm và PR release |

Thứ tự đề xuất: A01/A02 → quyết định và sửa A03 → A04 → CI/UAT chung →
cập nhật bằng chứng/ERD/ADR/SRS → nhóm duyệt → release M2. Không tự tick
checklist hoặc tag thay nhóm. M3-prep có thể tiếp tục trong thời gian này.

## 7. Phần cần phát triển ở M3 và giai đoạn hoàn thiện

1. **Upload/attachment:** triển khai K8 với upload intent, idempotency,
   staging/final verification, private download và cleanup; thêm migration
   mới theo review, nối web/mobile và SR customer projection. Không chỉ lưu
   URL MinIO vào attachment rồi coi đã hoàn thành.
2. **Inventory cơ bản:** Part/Warehouse/Stock, receive/adjust/issue/return,
   ledger/WorkOrderPart, không âm tồn, decimal, idempotency và concurrency.
   Chốt race xuất phụ tùng với WO terminal và hoàn trả trước code; không mở
   procurement/ERP.
3. **Notification:** in-app list/unread/read, event consumer và dedup theo
   recipient; chốt nguồn recipient và cơ chế background theo ADR 0004.
   Recipient matrix đang nói rõ chưa có machine credential/read model được
   thống nhất. Không tự tạo token giả hoặc đọc database Identity trực tiếp.
   Activation email theo ADR 0008 cũng cần đường gửi thật ở M3.
4. **Web hoàn thiện:** nối các route còn sample với API, quản trị tài khoản/
   tổ chức, báo cáo cơ bản và notification; bảo đảm điều hướng giữa customer,
   equipment, request và WO dùng ID thật; loading/error/empty rõ ràng.
5. **Deploy/demo ổn định:** Dockerfile từng app, compose staging, Nginx/TLS,
   cấu hình secret, migration/seed orchestration, private storage/CORS,
   backup/restore và readiness phản ánh dependency/event backlog.
   RabbitMQ hiện chưa có volume trong Compose; bổ sung lưu dữ liệu nếu cần
   giữ queue qua lần recreate container ở môi trường triển khai.
6. **Vận hành/kiểm chứng cuối:** quan sát FAILED outbox, DLQ, pending lifecycle/
   replacement và conflict; hướng dẫn replay có kiểm soát. Thêm kiểm tra
   backup/restore, tải vừa phạm vi demo, tài liệu người dùng và sequence cho
   các luồng trọng tâm. Không cần service mesh/GPS/IoT/AI để hoàn thành PBL6.

## 8. Nhận xét kiến trúc

Điểm mạnh là ranh giới service/DB rõ, dùng logical references và HTTP/event,
RBAC catalog thống nhất, kiểm tra scope ở backend, transaction cho report/
assignment/history/outbox, inbox chống lặp và test concurrency/rollback.
Những phần này phù hợp để giải thích và bảo vệ kiến trúc của đồ án.

Rủi ro lớn hiện tại nằm ở tích hợp, kiểm tra lại quyền tại thời điểm ghi,
vòng đời session phía web và sự nhất quán của tài liệu nghiệm thu. Bộ test
rộng vẫn có thể bỏ lọt interleave hoặc lỗi form. Ưu tiên đóng các khoảng trống
này trước khi mở thêm nghiệp vụ hoặc thay đổi kiến trúc.
