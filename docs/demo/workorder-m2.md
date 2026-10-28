# K7 — Seed và chuẩn bị demo Work Order M2

Owner: Khương. Phần backend/seed đã có; hướng dẫn này không xác nhận Web/Android
đã nối API. Baseline sau K6: develop `ccace00`, PR #36 đã merge.

## Hai lệnh và phạm vi

```bash
pnpm --filter workorder-service db:seed:dev
pnpm --filter workorder-service demo:prepare
```

`db:seed:dev` tự generate/build WO rồi chạy seed. Cần Identity và Organization
API đang chạy, đã seed tenant DEMO, user/branch. Đọc service `.env` rồi root
`.env`; dùng SEED_DEMO_PASSWORD để login hai tài khoản demo, không in password/
token. Chỉ cho NODE_ENV development/test. Không cần WO API đang chạy cho seed.

Seed kiểm tra manager thuộc DEMO và có technician:manage, Technician ACTIVE
thuộc cùng tenant/role, HCM branch ACTIVE qua API với token manager. Chỉ ghi
workorder_db: Technician, hai Skill và các quan hệ TechnicianSkill. Nó không
truy vấn identity_db/organization_db hoặc tạo SR/WO giả.

Fixture mới: Technician `…4001`, skills `…4101/…4102`, xem
[fixtures](../api/fixtures.md). Nếu profile cùng user đã được UI/smoke tạo với
ID khác, seed tái sử dụng ID đó. Nếu Skill cùng code đã có, tái sử dụng nó.
Giữ nguyên employeeCode/branch/status, tên skill, level, skill bổ sung và lịch sử
assignment. Không tự đổi BUSY/OFF_DUTY/INACTIVE về AVAILABLE. Collision ID/code
thuộc user/tenant khác → dừng và rollback, không chiếm hoặc ghi đè dữ liệu đó.
Hai seed đồng thời được serialize bằng khóa transaction trong WO DB.

`demo:prepare` cần Gateway + Identity/Organization/Asset/SR/WO và broker thật.
Nó dùng API có auth để tìm **đúng một SR tên DEMO-M2-WORKORDER-01**, thuộc khách
DEMO và DEMO-ASSET-01. Không có thì customer tạo SR REPAIR → manager review/
accept trong bảo hành → manager tạo WO. SR/WO ID và số chứng từ do service sở
hữu cấp; tool không ghi trực tiếp DB SR/WO nghiệp vụ, chỉ dùng WO DB cho khóa
session điều phối các lần chạy tool.

Rerun tái sử dụng record, không reset/assign/complete/reopen/cancel; giữ title/
priority/lịch của WO đã chỉnh. Không đổi tên marker SR nếu còn dùng tool tìm lại
demo. Nếu có nhiều SR cùng marker hoặc nhiều lifecycle WO, tool dừng để người
vận hành đối soát; không chọn bản mới nhất tùy ý. Khi marker đã hoàn tất, dùng
UI/API để tạo kịch bản mới nếu muốn diễn lại; không sửa SQL reset trạng thái.
Khóa tool không phải idempotency API SR cho mọi client khác; lỗi HTTP chưa rõ
kết quả cần kiểm tra record rồi rerun, không tự cấp ý định mới.

Output JSON chỉ có profile/SR/WO IDs, business numbers, trạng thái và bước tiếp.
WO ban đầu CREATED; event thật đưa SR sang PROCESSING. Nếu broker chưa đồng bộ
trong 20 giây, tool báo lỗi và giữ IDs để rerun phục hồi; không giả thành công.

## Chuẩn bị từ môi trường chưa có dữ liệu

1. Cài dependency và hạ tầng theo root README. Owner các service xác nhận/apply
   migrations của baseline trước khi start code tương ứng.

   ```bash
   pnpm install --frozen-lockfile
   pnpm infra:up
   pnpm db:migrate
   pnpm identity:seed:dev
   ```

2. Terminal A: `pnpm dev:backend`. Chờ Identity/Organization/Asset/SR/WO và
   Gateway health sẵn sàng. Không chạy thêm instance trên cùng cổng.
3. Terminal B, root repository:

   ```bash
   pnpm --filter organization-service db:seed:dev
   pnpm --filter asset-service db:seed:dev
   pnpm --filter workorder-service db:seed:dev
   pnpm --filter workorder-service demo:prepare
   ```

   Seed Organization cần Identity thật để link user. Nếu WO watch restart sau
   build seed, chờ `/api/workorders/health` qua Gateway trước demo:prepare.
4. Web: `pnpm dev:web`. Mobile dùng Gateway URL cấu hình theo môi trường; không
   dùng localhost của điện thoại thay cho máy backend. Tài khoản/mật khẩu lấy
   từ Identity seed và SEED_DEMO_PASSWORD cục bộ, không đưa vào slide.

GATEWAY_URL là tùy chọn của demo tool, mặc định http://localhost:3000. Các base
URL service/DB lấy từ env hiện hành; .env.example là danh mục cấu hình gốc.

## Điểm bắt đầu để Web/Android tích hợp

- Service Manager/Dispatcher: list/detail WO theo workOrderId trong summary,
  `POST /api/workorders/work-orders/{id}/assign` với technicianId được seed in ra.
- Technician: `GET /api/workorders/technicians/me`,
  `GET /api/workorders/work-orders?mine=true`, rồi accept/start-travel/start/
  hold/resume/complete theo allowedActions và [workorder.yaml](../api/workorder.yaml).
- Customer: đọc SR summary; confirm/reopen theo quyền/trạng thái. CUSTOMER không
  được gọi WO/report trực tiếp. Event đồng bộ bất đồng bộ, UI cần refresh/poll
  phù hợp thay vì giả sử SR đổi ngay khi complete trả 200.
- Nếu Technician đang OFF_DUTY/INACTIVE, manager chủ động cập nhật theo API trước
  phân công. Seed sẽ giữ trạng thái đó. Không dùng SQL đổi BUSY/assignment.

## Smoke opt-in cho seed/demo thật

Sau khi đã build và start stack, trên dữ liệu demo riêng:

```bash
pnpm --filter workorder-service test:demo
```

Lệnh chạy seed hai lần, prepare hai lần, xác nhận profile/SR/WO không nhân đôi.
Nếu WO còn CREATED, smoke assign → accept, kiểm tra BUSY còn nguyên sau seed →
start → report complete → broker → customer-safe SR summary; CUSTOMER vẫn 403
ở WO. Sau progress/completion, seed/prepare tiếp không sửa WO/history hoặc tạo
thêm SR. Nếu job đã tiến triển, lệnh ghi NOT RUN phần execution và chỉ kiểm tra
preservation; không gọi đó là một lần thực hiện mới.

Smoke **hoàn thành job demo** khi còn CREATED; không chạy ngay trước buổi demo
nếu muốn tự trình diễn assignment/execution. Batch smoke login hơn 10 lần qua
Gateway; đặt LOGIN_RATE_LIMIT=100 trên Gateway dev/test và restart trước chạy
batch. Seed riêng login trực tiếp Identity, demo:prepare dùng ba login Gateway.

## Bằng chứng kiểm tra 28/10/2026

- PostgreSQL/RabbitMQ riêng cho kiểm thử; không reset hoặc seed thêm vào DB dev
  đang có của người dùng. Work Order DB: 130 PASS, gồm 19 seed cases mới và 111
  regression K1–K6. Unit/transport toàn repo: 213 PASS; lint/typecheck/build đạt.
- Stack Identity/Organization/Asset/SR/WO/Gateway thật, migration và seed các
  service theo ownership. Seed/demo rerun đạt, có assign/accept/start/report và
  event SR thật; giữ BUSY khi seed giữa execution và giữ WO/history sau complete.
- Không chạy UI Web/Android và không kiểm thử upload MinIO. K7 nghiệm thu 9/9
  và F09/F10/F11 SR vẫn được theo dõi riêng. K8 có
  [contract upload](../api/workorder-attachments.md) cho consumer review.
- Log local: `/tmp/pbl6-k78-*.log`, `/tmp/pbl6-review-k78-demo-smoke.log`.
