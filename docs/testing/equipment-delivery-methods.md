# Nghiệm thu hình thức bàn giao — 09/11/2026

Nhánh triển khai: `feature/equipment-handover-methods`, từ `develop` tại `7a6b5d9`.
Thiết kế: [ADR 0021](../decisions/0021-registration-delivery-methods.md).

## Kết quả đã chạy

| Kiểm tra | Kết quả |
| --- | --- |
| `pnpm lint` | PASS |
| `pnpm typecheck` | PASS |
| `pnpm test` | 553 PASS; 3 broker tests được skip mặc định theo cấu hình suite |
| `pnpm build` | PASS |
| `pnpm --filter asset-service test:db` | 41 PASS trên Asset test DB |
| `pnpm --filter maintenance-service test:db` | 23 PASS trên Maintenance test DB |
| `pnpm --filter asset-service db:check-drift` | Không có khác biệt schema/migrations |
| `pnpm test:model-policies`, bật `HANDOVER_METHODS_BROWSER=true` | PASS; đăng nhập Identity thật, Gateway, các service, PostgreSQL test riêng, RabbitMQ exchange riêng và Chromium/Brave qua Playwright |
| OpenAPI YAML và SQL reference | Parse thành công; SQL reference chứa nguyên văn cả hai migration mới |

Sau lượt build, đã chạy lại `node scripts/test-model-policies.cjs` với browser flag để xác nhận bản build cuối và migration guard. Không dùng database production; không reset database phát triển.

## Ca nghiệp vụ đã kiểm tra

- STORE: tạo hồ sơ qua wizard, 4 bước, không hiện ngày lắp đặt/vận hành, nhân viên hoàn tất; không tạo EquipmentHandover hoặc chữ ký khách. Giữ Customer Site; bảo hành lấy ngày bàn giao thực tế.
- CUSTOMER_SITE: 5 bước, snapshot có ngày bàn giao/lắp đặt/vận hành và điều khoản đã chọn. Chưa xác nhận thì Equipment chưa ACTIVE, chưa có Warranty/Plan/Task; các API riêng không bỏ qua cổng xác nhận.
- Customer Admin đọc snapshot và xác nhận trên portal; manager và Customer User không có quyền quyết định. Yêu cầu thiếu/sai expectedVersion bị từ chối.
- Khách từ chối, nhân viên sửa ngày và gửi lại: yêu cầu mới, snapshot cũ giữ nguyên, liên kết superseded; không tạo trùng chính sách. Liên kết cũ không chấp nhận được.
- Hết hạn trả về DRAFT; không tự kích hoạt hoặc tạo lịch. Policy preview phải được xem lại.
- Chấp nhận lặp/đồng thời chỉ tạo một Warranty. Ngày bắt đầu không lấy theo thời điểm bấm, ngày lắp đặt hoặc phiên bản Model phát hành sau khi gửi.
- RabbitMQ tạo Plan sau xác nhận; lịch lấy đúng ngày bàn giao và thời hạn bảo hành đã duyệt. Replay cùng ID và ID sự kiện mới vẫn dùng đúng group receipt.
- Resume bởi manager xử lý được provisioning chậm và không thay thời điểm khách hoàn tất. Consumer từ chối producer sai hoặc receipt mâu thuẫn.
- NONE/NONE hoàn tất đúng cho cả hai hình thức mà không tạo Warranty/Plan.
- Database không cho xóa deliveryMethod của hồ sơ đang chờ khách để rơi vào nhánh legacy; CHECK phase cũ vẫn được bảo vệ với giá trị NULL.
- Luồng Model policies, bảo trì có thời hạn và registration/handover legacy tiếp tục qua các bộ kiểm thử hiện có.

## Tái chạy trình duyệt

```sh
HANDOVER_METHODS_BROWSER=true \
PLAYWRIGHT_MODULE=/path/to/playwright \
PLAYWRIGHT_EXECUTABLE_PATH=/path/to/chromium \
pnpm test:model-policies
```

Playwright dùng ngoài repository; không thêm dependency vào ứng dụng. Ảnh UAT local ở `/tmp/pbl6-handover-methods-uat`: store-review/result, customer_site-review/result, customer-review và customer-confirmed-registration. Log lượt cuối: `/tmp/pbl6-handover-final-*.log`.

Phạm vi browser UAT là wizard và portal Web. Notification fan-out, Mobile/Android và gửi thông báo ra ngoài không thuộc lượt UAT này; outbox handover dùng contract thông báo hiện có. Khi triển khai cần cập nhật Asset, Maintenance, shared contracts và áp dụng migration Asset cùng nhau; pending provisioning có thể đối soát bằng resume.
