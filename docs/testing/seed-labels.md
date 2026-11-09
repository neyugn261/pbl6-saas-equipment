# Nghiệm thu tên và mã nghiệp vụ của seed

Ngày thực chạy: 2026-11-10. Hướng dẫn: [dữ liệu phát triển](../user-guide/demo-data.md). Nguồn dữ liệu: [`scripts/demo/catalog.cjs`](../../scripts/demo/catalog.cjs).

## Quy ước đã áp dụng

| Đối tượng | Tên/mã |
| --- | --- |
| Doanh nghiệp | Công ty Thiết bị Minh Phát, mã đăng nhập `MP` |
| Chi nhánh | `HCM`, `DN` |
| Khách hàng | Bệnh viện Đa khoa An Phúc (`BV-AP`), Công ty Cơ khí Hòa Long (`CK-HL`) |
| Địa điểm | `AP-HCM`, `AP-DN`, `HL-HCM`, `HL-DN` |
| Thiết bị | `SA-001`–`SA-003`, `MB-001`–`MB-003` |
| Kỹ thuật viên | `KT001`–`KT004`; họ tên không ghép vai trò/chi nhánh |
| Kho | `K-HCM`, `K-DN` |
| Phụ tùng | `LOC-01`, `CC-5A`, `CB-AS01` |
| Yêu cầu dịch vụ | Mô tả lỗi: “Áp suất bơm không ổn định”, “Máy bơm mất nguồn”… |

Email tài khoản `@demo.local` giữ nguyên. Chính sách mặc định, kế hoạch bảo trì, nhật ký công việc và ghi chú nhập kho mới dùng nội dung nghiệp vụ, không có tiền tố kịch bản.

## Kết quả kiểm tra

| Lệnh/kiểm tra | Kết quả |
| --- | --- |
| `pnpm test:demo-seed` | PASS: build backend, 6 guard tests, seed integration trên tám DB test |
| Seed integration | PASS: reset sạch; 14 login; scope chi nhánh/khách hàng; broker và MinIO thật; chạy seed ba lần |
| Nâng cấp nhãn cũ trên DB test | PASS: giữ phiếu REVIEWING, WO tạm dừng, tồn kho đã nhập thêm và tên phụ tùng do người dùng tự sửa |
| `pnpm lint` và lint `scripts/demo` | PASS |
| `pnpm -r --if-present typecheck` | PASS |
| `pnpm --filter web build` | PASS |
| `pnpm --filter web test` | 109 passed |
| Inventory DB suite | 34 passed |
| Work Order DB e2e | 231 passed |
| `git diff --check` | PASS |

Seed integration giả lập lại các nhãn mặc định cũ rồi chạy seed thông thường để kiểm tra nâng cấp, không chỉ kiểm tra seed trên DB trống. Khóa chống lặp của receipt và tình huống dịch vụ giữ nguyên, không phát sinh nhập/xuất kho hoặc hồ sơ trùng.

## Dữ liệu local đã cập nhật

Đã chạy `node scripts/demo/seed.cjs` trên tám DB phát triển, không reset. Seed trả READY với tenant `MP`. Đối chiếu trước/sau xác nhận giữ nguyên:

- 14 tài khoản, mật khẩu, role và phân công chi nhánh.
- ID, trạng thái và liên kết giữa yêu cầu dịch vụ với WO; phiếu đầu tiên đang REVIEWING vẫn giữ trạng thái đó.
- Trạng thái WO và assignment kỹ thuật viên.
- Số tồn, ngưỡng tồn, thời hạn bảo hành, lịch/task bảo trì.

[`labels.cjs`](../../scripts/demo/labels.cjs) chỉ đổi các giá trị khớp nhãn mặc định cũ trong [`legacy-labels.json`](../../scripts/demo/legacy-labels.json), trên DB sở hữu dữ liệu tương ứng. Nội dung người dùng đã tự sửa được giữ. Chính sách đã publish, snapshot áp dụng và bằng chứng idempotency giữ nguyên; seed publish phiên bản mặc định mới có tên gọn. Các mã `DEMO-*` còn trong catalog là khóa nội bộ của journal/idempotency, không dùng làm tên hay mã hiển thị.

## Kiểm tra web đang chạy

[Kết quả browser/API](artifacts/seed-labels/result.json) không chứa token, mật khẩu hay hash mật khẩu:

- Gateway và cả tám backend trả health 200; 14 tài khoản đăng nhập được bằng mã `MP` (Platform Admin không truyền mã doanh nghiệp).
- [Service Manager HCM](artifacts/seed-labels/manager-hcm.png) và [Service Manager Đà Nẵng](artifacts/seed-labels/manager-dn.png) mỗi người chỉ thấy ba yêu cầu của chi nhánh mình.
- [Tenant Admin](artifacts/seed-labels/admin-requests.png) thấy đủ sáu yêu cầu với tiêu đề mới; phiếu REVIEWING hiển thị đúng.
- [Danh sách thiết bị](artifacts/seed-labels/equipment.png) dùng sáu mã `SA-*`/`MB-*`; [danh sách khách hàng](artifacts/seed-labels/customers.png) hiển thị tên và mã An Phúc/Hòa Long.
- Không có JavaScript page error trong năm trang được kiểm tra.

Backend và web local đã khởi động lại. Các ảnh nghiệm thu ngày 2026-11-09 vẫn giữ làm bằng chứng của lần seed trước. Flutter/Android UAT và CI từ xa chưa chạy lại trong lần thay đổi này.
