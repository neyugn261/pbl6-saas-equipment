# Issue #33 — kiểm tra web M2

- Nhánh: `feature/hatsady-m2-web-equipment-maintenance`.
- Commit phần web đầu tiên: `8a05707`; phần tiếp theo ở `5e61d83`. Đợt kiểm tra hiện tại dựa trên nhánh đã nhận code `develop` tại `3862375`.
- Ngày kiểm tra: 28/10/2026, máy Windows local; Node `v24.22.0`, Docker `27.5.1`.
- Hạ tầng: PostgreSQL, RabbitMQ, Redis và MinIO trong Docker; Identity, Organization, Asset, Service Request, Work Order, Maintenance và API Gateway chạy local. Dữ liệu DEMO, Maintenance dev plan và một lần scheduler tick đã được tạo. Sau khi pull, migration Work Order `0004_maintenance_replacement_reference` còn thiếu trong database local; đã chạy `pnpm --filter workorder-service db:migrate` và xác nhận API liên kết Work Order hoạt động.
- Phạm vi: kiểm tra API thật qua Gateway và kiểm tra tĩnh web. Chưa kiểm tra thao tác bằng trình duyệt trên mọi màn hình.

| Ca kiểm tra | Cách kiểm tra | Kết quả |
| --- | --- | --- |
| Web TypeScript, ESLint và build | `tsc -b apps/web/tsconfig.json`, ESLint trên các file web thay đổi, `vite build` trong `apps/web` | **PASS**. Build có cảnh báo bundle JS lớn hơn 500 kB. |
| Menu theo vai trò | `tsx apps/web/scripts/check-role-menu.ts` | **PASS**, 8 menu vai trò. |
| Luồng backend M2 tuần 1 và tuần 2 | `node --env-file=.env scripts/smoke-test-m2-week1.mjs` và `smoke-test-m2-week2.mjs` | **PASS** trong stack local trước khi thử thay thế Work Order. |
| Dossier, preview và trạng thái từng nguồn | `node --env-file=.env apps/web/scripts/verify-m2-issue33.mjs` | **PASS**: preview tối đa 5 dòng, tổng số và trạng thái nguồn tách riêng. |
| Chỉnh hồ sơ và xác nhận tình trạng | Cùng kịch bản với `--exercise-equipment-update` | **PASS**: PATCH tên hiển thị, thông số, ngày vận hành; xác nhận tình trạng riêng có lý do và ghi lịch sử; thiếu lý do trả 400, Customer User sửa trả 403. Kịch bản phục hồi ba trường hồ sơ nhưng giữ bản ghi lịch sử xác nhận. |
| Tenant và customer scope | Cùng kịch bản trên, qua Gateway | **PASS**: tài khoản DEMO thật của Customer User/Customer Admin và Service Manager; token thử nghiệm ký cho tenant thứ hai và customer thứ hai; Customer không đọc được Work Order raw. **Chưa** dùng tài khoản đăng nhập thật của tenant/customer thứ hai. |
| Lịch sử | Cùng kịch bản trên | **PASS**: Equipment global/per-equipment, Model, Warranty và Maintenance global/per-equipment/Plan/Task; pagination, filter và scope qua Gateway. |
| Work Order và Service Request | Cùng kịch bản trên | **PASS**: staff WO detail có assignments/history/logs/report theo trạng thái nguồn; SR có warrantyCheck snapshot, calendarCoverageNow, estimates và allowedActions. |
| Maintenance và quyền Customer | Cùng kịch bản trên | **PASS**: summary, Plan, Task, journey; Customer Admin đọc được summary, Customer User bị từ chối. |
| Maintenance Service ngừng | Tắt riêng Maintenance, chạy kịch bản với `--expect-maintenance-outage`, khởi động lại rồi chạy chế độ bình thường | **PASS**: dossier báo `UNAVAILABLE` với `data: null`; sau khi service trở lại, kiểm tra bình thường đạt. |
| Work Order thay thế | `--exercise-replacement` trên dữ liệu DEMO: hủy Work Order, gửi cùng `requestId` hai lần và đợi Task liên kết | **PASS** sau khi áp dụng migration: hai lần gửi cùng `requestId` trả cùng `replacementWorkOrderId`, Task chuyển `LINKED`. Lần thử đầu tiên sau pull **FAIL** do migration Work Order chưa áp dụng và một outbox event cũ đã xuất bản trước khi queue consumer được bind; đã phát lại đúng event cũ với cùng eventId/payload, sau đó Task cũ chuyển `LINKED`. Lần thử lại tạo chuỗi thay thế mới và **PASS**. |
| Giao diện bằng trình duyệt | Đăng nhập và bấm qua từng vai trò | **CHƯA HOÀN TẤT**. Web local trả HTTP 200, nhưng công cụ điều khiển trình duyệt dừng trước khi thao tác vì không xác định được URL cửa sổ đủ chắc chắn. API và build không xác nhận bố cục hay hành vi click. |

## Việc cần tiếp tục

1. Dùng hai tenant và hai customer có tài khoản thật để kiểm tra đăng nhập, menu và điều hướng trên trình duyệt. Test token tổng hợp hiện chỉ chứng minh ràng buộc phía API cho scope đó.
2. Kiểm tra trực tiếp các màn hình ở desktop/mobile: dossier, lịch sử và bộ lọc, WO staff/customer, SR, Maintenance; xác nhận nhãn, layout, trạng thái lỗi và nút thao tác.
3. Với môi trường local đã có request `PENDING` được phát trước khi consumer bind queue, kiểm tra outbox/queue và phát lại đúng event chưa được consumer xử lý. Không tạo request mới để che trạng thái cũ. Việc phát lại một event trong lần kiểm tra này chỉ tác động database local.

Kịch bản `verify-m2-issue33.mjs` cần `SEED_DEMO_PASSWORD` và `JWT_ACCESS_SECRET` trong `.env` local. Không lưu mật khẩu, token hay secret trong tài liệu này.

Bàn giao contract/API và công việc năm thành viên: [equipment-dossier-handoff](../plans/equipment-dossier-handoff.md), [m2-task-assignment](../plans/m2-task-assignment.md).
