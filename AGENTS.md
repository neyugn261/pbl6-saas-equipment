# PBL6 — PROJECT CONTEXT FOR AI CODING AGENT

## 1. Vai trò của AI Coding Agent

Bạn là Senior Software Engineer / Software Architect, chịu trách nhiệm hỗ trợ phát triển dự án PBL6 theo kiến trúc Microservices.

Nhiệm vụ:

- Đọc và hiểu cấu trúc repository hiện tại trước khi sửa code.
- Phát triển backend, frontend, database và tích hợp giữa các service.
- Tuân thủ thiết kế nghiệp vụ, ERD, sequence diagram và các quyết định kiến trúc đã thống nhất.
- Ưu tiên code rõ ràng, dễ kiểm thử, dễ bảo trì và phù hợp phạm vi đồ án đại học.
- Không tự ý mở rộng nghiệp vụ hoặc thay đổi kiến trúc khi chưa có lý do rõ ràng.
- Khi phát hiện mâu thuẫn giữa code, SQL, ERD và tài liệu, hãy báo cáo và đề xuất phương án trước khi thực hiện thay đổi lớn.

## 2. Tổng quan dự án

Tên dự án: PBL6 — SaaS-based Field Service Management Platform for Equipment Vendors.

Mục tiêu: Xây dựng nền tảng SaaS giúp các doanh nghiệp bán thiết bị quản lý hoạt động bảo hành, bảo trì, tiếp nhận yêu cầu sửa chữa và điều phối đội ngũ kỹ thuật viên nội bộ.

Khách hàng mục tiêu:

- Doanh nghiệp bán hoặc cung cấp thiết bị.
- Bộ phận quản lý dịch vụ kỹ thuật và bảo hành.
- Nhân viên điều phối, nhân viên kho phụ tùng và kỹ thuật viên.
- Doanh nghiệp mua thiết bị có thể gửi và theo dõi yêu cầu dịch vụ thông qua Customer Portal.

Đây là hệ thống quản lý dịch vụ sau bán hàng, không phải hệ thống ERP tổng thể.

## 3. Mô hình nghiệp vụ

Hệ thống sử dụng mô hình multi-tenant SaaS.

- Platform Admin quản lý nền tảng.
- Tenant là một doanh nghiệp cung cấp thiết bị sử dụng nền tảng SaaS.
- Mỗi Tenant quản lý người dùng nội bộ, chi nhánh, khách hàng doanh nghiệp, địa điểm khách hàng và thiết bị đã bàn giao.
- Customer là khách hàng của Tenant, không mặc định là một Tenant độc lập.
- Branch là chi nhánh nội bộ của doanh nghiệp cung cấp thiết bị, không phải Customer Site.
- Người dùng chỉ được truy cập dữ liệu thuộc Tenant và phạm vi quyền được cấp.

Các vai trò nghiệp vụ chính:

- Platform Admin
- Tenant Admin
- Customer Admin
- Service Manager
- Dispatcher
- Inventory Staff
- Technician
- Customer User

Phân quyền sử dụng RBAC. Không tự ý tạo thêm hệ thống role tùy chỉnh hoặc cơ chế phân quyền ngoài thiết kế đã thống nhất.

## 4. Quy trình nghiệp vụ chính

Luồng xử lý yêu cầu dịch vụ:

1. Thiết bị được bàn giao cho khách hàng và được ghi nhận trong Asset Service.
2. Hệ thống lưu thông tin thiết bị, khách hàng, địa điểm, bảo hành và mã QR.
3. Customer User hoặc nhân viên có quyền tạo Service Request.
4. Service Manager xem xét yêu cầu và thông tin bảo hành.
5. Nếu cần sửa chữa hoặc bảo trì, hệ thống tạo Work Order.
6. Dispatcher phân công Technician.
7. Technician tiếp nhận công việc, thực hiện sửa chữa/bảo trì và cập nhật kết quả.
8. Technician lập Service Report.
9. Hệ thống cập nhật trạng thái Work Order và lịch sử dịch vụ của thiết bị.
10. Notification Service gửi thông báo khi có sự kiện phù hợp.

Với yêu cầu ngoài bảo hành, MVP có thể hỗ trợ Cost Estimate cơ bản và khách hàng xác nhận chi phí. Không xây dựng quy trình hóa đơn hoặc thanh toán.

QR Code dùng để nhận diện Equipment và hỗ trợ tạo Service Request. Service Manager có thể tạo hoặc in lại QR. QR không thay thế việc kiểm tra quyền truy cập.

Bảo trì định kỳ gồm Maintenance Plan và Maintenance Task. Task có thể dẫn đến Work Order.

Inventory chỉ quản lý phụ tùng cơ bản, số lượng tồn và giao dịch nhập/xuất/điều chỉnh. Không triển khai hệ thống mua hàng hoặc cung ứng phụ tùng phức tạp.

## 5. Phạm vi dự án

### Trong phạm vi

- Multi-tenant và quản lý Tenant.
- Xác thực, người dùng, RBAC.
- Branch, Customer, Customer Site, Location và Contact.
- Equipment Model, Equipment, Warranty và QR Code.
- Service Request và lịch sử trạng thái.
- Work Order, phân công kỹ thuật viên và lịch sử phân công.
- Service Report.
- Maintenance Plan và Maintenance Task.
- Quản lý phụ tùng, kho và tồn kho cơ bản.
- Cost Estimate cơ bản.
- Notification.
- Báo cáo nghiệp vụ cơ bản.

### Ngoài phạm vi

- CRM và quản lý đơn hàng bán hàng.
- Quản lý kho thành phẩm.
- ERP tổng thể.
- Hóa đơn, thanh toán, VAT và kế toán.
- Quản lý nhân sự.
- GPS tracking thời gian thực và tối ưu tuyến đường.
- IoT monitoring.
- AI dự đoán hỏng hóc.
- Procurement và quy trình phê duyệt mua phụ tùng phức tạp.

Không tự triển khai các tính năng ngoài phạm vi trên nếu chưa được yêu cầu.

## 6. Kiến trúc hệ thống

Dự án sử dụng Monorepo kết hợp Microservices.

Cấu trúc mục tiêu:

apps/

- api-gateway/
- identity-service/
- organization-service/
- asset-service/
- service-request-service/
- workorder-service/
- maintenance-service/
- inventory-service/
- notification-service/
- web/
- mobile/

packages/ (xem packages/README.md)

- service-kit/ — bootstrap NestJS: env, logger JSON, correlation id, lỗi, health, pagination, HTTP giữa service, Prisma adapter
- auth/ — verify token, RBAC catalog, guard, data scope tenant/customer
- event-contracts/ — catalog event có version, outbox, inbox, RabbitMQ
- testing/ — token cho test, kiểm tra DB test

infrastructure/

- nginx/
- postgres/
- rabbitmq/
- redis/
- minio/

docs/

- architecture/
- erd/
- sequence-diagrams/
- api/
- decisions/

scripts/

Repository hiện tại có thể chưa chứa đủ tất cả service trong cấu trúc mục tiêu. Trước khi tạo mới hoặc đổi tên thư mục, hãy kiểm tra code thực tế và giữ lại các thành phần đang hoạt động.

### Công nghệ dự kiến

- Backend: NestJS, TypeScript.
- Web frontend: React/Next.js, TypeScript.
- Mobile: Flutter.
- Database: PostgreSQL.
- Giao tiếp đồng bộ: REST API.
- Giao tiếp bất đồng bộ: RabbitMQ.
- Cache: Redis.
- Object/file storage: MinIO.
- Container: Docker và Docker Compose.
- Reverse proxy: Nginx.

Nếu repository hiện tại đã sử dụng thư viện hoặc framework cụ thể, hãy kiểm tra package.json và code trước khi thay đổi công nghệ.

## 7. Database per Microservice

Mỗi microservice sở hữu database logic riêng:

| Microservice            | Database           |
| ----------------------- | ------------------ |
| Identity Service        | identity_db        |
| Organization Service    | organization_db    |
| Asset Service           | asset_db           |
| Service Request Service | service_request_db |
| Work Order Service      | workorder_db       |
| Maintenance Service     | maintenance_db     |
| Inventory Service       | inventory_db       |
| Notification Service    | notification_db    |

Các nguyên tắc bắt buộc:

- Service chỉ trực tiếp đọc/ghi database do chính nó sở hữu.
- Không tạo foreign key xuyên database.
- Không truy vấn trực tiếp bảng của service khác để thay thế API hoặc event.
- ID tham chiếu giữa các service là logical reference và phải được xác thực tại service layer.
- Kiểm tra Tenant ownership khi tạo hoặc cập nhật quan hệ giữa các entity.
- Không cho phép người dùng truy cập dữ liệu Tenant khác bằng cách sửa ID trong request.
- Migration phải được quản lý riêng theo từng service.
- Không tự ý thay đổi schema nếu chưa đối chiếu với ERD và SQL hiện hành.

Trong môi trường phát triển, có thể dùng một PostgreSQL container chứa nhiều database logic riêng biệt nếu cấu hình bảo đảm tính độc lập.

## 8. Quy tắc giao tiếp giữa các service

REST API được dùng cho các thao tác cần phản hồi trực tiếp, ví dụ:

- Lấy thông tin Equipment.
- Kiểm tra quyền truy cập.
- Tra cứu trạng thái Service Request.
- Truy vấn Work Order.

RabbitMQ được dùng cho các sự kiện nghiệp vụ, ví dụ:

- ServiceRequestCreated.
- WorkOrderCreated.
- WorkOrderAssigned.
- WorkOrderCompleted.
- MaintenanceTaskCreated.
- NotificationRequested.

Tên event trên chỉ là ví dụ; contract hiện hành nằm ở `packages/event-contracts/src/catalog.ts` và `docs/architecture/events.md` (ADR 0005). Xác thực, phân quyền và gọi giữa service theo ADR 0004; phạm vi dữ liệu của tài khoản CUSTOMER theo ADR 0003.

Khi triển khai event:

- Định nghĩa payload rõ ràng và có version nếu cần.
- Consumer phải xử lý idempotent để tránh tạo dữ liệu trùng.
- Có cơ chế retry và ghi nhận lỗi.
- Không giả định thao tác trên hai database khác nhau là một transaction nguyên tử.
- Với liên kết Maintenance Task và Work Order, phải xác định rõ service sở hữu dữ liệu và cơ chế đồng bộ qua event/API.

## 9. Quy tắc phát triển code

1. Kiểm tra repository, package scripts, environment và tài liệu trước khi sửa.
2. Tôn trọng kiến trúc và quy ước đặt tên hiện có.
3. Tách controller, service, DTO, repository và module theo trách nhiệm.
4. Validate input ở API boundary.
5. Xử lý authentication, authorization và tenant isolation ở backend; không chỉ ẩn chức năng ở frontend.
6. Không lưu secret hoặc thông tin đăng nhập thật vào source code.
7. Không hardcode URL service, credentials hoặc cấu hình môi trường.
8. Dùng transaction cho các thao tác nhiều bảng trong cùng một database khi cần.
9. Ghi log có cấu trúc, tránh ghi mật khẩu, token hoặc dữ liệu nhạy cảm.
10. Viết test cho logic nghiệp vụ, quyền truy cập và các trường hợp lỗi quan trọng.
11. Cập nhật migration, API contract và tài liệu khi thay đổi thiết kế.
12. Không xóa hoặc viết lại hàng loạt file khi chưa xác định ảnh hưởng.

## 10. Cách làm việc với repository

Trước mỗi nhiệm vụ:

1. Đọc README.md, AGENTS.md/CLAUDE.md nếu có, package.json và cấu trúc thư mục liên quan.
2. Xác định service sở hữu nghiệp vụ cần thay đổi.
3. Kiểm tra database schema, API, event và các module phụ thuộc.
4. Nêu ngắn gọn phương án triển khai nếu thay đổi ảnh hưởng nhiều service.
5. Thực hiện thay đổi nhỏ, có thể kiểm tra được.
6. Chạy lint, typecheck, test hoặc build tương ứng nếu các lệnh đó tồn tại.
7. Báo cáo file đã thay đổi, chức năng đã hoàn thành, kết quả kiểm tra và những phần chưa hoàn thành.

Không tuyên bố build hoặc test thành công nếu chưa thực sự chạy và xác nhận kết quả.

## 11. Nguyên tắc ưu tiên

Ưu tiên phát triển theo luồng nghiệp vụ hoàn chỉnh:

Identity + Organization
→ Asset
→ Service Request
→ Work Order
→ Service Report
→ Maintenance / Inventory
→ Notification
→ Web và Mobile hoàn thiện dần.

Không cần xây dựng tất cả microservice cùng lúc. Hãy ưu tiên một luồng end-to-end có thể chạy và kiểm thử trước khi mở rộng.

Mục tiêu cuối cùng là một hệ thống SaaS quản lý bảo hành, bảo trì và dịch vụ kỹ thuật có thể demo được, có phân quyền đa tenant, kiến trúc nhất quán và phạm vi phù hợp với đồ án PBL6.
