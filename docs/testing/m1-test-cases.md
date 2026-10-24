# M1 — Kịch bản kiểm thử

Chạy với seed DEMO (`docs/api/fixtures.md`). Mỗi ca ghi `Pass/Fail`, thời điểm, response và lỗi vào bảng kết quả cuối tài liệu. Trạng thái `PROCESSING/RESOLVED` được tạo bằng event Work Order trong M2; ở M1 dùng fixture/test setup của Service Request để kiểm tra confirm/reopen. Không sửa DB production để dựng trạng thái.

## Đăng nhập và phân quyền web

| ID | Vai trò / dữ liệu | Bước | Kết quả mong đợi |
| --- | --- | --- | --- |
| AUTH-01 | Platform Admin, không nhập tenant code | Đăng nhập; mở menu; tải lại trang | Đăng nhập thành công, chỉ thấy Doanh nghiệp; phiên được phục hồi qua refresh rồi `/auth/me`. |
| AUTH-02 | Tenant Admin, `DEMO` | Đăng nhập, mở menu | Thấy Khách hàng, Thiết bị, Yêu cầu dịch vụ; không thấy nút tạo SR vì catalog chưa cấp `service_request:create`. |
| AUTH-03 | Service Manager, `DEMO` | Đăng nhập, mở menu | Thấy 3 mục M1, tạo SR và action review phù hợp. |
| AUTH-04 | Dispatcher, `DEMO` | Đăng nhập, mở menu; vào URL tạo SR | Thấy 3 mục đọc; URL tạo SR trả trang 403. |
| AUTH-05 | Inventory Staff, `DEMO` | Đăng nhập, mở menu | Chỉ thấy Thiết bị trong phạm vi M1. |
| AUTH-06 | Technician, `DEMO` | Đăng nhập, mở menu | Thấy Khách hàng, Thiết bị và Yêu cầu dịch vụ dạng đọc. |
| AUTH-07 | Customer Admin, `DEMO` | Đăng nhập, mở menu | Thấy Khách hàng, Thiết bị, Yêu cầu dịch vụ; chỉ dữ liệu customer của mình. |
| AUTH-08 | Customer User, `DEMO` | Đăng nhập, mở menu | Thấy Khách hàng (chỉ customer của mình), Thiết bị và Yêu cầu dịch vụ, đúng quyền `customer:read` trong catalog. |
| AUTH-09 | Bất kỳ | Đăng xuất rồi dùng Back / refresh | `/auth/logout` thu hồi phiên, web quay về đăng nhập. |
| AUTH-10 | Bất kỳ | Gọi nhiều API khi access token hết hạn | Chỉ một lần `/auth/refresh` đang chạy; các request dùng token mới. |
| AUTH-11 | Bất kỳ | Mở URL sai và URL không có quyền | Lần lượt nhận trang 404 và 403. |
| AUTH-12 | Tenant Admin hoặc Customer Admin | Mời người dùng ở môi trường tắt trả activation token | Lời mời vẫn thành công; không hiển thị link kích hoạt khi response thiếu token. Customer Admin gắn Customer User với customer của mình hoặc thấy lỗi gắn và có thể thử lại. |
| AUTH-13 | Tenant Admin hoặc Customer Admin | Mời người dùng ở dev/test có activation token | Chỉ lúc response có token mới hiển thị link `/activate#token=…`; mở link và đặt mật khẩu hợp lệ để kích hoạt. |

Email demo xem README gốc; mật khẩu lấy từ `SEED_DEMO_PASSWORD` cục bộ, không ghi vào báo cáo.

## Luồng M1 và state machine SR

| ID | Vai trò / dữ liệu | Bước | Kết quả mong đợi |
| --- | --- | --- | --- |
| SR-01 | Customer User, thiết bị của DEMO-CUST-01 | Chọn thiết bị, tạo SR | 201, `NEW`, `requestNo` duy nhất, customerId lấy từ token. |
| SR-02 | Service Manager, thiết bị cùng tenant | Tạo SR thay khách hàng | 201, `NEW`, customerId đúng thiết bị, warranty snapshot và checker chưa được ghi. |
| SR-03 | Service Manager, SR `NEW` | `review` | `REVIEWING`; kiểm tra và lưu snapshot bảo hành cùng transition, thêm history và event. |
| SR-04 | Service Manager, SR `REVIEWING` | `request-info` với reason | `AWAITING_INFO`; comment CUSTOMER hiện cho khách. |
| SR-05 | Customer User cùng customer, SR `AWAITING_INFO` | Gửi comment CUSTOMER | `REVIEWING`. |
| SR-06 | Service Manager, SR `REVIEWING` | `warranty-check` | Kiểm tra lại; trạng thái giữ nguyên và snapshot `IN_WARRANTY`/`OUT_OF_WARRANTY`/`NO_WARRANTY` đúng Asset. |
| SR-07 | Service Manager, chưa có snapshot | `accept` | 422 `WARRANTY_CHECK_REQUIRED`; không đổi trạng thái. |
| SR-07a | Service Manager, snapshot `IN_WARRANTY` | `accept` | `ACCEPTED`. |
| SR-08 | Service Manager, SR `NEW`, `REVIEWING`, `AWAITING_INFO` | `reject` với reason ở từng trạng thái | `REJECTED`, reason customer thấy; từ đây mọi transition bị 409. |
| SR-09 | Customer User, SR `NEW`, `AWAITING_INFO`, `AWAITING_CUSTOMER_APPROVAL`, `COST_REJECTED` | `cancel` ở từng trạng thái | `CANCELLED`; từ đây mọi transition bị 409. |
| SR-10 | Service Manager, SR `NEW`, `REVIEWING`, `AWAITING_INFO`, `AWAITING_CUSTOMER_APPROVAL`, `COST_REJECTED`, `ACCEPTED` | `cancel` ở từng trạng thái | `CANCELLED`; huỷ ở `ACCEPTED` không gọi Work Order đồng bộ. |
| SR-11 | Fixture SR `RESOLVED`, Customer User cùng customer | `confirm` | `CLOSED`; trạng thái cuối. |
| SR-12 | Fixture SR `RESOLVED`, Customer User cùng customer | `reopen` với reason | `ACCEPTED`. |
| SR-13 | Fixture SR `ACCEPTED` | Phát `WorkOrderCreated.v1` | `PROCESSING`; nếu SR đã `CANCELLED` thì event bị bỏ qua. |
| SR-14 | Fixture SR `PROCESSING` | Phát `WorkOrderCompleted.v2` result RESOLVED/PARTIALLY_RESOLVED | `RESOLVED`; lưu customer summary, work order number và completion time. |
| SR-15 | Fixture SR `PROCESSING` | Phát `WorkOrderCancelled.v2` hoặc hoàn tất UNRESOLVED | `ACCEPTED` hoặc `CANCELLED` theo `cancelServiceRequest`. |
| SR-16 | Fixture SR `REVIEWING`, snapshot ngoài bảo hành | Gọi `accept` | 422 `ESTIMATE_REQUIRED`; không đổi trạng thái. Báo giá thuộc M2. |
| SR-17 | Fixture SR `REVIEWING`, chưa có snapshot | Gọi `accept` | 422 `WARRANTY_CHECK_REQUIRED`. |
| SR-18 | Dispatcher, SR `NEW` | `review` | 403. |
| SR-27 | Customer User tạo SR `NEW`, Service Manager mở chi tiết | So sánh `warrantyCheckedBy` trước và sau `review` | Trước review là null; sau review là ID Service Manager, không phải người tạo. |
| SR-19 | Bất kỳ, sai trạng thái | Lặp transition không hợp lệ | 409 `INVALID_STATE_TRANSITION`, không thêm history. |
| SR-20 | Customer User | Đọc comment INTERNAL của SR thuộc customer qua comments và history | Không có comment INTERNAL trong response; được thấy comment CUSTOMER. (DB E2E) |
| SR-26 | Service Manager, SR `PROCESSING` | `cancel` | 409 `WORK_ORDER_CANCELLATION_REQUIRED`; hướng dẫn huỷ Work Order trước, không đổi trạng thái/history. |
| SR-21 | Fixture SR `REVIEWING` ngoài bảo hành | Gửi estimate | `AWAITING_CUSTOMER_APPROVAL` (M2: Cost Estimate). |
| SR-22 | Fixture SR `AWAITING_CUSTOMER_APPROVAL` | Customer duyệt estimate | `ACCEPTED` (M2). |
| SR-23 | Fixture SR `AWAITING_CUSTOMER_APPROVAL` | Customer từ chối estimate | `COST_REJECTED` (M2). |
| SR-24 | Fixture SR `AWAITING_CUSTOMER_APPROVAL` | Service Manager sửa estimate | `REVIEWING` (M2). |
| SR-25 | Fixture SR `COST_REJECTED` | Gửi revision mới | `AWAITING_CUSTOMER_APPROVAL` (M2). |

### Ma trận chuyển trạng thái cần chạy

Mỗi dòng là một cạnh của `docs/architecture/state-machines.md`; tạo một SR mới cho mỗi nhánh có trạng thái cuối. Cột M2 chỉ rõ phần phụ thuộc Cost Estimate/Work Order chưa có trong M1.

| Từ | Hành động | Đến | Case | Giai đoạn |
| --- | --- | --- | --- | --- |
| — | create | NEW | SR-01/02 | M1 |
| NEW | review + initial warranty check | REVIEWING | SR-03/27 | M1 |
| REVIEWING | request-info | AWAITING_INFO | SR-04 | M1 |
| AWAITING_INFO | customer comment | REVIEWING | SR-05 | M1 |
| REVIEWING | accept (in warranty) | ACCEPTED | SR-07 | M1 |
| REVIEWING | send estimate | AWAITING_CUSTOMER_APPROVAL | SR-21 | M2 |
| AWAITING_CUSTOMER_APPROVAL | approve estimate | ACCEPTED | SR-22 | M2 |
| AWAITING_CUSTOMER_APPROVAL | reject estimate | COST_REJECTED | SR-23 | M2 |
| AWAITING_CUSTOMER_APPROVAL | revise estimate | REVIEWING | SR-24 | M2 |
| COST_REJECTED | send new revision | AWAITING_CUSTOMER_APPROVAL | SR-25 | M2 |
| ACCEPTED | WorkOrderCreated.v1 | PROCESSING | SR-13 | M1 consumer / M2 producer |
| PROCESSING | WorkOrderCompleted.v2 resolved | RESOLVED | SR-14 | M2-prep consumer contract |
| PROCESSING | WorkOrderCancelled.v2 (`cancelServiceRequest=false`) / unresolved | ACCEPTED | SR-15 | M2-prep |
| PROCESSING | WorkOrderCancelled.v2 (`cancelServiceRequest=true`) | CANCELLED | SR-15 | M2-prep |
| RESOLVED | confirm | CLOSED | SR-11 | M1 fixture, M2 end-to-end |
| RESOLVED | reopen | ACCEPTED | SR-12 | M1 fixture, M2 end-to-end |
| NEW | reject | REJECTED | SR-08 | M1 |
| REVIEWING | reject | REJECTED | SR-08 | M1 |
| AWAITING_INFO | reject | REJECTED | SR-08 | M1 |
| NEW | cancel | CANCELLED | SR-09/10 | M1 |
| REVIEWING | cancel (staff) | CANCELLED | SR-10 | M1 |
| AWAITING_INFO | cancel | CANCELLED | SR-09/10 | M1 |
| AWAITING_CUSTOMER_APPROVAL | cancel | CANCELLED | SR-09/10 | M2 fixture |
| COST_REJECTED | cancel | CANCELLED | SR-09/10 | M2 fixture |
| ACCEPTED | cancel (staff) | CANCELLED | SR-10 | M1 |

## Cách ly tenant/customer và tích hợp

| ID | Bước | Kết quả mong đợi |
| --- | --- | --- |
| ISO-01 | Dùng token tenant A đọc ID customer/equipment/SR tenant B | Cả ba endpoint trả 404. |
| ISO-02 | Customer User A đọc ID customer/equipment/SR của customer B cùng tenant | Cả ba endpoint trả 404. |
| ISO-03 | Customer User thay `customerId` trong body tạo SR, chọn equipment customer B | Không tạo được SR customer B; 400/404/422 theo contract. |
| ISO-04 | Thay `tenantId` trong query/body public | 400 validation; tenant luôn từ token. |
| ISO-05 | Gọi `/internal/*` qua gateway | 404. |
| ISO-06 | Mở web ở chế độ gateway, thực hiện login → list Equipment → tạo SR → review → accept | Mọi request đi qua gateway; review đã lưu snapshot bảo hành, chỉ accept khi bảo hành hợp lệ. |
| QR-01 | Mở URL `/portal/qr/{token}` khi chưa đăng nhập | Sau đăng nhập trở lại đúng URL QR, gọi Asset `GET /qr/{token}` qua gateway; không hiển thị thiết bị khi trả 404. |
| QR-02 | QR hợp lệ trong phạm vi khách hàng | Mở thiết bị hoặc tạo SR với thiết bị đã chọn sẵn; QR thiết bị RETIRED không hiện nút tạo SR. |

## Kết quả chạy

| Ngày giờ | Môi trường / commit | Case ID | Pass/Fail | Bằng chứng / issue |
| --- | --- | --- | --- | --- |
| 2026-10-22 | Identity thật qua Vite `/identity`, seed DEMO | AUTH-01–08 (login, `/auth/me`, refresh, logout ở API) | Pass | `apps/web/scripts/smoke-identity.ps1`: 8/8. Menu trên trình duyệt chưa kiểm bằng đăng nhập tương tác. |
| 2026-10-22 | Catalog RBAC hiện hành so với menu web | AUTH-01–08 (menu, route mặc định, quyền tạo SR) | Pass | `apps/web/scripts/check-role-menu.ts`: 8/8 vai trò, gồm vai trò không hợp lệ. |
| 2026-10-22 | Ba Prism mock từ OpenAPI qua Vite `/mock/*` | List/detail Organization, Asset, SR; POST tạo SR; history/comment/action review | Pass | `apps/web/scripts/smoke-mocks.ps1`: 5/5. Prism không lưu POST. |
| 2026-10-24 | Web mặc định gateway, code theo ADR 0008 | Menu 8 vai trò; lint, typecheck, build; mở QR khi chưa đăng nhập; form kích hoạt có/không có token mẫu | Pass | `check-role-menu.ts`: 8/8; web lint/typecheck/build đạt; browser chuyển `/portal/qr/testtoken` sang login kèm `next`, `/activate` báo link thiếu token và `/activate#token=test` hiện form. Chưa gửi lời mời hay kích hoạt tài khoản thật. |
| 2026-10-24 | Ba Prism mock từ OpenAPI qua Vite ở chế độ mock tạm thời | List/detail Organization, Asset, SR; POST tạo SR; history/comment và `POST /review` | Pass | `apps/web/scripts/smoke-mocks.ps1`: 5/5. Prism không lưu POST và vẫn còn endpoint cũ trong contract của owner Service Request. |
| Chưa chạy | Backend đang đổi theo ADR 0008 D1–D4/D8 | AUTH-09–13, SR-01–26, ISO-01–06, QR-01–02 trên backend thật | Pending | Chờ Identity và Service Request cập nhật contract/implementation, rồi chạy nghiệm thu M1 trên `develop`. Các kết quả mock ngày 22/10 không chứng minh luồng gateway hiện tại. |
