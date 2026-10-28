# Issue #33 — kiểm tra web M2

- Nhánh: `feature/hatsady-m2-web-equipment-maintenance`.
- Commit phần web đầu tiên: `8a05707` (dựa trên `76c179b`); form chỉnh thiết bị, kịch bản PATCH và tài liệu này nằm ở commit tiếp theo. Các phép kiểm tra đã chạy trước khi tạo commit.
- Ngày kiểm tra: 28/10/2026, máy Windows local; Node `v24.22.0`, Docker `27.5.1`.
- Hạ tầng: PostgreSQL, RabbitMQ, Redis và MinIO trong Docker; Identity, Organization, Asset, Service Request, Work Order, Maintenance và API Gateway chạy local. Các migration sẵn có của Asset, Service Request và Maintenance đã được áp dụng; dữ liệu DEMO, Maintenance dev plan và một lần scheduler tick đã được tạo.
- Phạm vi: kiểm tra API thật qua Gateway và kiểm tra tĩnh web. Chưa kiểm tra thao tác bằng trình duyệt trên mọi màn hình.

| Ca kiểm tra | Cách kiểm tra | Kết quả |
| --- | --- | --- |
| Web TypeScript, ESLint và build | `tsc -b apps/web/tsconfig.json`, ESLint trên các file web thay đổi, `vite build` trong `apps/web` | **PASS**. Build có cảnh báo bundle JS lớn hơn 500 kB. |
| Menu theo vai trò | `tsx apps/web/scripts/check-role-menu.ts` | **PASS**, 8 menu vai trò. |
| Luồng backend M2 tuần 1 và tuần 2 | `node --env-file=.env scripts/smoke-test-m2-week1.mjs` và `smoke-test-m2-week2.mjs` | **PASS** trong stack local trước khi thử thay thế Work Order. |
| Dossier, preview và trạng thái từng nguồn | `node --env-file=.env apps/web/scripts/verify-m2-issue33.mjs` | **PASS**: preview tối đa 5 dòng, tổng số và trạng thái nguồn tách riêng. |
| Chỉnh hồ sơ và xác nhận tình trạng | Cùng kịch bản với `--exercise-equipment-update` | **PASS**: PATCH tên hiển thị, thông số, ngày vận hành; xác nhận tình trạng riêng có lý do và ghi lịch sử; thiếu lý do trả 400, Customer User sửa trả 403. Kịch bản phục hồi ba trường hồ sơ nhưng giữ bản ghi lịch sử xác nhận. |
| Tenant và customer scope | Cùng kịch bản trên, qua Gateway | **PASS**: tài khoản DEMO thật của Customer User/Customer Admin và Service Manager; token thử nghiệm ký cho tenant thứ hai và customer thứ hai; Customer không đọc được Work Order raw. **Chưa** dùng tài khoản đăng nhập thật của tenant/customer thứ hai. |
| Lịch sử | Cùng kịch bản trên | **PASS**: global, per-equipment, Model, Warranty; pagination và scope. |
| Work Order và Service Request | Cùng kịch bản trên | **PASS**: staff WO detail có assignments/history/logs/report theo trạng thái nguồn; SR có warrantyCheck snapshot, calendarCoverageNow, estimates và allowedActions. |
| Maintenance và quyền Customer | Cùng kịch bản trên | **PASS**: summary, Plan, Task, journey; Customer Admin đọc được summary, Customer User bị từ chối. |
| Maintenance Service ngừng | Tắt riêng Maintenance, chạy kịch bản với `--expect-maintenance-outage`, khởi động lại rồi chạy chế độ bình thường | **PASS**: dossier báo `UNAVAILABLE` với `data: null`; sau khi service trở lại, kiểm tra bình thường đạt. |
| Work Order thay thế | Chạy một lần `--exercise-replacement` trên dữ liệu DEMO, hủy Work Order của Task rồi gửi replacement request | **FAIL** ở bước liên kết: API nhận request và trả trạng thái `PENDING`, nhưng không chuyển `LINKED` sau 20 giây. Work Order service hiện chưa có consumer xử lý `MaintenanceWorkOrderReplacementRequested.v1`. Task DEMO thử nghiệm còn `PENDING`, Work Order cũ là `CANCELLED`. Không chạy lại ca này trên cùng Task nếu chưa khôi phục dữ liệu hoặc triển khai consumer. |
| Giao diện bằng trình duyệt | Đăng nhập và bấm qua từng vai trò | **CHƯA CHẠY**. API và build không xác nhận bố cục hay hành vi click trên trình duyệt. |

## Việc cần tiếp tục

1. Chủ sở hữu Work Order Service triển khai và kiểm thử consumer cho `MaintenanceWorkOrderReplacementRequested.v1`, gồm idempotency theo `requestId` và liên kết Work Order mới với Maintenance Task. Sau đó kiểm tra lại trên Task mới bằng `--exercise-replacement` và chỉ bật `VITE_M2_REPLACEMENT_ENABLED=true` khi ca này **PASS**.
2. Dùng hai tenant và hai customer có tài khoản thật để kiểm tra đăng nhập, menu và điều hướng trên trình duyệt. Test token tổng hợp hiện chỉ chứng minh ràng buộc phía API cho scope đó.
3. Kiểm tra trực tiếp các màn hình ở desktop/mobile: dossier, lịch sử và bộ lọc, WO staff/customer, SR, Maintenance; xác nhận nhãn, layout, trạng thái lỗi và nút thao tác.

Kịch bản `verify-m2-issue33.mjs` cần `SEED_DEMO_PASSWORD` và `JWT_ACCESS_SECRET` trong `.env` local. Không lưu mật khẩu, token hay secret trong tài liệu này.
