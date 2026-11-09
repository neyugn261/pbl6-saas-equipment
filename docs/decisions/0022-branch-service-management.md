# ADR 0022 — Điều phối dịch vụ theo chi nhánh

Ngày: 2026-11-09. Accepted theo yêu cầu chủ dự án trong phiên triển khai này.

## Quyết định

- SERVICE_MANAGER tiếp nhận, đánh giá bảo hành, lập dự toán, tạo WO, xếp lịch và phân công. DISPATCHER giữ tương thích tài khoản cũ, ngừng đưa vào onboarding/demo mới; không tự nâng quyền tài khoản cũ.
- Tenant Admin quản trị và xem tổng tenant. Quyền thao tác vẫn theo catalog; cấp branch:manage cho hành động phân bổ hồ sơ chưa định tuyến, không cấp toàn bộ quyền nghiệp vụ.
- Nhân viên vận hành sử dụng một chi nhánh chính ACTIVE từ Organization. Mỗi HTTP request cần branch scope gọi Organization với token người dùng, không dùng header/client branch làm quyền. Không có chi nhánh trả 403, dependency lỗi trả 503, không mở rộng về toàn tenant. Tenant Admin được miễn giới hạn chi nhánh; customer scope giữ nguyên.
- Customer/Equipment/Model và Maintenance Plan/Task dùng chung trong tenant. SR và WO lưu branch_id nullable: NULL là hàng chờ Tenant Admin. SR định tuyến từ CustomerSite.defaultServicingBranchId đang hoạt động qua Asset/Organization; WO từ SR kế thừa branch_id. WO bảo trì định tuyến từ bản sao site routing do Organization phát event, không gọi liên service bằng token giả trong scheduler/consumer.
- Site routing là mặc định cho ca mới. Thay đổi site không sửa chi nhánh của ca cũ. Mọi phân bổ thủ công lưu lịch sử, chỉ trước tiếp nhận/triển khai; không xây quy trình điều chuyển ca đang chạy.
- Kỹ thuật viên phân công phải cùng chi nhánh WO. Profile technician khi tạo/sửa đối chiếu chi nhánh chính Organization. Kho có tồn riêng; stock/ledger/mutation/recovery áp dụng quyền chi nhánh. Catalogue phụ tùng vẫn dùng chung.
- Notification nghiệp vụ chi nhánh được gắn branch_id và lọc khi đọc/count/read. Báo cáo và attachment áp dụng cùng phạm vi với WO/SR nguồn.
- Không xóa hoặc suy đoán chi nhánh lịch sử khi migration. Hồ sơ cũ chưa định tuyến vào hàng chờ admin; công cụ backfill sử dụng API có quyền, không truy cập DB service khác.

## Giai đoạn và nghiệm thu

1. Nền quyền: live branch context, admin gán chi nhánh chính, guard fail closed; test missing/inactive/khác tenant/dependency lỗi.
2. Luồng dịch vụ: migration SR/WO, định tuyến site, gán hàng chờ, phân công cùng chi nhánh; test hai chi nhánh và truy cập ID trực tiếp.
3. Tích hợp: WO bảo trì, inventory, attachments, báo cáo và notification; test scope cả retry/cache và luồng tự động.
4. Web/demo: một tài khoản Service Manager làm toàn hành trình; admin quản lý nhân viên/site routing/hàng chờ; scope rõ, giữ customer portal/mobile tương thích.
5. Kiểm tra: lint/typecheck/unit/build, drift/migration DB test, integration hai chi nhánh qua Gateway; ghi kết quả thực tế và giới hạn vào docs/testing.

Organization tiếp tục sở hữu membership/site routing. Mọi migration chỉ thuộc DB service sở hữu; outbox/inbox, version của event mới và kiểm tra tenant được giữ.
