# M2 — Tuần 1 của Khương

| Thuộc tính | Giá trị |
| --- | --- |
| Kế hoạch tổng | [M2 của Khương](m2-khuong.md) |
| Ngày tạo / cập nhật | 2026-10-26 / 2026-10-26 |
| Mốc code đối chiếu | `2aecbe7` (implementation), `cf54470` (dependency); baseline trước triển khai `e3acf49` |
| Giả định thời gian | 5 ngày làm việc từ khi bắt đầu, khoảng 5–6 giờ tập trung/ngày |
| Trạng thái | Mục tiêu triển khai/test local tuần 1 đã đạt; chờ review/merge, chưa nghiệm thu M2 toàn nhóm |
| Việc tiếp theo | Review thay đổi tuần 1 với Nguyên/consumer; sau merge bắt đầu K4 và consumer hủy của K5 |

Đây là kế hoạch thực hiện K1 và phần ưu tiên của K2/K3, không phải cam kết
hoàn tất mọi endpoint trong một tuần. Nếu chỉ có 2–3 giờ/ngày hoặc review chưa
xong, kéo dài số ngày tương ứng và cập nhật lịch. Không bỏ kiểm tra quyền,
transaction hoặc DB tests để giữ lịch.

## 1. Mục tiêu cuối tuần

Thứ tự ưu tiên:

1. **K1:** Work Order dùng nền tảng chung, chạy được với DB thật, có health,
   auth/validation/lỗi/log và nền tảng event/test.
2. **K2 ưu tiên:** quản lý được profile Technician cơ bản và
   `/technicians/me`; có dữ liệu cho mobile nhận diện người dùng và web chuẩn
   bị phân công. Skill/trạng thái hoàn thiện theo sức chứa còn lại.
3. **K3 ưu tiên:** tạo WO từ SR ACCEPTED, đọc list/detail và phát Created v1
   để SR chuyển sang PROCESSING; bàn giao API qua Gateway.

Demo cuối tuần chưa gồm assign/accept/start/complete, Service Report, consumer
Maintenance hoặc upload. K5 được thiết kế cùng create trong tuần này nhưng
chưa được coi là hoàn thành. Nhánh create chỉ được nghiệm thu đầy đủ sau khi
race với hủy SR đã được xác minh.

## 2. Chia công việc theo ngày

| Ngày | Trọng tâm | Đầu ra cuối ngày | Task |
| --- | --- | --- | --- |
| 1 | Contract, dependency và đầu vào dùng chung | Checklist khác biệt, PR dependency, danh sách test DB/env/CI cần review | K1, D01/D04/D06 |
| 2 | Bootstrap và kiểm tra nền tảng | Service nối DB/auth/validation/health; bộ test nền tảng và PR bootstrap | K1 |
| 3 | Technician cơ bản và API me | API create/list/detail/me, kiểm tra reference và scope; mẫu request cho client | K2 ưu tiên |
| 4 | Tạo WO từ SR và đọc WO | Create/list/detail, cấp số WO, transaction/history/outbox, thiết kế khóa | K3 ưu tiên + thiết kế K5 |
| 5 | DB/concurrency, tích hợp và bàn giao | Bằng chứng API thật, case lỗi, trạng thái PR và danh sách việc sang tuần 2 | K7 xuyên suốt; phần K2/K3 còn lại nếu đủ thời gian |

### Ngày 1 — Chốt đầu vào, mở PR nhỏ

**Buổi đầu (2–3 giờ):**

- [x] Đối chiếu Work Order OpenAPI, state machine, schema/migration và event
  catalog. Ghi rõ endpoint nào làm tuần 1; giữ các migration đã có.
- [x] Lập ma trận endpoint → permission → tenant/assignment scope theo catalog
  hiện có; Khương đã chốt giữ nguyên D01. Nguyên review thay đổi dùng chung
  khi review PR, không tự cấp thêm quyền.
- [x] Chuẩn bị sửa câu “reports” ngoài M2 trong contract để phân biệt Service
  Report với thống kê. Cập nhật triển khai: câu chữ đã sửa trong commit
  implementation; gộp với PR tuần 1 và liệt kê để consumer review.

**Buổi sau (2–3 giờ):**

- [x] Chuẩn bị PR dependency chỉ gồm `apps/workorder-service/package.json`
  và lockfile theo CONTRIBUTING: package dùng chung, validation và dependency
  thực sự cần cho bootstrap; không sửa lockfile bằng tay.
- [x] Chuẩn bị nội dung phối hợp Nguyên: `workorder_test_db`,
  `WORKORDER_TEST_DATABASE_URL`, bootstrap DB, `.env.example` và CI chạy DB
  suite. Khương chuẩn bị test harness trong service; thay đổi dùng chung đi PR
  riêng và Nguyên review.
- [ ] Đặt lịch trao đổi với Huy về event cũ/WO thay thế; với Minh về D04
  (ai yêu cầu lần thay thế, event/operation, retry/backoff/giới hạn). Ghi câu
  hỏi và phạm vi bị chặn nếu chưa có câu trả lời. Khương đã chốt D04 là yêu
  cầu thay thế chủ động từ Service Manager; trao đổi/review với các owner chưa
  được thực hiện, không ghi nhận thay họ.

**Đạt khi:** PR dependency và checklist contract có thể review; các đầu vào
chưa chốt được ghi trong kế hoạch tổng. Ngày 1 không phụ thuộc Maintenance
đã có code hay chưa. Chỉ ghi “đã trao đổi/đã duyệt” khi có phản hồi thật.

### Ngày 2 — Biến scaffold thành service có nền tảng

- [x] Nối shared packages theo mẫu Identity/Asset/SR: PrismaModule/Service,
  global JWT/permission guard, `configureApp`, health DB, logger và correlation ID.
- [x] Validate DB/JWT/service URL/broker theo nhu cầu của service; cấu hình
  sai phải từ chối startup. Quy tắc broker dev/production theo mẫu đã thống nhất.
- [x] Cập nhật scripts tự generate Prisma khi cần; thay test Hello World
  bằng bootstrap/health/env và kiểm tra wiring auth phù hợp.
- [x] Chuẩn bị DB test harness có `requireTestDatabaseUrl`; không dùng
  business DB để chạy test có truncate/xóa dữ liệu.
- [x] Chuẩn bị outbox relay và vòng đời kết nối broker theo package có sẵn;
  không tự viết lại transport/retry/inbox.
- [x] Chạy lint/typecheck/unit/bootstrap tests/build liên quan. Health DB thật
  trả 200; ca DB không sẵn sàng → 503 được kiểm tra bằng fake trong bootstrap
  suite, không dừng PostgreSQL dùng chung để giả lập lỗi.

**Đạt khi:** service chạy trên cổng cấu hình, có PR bootstrap và hướng dẫn
chạy/check. Nếu test DB/CI chưa có, ghi phần đó “Chờ đầu vào”; không tick toàn
K1 hoàn thành chỉ vì build được. Ngày 3 có thể tiếp tục DTO/service với fake
trong lúc chờ review, giữ rõ quan hệ phụ thuộc giữa các PR.

### Ngày 3 — Technician để mobile/web có đầu vào

**Bắt buộc ưu tiên trong ngày:**

- [x] `POST /technicians`: validate DTO; kiểm tra tài khoản cùng tenant,
  TENANT_STAFF có role TECHNICIAN qua Identity; branch hợp lệ qua Organization.
- [x] `GET /technicians`, `GET /technicians/{id}`, `GET /technicians/me` theo
  contract; me lấy user ID từ token và trả lỗi profile thiếu đúng contract.
- [x] HTTP clients chuyển tiếp token/correlation ID. Có interface/fake để
  unit/HTTP test, production dùng HTTP thật và không fallback giả.
- [x] Test thiếu token/sai quyền, tenant khác, account/branch không hợp lệ,
  duplicate user/employeeCode và upstream lỗi; tenant khác không lộ dữ liệu.

**Làm tiếp nếu phần bắt buộc đã đạt:**

- [x] PATCH technician theo contract; BUSY do hệ thống quản lý, đặt AVAILABLE
  phải xét assignment ACCEPTED và giữ quy tắc OFF_DUTY/INACTIVE.
- [x] API Skill và thay danh sách skill của technician; validate tenant,
  uniqueness, level và rollback. Không triển khai UI quản trị skill ở đây.

**Đạt khi:** profile API ưu tiên có test phù hợp, mẫu request/response và PR
cho Nguyên/Hatsady review. Nếu PATCH/Skill còn thiếu thì báo K2 “Đang làm”,
không đánh dấu toàn K2 hoàn thành.

### Ngày 4 — Luồng tạo Work Order từ SR

- [x] Chuẩn bị SRClient và AssetClient theo internal contract; dùng fake
  đúng contract cho test, HTTP thật chuyển tiếp token/correlation ID.
- [x] `POST /work-orders`: lấy advisory lock theo SR ID trong transaction,
  sau đó đọc SR; chỉ nhận SR ACCEPTED. Reference/customer/equipment từ service
  có thẩm quyền, không tin client gửi tenant/customer để xác lập ownership.
- [x] Lấy site/location từ Asset; xử lý lịch/title/priority theo contract;
  cấp số WO từ document sequence an toàn khi chạy đồng thời.
- [x] Ghi WO CREATED, history/work log theo actor và outbox Created v1 trong
  cùng transaction; map constraint một WO chưa terminal/SR thành lỗi 409.
- [x] `GET /work-orders` và `GET /work-orders/{id}` theo contract; Technician
  chỉ thấy WO được/đã được giao, CUSTOMER bị chặn. Chưa có assignment API vẫn
  phải test scope bằng dữ liệu test phù hợp.
- [x] Ghi thiết kế consumer cancel dùng cùng advisory lock và test case cần
  làm; helper khóa, HTTP timeout và transaction timeout đã có. Kiểm chứng
  consumer cancel/event trễ với Huy còn ở K5, chưa chạy trong tuần 1.

**Đạt khi:** create/list/detail có PR, test validation/scope/upstream lỗi,
rollback và tạo trùng; outbox đúng catalog. Việc hủy chỉ có thiết kế/test case
chưa chứng minh K5 đã triển khai. Internal reference/history/update/filter còn
thiếu được ghi để làm tiếp trong ngày 5 hoặc đầu tuần 2.

### Ngày 5 — Kiểm chứng và bàn giao

**Ưu tiên 1 — Xác minh phần đã viết:**

- [x] DB tests trên `workorder_test_db`: tạo đồng thời cùng SR chỉ có một WO
  chưa terminal; không trùng số WO; rollback không để lại history/outbox dở dang.
- [x] Negative tests: tenant khác → 404, technician chưa từng được giao không
  xem được WO, CUSTOMER không đọc WO, field tenant lạ bị validation từ chối.
- [x] Kiểm tra migration/drift trên đúng DB/shadow, giữ các raw SQL constraint;
  lint/typecheck/test/build liên quan đạt và có CI/bằng chứng phù hợp.

**Ưu tiên 2 — Tích hợp thật:**

- [x] Dùng Identity/Organization/Asset/SR/Gateway, DB và RabbitMQ thật; chuẩn bị
  dữ liệu demo theo owner/fixtures, không đọc/ghi DB của service khác từ WO.
- [x] Login Service Manager → tạo/review/accept SR trong bảo hành →
  `POST /api/workorders/work-orders` → WO CREATED → event Created v1 → SR
  PROCESSING; chờ event theo điều kiện, không giả định cập nhật tức thì.
- [x] Login Technician → `GET /api/workorders/technicians/me`; kiểm tra API
  đọc và đường dẫn Gateway. My Jobs có thể rỗng vì tuần này chưa phân công.
- [x] Ghi commit, môi trường, case và response an toàn vào bảng bằng chứng;
  nếu chưa chạy được chỉ ghi Pending và phụ thuộc, không thay bằng mock Pass.

**Ưu tiên 3 — Nếu còn thời gian sau kiểm chứng:**

- [x] Hoàn thiện history/internal reference/update/filter theo contract K3,
  hoặc Skill/PATCH còn thiếu ở K2; test đi cùng thay đổi.
- [x] Đối chiếu danh sách endpoint với K2/K3 trước khi tick hoàn thành.
- [x] Chuẩn bị hướng dẫn API, quyền, lỗi, trạng thái PR và bằng chứng trong
  README/kế hoạch để Nguyên/Hatsady/Huy review; chưa ghi nhận phản hồi của họ.

**Đạt khi:** có bằng chứng thực tế cho mục tiêu cuối tuần và danh sách phần
còn lại. Create/cancel chưa xác minh thì vẫn ghi rõ giới hạn nghiệm thu.

## 3. PR và phạm vi file

Tên nhánh là gợi ý theo CONTRIBUTING; mỗi PR tách từ `develop` phù hợp trạng
thái đã merge. PR phụ thuộc phải ghi rõ base/dependency, không đưa lại thay đổi
của người khác vào PR để chạy được.

| PR | Nhánh gợi ý | Phạm vi chính | Trạng thái / link |
| --- | --- | --- | --- |
| Dependency | `feature/khuong-workorder-deps` | package WO + lockfile; Nguyên review | Đã commit `cf54470`, chờ review |
| Implementation tuần 1 | `feature/khuong-workorder-week1` | Bootstrap, Technician/Skill, create/read/update/history/internal WO và kiểm thử | Đã code/test local tại `2aecbe7`, chờ review |
| Contract clarification và Test DB / CI | Cùng nhánh implementation tuần 1 | Liệt kê riêng các file dùng chung để Nguyên/consumer review | Đã chuẩn bị; chưa có owner review |

So với chia PR ban đầu, bootstrap/Technician/WO và phần cấu hình được gộp để
review cùng luồng đã chạy; dependency vẫn tách riêng. Đây là điều chỉnh cách
đóng gói, không tự thay đổi ownership hay bỏ yêu cầu review.

## 4. Những đầu vào cần phối hợp ngay

| Người | Nội dung cần trao đổi | Thời điểm | Nếu chưa có |
| --- | --- | --- | --- |
| Nguyên | Review dependency/permission; test DB/env/CI; mẫu API me cho Android | Ngày 1, bàn giao tăng dần từ ngày 3 | Dùng fake cho kiểm thử độc lập; DB test/CI không được ghi đạt |
| Huy | Internal SR, demo ACCEPTED, consumer Created và rủi ro event WO cũ | Ngày 1–2; tích hợp ngày 5 | Client giả theo contract; giữ trạng thái Pending cho integration |
| Minh | D04: yêu cầu WO thay thế, retry và thứ tự event | Đề nghị chốt trong tuần 1 | Tiếp tục nhánh SR; chưa code phần K6 phụ thuộc |
| Hatsady | API profile/list/create/detail, quyền và URL `/api/workorders/...` | Chia sẻ contract đầu tuần, API mẫu ngày 3–5 | Web M2 dùng mock contract; giữ màn hình M1 dùng API thật |

Đây là checklist phối hợp, không xác nhận các cuộc trao đổi/review đã diễn ra.

## 5. Theo dõi và kết thúc tuần

| Ngày | Trạng thái | PR / commit | Kiểm tra đã chạy và bằng chứng | Còn thiếu / việc tiếp theo |
| --- | --- | --- | --- | --- |
| 1 | Đã chuẩn bị; chờ review owner | `cf54470`, `2aecbe7` | D01/D04 Khương đã chốt; dependency/contract/test DB đã chuẩn bị | Chờ Nguyên/consumer review |
| 2 | Đã code/test local | `2aecbe7` | 5 unit + 2 bootstrap test; health/auth/env/HTTP forwarding đạt | Chờ review/merge |
| 3 | Đã code/test local | `2aecbe7` | Profile/Skill/PATCH/me có DB test; smoke references thật đạt | Chờ review/merge |
| 4 | Đã code/test local | `2aecbe7` | Create/list/detail/patch/history/internal + outbox; có helper advisory lock | K5 consumer/race chưa triển khai |
| 5 | Kiểm chứng local đạt | `2aecbe7` | 16 DB test; lint/typecheck/build toàn repo; 183 test; smoke M1/M2 và drift đạt | Theo dõi CI remote/review; không đánh dấu merge khi chưa merge |

Cuối mỗi ngày cập nhật dòng tương ứng, checklist đã chứng minh và mục **Việc
tiếp theo** trong kế hoạch tổng. Chỉ tick toàn K1/K2/K3 sau khi đạt đủ phạm vi
của task, có bằng chứng và PR đã merge; hoàn thành API ưu tiên không tự động
nghĩa là hoàn thành toàn task.

Nếu thiếu thời gian, giữ thứ tự: nền tảng/quyền → profile tối thiểu → create/
đọc WO đúng transaction → kiểm thử/tích hợp. Ghi Skill, filter/update/history
hoặc internal API còn thiếu thành việc đầu tuần 2; vẫn thuộc M2. Không mở
assign/complete/Maintenance/upload để tăng số đầu việc khi luồng ưu tiên chưa ổn.

Kết quả chạy local và ID smoke được lưu tại
[bằng chứng tuần 1](../testing/m2-week1-test-cases.md). Đã hoàn thiện cả Skill,
PATCH, filter/history/internal reference ngoài phần ưu tiên ban đầu. Các
checkbox đã tick thể hiện code/test local; chưa đại diện cho review/merge.
K5 chỉ có thiết kế khóa, còn assignment/execute/complete/Maintenance thuộc
các phần tiếp theo. Các lệnh kiểm tra và nguồn kỹ thuật nằm trong
[kế hoạch tổng](m2-khuong.md).

## 6. Nhật ký

| Ngày | Người cập nhật | Thay đổi |
| --- | --- | --- |
| 2026-10-26 | Codex, theo yêu cầu Khương | Chia tuần 1 thành 5 ngày; xác định mục tiêu ưu tiên, đầu ra, PR, phối hợp và bảng bằng chứng. Chưa triển khai code hoặc nghiệm thu task. |
| 2026-10-26 | Codex; Khương chốt D01/D04 | Hoàn thiện triển khai và kiểm tra local tuần 1 tại `2aecbe7`; lưu bằng chứng, giữ rõ review/merge và trao đổi owner còn chờ. |
