# Nghiệm thu seed toàn hệ thống

Ngày thực chạy: 2026-11-09. Hướng dẫn sử dụng: [bộ dữ liệu demo](../user-guide/demo-data.md). Catalog: [`scripts/demo/catalog.cjs`](../../scripts/demo/catalog.cjs).

## Kết quả

| Kiểm tra | Kết quả |
| --- | --- |
| `pnpm build` | PASS toàn workspace |
| `pnpm -r --if-present typecheck` | PASS toàn workspace |
| `pnpm lint` | PASS toàn workspace |
| `pnpm test` | 564 passed; 3 broker tests mặc định skipped |
| Guard tests của seed/reset | 5 passed: đúng DB dev/test, từ chối production/staging, remote host, tên DB lạ hoặc thiếu cấu hình |
| Seed integration trên tám DB test | PASS: reset sạch, 14 login, phạm vi chi nhánh/customer, trạng thái, số tồn, báo cáo/tệp và thông báo thật |
| Chạy seed ba lần trên DB test | PASS: không nhân đôi danh mục/ca/lịch sử/event; giữ ngày bảo hành và tồn kho |
| Thao tác sau seed rồi chạy lại | PASS: giữ WO được tạm dừng và giao dịch nhập thêm phụ tùng qua API |
| Identity DB e2e | 94 passed, 1 skipped |
| Organization DB e2e | 47 passed |
| Work Order DB e2e | 231 passed, bao gồm seed đồng thời/bảo toàn dữ liệu và trường hợp tham chiếu lỗi |
| Inventory DB suite | 34 passed, bao gồm receipt idempotent và bảo toàn metadata/số tồn |
| Maintenance vertical slice | PASS qua Gateway, PostgreSQL, RabbitMQ; seed hai lần với fixture riêng để không chiếm ID demo chung |
| CI workflow YAML, tài liệu và `git diff --check` | PASS parse/link/whitespace checks |

Các ca skipped không được tính là đã chạy. Seed integration thực sự dùng RabbitMQ và MinIO riêng với API/scheduler/consumer thật; không mock HTTP. Workflow CI đã thêm `test:demo-seed`, chưa có kết quả CI từ xa trong phiên này.

## Thay dữ liệu local đã thực hiện

Backend đang chạy được dừng trước khi reset. Đã xóa dữ liệu ứng dụng cũ trong đúng tám DB `identity_db`, `organization_db`, `asset_db`, `service_request_db`, `workorder_db`, `maintenance_db`, `inventory_db`, `notification_db`. Schema/migration được giữ; catalog RBAC được nạp lại, message cũ của queue dự án được dọn khi không còn consumer. Không xóa database dự án khác hoặc toàn bộ bucket MinIO.

Seed sạch đã trả READY và kiểm tra đúng số lượng:

- 14 tài khoản; 2 chi nhánh; 2 khách hàng; 4 site; 8 location; 4 contact.
- 6 thiết bị; 5 warranty; 6 QR; 2 chính sách bảo hành và 2 mẫu bảo trì đã publish.
- 4 Technician, 3 kỹ năng; 2 kho, 3 phụ tùng, 6 dòng tồn.
- 6 SR; 5 WO; 2 Cost Estimate; 2 Service Report; 2 Plan, 2 Task; 2 đăng ký hoàn tất; 3 PDF thật.

[Kết quả seed local](artifacts/demo-data/local-result.json) ghi counts và các email/role demo, không chứa mật khẩu hoặc token. Backend bình thường đã được khởi động lại sau seed.

Đã chạy lại seed trên DB phát triển khi backend đang hoạt động: READY, số tồn và các ca giữ nguyên. [Kiểm tra số lượng đầy đủ từng entity](artifacts/demo-data/entity-counts.json) xác nhận các bản ghi cũ đã được thay bằng đúng bộ dữ liệu mới.

## Kiểm tra trên hệ thống đang chạy

[Kết quả browser/API](artifacts/demo-data/browser-result.json):

- Health check trực tiếp của cả tám backend trả 200; Gateway tổng hợp bốn service M1 đều up. Cả 14 tài khoản đăng nhập được với role tương ứng.
- Hai PDF báo cáo tải thành công từ MinIO sau khi khởi động lại backend bình thường; dữ liệu bytes có định dạng PDF.
- [Service Manager HCM](artifacts/demo-data/manager-hcm.png) thấy đúng ba yêu cầu HCM.
- [Service Manager Đà Nẵng](artifacts/demo-data/manager-dn.png) thấy đúng ba yêu cầu Đà Nẵng.
- [Tenant Admin](artifacts/demo-data/admin-all-branches.png) thấy đủ sáu yêu cầu; không có page error.

## Giới hạn

Seed là công cụ phát triển local, cần hạ tầng Compose hoạt động và tài khoản RabbitMQ có quyền tạo vhost. Nó không chạy trên production/staging hoặc DB từ xa. Hai hồ sơ đăng ký đã hoàn tất sử dụng API KEEP của luồng tương thích cho thiết bị đã có bảo hành/bảo trì; chính sách model mới được publish sẵn để demo đăng ký mới. Timestamp nghiệp vụ là thời điểm API chạy thực tế, không được sửa lùi ngày. Tệp cũ trên bucket không còn tham chiếu DB được giữ ngoài luồng demo.

Flutter/Android UAT chưa chạy lại; ảnh ở trên là web desktop. Không tuyên bố đã deploy hoặc CI từ xa thành công.
