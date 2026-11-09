# Nghiệm thu quản lý dịch vụ theo chi nhánh

Ngày thực chạy: 2026-11-09. Nhánh triển khai: `feature/branch-service-management`.

Thiết kế: [ADR 0022](../decisions/0022-branch-service-management.md). Cấu hình dữ liệu và kịch bản demo: [hướng dẫn vận hành](../user-guide/branch-service-management.md).

## Phạm vi hoàn thành

Cả năm giai đoạn trong ADR đã được triển khai: nền phân quyền theo chi nhánh chính; tiếp nhận và điều phối bằng một Service Manager; kho/bảo trì/thông báo/báo cáo theo phạm vi; giao diện quản trị và hàng chờ; kiểm thử với backend, PostgreSQL và RabbitMQ thật.

Customer, Equipment và Maintenance Plan/Task dùng chung trong tenant. Chi nhánh chịu trách nhiệm cho từng Service Request/Work Order, có nhân viên và tồn kho riêng. Tenant Admin xem tổng, gán nhân viên, đặt chi nhánh phục vụ site và phân bổ hồ sơ; quyền nghiệp vụ vẫn theo RBAC hiện hành.

## Kết quả kiểm tra

| Kiểm tra | Kết quả thực chạy |
| --- | --- |
| `pnpm lint` | PASS |
| `pnpm typecheck`, kiểm tra lại bằng `pnpm -r --if-present typecheck` | PASS |
| `pnpm build` | PASS |
| `pnpm test` | 564 passed: 455 backend/packages và 109 web; 3 broker tests mặc định skipped |
| Event Contracts với `RABBITMQ_TEST_URL` | 32 passed, bao gồm cả 3 transport tests với broker thật |
| Bootstrap/HTTP e2e của Gateway và bảy backend nghiệp vụ | 91 passed |
| Organization `test:e2e:db` | 47 passed |
| Service Request `test:e2e:db` | 69 passed |
| Work Order `test:e2e:db` | 231 passed |
| Inventory `test:db` | 34 passed |
| Identity `test:e2e` | 94 passed, 1 skipped |
| Notification `test:e2e:db` | 16 passed, 2 skipped |
| `pnpm db:check-drift` trên tám service | PASS, không khác biệt giữa migration và Prisma schema |
| Database vs Prisma schema của tám service | PASS, không khác biệt |
| `pnpm db:migrate` hai lần | PASS trên tám DB phát triển local; không reset hoặc tự gán chi nhánh dữ liệu cũ |
| Identity permission seed hai lần và Organization demo seed hai lần trên DB test | PASS; không nhân đôi entity, site routing tăng revision và phát event |
| `pnpm test:model-policies` | PASS, regression luồng model policy/registration/handover/maintenance qua service thật |
| Maintenance `test:integration` | PASS: chuyển site, scheduler, tạo/thực hiện/hủy/thay thế WO và đồng bộ lịch sử qua Gateway/RabbitMQ; seed hai lần |
| Integration chi nhánh qua Identity/Gateway + PostgreSQL/RabbitMQ | PASS; [kết quả](artifacts/branch-service-management/results.json) |
| Browser với backend thật | 4 kiểm tra PASS, không có page error; [kết quả](artifacts/branch-service-management/browser-results.json) |
| Workflow CI và bảy OpenAPI YAML đã sửa | Parse thành công |
| `git diff --check` | PASS |

Các DB suite sử dụng database test riêng. Một số suite sẵn có dùng upstream contract double; script integration chi nhánh bổ sung kiểm tra các hợp đồng giữa service thật. Những ca skipped trong suite mặc định không được tính là đã chạy; script integration riêng đã thực sự truyền event qua RabbitMQ.

Workflow CI đã thêm bước `pnpm test:branch-scope` trong job database; chưa có kết quả CI từ xa trong phiên này. Fixture bootstrap được cập nhật để cung cấp branch context rõ ràng và tự đủ biến môi trường, không dựa vào `.env` phát triển.

## Luồng và tình huống đã xác minh

- Đăng nhập thật qua Identity/Gateway; chặn dữ liệu tenant khác và customer khác.
- Một Service Manager xem xét, tiếp nhận, tạo WO, xếp lịch và phân công kỹ thuật viên cùng chi nhánh; không cần đổi tài khoản sang Dispatcher.
- List/detail/mutation/attachment của Request và WO không vượt chi nhánh, kể cả truy cập trực tiếp bằng ID. Dự toán ngoài bảo hành gửi/duyệt được; chi nhánh khác không sửa hoặc gửi được.
- Tenant Admin xem hàng chờ, phân bổ ca có lý do và kiểm tra phiên bản chi nhánh trước khi ghi. Cấu hình site mới không đổi chi nhánh ca cũ.
- Tạo/sửa hồ sơ kỹ thuật viên phải khớp chi nhánh chính. Không phân công kỹ thuật viên sang WO chi nhánh khác.
- Kho kiểm tra chi nhánh ở stock/ledger/nhập/xuất/trả/audit/recovery. Replay idempotency và truy xuất operation vẫn kiểm tra quyền hiện tại.
- Technician thực hiện, trả phụ tùng, nộp báo cáo và khách hàng xác nhận kết quả; thông báo và báo cáo tổng hợp phản ánh đúng phạm vi.
- Routing site truyền qua outbox/inbox RabbitMQ; WO bảo trì nhận chi nhánh. Event cũ không ghi đè revision mới, revision xung đột và producer giả bị từ chối.
- Thay chi nhánh chính có hiệu lực khi dùng lại JWT hiện tại. Thiếu chi nhánh hoặc chi nhánh ngừng hoạt động trả 403; Organization mất kết nối trả 503 cho thao tác cần scope. Admin vẫn xem tổng được.
- Lời mời mới hoặc gán thêm Dispatcher bị từ chối; tài khoản Dispatcher cũ không tự được nâng quyền.

## Bằng chứng giao diện

Browser đăng nhập tài khoản thật, dùng API qua Gateway, không mock HTTP:

- [Tenant Admin gán chi nhánh chính](artifacts/branch-service-management/admin-primary-branch.png).
- [Mở yêu cầu chi nhánh khác bị chặn](artifacts/branch-service-management/manager-foreign-request.png).
- [Hàng chờ trên màn hình 390 × 844](artifacts/branch-service-management/admin-mobile.png), không tràn ngang.

## Tái chạy

Xem [điều kiện môi trường và lệnh browser](../user-guide/branch-service-management.md#tái-chạy-kiểm-thử). Lệnh chính là `pnpm test:branch-scope`; script tạo fixture tenant ngẫu nhiên trên tám database test, dùng exchange/queue riêng và không reset database phát triển. Không chạy cùng các DB suite có TRUNCATE.

Không chạy đồng thời `build:packages` với suite đang dùng `packages/*/dist`: bước build dọn thư mục đầu ra. Các lần lỗi fixture/build cạnh tranh trong lúc phát triển đã được sửa hoặc chạy lại thành công trước khi ghi kết quả trên.

## Giới hạn và vận hành dữ liệu cũ

- Hồ sơ cũ chưa có `branch_id` được giữ trong hàng chờ admin. Cần phân bổ theo dữ liệu thực tế; với WO từ Request, phân bổ Request trước. Bản migration không suy đoán chi nhánh từ người tạo hoặc kỹ thuật viên hiện tại.
- Site cũ cần được lưu cấu hình chi nhánh phục vụ để phát event routing. Backend và outbox consumer cần restart sau cập nhật.
- Chưa triển khai điều chuyển ca đang làm, mượn kỹ thuật viên hoặc luân chuyển kho giữa chi nhánh; đây là giới hạn chủ động của phương án đơn giản.
- Branch context đọc trực tiếp từ Organization cho từng request cần scope. Organization không khả dụng thì nhân viên tạm thời không thao tác dịch vụ được; không mở rộng quyền sang toàn tenant.
- Flutter/mobile không đổi mã nguồn và chưa chạy lại Android UAT trong đợt này. Browser mobile ở trên là web responsive.
- Kết quả là kiểm tra local; chưa xác nhận CI từ xa hoặc triển khai production.
