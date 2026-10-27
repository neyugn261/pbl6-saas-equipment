# Gateway developer portal — kiểm chứng local

Ngày 2026-10-27. Baseline develop `99bc1c3` sau merge K6 #26/#27.
Dependency `b07b987`; implementation `f8bab9e`.
Khương yêu cầu chưa tạo PR; giữ các commit local, chưa push portal.

## Đã kiểm tra

| Kiểm tra | Kết quả |
| --- | --- |
| `pnpm install --frozen-lockfile` | PASS; Swagger UI 5.34.0, YAML 2.9.1; tắt install script Scarf qua allowBuilds=false |
| `pnpm lint`, `pnpm typecheck`, `pnpm build` | PASS toàn workspace |
| `pnpm test` với RabbitMQ test URL | PASS 183 unit/transport tests |
| `pnpm --filter api-gateway test:e2e` | PASS 19 ca: 7 regression và 12 ca portal |
| Chromium/Playwright trên Gateway đang chạy tại localhost:3000 | PASS các thao tác UI dưới đây |

E2E dùng HTTP upstream cục bộ giả, không cần DB. Nó kiểm tra HTML/assets,
6 spec và mapping Gateway (nhất là SR không lặp prefix), forwarding auth,
ẩn internal/Estimate chưa triển khai, 8 health targets, lỗi/404 health và mọi
route developer bị tắt ở production. Có ca whitelist asset/spec không biết
trả 404. Serving Swagger assets cho phép dotfiles chỉ ở các file whitelist vì
pnpm resolve dependency qua node_modules/.pnpm; không phục vụ đường dẫn tùy ý.

Browser smoke dùng Chromium headless từ Playwright cài tạm ngoài repo; không
thêm Playwright vào dependency dự án và chưa đưa browser smoke vào CI. Đã:

1. Mở `/dev`, thấy đủ 8 service cards; refresh và link sang API Explorer.
2. Mở `/docs`, đọc Work Order và chuyển được giữa 6 tài liệu.
3. Chọn Maintenance, mở operation, không có nút Try it out.
4. Login Service Manager bằng nút Try it out/Execute của Swagger qua
   `/api/identity/auth/login`, nhận 200 từ Identity thật.
5. Authorize JWT, chuyển sang Work Order và Execute GET danh sách qua
   `/api/workorders/work-orders`, nhận 200 từ WO thật.
6. Chọn SR: spec dùng server `/api`, paths `/service-requests`; không lặp prefix,
   không quảng bá các đường Estimate chưa triển khai.
7. Full reload không còn JWT trong authorization state.
8. Dashboard ở viewport 390px không tràn ngang; không có page/console error.

Các tài khoản/DB business không bị reset; browser chỉ login và đọc dữ liệu.
Không chạy lại DB suite hoặc nghiệp vụ tạo WO cho thay đổi portal này; schema,
migration, quyền và nguồn YAML không thay đổi. Không ghi token/password vào
bằng chứng hoặc screenshot lưu trong repo.

## Cách dùng

Mở `http://localhost:3000/dev` hoặc `http://localhost:3000/docs` khi Gateway
chạy ở development. Xem [README Gateway](../../apps/api-gateway/README.md)
để khởi động và đăng nhập bằng Swagger. `/health` hiện hành vẫn chỉ tổng hợp
4 service M1; `/dev/status` kiểm tra cả 8 và phân biệt endpoint health chưa có.

Giới hạn: portal không chứng minh API scaffold đã có code hoặc mọi luồng M2
đã được nghiệm thu. UI Web/Android, scheduler Maintenance thật, H4 và replacement
vẫn theo các kế hoạch/owner hiện hành. Chưa có kết quả CI remote cho portal vì
chưa mở PR theo yêu cầu Khương.
