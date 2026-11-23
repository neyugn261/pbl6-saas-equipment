# Nguyên — triển khai Web ngày 21/11/2026

Nhánh: `feature/nguyen-web-task-completion`. Baseline: `a72c766` trên develop.
Thay đổi đang ở working tree; chưa commit, push hoặc merge.

Điều chỉnh UX theo yêu cầu ngày 22/11/2026: danh sách yêu cầu dịch vụ/hỗ trợ dùng bảng tóm tắt và nút **Xem chi tiết**, bỏ lối mở xem nhanh Request. Bảng ưu tiên tiêu đề, mô tả ngắn, khách/thiết bị/địa điểm, ưu tiên, trạng thái/kết quả một phần, bên xử lý/bước tiếp và thời điểm gửi. Preview cũ trên URL không mở Drawer; các bộ lọc và phân trang giữ nguyên.

Danh sách Thiết bị cũng giữ nguyên nội dung bảng, thay Xem nhanh bằng **Xem chi tiết** dẫn thẳng tới hồ sơ theo phạm vi nội bộ/Portal. Đã bỏ component và state xem nhanh Thiết bị; vẫn giữ chọn hàng, bộ lọc, thứ tự cột và xuất dữ liệu.

Lệnh công việc dùng một danh sách duy nhất; bỏ Board, chuyển chế độ và xem nhanh. Bảng hiển thị mã/tiêu đề/loại, khách hàng/thiết bị/địa điểm lệnh, ưu tiên, người phụ trách, lịch dự kiến, trạng thái/bước tiếp và **Xem chi tiết**. Bộ lọc dùng toolbar chung có nhãn, lọc loại công việc và reset toàn bộ; các điều kiện từ lịch/KPI/chi nhánh hiển thị thành nút bỏ riêng. URL Board/preview cũ chỉ mở danh sách; phạm vi KTV vẫn được giữ.

Điều chỉnh CSS ngày 23/11/2026: tab Hồ sơ & chính sách/Bảo hành & dự toán trong chi tiết SR tái sử dụng `ServiceCard`, `ServiceFacts`, `ServiceNotice`; tách quyết định bảo hành, tóm tắt và từng phiên bản dự toán. Form thẩm định có hai cột trên màn rộng, một cột trên màn nhỏ. Tab Lịch sử xử lý có khung/tiêu đề, trạng thái trống riêng và timeline xuống dòng trên màn nhỏ. Giữ API, phân quyền và nội dung nghiệp vụ hiện có; bước UAT ở T05.

Tab Thông tin & trao đổi được bố trí lại thành hai cột: mô tả, trao đổi, kết quả, tệp ở cột chính; thông tin yêu cầu, thiết bị và lệnh liên quan theo quyền ở cột phụ. Mô tả chỉ nằm trong tab cho mọi vai trò; các form tiếp nhận giữ ID và chuyển bước hiện có. Thẻ thiết bị hiển thị tên/mã/serial từ dữ liệu đã tải, link theo đúng App/Portal; không gọi vị trí hiện tại của máy là địa điểm lịch sử của yêu cầu. Màn nhỏ dùng một cột; lỗi tải thiết bị vẫn được hiển thị.

Đội ngũ kỹ thuật ngày 23/11: bỏ component/state xem nhanh KTV; bảng có tên/mã, chi nhánh, kỹ năng/mức, trạng thái và Xem chi tiết. Toolbar chung tìm mã/lọc trạng thái/reset, bộ chọn chi nhánh/kỹ năng có bố cục riêng. Hồ sơ tái sử dụng thẻ thông tin/kỹ năng và bảng công việc có lọc trạng thái/ngày/sắp xếp/phân trang, giữ đầu/cuối ngày theo giờ Việt Nam. Không đọc danh sách công việc trước khi tải được hồ sơ KTV, không suy diễn lỗi thành 0 lệnh; không thêm endpoint hoặc dữ liệu liên hệ ngoài API hiện có. CSS của panel KPI vẫn được giữ vì còn nơi sử dụng.

Đối chiếu hai backlog:

- [UX và phân công](../planning/2026-11-19-ux-issues-and-task-breakdown.md).
- [Thiết bị/import/filter/export](../plans/2026-11-19-web-equipment-import-filter-export-task-assignment.md).

“Có code” trong báo cáo này không thay thế nghiệm thu trình duyệt, tích hợp API thật hoặc owner review. Những checkbox có tiêu chí rộng hơn phần đã triển khai vẫn để trống.

## 1. Tiến độ tám task UX

| Task | Đã triển khai / tái sử dụng | Còn thiếu để đóng task |
|---|---|---|
| NGUYEN-01 | Stepper ba bước; Quick Dispatch Drawer chọn KTV cùng branch, giờ hẹn; gọi `POST /work-orders/quick-dispatch` qua Gateway. Chống double-submit; lưu trạng thái chưa xác định trước POST; sau reload chỉ đối soát bằng GET. | SR sửa chữa phải ACCEPTED trước; API hiện không tiếp nhận SR hay cấp vật tư trong cùng lệnh. Vật tư làm tiếp trên WO. Cần UAT và đo thao tác thực tế. |
| NGUYEN-02 | Biểu đồ Recharts, bảng so sánh có nút mở chi tiết, MTTR/FTFR và drilldown theo đúng KTV/khoảng thời gian của báo cáo. Dùng API đã merge của Khương. | UAT với dữ liệu thật; không suy từ số lượng ca thành mức hài lòng. |
| NGUYEN-03 | `LocationTreeView` dùng ở hồ sơ khách và Portal địa điểm; đóng/mở bằng native details/summary; đọc location và toàn bộ trang thiết bị của site để đếm gồm cấp con. Phát hiện vòng lặp/cấp trên thiếu; lỗi đếm không hiển thị 0. | UAT cây lớn/quyền thực tế. Có thể thay nguồn đọc bằng endpoint tổng hợp của Huy sau khi có contract, không cần làm lại component. |
| NGUYEN-04 | Giữ component RecommendedParts và bảo vệ giá vốn hiện có. | Huy bổ sung `partId`, snapshot/revision và producer/outbox từ báo giá được duyệt; sau đó nối picker và thao tác tạo phiếu/cấp đúng quy trình Inventory. Chưa làm picker mang tên liên kết kho khi backend chưa lưu liên kết đó. |
| NGUYEN-05 | `TableToolbar` dùng chung, debounce 300 ms, áp dụng Khách hàng, Request/WO/KTV qua SearchSubmit và danh mục Phụ tùng. Thiết bị dùng bộ lọc chuyên biệt lưu URL. | Chuẩn hóa tiếp date/branch/chips và các phân hệ còn lại theo DTO thật; không tự thêm query chưa được hỗ trợ. |
| NGUYEN-06 | Customer workspace có metric cards từ Equipment summary và SR total, các tab Tổng quan/Vị trí & thiết bị/Yêu cầu & lệnh/Bảo trì; giữ tab liên hệ. WO/Request/Equipment phân trang riêng; bảo trì chọn đúng máy của khách. | Chi phí lũy kế chưa có nguồn nên hiện chưa có số liệu, không gán 0. Chờ summary chi phí và các projection mở rộng; UAT. |
| NGUYEN-07 | Tái sử dụng public QR landing/configuration/inquiry đã merge. | Chưa có contract upload media của báo lỗi vãng lai hoặc chuyển sang SR. Không thêm form tải ảnh chỉ lưu trong browser rồi báo thành công. |
| NGUYEN-08 | Header chọn chi nhánh mặc định cho TA; lưu theo tenant/user trong sessionStorage. Tự thêm filter chỉ vào list Request/WO/Technician/KPI/Warehouse được DTO hỗ trợ. Dữ liệu đến muộn khi đổi branch bị từ chối; cache/read key chứa branch; remount trang con để bỏ lựa chọn cũ. | Đây là filter mặc định: filter branch riêng của trang được ưu tiên. Equipment/Maintenance và các endpoint khác chưa có branch filter tương ứng. Chưa coi là ngữ cảnh branch đầy đủ toàn hệ thống. Backend vẫn quyết định quyền. |

## 2. Tiến độ N01–N17

| ID | Tiến độ và phần còn lại |
|---|---|
| N01 | Có mẫu toolbar, summary, quick view, drawer và loading/error/empty; cần áp dụng đủ ma trận phân hệ/role. |
| N02 | Thiết bị có chọn/đổi thứ tự cột, lưu lựa chọn theo tài khoản trong tab, giữ nhận dạng và cuộn ngang. Grid và export dùng cùng thứ tự cột. Các trường mở rộng của C01/M11 còn cần nguồn backend. |
| N03 | Filter ngày mua/giao/lắp, khách/site/location/trạng thái giữ theo URL, gồm phân trang; có bỏ từng điều kiện/nhóm ngày hoặc reset toàn bộ; ẩn cột không bỏ filter. Multi-select/multi-serial cần DTO mới. |
| N04 | Summary server hiện có và nút Xem chi tiết dẫn thẳng tới hồ sơ, ghi nhớ vị trí cuộn khi mở từ bảng; reader tách session/branch. Theo quyết định UX ngày 22/11 đã bỏ xem nhanh Thiết bị. Cần browser UAT quay lại danh sách. |
| N05 | CSV/XLSX dùng cùng bước ghép cột và preview; giữ text serial. Đã có form update riêng. Chưa có nguồn xác nhận ngoài hệ thống, preview trước/sau đầy đủ hoặc job lớn từ backend. |
| N06 | Tái sử dụng form sửa từng máy/site/location/ngày đã có. Site chưa xác định và các trạng thái lắp đặt mới phụ thuộc C03/M01/M06/H02. |
| N07 | Xuất CSV/XLSX toàn kết quả qua mọi trang hoặc hàng chọn; chọn preset cột đang hiển thị/mẫu cập nhật có ID và updatedAt; phát hiện đổi số lượng/trùng ID trong lúc đọc. Chưa có job/export endpoint hay snapshot server; không coi các lần GET là snapshot nguyên tử. |
| N08 | Customer 360 nền tảng và list khách dùng toolbar; Request dùng bảng tóm tắt và nút Xem chi tiết theo quyết định UX ngày 22/11, bỏ lối mở Drawer cho Request. Estimate vẫn trong hồ sơ SR; còn projection/list/export H04/H05 mở rộng. |
| N09 | KTV mở hồ sơ chi tiết có kỹ năng và bảng công việc, lọc ngày/trạng thái/sắp xếp/phân trang; bỏ xem nhanh theo quyết định UX ngày 23/11. KPI có drilldown; WO dùng một bảng danh sách với thông tin điều phối, địa điểm công việc đã ghi nhận và nút Xem chi tiết, bỏ Board/Drawer theo quyết định UX ngày 22/11. Export/projection mở rộng còn phụ thuộc K02–K05. |
| N10 | Phụ tùng có toolbar chung; các form Phụ tùng/Kho/Giao dịch mở theo nút Thêm, hủy giữ draft, khóa trong lúc gửi; giao dịch mất phản hồi vẫn khóa và cho phục hồi. Chưa chuẩn hóa toàn bộ Maintenance/PartRequest/inquiry/Notification/export. |
| N11 | Giữ Gate/RBAC, không thêm endpoint hay trả thêm trường nhạy cảm; test session/branch và native điều khiển bàn phím. Chưa nghiệm thu trực quan/tất cả role. |
| N12 | Có báo cáo này và bước UAT; chưa có bằng chứng browser/dataset toàn stack cho yêu cầu mới. |
| N13 | Web bỏ quyền tạo SR của SM ở creators, route mới/alias qua Gate và CTA dashboard/dossier/QR. Khách vẫn giữ quyền tạo. **Backend catalog/API vẫn còn quyền SM; H08 chưa hoàn thành. Không tuyên bố đã thu hồi quyền backend.** |
| N14 | Bảng KTV có tổng toàn tập, toolbar tìm mã/lọc trạng thái và bộ chọn chi nhánh/kỹ năng. Xem chi tiết thay xem nhanh, hồ sơ có bảng lịch phân trang và giới hạn ngày theo giờ Việt Nam. Không coi AVAILABLE hay kết quả trống là bằng chứng rảnh. Cần UAT K03/Q10. |
| N15 | SM thấy nhãn Lịch sử sự kiện ở menu/tiêu đề/footer; giữ route và bộ lọc, nêu rõ phạm vi lịch sử thiết bị/dịch vụ. Không biến thành audit toàn nền tảng hoặc đổi nhãn Portal của khách. |
| N16 | Chờ H09/K07: API báo cáo khách, filter/drilldown/export đúng customer scope. Không đưa báo cáo KPI nội bộ vào Portal. |
| N17 | Đã mở rộng filter Thiết bị/toolbar các list; kho và các phân hệ còn lại cần contract query/export đúng S01–S03. |

## 3. Kiểm tra tự động

Các lệnh dưới đây chạy trực tiếp bằng Node với dependency đã cài, tương ứng script trong `apps/web/package.json`:

```powershell
cd apps/web
node --test --test-reporter=spec test/*.test.mjs
node node_modules/eslint/bin/eslint.js .
node node_modules/typescript/bin/tsc -b
node node_modules/vite/bin/vite.js build
```

- Unit/component harness: **155/155 đạt** ở lượt xác nhận cuối ngày 21/11.
- ESLint toàn Web: đạt.
- TypeScript project (`tsc -b`) và production build: đạt. Báo cáo/KPI được tách thành lazy chunk, không tải toàn bộ Recharts ngay khi mở ứng dụng. Vite vẫn cảnh báo entry chunk khoảng 531 kB; không tăng ngưỡng cảnh báo hoặc coi đây là bằng chứng đạt mục tiêu tải dưới 500 ms.
- Test mới: cây đệ quy/cycle/count unavailable; URL filter; branch scope và late response; dispatch double-submit/reload/reconciliation; KPI drilldown; role/CTA tạo SR; mapping CSV giữ serial 0 và ngày Excel sau đổi tên cột; debounce và thay URL không remount ô tìm. Form tạo kho/phụ tùng được kiểm tra hai lần submit trước rerender vẫn chỉ gửi một POST.
- Bổ sung ngày 22/11: grid/export cùng thứ tự cột; Request/Thiết bị/WO mở trang chi tiết thay xem nhanh; WO chỉ dùng danh sách, giữ địa điểm lệnh đã ghi nhận và phạm vi KTV. URL Board/preview cũ không mở lại chế độ đã bỏ. Bộ lọc WO giữ điều kiện từ KPI/lịch và hỗ trợ bỏ từng điều kiện hoặc reset toàn bộ.
- Xác nhận lượt sửa danh sách WO ngày 22/11: **47/47 test đạt** trong `workspace`, `nguyen-web-tasks`, `workshop`, `workshop-business`, `service-manager-m2`; ESLint, `tsc -b`, Vite build đạt. Vite vẫn cảnh báo entry chunk trên 500 kB. Chưa chạy browser UAT cho lượt sửa này.
- Xác nhận CSS hồ sơ chính sách/lịch sử SR ngày 23/11: **42/42 test hiện có đạt** trong `service-manager-m2`, `service-manager-detail`, `m3-web`, `minh-ux`, `request-intake-qr`; ESLint, `tsc -b`, Vite build đạt. Đã dọn helper trạng thái trống không còn được dùng. Vite vẫn cảnh báo entry chunk trên 500 kB; chưa chạy browser UAT.
- Xác nhận bố cục Thông tin & trao đổi ngày 23/11: **29/29 test hiện có đạt** trong `service-manager-m2`, `service-manager-detail`, `workshop-business`, `request-intake-qr`; ESLint, `tsc -b`, Vite build và `git diff --check` đạt. Thay đổi ở `App.tsx`, `workshop.css`, `service-detail.css`; UAT bổ sung ở T05 bước 8, chưa chạy trực quan trên trình duyệt.
- Sửa harness của `minh-ux.test.mjs` để tải module spreadsheet thật và cung cấp TextEncoder/TextDecoder. Các test hiện có tiếp tục kiểm tra hành vi thực, không bỏ assertion nghiệp vụ.
- `inventory-forms.test.mjs` là file local đã tồn tại và chưa được Git theo dõi lúc bắt đầu. Giữ file, cập nhật import/field giá theo code hiện hành và chạy cùng toàn suite.

Backend và Web local tại `localhost:3000`/`localhost:5173` không hoạt động khi kiểm tra; chưa chạy login/API smoke hay thao tác dữ liệu demo thật. Chưa chạy browser UAT. Không reset/seed dữ liệu, đổi schema, sửa mobile hoặc thay dependency.

## 4. UAT sau khi bật stack

Hướng dẫn từng bước theo tài khoản, 15 ca test và file CSV mẫu: [kịch bản kiểm thử thủ công](nguyen-web-manual-uat.md).

1. SM mở một SR ACCEPTED đã phân bổ branch tại `/app/service-requests/:id`. Mở Điều phối nhanh, chọn KTV cùng branch và lịch; xác nhận rồi mở WO để kiểm tra assignment. Thử mất phản hồi và reload: phải kiểm tra lệnh đã có, không gửi POST mới. Kiểm tra SR chưa ACCEPTED không có nút Quick Dispatch.
2. SM/TA mở `/app/reports`, chọn khoảng ngày có dữ liệu và mở chi tiết KTV. So sánh MTTR/FTFR, kỳ báo cáo, các liên kết WO và ranh giới ngày Việt Nam. Kỳ không có dữ liệu phải hiện trống hoặc chưa đủ dữ liệu đúng nghĩa.
3. Mở `/app/customers/:id`: đối chiếu tổng máy/bảo hành/yêu cầu với list cùng scope; mở cây ở hai site có phòng trùng tên; lỗi Asset không được thành 0 máy. Customer xem cây của mình tại `/portal/locations`.
4. `/app/equipment`: kết hợp ngày mua/ngày giao/vị trí; chuyển trang, ẩn cột ngày mua và bấm Xem chi tiết rồi Back. Filter vẫn còn. Xuất cả hai định dạng và hàng chọn; kiểm tra số lượng/cột/serial; mẫu cập nhật giữ ID/version. Ghép tên cột CSV/XLSX khác template trước preview.
5. `/app/technicians`: tìm kỹ năng/branch, chọn KTV và kiểm tra lịch nhiều trang/khoảng ngày; màn hẹp panel nằm dưới bảng. Không hiển thị lỗi nguồn như người rảnh.
6. TA đổi chi nhánh mặc định trong lúc list đang tải: không hiện response hay hàng chọn cũ. Thử filter riêng trên trang; đổi tài khoản phải không kế thừa branch của tài khoản trước. Kiểm tra những trang chưa hỗ trợ branch filter theo mô tả Header.
7. SM không có CTA/form tạo SR qua `/app/service-requests/new`, `/requests/new`, dashboard, dossier và QR; Customer vẫn tạo được qua Portal. Test API trực tiếp của SM còn chờ H08; không bỏ qua bước này khi nghiệm thu Q09.
8. Kho: mở/hủy/mở lại các form, thử lỗi nghiệp vụ và mất response; input bị khóa trong POST và khi kết quả giao dịch chưa xác định. Kiểm tra giá vốn vẫn theo quyền hiện hành.
9. Request/WO: bảng tóm tắt và nút Xem chi tiết, không có Xem nhanh; WO không có Board. Kiểm tra lọc loại/trạng thái/ưu tiên, reset toàn bộ và bỏ từng điều kiện từ KPI/lịch; KTV vẫn chỉ đọc lệnh của mình. Back từ chi tiết giữ URL bộ lọc/trang; URL Board/preview cũ chỉ hiện danh sách. Khách chỉ có link Portal, không đọc WO nội bộ. Di chuyển thiết bị không được làm bảng WO dùng nơi lắp hiện tại thay địa điểm lệnh đã ghi nhận.

## 5. Phụ thuộc cần owner tiếp nhận

- Huy: H08 thu hồi quyền SM phía catalog/DB/token/API; H04/H05/H09 và media SR/public inquiry; producer snapshot partId/revision của báo giá.
- Minh: nguồn xác nhận ngoài hệ thống, lookup mã nghiệp vụ/site chưa xác định, import job và export job/contract mở rộng.
- Khương: K02–K05 và K07 cho WO/report khách; xác nhận KPI/Quick Dispatch với dữ liệu thật. Quick Dispatch hiện chỉ nguyên tử trong workorder_db.
- Cả nhóm: browser UAT, scope test toàn stack, owner review và CI trước merge. Không đánh dấu đạt mục tiêu hiệu năng/giảm click khi chưa đo.

## 6. Các file chính

| Nhóm | File |
|---|---|
| Routing, grid và filter/export thiết bị | `apps/web/src/App.tsx`, `features/equipment/list-view.ts`, `EquipmentGridRow.tsx`, `spreadsheet.ts` |
| Điều phối/KPI | `features/workspace/QuickDispatch.tsx`, `features/reports/WorkOrderReports.tsx`, `TechnicianKpiVisuals.tsx` |
| Cây vị trí/khách hàng | `features/workspace/location-tree.ts`, `LocationTreeView.tsx`, `CustomerOverview.tsx`, `CustomerServicePanel.tsx`, `routes/EquipmentDirectories.tsx`, `LiveAdministration.tsx` |
| Toolbar/danh sách/lịch | `features/workspace/TableToolbar.tsx`, `OperationsPages.tsx`, `routes/M2Pages.tsx`, `management.css`, `workshop.css` |
| Branch và chống response cũ | `features/workspace/BranchSwitcher.tsx`, `branch-context.ts`, `workspace-data.ts`, `ServiceManagerShell.tsx`, `api/client.ts`, `routes/registration-data.ts` |
| Import/kho | `routes/MinhAssetUx.tsx`, `registration-shared.tsx`, `features/inventory/InventoryPages.tsx`, `inventory-parts.css` |
| Role/nhãn lịch sử | `auth/access.ts`, `features/workspace/role-workspace.ts`, `ServiceDecisionDesk.tsx`, `RoleDashboard.tsx`, `routes/M2Pages.tsx`, `DashboardPage.tsx`, `DemoPage.tsx` |
| Kiểm thử | `apps/web/test/nguyen-web-tasks.test.mjs`, `workspace.test.mjs`, `inventory-forms.test.mjs` và các harness tương ứng |

Các đường dẫn rút gọn trong bảng cùng nằm dưới `apps/web/src/` trừ nhóm kiểm thử. Không có thay đổi backend/migration/mobile/dependency trong nhánh này.
