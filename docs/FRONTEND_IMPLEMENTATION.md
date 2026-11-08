# PBL6 Web Frontend — trạng thái triển khai

Cập nhật 08/11/2026, đối chiếu `develop@fbfab28` ([PR #65](https://github.com/neyugn261/pbl6-saas-equipment/pull/65)).

Web dùng React + Vite + TypeScript trong `apps/web`. **Các route vận hành dùng API thật**, không chuyển sang mock khi service lỗi. API client quản lý phiên; Gateway/backend kiểm tra JWT, permission, tenant/customer scope và điều kiện nghiệp vụ. Ẩn nút không thay phân quyền server.

Studio DEV `/design/workshop` dùng dữ liệu minh họa, không gọi API, không đổi session/quyền và không nằm trong build production. Role selector chỉ có ở studio/fixture; web thật lấy role từ Identity. Bản thiết kế không chứng minh endpoint tương ứng đã có.

## Route map

### Tenant admin and operations

- `/app/dashboard`
- `/dashboard`
- `/app/customers`, `/app/customers/new`, `/app/customers/:id`
- `/app/equipment`, `/app/equipment/:id`, `/app/equipment-history`
- `/app/equipment-models`, `/app/equipment-models/:id`
- `/app/equipment-registrations`, `/app/equipment-registrations/new`, `/app/equipment-registrations/:id`
- `/app/equipment-handovers`, `/app/equipment-handovers/new`, `/app/equipment-handovers/:id`
- `/app/service-requests`, `/app/service-requests/new`, `/app/service-requests/:id`
- `/app/work-orders`, `/app/work-orders/:id`
- `/app/technicians`, `/app/technicians/:id`
- `/app/maintenance`, `/app/maintenance/:id`
- `/app/maintenance-history`
- `/app/inventory/parts`, `/app/inventory/parts/:id`
- `/app/inventory/warehouses`, `/app/inventory/transactions`
- `/app/organization/branches`, `/app/organization/users`, `/app/organization/roles`
- `/app/reports`, `/app/notifications`, `/app/profile`

Thiết bị còn có các nguồn `timeline`, `service-requests`, `work-orders`, `maintenance-plans`, `maintenance-tasks`, `maintenance-history` dưới `/app/equipment/:id/...`. Các route/guard đầy đủ nằm trong [App.tsx](../apps/web/src/App.tsx).

### Platform administration

- `/admin`
- `/admin/tenants`, `/admin/tenants/new`, `/admin/tenants/:id`
- `/admin/profile`

`/admin/audit-logs`, `/admin/settings`, `/app/settings` hiện là trang chưa hỗ trợ, không có dữ liệu/nút lưu giả. Audit nền tảng bị loại khỏi menu vận hành.

### Customer portal

- `/portal`
- `/portal/equipment`, `/portal/equipment/:id`
- `/portal/requests`, `/portal/requests/new`, `/portal/requests/:id`
- `/portal/locations`, `/portal/notifications`, `/portal/profile`
- `/portal/equipment-handovers`, `/portal/equipment-handovers/:id`
- `/portal/maintenance`, `/portal/maintenance/:id`, `/portal/maintenance-history`, `/portal/equipment-history`
- `/portal/users`, `/portal/users/invite`: Customer Admin theo guard/quyền hiện có.

Thiết bị trong portal có các nguồn lịch sử scoped tương ứng. `/login` và `/activate` là luồng truy cập hiện có. Quên mật khẩu/gửi lại lời mời trong studio chưa phải API triển khai.

## Role navigation

| Role | Primary access |
| --- | --- |
| Platform Admin | Tenant và quản trị nền tảng; không mặc định đọc nghiệp vụ mọi tenant |
| Tenant Admin | Tổng quan, tổ chức/tài khoản và tra cứu vận hành; không mặc định mọi quyền chuyên môn |
| Service Manager | Yêu cầu, bảo hành, chi phí, trách nhiệm ca, kết quả, thiết bị và bảo trì |
| Dispatcher | WO, người thực hiện, địa điểm và lịch; AVAILABLE/BUSY chưa chứng minh không trùng lịch |
| Technician web | Công việc của mình (`mine=true`), checklist, bằng chứng và báo cáo trong scope |
| Inventory Staff | Dashboard, parts, warehouses, stock transactions |
| Customer Admin | Customer dashboard, all company equipment/requests, locations, notifications, profile |
| Customer User | Customer dashboard and assigned customer-scope data |

Đây là trọng tâm UI, không thay catalog RBAC. Menu tại [role-workspace.ts](../apps/web/src/features/workspace/role-workspace.ts); quyền cuối cùng phụ thuộc backend/allowedActions từng hồ sơ. Customer User không tự được duyệt chi phí; nhiều role cần kiểm tra thêm trải nghiệm hợp nhất.

## Shared UI

- Workshop `ServiceManagerShell` dùng chung, menu theo role; Service Manager có bàn quyết định riêng.
- `WorkspaceUI`, `ServiceDetailUI`, badge, toolbar, phân trang và các khối hồ sơ/lịch sử.
- Loading, nguồn lỗi có hướng đọc lại, dữ liệu rỗng có giải thích; không dùng lỗi thay số 0.
- ServiceSections có deep link `#section=...`, chỉ mount panel khi mở, giữ editor đã mở.
- Các nhóm route tải riêng với Suspense và màn lỗi tải bundle.

## Hành vi đã nối API và các giới hạn

1. Request, WO, báo cáo, bảo trì, bàn giao, inventory, thông báo và danh mục dùng API hiện có qua Gateway/client. Dữ liệu được lọc/phân trang server theo contract.
2. Địa điểm WO tách vị trí hiện tại của máy; kết thúc việc kỹ thuật tách kết quả sửa, tình trạng vận hành và xác nhận khách.
3. Dự toán có bước đọc lại đúng revision, hạng mục/tổng/hạn, so sánh bản trước và form từ chối. Chưa rõ kết quả ghi thì khóa gửi lại và cho đọc/đối soát.
4. Request mới thêm mã lỗi/liên hệ/hiện trường vào **description**; các field riêng trong studio chưa là DTO được triển khai.
5. Báo cáo dùng textarea; kết quả một phần/chưa được cần phần còn lại, hiện gửi trong customerSummary. Chưa tự tạo entity follow-up mới.
6. Số lượng kho dùng chuỗi thập phân chính xác, hiển thị tiếng Việt, ô sửa không chứa dấu phân cách hàng nghìn; giữ idempotency/reservation/recovery hiện có. Lịch sử phụ tùng xác nhận dùng đã có API/UI.
7. Tạo plan có preview bốn kỳ neo ngày gốc. Idempotency cho POST plan trực tiếp vẫn cần bổ sung; không đồng nhất với registration/replacement đã có.

Nháp Request/Estimate/Report dùng **sessionStorage**, tách tài khoản/tenant/customer/resource; thông thường 12 giờ, dấu pending giữ để đối soát. Không dùng localStorage làm database nghiệp vụ. Không đồng bộ nháp giữa tab/thiết bị; đóng tab/xóa dữ liệu trình duyệt hoặc storage bị chặn có thể mất nháp.

Studio có 12 hành trình cho 8 role cùng tình huống lỗi/chỉ đọc/xung đột, biên nhận/in/TXT minh họa. Cần chốt contract và nghiệm thu trước khi đưa thao tác mới vào route vận hành.

## Run and verify

```bash
pnpm install
pnpm dev:web
pnpm --filter web test
pnpm --filter web lint
pnpm --filter web typecheck
pnpm --filter web build
```

Kết quả đã ghi nhận trên code PR #65: 101 test web đạt, web lint/typecheck/build đạt, lint và typecheck workspace đạt; sau merge chạy lại 101 test web đạt. JS chính khoảng 403,93 kB theo build đó. Đây là lịch sử kiểm tra commit đã nêu, không phải nghiệm thu backend mới trong lượt sửa tài liệu.

CI GitHub PR #65 không khởi chạy do billing chủ repository; đã merge theo ngoại lệ người dùng xác nhận. Không ghi CI xanh hoặc toàn hệ thống đã nghiệm thu.

## Bàn giao tiếp theo

- [Bàn giao 08/11/2026](reports/2026-11-08-workshop-ui-handoff.md): API đã có/còn thiếu, owner, ưu tiên và checklist UAT.
- [Nghiệm thu UI V2](reports/2026-11-08-workshop-ui-v2-acceptance.md): bằng chứng và giới hạn UI.
- Không giao lại các API auth, pagination, checklist, attachment, notification hoặc inventory đã tồn tại như chức năng cần xây mới.
- Các endpoint/field đề xuất chưa là contract Accepted; phải đối chiếu RBAC/tenant scope và nguồn sở hữu trước khi triển khai.
- Lượt Workshop chỉ sửa web, không sửa hoặc giao lại Flutter/mobile. ERP, thanh toán, hóa đơn, kế toán, GPS, IoT, AI nằm ngoài phạm vi.
