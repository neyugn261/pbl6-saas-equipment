# ADR 0021 — Hình thức bàn giao và xác nhận khách hàng trong hồ sơ

Ngày: 2026-11-09. Trạng thái: Accepted theo quyết định nghiệp vụ của chủ dự án.

## Quyết định

Hình thức bàn giao thuộc **Equipment Registration**, không thêm cấu hình vào Equipment Model. Hồ sơ mới trên Web chọn một trong hai hình thức:

| Hình thức | Hoàn tất | Ngày bắt đầu chính sách | Lắp đặt / vận hành |
| --- | --- | --- | --- |
| `STORE` — tại cửa hàng | Nhân viên có quyền hoàn tất ở bước 4 | Ngày bàn giao thực tế | Không nhập trong luồng này |
| `CUSTOMER_SITE` — tại cơ sở khách | Bước 5 chờ Customer Admin xác nhận | Ngày bàn giao thực tế đã gửi | Tùy chọn; chưa có thì để trống |

Customer Site luôn là nơi khách đặt/sử dụng thiết bị. Chọn STORE không chuyển thiết bị về Branch của nhà cung cấp. Ngày thực tế không ở tương lai. Ngày lắp đặt, vận hành và thời điểm bấm xác nhận không thay thế mốc bàn giao.

## Trạng thái và dữ liệu đóng băng

Luồng STORE dùng `DRAFT → PENDING_MAINTENANCE → COMPLETED` hoặc trực tiếp COMPLETED khi không có bảo trì. Nhân viên hoàn tất được ghi nhận bằng audit, không tạo chữ ký hoặc EquipmentHandover giả của khách hàng.

CUSTOMER_SITE dùng `DRAFT → PENDING_CUSTOMER_CONFIRMATION → COMPLETED`. Gửi hồ sơ tạo EquipmentHandover với snapshot v2, ngày thực tế, tình trạng, ghi chú, phiên bản và điều khoản bảo hành/bảo trì đã chọn. Gửi yêu cầu và outbox thông báo trong cùng transaction Asset. Nội dung gửi không thay đổi khi Model phát hành phiên bản mới. Customer Admin phải gửi `expectedVersion` của yêu cầu đang xem; vẫn kiểm tra tài khoản, quyền và membership trực tiếp như ADR 0019.

Trong khi chờ: Equipment OUT_OF_SERVICE, chưa có Warranty hay MaintenancePlan được áp dụng. Khóa sửa nội dung Equipment ảnh hưởng snapshot, chặn kích hoạt qua API trạng thái, chặn tạo Warranty/Plan riêng để bỏ qua hồ sơ. API handover riêng không tạo thêm yêu cầu cho một hồ sơ có deliveryMethod.

Từ chối phải có lý do. Từ chối, hủy hoặc hết hạn đưa Registration về DRAFT, xóa preview để nhân viên xem lại chính sách. Snapshot và audit của lần gửi cũ được giữ nguyên. Lần gửi mới tạo handover mới, liên kết superseded; không sửa nội dung cũ. Deadline tương lai, tối đa 90 ngày; không tự chấp nhận khi hết hạn. Hình thức đã chọn được giữ sau lần lưu đầu tiên.

## Transaction và tích hợp Maintenance

Khách chấp nhận: trong một transaction Asset, kiểm tra snapshot/current handover, tạo Warranty từ chính snapshot đã gửi, hoàn tất Registration với người xác nhận là khách, kích hoạt Equipment và ghi outbox. Không lưu token nhân viên để thực hiện thay khách.

Nếu có bảo trì, `EquipmentRegistrationConfirmed.v1` mang snapshot bất biến và tham chiếu equipment/customer/site/version. Maintenance consumer kiểm tra producer/tenant/aggregate/hash, dùng inbox và cùng logic group receipt hiện có để tạo các Plan trong một transaction, rồi ghi `RegistrationMaintenanceReady.v1` trong outbox. Asset consumer kiểm tra receipt khớp hash và rule IDs rồi cập nhật Plan IDs. Không có truy cập chéo database.

Hồ sơ hoàn tất ngay khi khách xác nhận; `maintenanceProvisioning=PENDING` cho biết lịch đang được tạo, `READY` khi nhận receipt. Scheduler chỉ thấy Plan sau xác nhận, không cần một trạng thái PAUSED mà nhân viên có thể vô tình mở. RabbitMQ/outbox/inbox dùng retry và DLQ hiện hành; khi mất broker không mất xác nhận. Service Manager có thể gọi resume để đối soát/tạo lại nhóm từ snapshot đã xác nhận; group receipt chống trùng với consumer. Việc xác nhận không đợi một transaction xuyên hai database.

## Tương thích và migration

`deliveryMethod=null` giữ nguyên luồng trước ADR này, gồm handover opt-in độc lập; không suy luận hình thức hoặc tạo xác nhận cho hồ sơ cũ. API cũ vẫn có thể bỏ deliveryMethod. Web mới luôn chọn rõ. Các CHECK phase cũ được giữ cho legacy/STORE; nhánh CUSTOMER_SITE có invariant riêng. Các migration additive `20261109100000_registration_delivery_methods` và `20261109101000_registration_legacy_phase_guard` chỉ thuộc Asset; guard riêng bảo đảm NULL không bỏ qua CHECK phase cũ theo quy tắc ba giá trị của PostgreSQL; Maintenance tái sử dụng schema group receipt. Không thay đổi cấu hình Model hoặc lịch sử đã áp dụng.

## Kiểm tra

`pnpm test:model-policies` bổ sung luồng Gateway/Identity/Organization/Asset/Maintenance/RabbitMQ trong `scripts/test-handover-methods.cjs`. Browser UAT bật bằng `HANDOVER_METHODS_BROWSER=true`; dùng Playwright và trình duyệt cài sẵn. Các bài test dùng database test riêng, không reset database phát triển.
