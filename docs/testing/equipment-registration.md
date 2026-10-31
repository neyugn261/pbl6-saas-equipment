# Kiểm thử ghi nhận thiết bị sau bàn giao

Ngày 31/10/2026 · nhánh `feature/equipment-registration-handover` · baseline `develop@ca22f09`.

## Kết quả triển khai

Luồng mới dùng dữ liệu thật qua Gateway: Customer → Site/Location/Contact → Equipment Model → Equipment → Warranty → Maintenance Plan → QR → hồ sơ thiết bị. Organization, Identity, Gateway, RBAC và event contracts được tái sử dụng; backend chỉ sửa Asset/Maintenance. Không có luồng đơn hàng hoặc kho thành phẩm.

Danh mục model do Tenant Admin/Service Manager nhập từ catalogue doanh nghiệp/hãng; mỗi máy có serial, ngày bàn giao và điều khoản riêng. Form thêm danh mục lưu ngay; đóng wizard không xóa Customer/Site/Model vừa tạo. Equipment và hồ sơ DRAFT được tạo cùng transaction khi bấm lưu. Warranty chỉ được áp dụng khi submit; Maintenance ghi ở database riêng sau Asset commit.

- Service Manager thực hiện đầy đủ; Tenant Admin lưu draft/bảo hành nhưng cần Service Manager xác nhận Maintenance và hoàn tất.
- `UNCONFIRMED` cho phép lưu draft; `NONE` yêu cầu lý do. Máy cũ có thể chọn `KEEP` cho Warranty/Plan, không reset lịch hoặc trạng thái Plan.
- `PENDING_MAINTENANCE` giữ nguyên input. Nút tiếp tục dùng cùng registration, không tạo request mới. Khi Plan đã được chỉnh sửa sau này, replay không khôi phục lịch cũ.
- QR có thể tạo/tải ảnh/in sau khi hoàn tất. Thất bại QR không gửi lại Equipment/Warranty/Plan.
- List Equipment tìm kiếm/lọc/phân trang tại server, có filter tiến độ thiết lập và đường dẫn hoàn thiện máy cũ.

Contract: [equipment-registration.yaml](../api/equipment-registration.yaml), [asset.yaml](../api/asset.yaml). Thiết kế: [ADR 0012](../decisions/0012-equipment-registration.md), [DB/API](../plans/equipment-registration-technical-design.md).

## Migration thực tế

| Database | Migration mới | Kết quả local |
| --- | --- | --- |
| asset_db / asset_test_db | 20261031090000_equipment_registration | Applied |
| maintenance_db / maintenance_test_db | 20261031090000_plan_registration_link | Applied |

Hai migration chỉ bổ sung bảng/cột/index/constraint; không reset dữ liệu, không sửa migration cũ, không backfill lựa chọn chính sách cho thiết bị cũ. Các tham chiếu liên service vẫn là logical reference; Warranty FK chỉ nằm trong Asset.

```sh
pnpm --filter asset-service --filter maintenance-service db:migrate
pnpm --filter asset-service --filter maintenance-service db:check-drift
pnpm --filter asset-service --filter maintenance-service exec prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code
```

Đã kiểm tra migrate deploy lặp lại không còn migration pending, migration → schema và database local → schema đều không có drift. SQL ERD được bổ sung đúng DDL của hai migration.

## Kiểm tra tự động đã chạy

| Lệnh | Kết quả |
| --- | --- |
| `pnpm --filter asset-service --filter maintenance-service --filter web lint` | Pass |
| `pnpm --filter asset-service --filter maintenance-service --filter web typecheck` | Pass, gồm typecheck riêng cho test tích hợp hai service |
| `pnpm --filter asset-service --filter maintenance-service build` | Pass |
| `pnpm --filter web build` | Pass; Vite vẫn cảnh báo bundle > 500 kB |
| `pnpm --filter asset-service --filter maintenance-service test` | Asset 18 + Maintenance 19 pass |
| `pnpm --filter asset-service --filter maintenance-service test:e2e` | Asset 15 + Maintenance 2 pass |
| `pnpm --filter asset-service --filter maintenance-service test:db` | Asset 33 + Maintenance 18 pass |
| `pnpm --filter web test` | 7 pass |

`apps/asset-service/test/registration-db.integration.ts` khởi động hai Nest app Asset/Maintenance thật, gọi HTTP hai chiều với JWT và dùng database test riêng; chỉ Organization reference được fake. Test chỉ dọn fixture tenant do chính suite tạo. Kiểm tra các trường hợp:

1. Tạo DRAFT chưa ghi Warranty/Plan; submit tạo Warranty cùng trạng thái Asset và một Plan qua HTTP.
2. Replay POST sau COMPLETED, khác payload/cùng key, concurrent create và concurrent submit.
3. Maintenance commit thành công nhưng response mất; Asset giữ PENDING, input bị khóa, hai resume hội tụ về cùng Plan và một lịch sử hoàn tất.
4. Replay không reset Plan đã chỉnh sửa/INACTIVE; KEEP bảo toàn Warranty cũ và Plan PAUSED.
5. NONE có lý do, UNCONFIRMED không được hoàn tất, unknown fields bị từ chối, biên lịch được kiểm tra trước freeze.
6. Tenant Admin, CUSTOMER và ID tenant khác; rollback khi Warranty overlap; PostgreSQL phase constraints. Các event thiết lập nội bộ bị loại trước phân trang/đếm của customer ở cả history cũ, timeline và feed; history detail từ chối đọc trực tiếp. CUSTOMER không có các field tiến độ trong list/detail và không được lọc theo registrationStatus. Maintenance ẩn event liên kết registration trong history của customer, kể cả khi lọc theo eventType.

`apps/web/test/session.test.mjs` chạy source thực với network được điều khiển thứ tự: single-flight refresh, logout khi refresh chưa xong, refresh cũ lỗi sau login mới, mutation không tự replay sau 401, GET được retry một lần, body response hoặc lỗi fetch cũ không cập nhật phiên mới. Callback lưu nháp không điều hướng hoặc thay marker sau khi phiên đã đổi. Không lưu token hoặc nội dung form vào marker khôi phục; marker scoped theo origin/tenant/user và được xóa khi logout.

## Nghiệm thu trình duyệt đã chạy

Chromium headless, viewport desktop 1440×1100 và mobile 390×844, web Vite → Gateway → các service local thực. Đăng nhập bằng tài khoản DEMO và mật khẩu từ biến môi trường; không reset hoặc chạy lại seed.

| Kịch bản | Kết quả |
| --- | --- |
| Service Manager thêm Customer, Site, Location, Contact và Model ngay trong wizard | Pass, gọi API thật và tự chọn entity vừa tạo |
| Máy mới + Warranty CREATE + Plan CREATE → COMPLETED | Pass |
| Cấp QR, hiển thị ảnh, có tải/in; reload biên nhận rồi mở dossier | Pass |
| Cho POST thực sự commit rồi chặn response bằng browser routing | Pass, form chuyển sang chưa rõ kết quả; lookup cùng createKey tìm đúng draft |
| Reload draft, xác nhận Warranty NONE + Maintenance NONE có lý do rồi hoàn tất | Pass |
| Mobile hiển thị biên nhận, không tràn ngang viewport; mở/đóng menu | Pass |
| List thiết bị tìm kiếm phía server và lọc COMPLETED | Pass, trả đúng máy cũ vừa hoàn thiện |
| Gateway chặn route internal của registration | Pass, HTTP 404 |
| Tenant Admin lưu draft, Maintenance bị khóa, không có nút hoàn tất | Pass |
| Máy cũ: bổ sung ngày bàn giao, KEEP Warranty hết hạn và Plan PAUSED | Pass, giữ nguyên Equipment/Warranty/Plan IDs và ngày kỳ tiếp theo |
| Tab khác cập nhật trước khi lưu draft | Pass, 409 không ghi đè; nút tải bản đã lưu yêu cầu người dùng chủ động chọn lại |

Không phát hiện lỗi JavaScript trong các kịch bản trên. Browser routing chỉ mô phỏng mất response sau backend commit; dữ liệu vẫn được ghi qua API thật. Dữ liệu kiểm thử local dùng tiền tố `UAT-`, `RECOVERY-`, `TA-DRAFT-`; không phải dữ liệu nghiệp vụ thật.

Ảnh giao diện được ghi khi chạy tại `/tmp/pbl6-registration-browser/`: `initial.png`, `review.png`, `completed.png`, `dossier.png`, `mobile.png`, `existing.png`. Kết quả ID fixture nằm trong `result.json` và `recovery-result.json` cùng thư mục, không chứa thông tin đăng nhập.

## Chạy và kiểm tra lại

```sh
pnpm infra:up
pnpm --filter asset-service --filter maintenance-service db:migrate
pnpm dev:backend
pnpm dev:web
```

Mở `/app/equipment-registrations/new`, `/app/customers`, `/app/equipment-models`. `MAINTENANCE_SERVICE_URL` và `ASSET_SERVICE_URL` phải trỏ tới các service tương ứng; `ASSET_QR_PORTAL_BASE_URL` phải đúng origin web. Dùng Service Manager để hoàn tất; dùng Tenant Admin để kiểm tra lưu rồi bàn giao nội bộ cho Service Manager.

## Giới hạn của đợt này

- PENDING không có worker chạy tự động hoặc nút đổi input. Lỗi quyền/mạng có thể resume với tài khoản đủ quyền; lỗi tham chiếu cố định cần người phụ trách đối soát, không tự ghi nhận hoàn tất.
- NONE Maintenance xác minh các Plan ACTIVE/PAUSED ở thời điểm preflight; không phải khóa phân tán ngăn mọi Plan được tạo sau đó.
- Không có default policy theo model, nhập hàng loạt hoặc chuyển chủ sở hữu. Chính sách hiện hành sau hoàn tất tiếp tục đọc từ Warranty/Plan, không lấy biên nhận làm nguồn trạng thái mới nhất.
- Kiểm tra trình duyệt chưa bao gồm hộp thoại in vật lý, thiết bị quét QR hoặc mobile Flutter. Các phần này không nằm trong thay đổi web/backend hiện tại.
