# Quản lý dịch vụ chi nhánh — triển khai và demo

Thiết kế: [ADR 0022](../decisions/0022-branch-service-management.md). Kết quả thực chạy: [nghiệm thu](../testing/branch-service-management.md).

## Các giai đoạn đã triển khai

| Giai đoạn | Kết quả |
| --- | --- |
| 1. Vai trò và phạm vi | Service Manager đảm nhiệm tiếp nhận + điều phối. Organization cung cấp chi nhánh chính ACTIVE trực tiếp; thiếu chi nhánh trả 403, nguồn lỗi trả 503. Tenant Admin xem toàn tenant. |
| 2. Request → WO | Request lấy chi nhánh từ site của thiết bị; WO kế thừa Request. List/detail/mutation/estimate/attachment/report kiểm tra cùng phạm vi. Phân công kỹ thuật viên cùng chi nhánh. |
| 3. Kho và bảo trì | Tồn, ledger, nhập/xuất/trả/điều chỉnh, audit và recovery bị giới hạn theo chi nhánh kho; key cũ vẫn được kiểm tra quyền hiện tại. WO bảo trì dùng site routing qua outbox/inbox, giữ chi nhánh khi tạo WO thay thế. Notification inbox/count/read và thống kê WO có cùng phạm vi. |
| 4. Web | Hiển thị chi nhánh làm việc; admin gán chi nhánh chính, tạo/cập nhật hồ sơ kỹ thuật viên, cấu hình chi nhánh phục vụ site và phân bổ hàng chờ. Mời mới không đưa Dispatcher vào lựa chọn. |
| 5. Kiểm thử | Có regression unit/DB, integration qua Identity/Gateway thật, PostgreSQL/RabbitMQ riêng và browser desktop/mobile. Chi tiết và giới hạn trong báo cáo nghiệm thu. |

## Quy tắc đơn giản của MVP

- Customer, Equipment, Model và Maintenance Plan/Task dùng chung tenant; Customer Portal vẫn giới hạn theo customer. Địa điểm khách không phải chi nhánh nhà cung cấp.
- Một nhân viên vận hành dùng một **chi nhánh chính**. Các liên kết chi nhánh phụ cũ không cấp thêm phạm vi. Tài khoản nhiều vai trò vẫn chịu giới hạn này; Tenant Admin là ngoại lệ toàn tenant.
- Tenant Admin quản trị/xem tổng và phân bổ hồ sơ. Các quyền duyệt yêu cầu/xuất kho vẫn theo catalog, không tự cấp toàn bộ nghiệp vụ cho admin.
- SERVICE_MANAGER có sẵn toàn bộ quyền tiếp nhận và điều phối. DISPATCHER giữ cho tài khoản cũ, không nhận lời mời hay người giữ role mới; muốn chuyển người cũ sang SERVICE_MANAGER thì admin đổi role rõ ràng.
- Thay site routing ảnh hưởng ca mới; không sửa chi nhánh, thời hạn bảo hành hoặc lịch sử ca đã có. Chưa triển khai điều chuyển ca đang làm hoặc mượn kỹ thuật viên chéo chi nhánh.
- Maintenance Plan/Task vẫn là cấu hình/lịch dùng chung. WO phát sinh mới được giao về chi nhánh. Khi chưa nhận routing, WO vào hàng chờ; bản routing đầu tiên có thể phân bổ WO maintenance còn CREATED/chưa có assignment. Consumer không gọi HTTP bằng token giả.

## Cập nhật môi trường

1. Áp migration: `pnpm db:migrate`. Các migration ADR 0022 chỉ thêm cột/bảng/index, không xóa dữ liệu hoặc sửa migration cũ.
2. Build/restart backend theo README. SR và Notification nay cần `ORGANIZATION_SERVICE_URL`, đã có trong `.env.example`; các service xác thực branch phải truy cập được Organization.
3. Với demo mới: chạy seed Identity → Organization theo README, sau đó seed các service còn lại. Seed Organization phát site routing; RabbitMQ và outbox worker phải chạy để WO bảo trì tự nhận chi nhánh.
4. Hồ sơ cũ có `branch_id=NULL` được giữ nguyên. Không gán theo người tạo/chi nhánh hiện tại của kỹ thuật viên. Tenant Admin dùng hàng chờ để phân bổ có lý do. Với WO cũ từ Request: phân bổ Request nguồn trước, sau đó WO cùng chi nhánh.
5. Site có từ trước ADR: mở chi tiết khách hàng, lưu chi nhánh phục vụ để phát routing. Việc cấu hình không chuyển các ca đã có chi nhánh. Khi ngừng chi nhánh, xử lý các ca mở trước; nhân viên có chi nhánh chính INACTIVE bị từ chối truy cập vận hành.

## Chuẩn bị bằng giao diện

Tenant Admin:

1. **Chi nhánh**: tạo A và B.
2. **Người dùng → Chi nhánh chính**: gán Service Manager, Inventory Staff, Technician vào A/B.
3. Trong cùng khối quản trị nhân viên, tạo hồ sơ kỹ thuật viên với mã nhân viên, hoặc cập nhật chi nhánh hồ sơ theo chi nhánh chính mới. Đây là hai bước trên hai service, lỗi bước sau không tạo lại tài khoản/membership đã lưu.
4. **Khách hàng → Chi tiết → Địa điểm**: lưu chi nhánh tiếp nhận yêu cầu mới.
5. **Phân bổ dịch vụ** (`/app/organization/service-branches`): xem Request/WO chưa phân bổ hoặc lọc từng chi nhánh. Phân bổ cần lý do; Request kiểm tra `expectedBranchId` để tránh ghi đè quyết định khác.

Service Manager tạo site mới được mặc định chi nhánh chính nếu đã có. Site thiếu routing vẫn có thể lưu dưới danh mục dùng chung; yêu cầu khách gửi sẽ vào hàng chờ admin. Nhân viên không tự thay routing của site sang chi nhánh khác.

## Kịch bản demo gọn

1. Customer Admin chọn máy tại site A, gửi yêu cầu.
2. Một tài khoản Service Manager A xem xét bảo hành, lập/gửi dự toán nếu cần, tiếp nhận, tạo WO, xếp lịch và phân công Technician A. Không cần đổi sang Dispatcher.
3. Inventory Staff A cấp/trả phụ tùng từ kho A nếu ca có phụ tùng.
4. Technician A tiếp nhận, thực hiện và nộp báo cáo.
5. Customer Admin xác nhận kết quả. Tenant Admin mở tổng quan hoặc lọc A/B để trình bày quản lý tổng.
6. Đăng nhập Service Manager B và thử URL ca A: backend trả 404. Đổi lại admin để xem cùng hồ sơ và lịch sử.

## Tái chạy kiểm thử

`pnpm test:branch-scope` cần đủ tám `<SERVICE>_TEST_DATABASE_URL` riêng có tên chứa `test`, RabbitMQ test (hoặc broker local với exchange/queue riêng), và dependencies đã cài. Fixture tạo tenant/ID ngẫu nhiên trên DB test, không reset DB phát triển. Các DB suite có TRUNCATE phải chạy tách khỏi script này.

Browser tùy chọn:

```sh
BRANCH_BROWSER=true \
PLAYWRIGHT_MODULE=/path/to/playwright \
PLAYWRIGHT_EXECUTABLE_PATH=/path/to/chromium \
pnpm test:branch-scope
```

Browser dùng backend/Identity thật, không fixture HTTP. Playwright nằm ngoài dependency ứng dụng. Ảnh/kết quả mặc định ở `/tmp/pbl6-branch-browser/results`.
