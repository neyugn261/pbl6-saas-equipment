# M3 — Kịch bản demo đầy đủ cho Khương

Đối chiếu ngày 03/11/2026, `develop@3bcf42f`. Hướng dẫn ưu tiên Ubuntu/zsh trên
máy hiện tại, chạy backend và Vite ở host, hạ tầng trong `docker-compose.yml`.
Dành 30–45 phút chuẩn bị và 35–45 phút trình diễn đầy đủ. Luồng chính cần khoảng
20–25 phút; các nhánh mở rộng thực hiện sau để không làm đổi trạng thái luồng chính.

**Trạng thái hiện tại: chưa chốt M3.** API liên dịch vụ, file CUSTOMER, Inventory
reservation và activation email đã chạy thật trong lần rà soát. Tuy nhiên marker
bootstrap của Identity bị Notification từ chối do sai `aggregateType/aggregateId`.
Phải merge bản sửa của Huy và qua cổng kiểm tra ở mục 5 trước khi trình diễn
Notification hoặc ghi nhận M3 hoàn tất. Xem [báo cáo và bằng chứng](../reports/2026-11-03-m3-final-readiness.md).

## 1. Chuẩn bị nhánh và cấu hình

Tại root repository:

```bash
cd /home/khuong/projects/PBL6/pbl6-saas-equipment
git status --short
git switch develop
git pull --ff-only origin develop
pnpm install --frozen-lockfile
pnpm build:packages
pnpm -r --if-present prisma:generate
```

Giữ lại `.env` hiện có; nếu là máy mới mới copy `.env.example` thành `.env`.
Không ghi đè file môi trường đang dùng. Không chạy nhiều `pnpm install` hoặc
`build:packages` đồng thời vì build package dùng chung có bước clean.
Generate Prisma là bước riêng bắt buộc khi cập nhật schema; `nest build` của
Notification hiện không tự generate client.

Kiểm tra các biến sau trong `.env` (không đưa secret vào tài liệu hay Git):

| Biến | Giá trị/điều kiện local |
|---|---|
| `NODE_ENV` | `development` |
| `JWT_ACCESS_SECRET` | Giá trị riêng, ít nhất 32 ký tự; dùng chung giữa các service |
| `SEED_DEMO_PASSWORD` | Mật khẩu demo riêng, tối thiểu 8 ký tự; các seed dùng cùng giá trị |
| `BCRYPT_COST` | `10`–`15` trong development; không dùng `4` khi khởi động development |
| `*_DATABASE_URL`, `*_SHADOW_DATABASE_URL` | Đúng từng DB của service, khớp PostgreSQL local |
| `RABBITMQ_URL` | Khớp broker local, ví dụ giá trị dev trong `.env.example` |
| `IDENTITY_SERVICE_URL`…`INVENTORY_SERVICE_URL` | Các service host `localhost:3001`…`3008`, theo `.env.example` |
| `WORKORDER_ATTACHMENTS_ENABLED` | `true` |
| `WORKORDER_ATTACHMENT_WORKER_ENABLED` | `true` |
| `MINIO_ENDPOINT`, `MINIO_PORT`, `MINIO_USE_SSL` | `localhost`, `9000`, `false` |
| `MINIO_REGION` | `us-east-1` — không bỏ trống |
| `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY` | Khớp MinIO đang chạy |
| `WORKORDER_ATTACHMENT_BUCKET` | `pbl6-workorder-attachments` hoặc bucket demo riêng |
| `MINIO_PUBLIC_ENDPOINT` | `http://localhost:9000` cho browser trên host |
| `CORS_ORIGINS` | `http://localhost:5173` |
| `ASSET_QR_PORTAL_BASE_URL` | `http://localhost:5173/` |
| `IDENTITY_ACTIVATION_ENCRYPTION_KEY` | 64 ký tự hex sinh một lần, giữ ổn định khi còn mail pending |
| `IDENTITY_ACTIVATION_URL_BASE` | `http://localhost:5173/activate#token=` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM` | `localhost`, `1025`, địa chỉ gửi demo |
| `IDENTITY_EXPOSE_ACTIVATION_TOKEN` | `false`; demo email qua Mailpit |
| `LOGIN_RATE_LIMIT` | Có thể đặt `100` cho rehearsal local nhiều tài khoản; restart Gateway sau đổi |
| `MAINTENANCE_SCHEDULER_ENABLED` | Có thể đặt `false` để tự tick ở nhánh bảo trì, tránh sinh WO giữa demo chính |

Sinh hai secret riêng nếu chưa có: chạy `openssl rand -hex 32` hai lần và điền
vào hai biến JWT/encryption tương ứng. Không sinh lại encryption key mỗi lần restart.

Với Vite, tạo/kiểm tra `apps/web/.env.local`:

```dotenv
VITE_M1_API_MODE=live
VITE_GATEWAY_API_URL=/gateway
GATEWAY_PROXY_TARGET=http://localhost:3000
```

Bỏ các override `VITE_*_API_URL` trỏ về Prism/mock nếu còn. Restart Vite sau đổi env.
Nếu dùng điện thoại thật, thay URL QR, web và MinIO bằng LAN IP truy cập được từ
cả host và điện thoại; không sửa host trên một URL đã ký, phải xin ticket mới.

## 2. Khởi động hạ tầng, mail và database

```bash
docker compose up -d
docker compose ps
```

Bốn container PostgreSQL, RabbitMQ, Redis và MinIO phải `Up`. Chờ PostgreSQL:

```bash
docker compose exec -T postgres pg_isready -U pbl6 -d postgres
```

`docker-compose.yml` local chưa có Mailpit. Trong terminal riêng chạy mail sink:

```bash
docker run --rm --name pbl6-mailpit-demo \
  -p 127.0.0.1:1025:1025 -p 127.0.0.1:8025:8025 \
  axllent/mailpit:latest
```

Nếu đã có Mailpit tại các cổng này thì dùng instance đang có. Mở
`http://localhost:8025` để kiểm tra. Đây là hộp thư local, không gửi thư ra Internet.

Terminal chuẩn bị, root repository:

```bash
pnpm db:migrate
pnpm identity:seed:dev
pnpm --filter workorder-service attachments:prepare
```

Migration phải áp đủ 8 service, gồm WO `0006_inventory_reservations`, Inventory
các migration hiện hành và Notification `0002`/`0003`. Provision storage phải trả
`READY`, bucket private và CORS đúng origin. Không dùng `prisma db push`, không
xóa volume hoặc reset DB đang dùng để xử lý lỗi migration.

Nếu đã seed trước đây, seed sẽ tái sử dụng dữ liệu và giữ thay đổi nghiệp vụ;
không kỳ vọng seed đưa tồn kho/WO đã hoàn thành về trạng thái ban đầu.

## 3. Khởi động ứng dụng và seed theo phụ thuộc

Terminal A, root:

```bash
pnpm dev:backend
```

Chờ các service khởi động. Terminal B, root:

```bash
pnpm --filter organization-service db:seed:dev
pnpm --filter asset-service db:seed:dev
pnpm --filter workorder-service db:seed:dev
pnpm --filter inventory-service db:seed:dev
pnpm --filter maintenance-service build
pnpm --filter maintenance-service db:seed:dev
```

Identity phải đang chạy để Organization link user; WO/Inventory cần Identity và
Organization thật; Maintenance seed cần Asset thật. Seed/build có thể khiến watch
restart; chờ health ổn định lại rồi mới thao tác tiếp.

Terminal C, root:

```bash
pnpm dev:web
```

Web: `http://localhost:5173/login`. Mailpit: `http://localhost:8025`.
RabbitMQ UI local: `http://localhost:15672` (credential theo cấu hình dev).
MinIO console local: `http://localhost:9001`.

Kiểm tra health của từng service, không chỉ Gateway:

```bash
for port in 3000 3001 3002 3003 3004 3005 3006 3007 3008; do
  printf 'port %s: ' "$port"
  curl --fail --silent --show-error "http://localhost:$port/health"
  printf '\n'
done
```

Tất cả phải HTTP 200, database `up`. Gateway `/health` không chứng minh
Notification đã bootstrap hoặc Inventory reservation hoạt động.

## 4. Tài khoản, cửa sổ và dữ liệu

Mã tenant: **DEMO**. Mật khẩu tài khoản seed lấy từ `.env` (`SEED_DEMO_PASSWORD`).
Mỗi vai trò dùng profile trình duyệt/cửa sổ riêng; hai tab thường dùng chung
cookie nhưng phiên web hiện lưu theo tab. Để dễ theo dõi, đặt nhãn cửa sổ theo role.
Không copy bearer token giữa các vai trò.

| Vai trò | Tài khoản | Trang nên mở sẵn |
|---|---|---|
| Tenant Admin | `tenant.admin@demo.local` | `/app/equipment-registrations`, `/users/invite` |
| Service Manager | `service.manager@demo.local` | `/app/service-requests`, `/app/work-orders`, `/app/reports` |
| Dispatcher | `dispatcher@demo.local` | `/app/work-orders`, `/app/notifications` |
| Inventory Staff | `inventory@demo.local` | `/app/inventory/parts`, `/app/inventory/transactions`, `/app/notifications` |
| Technician | `technician@demo.local` | `/app/work-orders`, `/app/notifications` |
| Customer Admin | `customer.admin@demo.local` | `/portal/equipment`, `/portal/maintenance`, `/users/invite` |
| Customer User | `customer.user@demo.local` | `/portal/equipment`, `/portal/requests`, `/portal/notifications` |

Dữ liệu gốc: [fixtures](../api/fixtures.md).

- `DEMO-ASSET-01` (`…1101`): của `DEMO-CUST-01`, còn bảo hành đến 2099; dùng luồng chính.
- `DEMO-ASSET-02` (`…1102`): cùng khách hàng, đã hết bảo hành; dùng nhánh báo giá.
- `DEMO-ASSET-03` (`…1103`): của `DEMO-CUST-02`; dùng kiểm tra không xem được.
- Technician `DEMO-TECH-01`: kiểm tra `AVAILABLE`; không dùng SQL để xóa BUSY.
- Part `DEMO-FILTER-01`, kho `DEMO-HCM-STORE`, ngưỡng gốc `5.00`.
  Seed chỉ nhập `10.00` một lần. Nếu tồn hiện tại khác, ghi lại và bổ sung qua UI.
- Chuẩn bị hai file PNG/JPEG/PDF, mỗi file <10 MiB: `internal-evidence.png` và
  `customer-result.pdf` (dùng file thật đúng định dạng, không chỉ đổi đuôi).

Đặt marker mới cho từng lần chạy, ví dụ `M3-DEMO-20261103-LAN1`; ghi lại SR/WO
number trên giấy. Không reset SR/WO cũ. `demo:prepare` chỉ tạo/tái sử dụng marker
M2 cố định; không chạy `test:demo` trước trình diễn vì có thể tự hoàn thành WO đó.

## 5. Cổng bắt buộc: recipient bootstrap và Notification

**Chỉ qua mục này sau khi Huy sửa validation marker theo shared catalog.**
`--new` trên code hiện tại vẫn phát marker bị từ chối, không chữa được lỗi.

Đảm bảo Notification đang chạy với `RABBITMQ_URL` đúng broker:

```bash
docker compose exec -T rabbitmq rabbitmqctl list_queues name messages consumers
docker compose exec -T rabbitmq rabbitmqctl list_bindings source_name destination_name routing_key
```

Cần ba queue chính có consumer:
`notification-service.recipient-snapshots`,
`notification-service.recipient-bootstrap`,
`notification-service.business-events`.
Hai binding recipient phải trỏ từ `pbl6.events` theo routing key của catalog.
Queue `.retry`/`.dlq` có 0 consumer là bình thường; nếu có message thì phải xem lý do.

Chạy bootstrap **sau khi queue đã bind**:

```bash
pnpm --filter identity-service recipient:bootstrap 00000000-0000-4000-8000-000000000001
```

Nếu Identity báo `already COMPLETED` từ lần phát khi chưa có consumer, hoặc muốn
recapture sau khi sửa lỗi marker, tạo run mới:

```bash
pnpm --filter identity-service recipient:bootstrap 00000000-0000-4000-8000-000000000001 --new
```

Kiểm tra kết quả **ở Notification**, không chỉ dòng `COMPLETED` của CLI Identity:

```bash
docker compose exec -T postgres psql -U pbl6 -d notification_db -c "SELECT bootstrap_run_id,expected_users,received_users,marker_received,status FROM recipient_bootstrap_runs WHERE tenant_id='00000000-0000-4000-8000-000000000001' ORDER BY created_at DESC LIMIT 3;"
```

Run mới nhất phải có `status=COMPLETED`, `marker_received=t`,
`expected_users=received_users`. Không cố định phải 8: có thể đã mời thêm user.
Nếu thiếu snapshot hoặc marker bị DLQ, xem log Notification/Identity; không sửa
SQL thành COMPLETED. Với lỗi cũ cần owner replay event gốc hoặc dùng bootstrap
run mới hợp lệ, không đổi metadata/eventId của event cũ để né validation.

Tạo một SR kiểm tra mới bằng Customer User, rồi mở inbox manager/dispatcher và
requester. Trong vòng vài chu kỳ relay/reconcile (chờ khoảng 30 giây) phải thấy
thông báo thật, mở được SR tương ứng. Đánh dấu đã đọc và kiểm tra badge giảm;
filter UNREAD không còn item đó. Reload sau event mới nếu bell chưa tự cập nhật.
Nếu chưa thấy, kiểm tra:

```bash
docker compose exec -T postgres psql -U pbl6 -d notification_db -c "SELECT reason,status,count(*) FROM pending_notification_events WHERE tenant_id='00000000-0000-4000-8000-000000000001' GROUP BY reason,status;"
```

Các event `WAITING_FOR_RECIPIENT_BOOTSTRAP` phải được reconcile sau bootstrap
hợp lệ, gồm cả trường hợp đã vào `MANUAL_REVIEW` vì chờ quá lâu. Không coi việc
inbox trả 200 nhưng rỗng là bằng chứng fan-out thành công.

## 6. Luồng chính — SR tới khách hàng xác nhận (20–25 phút)

| Bước | Người thực hiện và thao tác | Kết quả cần cho người xem thấy |
|---|---|---|
| 1 | Customer User mở `/portal/equipment`, chọn `DEMO-ASSET-01` | Đúng customer, model, serial, bảo hành; không có `DEMO-ASSET-03` |
| 2 | Tạo SR mới tại `/portal/requests/new`, thiết bị 01, loại REPAIR, NORMAL, title có marker lần chạy | SR number thật, trạng thái NEW; ghi lại SR number |
| 3 | Mở inbox Customer, manager, dispatcher | Requester và staff đúng audience nhận event Created; không yêu cầu mọi customer đều nhận |
| 4 | Manager mở SR, bấm xem xét/kiểm tra bảo hành rồi tiếp nhận | NEW → REVIEWING → ACCEPTED, snapshot IN_WARRANTY và history thật |
| 5 | Manager chọn tạo WO từ chính SR | WO number thật, CREATED; sau event SR thành PROCESSING. Ghi lại WO number |
| 6 | Dispatcher mở WO, đặt lịch phù hợp nếu cần, phân công DEMO-TECH-01 | ASSIGNED, history phân công; Technician có thông báo assignment |
| 7 | Technician nhận lệnh, bắt đầu di chuyển, bắt đầu công việc | ACCEPTED → TRAVELLING → IN_PROGRESS theo `allowedActions`; có thể hold/resume với lý do |
| 8 | Inventory Staff mở giao dịch kho, chọn đúng WO/kho/part, xuất số lượng phù hợp | Một ISSUE trên ledger, một usage; không còn operation chờ đối soát cho WO trước complete |
| 9 | Technician upload `internal-evidence.png` vào phần tệp WO khi đang IN_PROGRESS | Prepare → PUT storage → finalize; tệp INTERNAL, dữ liệu còn sau refresh |
| 10 | Inventory Staff tải phụ tùng theo WO, trả phần chưa sử dụng, tình trạng GOOD, có ghi chú | Một RETURN, số dư/ledger đổi đúng; không trả vượt outstanding |
| 11 | Technician nhập sự cố, nguyên nhân nội bộ, giải pháp, result RESOLVED và customerSummary rồi hoàn tất | WO COMPLETED, có service report; refresh Customer SR đến RESOLVED |
| 12 | Technician upload `customer-result.pdf` ở phần tệp báo cáo đã tồn tại | Report attachment ban đầu INTERNAL; không upload lại tệp WO khi WO đã terminal |
| 13 | Manager mở báo cáo, đổi riêng `customer-result.pdf` sang CUSTOMER | Tệp kết quả được công bố; `internal-evidence.png` giữ INTERNAL |
| 14 | Customer mở SR RESOLVED, xem summary và file kết quả rồi tải | Chỉ có summary được phép và file CUSTOMER; tải được byte thật từ MinIO; không có report note/WO route nội bộ |
| 15 | Customer xác nhận hoàn thành | SR CLOSED, lịch sử có người xác nhận/mốc thời gian; thông báo theo SR scope |
| 16 | Manager mở `/app/reports`, chọn khoảng ngày chứa lượt demo | Summary API thật: created/completed và trạng thái đúng. Khoảng ngày UI chuyển theo Asia/Ho_Chi_Minh, không cộng số từ list phân trang |

Gợi ý nội dung report: sự cố “Bộ lọc bẩn, máy báo lỗi”; giải pháp “Vệ sinh và thay
bộ lọc, chạy thử”; customerSummary “Đã xử lý lỗi, thiết bị vận hành ổn định.”
Ghi chú nội bộ dùng câu khác để dễ chứng minh nó không lộ trên portal.

Tồn kho gợi ý nếu bắt đầu đúng `10.00`, min `5.00`: xuất `6.00` còn `4.00`, trả
`1.00` GOOD thành `5.00`; kiểm tra số thực tế trước mọi thao tác. Nếu chỉ muốn
luồng chính gọn, xuất `2.00`, trả `1.00`, rồi minh họa Low Stock riêng ở mục 8.

Phần xác nhận **đã dùng thực tế** có API gắn service report nhưng UI M3 hiện chưa
có control `confirm-use`. Không gọi “đã xuất” là “đã dùng”. Nếu cần demo đầy đủ
lịch sử thay thế, dùng API ở mục 10 sau khi report COMPLETED; không mô tả rằng
đã làm được thao tác đó từ form hiện tại.

Không dùng số trên `/app/dashboard` làm evidence: màn hình này vẫn có dữ liệu
sample và offset hardcode. Dùng danh sách live và `/app/reports` cho dữ liệu thật.

## 7. Nhánh bàn giao + QR (5–7 phút)

1. Tenant Admin mở `/app/equipment-registrations/new`, dùng customer/site/model
   đã seed, đặt asset code/serial mới theo marker lần chạy và lưu draft.
2. Manager mở lại đúng draft. Chọn Warranty CREATE với thời gian còn hiệu lực;
   chọn Maintenance CREATE hoặc NONE kèm lý do. Nếu muốn demo bảo trì, chọn
   CREATE và ngày đến hạn phù hợp; không tạo trùng một plan đang dùng.
3. Submit, chờ trạng thái hoàn tất; nếu `PENDING_MAINTENANCE`, dùng kiểm tra/tiếp
   tục cùng registration, không tạo wizard mới vì phản hồi chậm.
4. Mở dossier, warranty/plan, history, xem/tải/in QR. Customer đăng nhập rồi quét
   hoặc mở QR, kiểm tra giải đúng thiết bị trong scope. QR không bỏ qua login/quyền.
5. Có thể dùng thiết bị mới này làm luồng chính; nếu rehearsal chưa xác nhận đầy
   đủ warranty/membership thì dùng DEMO-ASSET-01 để giữ luồng chính ổn định.

## 8. Nhánh Low Stock và cảnh báo lại (4 phút)

1. Inventory Staff xem tồn thực tế và minQuantity. Seed mặc định part 01 có min
   `5.00`; sửa threshold có thể tự gây alert nên ghi lại baseline trước khi đổi.
2. Đưa available về `>=5.00` bằng RECEIVE nếu cần (có chứng từ/ghi chú) để re-arm.
3. Xuất cho một WO còn mở hoặc ADJUST_OUT có lý do kiểm kê, đưa tồn xuống `<5.00`.
   Ví dụ 5 → 4. Warehouse hiển thị low stock; inventory inbox có LowStock notice.
4. Một thay đổi tiếp theo khi vẫn `<5.00` không tạo alert mới cho cùng episode.
5. RECEIVE để về `>=5.00`, sau đó hạ xuống `<5.00` lần nữa: có một alert mới.

Điều kiện là **nhỏ hơn**, không phải bằng ngưỡng. Audience M3 hiện chỉ
INVENTORY_STAFF; không kỳ vọng Service Manager/Customer nhận LowStock.
Số lượng là decimal string. Notification bị marker blocker thì chỉ chứng minh
được producer/stock state, chưa chứng minh được inbox ở mục này.

## 9. Nhánh ngoài bảo hành, bảo trì và activation (8–12 phút)

### Ngoài bảo hành

- Tạo SR **khác** cho DEMO-ASSET-02; manager review thấy OUT_OF_WARRANTY.
- Lập báo giá một dòng LABOR hoặc PART, nhập quantity/unitPrice dạng decimal,
  currency VND, `validUntil` ở tương lai theo thời gian hiện tại, rồi gửi.
- Customer **Admin** xem và approve (hoặc reject trong một SR riêng). Customer
  User không thay cho Customer Admin khi duyệt giá.
- Manager tiếp tục accept/create WO khi server cho phép. Không demo hóa đơn,
  thanh toán hoặc VAT. Không dùng báo giá hết hạn rồi kỳ vọng chỉ cần refresh là duyệt được.

### Bảo trì

- Customer Admin/Manager mở Maintenance để xem plan đã seed, đúng thiết bị/scope.
- Với scheduler đã tắt tự chạy, operator chạy một tick thật trong terminal root:

```bash
pnpm --filter maintenance-service scheduler:tick
```

- Mở lại task/WO được tạo từ event, kiểm tra logical link và không sinh trùng khi
  tick lại cùng kỳ. Maintenance seed giữ lịch cũ: nếu chưa tới hạn, UI/manager
  phải chọn plan/ngày hợp lệ, không sửa DB hoặc giả rằng tick đã tạo task.
- Maintenance-origin WO không tự sinh customer notification nếu không có SR.

### Mời tài khoản và email kích hoạt

- Tenant Admin vào `/users/invite`, mời một TENANT_STAFF/TECHNICIAN với email
  demo **mới mỗi lần chạy**; đây là nhánh độc lập, không đổi Technician đang làm WO.
- Mở Mailpit, kiểm tra thư đúng người nhận, mở link `/activate#token=...` ở cửa sổ
  sạch, đặt mật khẩu mới có chữ hoa, chữ thường, số và ký tự đặc biệt (8–128 ký tự).
- Kích hoạt thành ACTIVE, đăng nhập được; dùng lại link không thể kích hoạt lần hai.
- Token không xuất hiện trong response mời khi `IDENTITY_EXPOSE_ACTIVATION_TOKEN=false`.
  Identity sở hữu SMTP/token lifecycle; Notification không nhận token này.
- Nếu muốn mời Customer User, dùng Customer Admin tại `/users/invite` để form
  gắn membership vào đúng customer; phải hoàn tất cả membership và activation.
  Mời CUSTOMER từ Tenant Admin đơn thuần không tự bảo đảm có customer membership.

## 10. Phần API bổ trợ: xác nhận phụ tùng thực dùng

Control UI chưa có; chỉ thực hiện nếu cần trình bày cải tiến nghiệp vụ Inventory.
Dùng Bruno/Postman có bearer của **Technician được phân công**, không phải Inventory
Staff. Lấy usage ID từ Inventory response, report ID từ report của đúng WO.

```http
POST /api/inventory/work-order-parts/{usageId}/confirm-use
Authorization: Bearer <token Technician>
Idempotency-Key: <một UUID cố định cho ý định này>
Content-Type: application/json

{
  "quantity": "5.00",
  "serviceReportId": "<report UUID của WO đã COMPLETED>",
  "customerReason": "Thay bộ lọc bị hỏng",
  "removedPartDisposition": "NOT_APPLICABLE"
}
```

`5.00` chỉ đúng ví dụ xuất 6, trả 1; dùng đúng số chưa đối soát của lượt chạy.
Nếu mô tả bộ phận tháo ra được giữ/trả/tiêu hủy thì chọn disposition tương ứng
và thêm `removedPartNote`. Replay cùng key/body phải trả cùng kết quả; không
phát sinh thêm stock movement. Không công bố internal cost/note cho Customer.

## 11. Lỗi và phân quyền cần thử trong rehearsal

| Tình huống | Cách thử và kết quả đúng |
|---|---|
| Scope customer | Customer mở URL dossier của DEMO-ASSET-03: backend 404; không trả thông tin customer khác |
| Quyền staff | Customer gọi WO/report trực tiếp hoặc Inventory catalogue: 403; tệp kết quả đi qua SR route |
| File INTERNAL | Customer không thấy INTERNAL; dùng ID INTERNAL tại SR download vẫn bị từ chối |
| Phiên hết hạn | UI yêu cầu làm mới/đăng nhập; không tự báo thao tác thành công |
| Stale state 409 | Refresh detail/stock, dùng `allowedActions` mới; không POST mù nhiều lần |
| Dịch vụ WO tạm ngắt | Tắt riêng process Work Order trên stack rehearsal, gửi ISSUE từ web: nhận lỗi và giữ giao dịch đã lưu. Bật WO lại, chọn thử lại cùng giao dịch; chỉ một ISSUE. Không dùng `killall node` |
| Mất phản hồi sau commit | Chỉ làm trên dữ liệu rehearsal qua công cụ chặn response: retry/reload giữ key/path/body, ledger có một giao dịch; có regression tự động cho cả RECEIVE/ADJUST/ISSUE/RETURN |
| ISSUE pending settlement | Dùng panel khôi phục cùng key. COMMITTED thì xử lý settlement/RETURN, không ABORT stock đã commit. WO còn HELD phải chặn complete/cancel |
| Mail không tới | Kiểm tra Mailpit/SMTP/encryption key, trạng thái private activation delivery; không mời lại liên tục để sinh token mới |
| File tải hỏng | Xin URL mới qua API; không thay host/query URL ký, không đưa API bearer vào PUT MinIO |
| Notification rỗng | Kiểm tra marker, snapshot, queue/DLQ và pending reason; health 200 chưa đủ |

Không cố tình tắt backend hoặc sửa clock khi trình diễn chính thức. Các drill
mất mạng và replay nên rehearsal trước, giữ bằng chứng để giải thích khi cần.

## 12. Kiểm thử và hồ sơ chốt M3

Chạy ở root, tuần tự các bước có build package:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm db:check-drift
```

Các test tích hợp DB cần `*_TEST_DATABASE_URL` đúng database test; không trỏ vào
DB đang trình diễn. Với RabbitMQ integration, dùng broker test riêng. Ví dụ
sau khi cấu hình đúng DB/broker test:

```bash
pnpm --filter notification-service test:e2e:db
pnpm --filter workorder-service test:m3
pnpm --filter workorder-service test:inventory:integration
```

Không chạy script mutation trên dữ liệu presenter ngay trước giờ demo.
27 test web tự động không thay cho 27 ca browser/API trong acceptance matrix.

Lưu bằng chứng mỗi ca: ngày, commit, SR/WO number, vai trò, thao tác, expected/
actual, ảnh UI và lỗi nếu có. Không lưu password, bearer, activation token/link
hoặc signed URL. Bảng cần nghiệm thu: [M3 web cases](../testing/m3-test-cases.md).
Chạy Android nếu đó là phạm vi bàn giao của nhóm; bằng chứng API không thay cho
thao tác file/network/session trên thiết bị.

Chỉ đề nghị `develop → main` và chuyển M4 sau khi:

- [ ] Huy sửa marker và thêm regression từ contract/producer thật.
- [ ] Bootstrap Notification COMPLETED, pending chờ bootstrap được reconcile.
- [ ] Inbox requester/staff, assignment, LowStock, read/unread và deep link chạy thật.
- [ ] Luồng chính tới CLOSED, file CUSTOMER tải được, INTERNAL không lộ.
- [ ] Inventory ISSUE/replay/RETURN và reservation settlement đúng; ledger không trùng.
- [ ] Báo cáo thật, handover/QR, báo giá và Maintenance được rehearsal trên UI.
- [ ] Activation mail/one-use và customer membership đúng.
- [ ] Ca quyền/tenant/customer và lỗi quan trọng có evidence; mọi NOT RUN được giải quyết hoặc nhóm chấp thuận rõ việc chuyển scope.
- [ ] CI trên commit cuối xanh; owner review; có người khác chạy lại runbook thành công.

## 13. Kết thúc và lựa chọn Docker demo

Local dev: Ctrl+C từng terminal backend, web và Mailpit. Dừng hạ tầng nếu muốn:

```bash
docker compose stop
```

Không dùng `down -v` để kết thúc demo vì sẽ mất dữ liệu và file.

Nếu cần chạy cả ứng dụng trong Docker trên máy khác, dùng
[deployment runbook](../deployment/m3-demo.md) và `compose.demo.yml` thay cho
local dev. Đây là **hai stack khác nhau**; không khởi động đồng thời với cùng
cổng 3000/9000. Demo Compose không tự tạo đủ tài khoản/dữ liệu, phải seed
Identity → Organization → Asset → WO → Inventory → Maintenance và bootstrap
sau khi Notification đã bind. Các seed dùng container one-off development và
cùng `SEED_DEMO_PASSWORD`; image backend cần được build lại từ commit cuối.
Cổng mặc định của web Docker là 8080, không phải 5173; cập nhật activation URL,
CORS/QR và MinIO origin theo `DEMO_PUBLIC_URL` trong runbook đó.

Trước khi chọn Docker, xử lý thêm bước generate Prisma của Notification trong
build image. Audit đã tái hiện build service thất bại khi không có generated
client, và thành công sau generate; chưa chạy một full Docker image build mới.
Nguyên/Huy cần xác nhận image build từ checkout sạch. Local runbook ở trên có
bước generate riêng nên không phụ thuộc generated file từ máy cũ.
