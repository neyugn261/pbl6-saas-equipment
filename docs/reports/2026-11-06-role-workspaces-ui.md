# Web theo vai trò — phần UI đã triển khai và kiểm tra

Ngày 06/11/2026. Thay đổi local chưa commit/push trong lượt này.

## Phạm vi yêu cầu

Mở rộng thiết kế từ sáu trang Service Manager sang tám role của dự án. Mục tiêu
là rõ việc cần làm, dễ tìm hồ sơ và giữ ngữ cảnh cho nhân viên lẫn khách hàng.

Tài liệu chính:

- [Bản đồ màn hình và hành trình của tám vai trò](../plans/2026-11-06-web-experience-by-role.md).
- [Phần UI thật và contract backend còn cần làm](../plans/2026-11-06-ui-backend-contract-gaps.md).

## Thay đổi đã thực hiện

- Trang chủ mới cho Platform Admin, Tenant Admin, Service Manager, Dispatcher,
  Technician, Inventory Staff, Customer Admin và Customer User.
- Menu tách quản trị nền tảng / vận hành tenant / portal khách hàng; Customer
  User không có quản lý người dùng; Technician có nhãn Công việc của tôi.
- Thêm đường vào hồ sơ cá nhân cho nhân viên/platform và quản lý Customer User
  cho Customer Admin. Không cho Customer Admin quản lý Customer Admin khác hoặc
  gán role nhân viên từ màn hình này; backend vẫn kiểm tra quyền.
- View đọc phụ tùng/tồn cho Service Manager và Technician, giữ mutation cho
  Inventory Staff theo quyền hiện hành; không đổi catalog quyền backend.
- Bố cục mới cho yêu cầu dịch vụ, WO, kỹ thuật viên, bàn giao, bảo trì và lịch sử.
  Bộ lọc và phân trang server/URL cho danh sách; nhãn tiếng Việt, trạng thái trống,
  retry khi lỗi và hướng dẫn bước tiếp theo.
- WO hiển thị thiết bị/khách hàng/người phụ trách/lịch; Technician gửi mine=true.
  Hồ sơ đã hoàn tất hướng xem lịch sử phân công nếu không còn current assignment.
- Tạo plan và lọc lịch sử dùng chọn thiết bị/kế hoạch/task theo danh mục; không
  bắt nhập UUID. Trước/sau có tên trường; phần công khai customer không render
  actor UUID hoặc ghi chú nội bộ. Biểu mẫu plan có nội dung bảo trì.
- Chống double submit tạo plan; kết quả mạng chưa rõ không báo đã lưu hoặc tự
  POST lại. Đường kiểm tra danh sách không được coi là xác nhận đã lưu thành công.
- Bố cục responsive: chỉ số hai cột trên mobile, form một cột, bảng thành thẻ có
  nhãn; dùng button group với trạng thái pressed, label/focus và giảm chuyển động.
- Số liệu dashboard lấy total server theo đúng truy vấn, không đếm một trang làm
  toàn hệ thống; lỗi không được biến thành 0; không thêm dữ liệu mẫu vào nguồn thật.

File chính: `apps/web/src/features/workspace/`, `apps/web/src/App.tsx`,
`apps/web/src/routes/LiveAdministration.tsx`, `apps/web/src/components/Badges.tsx`
và test web. Thay đổi package.json Notification đã có từ lượt sửa lỗi trước,
không phải thay đổi nghiệp vụ của đợt UI này.

## Kiểm tra đã chạy

| Kiểm tra | Kết quả |
| --- | --- |
| `pnpm --filter web typecheck` | PASS ở các lượt triển khai; build cuối chạy lại `tsc -b` PASS |
| `pnpm --filter web lint` | PASS |
| `pnpm --filter web test` | **61/61 PASS** |
| `pnpm --filter web build` | PASS; có cảnh báo chunk JS lớn hơn 500 kB |
| Browser đăng nhập role | Đã đăng nhập cả tám tài khoản demo, xác nhận heading/menu theo role |
| Browser trang vận hành | Đã mở WO, kỹ thuật viên, bàn giao, bảo trì, lịch sử bảo trì và yêu cầu dịch vụ |
| Browser portal | Đã xem Customer Admin dashboard/người dùng; Customer User dashboard và bộ lọc yêu cầu chờ duyệt phí |
| Browser tạo plan | Mở form, kiểm tra picker có thiết bị thật, không gửi lưu |
| Responsive | Desktop 1440×1000 và mobile 390×844; mobile document 375 px do scrollbar, scrollWidth 375 px, không tràn ngang |

Test mới kiểm tra scope menu, union nhiều role không trùng, dữ liệu/response cũ
không đi qua phiên mới, lỗi không giả số 0, danh sách Technician mine, filter và
total từ server, ghi chú nội bộ không render cho khách, ngày Việt Nam gồm hết
ngày kết thúc, double submit và kết quả plan chưa xác định. Customer Admin chỉ
có thao tác quản lý Customer User phù hợp, không quản lý Customer Admin khác.

Một ca test privacy ban đầu kiểm tra JSON của toàn bộ props thay vì nội dung
render nên tính cả response được truyền cho DataState; đã sửa phép kiểm để xem
các node nội dung. Lượt cuối 61/61 phía trên đã chạy lại sau sửa.

Bằng chứng browser: [JSON kiểm tra role/menu](../testing/2026-11-06-role-workspaces-browser.json).
Ảnh local được lưu trong `tmp/ui-customer-admin-desktop.png` và
`tmp/ui-customer-user-mobile.png` (Git bỏ qua).

## Giới hạn nghiệm thu

- Kiểm tra browser role là smoke test đăng nhập/menu/trang chủ, chưa phải UAT
  toàn bộ thao tác của tám vai trò. Danh sách local phần lớn chưa có bản ghi;
  tình huống có dữ liệu, retry và riêng tư được kiểm thêm bằng test fixture.
- Không tạo/sửa hồ sơ nghiệp vụ để chụp ảnh; browser chỉ tạo/kết thúc phiên đăng nhập.
- Không sửa backend/schema/migration, không reset/seed database trong đợt UI.
- Chưa triển khai toàn bộ màn hình nâng cao trong bản đồ. Lịch điều phối, xác
  nhận/đổi lịch, public service summary đầy đủ, audit nền tảng và các phần chi
  tiết chưa được thiết kế lại được ghi rõ ở file contract gaps.
- Notification local còn báo 403 do nguồn quyền/projection; chưa được xử lý ở
  phạm vi này. Tên doanh nghiệp thật chờ nguồn scoped, UI dùng nhãn trung tính.
- Các màn chi tiết hiện có vẫn dùng quyền và API cũ; thay danh sách không có nghĩa
  mọi luồng xuyên role đã được nghiệm thu lại. Phụ thuộc owner cần ghép theo kế hoạch.

Kết luận: đạt kiểm tra local cho phần trang chủ/menu và các trang danh sách đã
thay đổi; có tài liệu đầy đủ để tiếp tục UI và backend theo từng hành trình role.
