# Bàn giao mở rộng giao diện Workshop trên web

Ngày: 08/11/2026 (Asia/Bangkok). Tiếp tục đợt rà soát ngày 07/11.

## 1. Phạm vi

Áp dụng thiết kế Workshop đã thống nhất cho các vai trò web, đồng thời sửa cách trình bày các nghiệp vụ ưu tiên trong [báo cáo rà soát](2026-11-07-ui-business-review.md).

- Cùng khung điều hướng ngang, màu xám ấm/cam đất, bảng, biểu mẫu, hồ sơ, trạng thái và thông báo lỗi.
- Dashboard và menu theo 8 vai trò hiện hành. Không thêm quyền hoặc role mới; backend vẫn xác thực tenant/customer và quyền thao tác.
- Route ứng dụng tiếp tục dùng API thật. Trang xem trước trong `apps/web/tmp/workshop-preview` chỉ là môi trường QA riêng có dữ liệu minh họa, không được import vào ứng dụng.
- **Không thay đổi Flutter trong `apps/mobile`, bao gồm UI và logic.**
- Không sửa schema, migration, event contract hoặc nghiệp vụ backend trong đợt UI này.
- Giữ các thay đổi local trước đó; chưa commit, push hoặc merge đợt này.

## 2. Thay đổi theo vai trò

| Vai trò | Giao diện và trọng tâm |
| --- | --- |
| Platform Admin | Shell Workshop; dashboard chọn nhóm tenant; quản trị tenant/tài khoản trong `/admin`. Không hiển thị chuông thông báo tenant hoặc menu nhật ký quản trị chưa có API. |
| Tenant Admin | Dashboard chọn nhóm theo dõi dịch vụ/tổ chức; trang quản trị dùng cùng style; bảng và hồ sơ WO có thông tin điều phối/kết quả. |
| Service Manager | Bàn quyết định theo bên cần hành động, đánh giá bảo hành thật, kiểm tra WO đang mở, bàn giao/bảo trì/kết quả cần chú ý. |
| Dispatcher | Bảng WO, danh sách có bộ lọc/sắp xếp, hồ sơ dùng địa điểm của lệnh; lọc kỹ thuật viên theo chi nhánh/kỹ năng và xem công việc đang được giao. |
| Technician trên web | Danh sách việc của mình; hồ sơ nhận dạng máy/serial, cảnh báo máy đã đổi địa điểm, thông tin kết quả/đối soát và các thao tác theo `allowedActions` sẵn có. Không ảnh hưởng ứng dụng Flutter. |
| Inventory Staff | Dashboard theo tồn thấp/giao dịch chờ đồng bộ/danh mục; kho, phụ tùng và giao dịch dùng style chung. Giữ cơ chế key và khôi phục giao dịch chưa rõ kết quả. |
| Customer Admin | Portal với dashboard chọn nhóm bàn giao/chi phí/tiến trình/thiết bị; hồ sơ máy, lịch sử phụ tùng công bố và bảo hành tham chiếu khi đọc bàn giao. |
| Customer User | Portal theo dõi hỗ trợ, bổ sung thông tin và hồ sơ thiết bị; nhãn phân biệt phần quản trị khách hàng cần quyết định. Không bổ sung thao tác duyệt chi phí hoặc chấp thuận bàn giao ngoài quyền hiện có. |

Style chung phủ các route con trong shell: yêu cầu, WO, thiết bị, đăng ký/bàn giao, model/chính sách, khách hàng, đội ngũ, bảo trì/lịch sử, kho, thông báo, báo cáo và quản trị. Các chức năng chưa có API vẫn được báo đúng khả năng; việc thay theme không tự tạo thêm chức năng backend.

## 3. Các điểm nghiệp vụ ưu tiên đã sửa trên UI

### 3.1 Bàn quyết định của Service Manager

Bốn nhóm: **Cần tôi xử lý / Chờ khách hàng / Chờ đội thực hiện / Cần xem lại kết quả**.

- Bổ sung yêu cầu `ACCEPTED`, chờ thông tin, chờ duyệt chi phí, bàn giao chờ xác nhận, Maintenance Task `FAILED`, yêu cầu `RESOLVED` và WO `COMPLETED`.
- Chọn hồ sơ cũ trước, ưu tiên cao trước hoặc mới trước cho nguồn Request/WO có API hỗ trợ. Không gửi tham số sort tới API bàn giao/bảo trì không hỗ trợ.
- Hiển thị tuổi từ ngày tạo và cập nhật gần nhất; nói rõ đây không phải thời gian trong trạng thái hiện tại hoặc SLA.
- Tổng là tổng của từng bộ lọc tại nguồn. Không cộng Request và WO thành một số việc giả, không dùng lỗi tải thành số 0.
- Với yêu cầu đã tiếp nhận: đọc WO đang mở, dẫn đến hồ sơ nguồn và cảnh báo độ trễ đồng bộ trước khi tạo thêm. Không tự kết luận mọi yêu cầu `ACCEPTED` đều chưa có WO.
- Pane bảo hành lấy quyết định, lý do và thời điểm kiểm tra từ chi tiết Request; thời hạn bảo hành và quyết định áp dụng cho sự cố hiển thị riêng.

### 3.2 Địa điểm WO

- Dùng `customerSiteId` và `locationId` đã lưu trên lệnh.
- Tra địa chỉ qua `/sites/:id` và vị trí qua `/sites/:id/locations`.
- Khi máy đã chuyển chỗ, địa điểm hiện tại có nhãn riêng; kỹ thuật viên được nhắc kiểm tra với điều phối trước khi đi.
- Tên/địa chỉ là metadata hiện tại theo ID của lệnh, **chưa phải snapshot địa chỉ lịch sử**. UI ghi rõ giới hạn này.

### 3.3 Kết quả không đồng nhất với trạng thái

Đầu hồ sơ WO trình bày riêng: kết thúc công việc, kết quả sửa chữa, tình trạng máy, khép yêu cầu và đối soát phụ tùng. Có cảnh báo xử lý một phần/chưa xử lý được. Không suy ra máy hoạt động hoặc khách đã đồng ý từ trạng thái `COMPLETED`.

Nhãn vòng đời thiết bị tách khỏi xác nhận vận hành trong danh sách, dashboard, hồ sơ và bàn giao. Khối nhận dạng máy/serial/khách hàng/địa điểm được dùng chung cho các tài khoản được phép đọc dossier.

### 3.4 Lịch sử phụ tùng theo từng thiết bị

- Mục mới đọc `/equipment/:id/service-parts` qua Asset, dùng projection đã lọc quyền.
- Hiển thị phụ tùng, SKU, đơn vị, số lượng xác nhận/còn hiệu lực, lần đảo/điều chỉnh, lý do, xử lý linh kiện cũ, thời điểm ghi nhận và mã WO.
- Khách hàng không nhận liên kết vào WO nội bộ từ component này.
- Không lấy lượng xuất kho làm lượng đã lắp. Không suy ra giá khách trả, miễn phí hoặc tự gia hạn bảo hành.
- Có phân trang, trạng thái không được xem/nguồn lỗi và cảnh báo lịch sử cũ có thể chưa đầy đủ.

### 3.5 Giao dịch kho đang chặn WO

`INVENTORY_RESERVATION_HELD` được giải thích là cần đối soát với kho; làm mới không tự giải quyết giao dịch treo. Áp dụng cho thao tác điều phối và kỹ thuật viên web. Các lỗi xung đột phiên bản khác vẫn yêu cầu đọc lại hồ sơ. Không thay cơ chế reservation hoặc tự mở khóa.

### 3.6 Đọc trước khi xác nhận kết quả

- Thẻ tổng hợp các dự toán `APPROVED`, revision và tổng tiền từ server; không tự tính bằng số thực JavaScript.
- Kết quả công bố và cảnh báo phần còn lại khi xử lý một phần.
- Chỉ rõ cần đối chiếu phụ tùng/phạm vi/phát sinh. Chi phí tham chiếu của kho không được coi là giá khách đã duyệt.
- Nút và modal nhân viên ghi rõ **Xác nhận thay khách hàng**; hướng dẫn ghi người đồng ý, kênh và căn cứ trong trao đổi.
- Đây là hỗ trợ đọc/kiểm tra. API confirm chưa lưu bộ trường bằng chứng bắt buộc, UI chưa phải cơ chế phê duyệt phát sinh hay điều kiện khép hồ sơ mới.

### 3.7 Điều phối, bàn giao, lịch sử và báo cáo

- Xem trước tối đa 5 WO đang giao cho người được chọn; có link danh sách đầy đủ. Không coi danh sách rỗng hoặc trạng thái AVAILABLE là bảo đảm rảnh lịch; backend chưa chặn trùng lịch.
- Bàn giao có thời hạn/điều khoản bảo hành và kỳ bảo trì tham chiếu từ dossier tại thời điểm đọc, phân biệt với biên bản đã gửi. Xác nhận bàn giao không tự đổi ngày bảo hành.
- Lịch sử thiết bị nêu phạm vi nguồn đã tổng hợp và dẫn hồ sơ nguồn theo quyền. Sửa nhãn link bảo trì và footer để không gọi lịch sử bảo trì là toàn bộ lịch sử dịch vụ.
- Báo cáo WO ghi rõ là khối lượng đã ghi nhận, chưa phải tỷ lệ sửa thành công hay mức hài lòng.

## 4. Phần còn cần backend/nghiệp vụ tiếp tục

| Ưu tiên | Phần cần làm | Đầu mối phối hợp | Điều kiện nghiệm thu |
| --- | --- | --- | --- |
| P1 | Xác nhận thay khách có lý do, người đồng ý, kênh, bằng chứng, thời điểm và audit/public projection phù hợp | Service Request + người chốt nghiệp vụ + web | Không thể giả thành khách tự xác nhận; lưu nguyên tử cùng hành động và truy vết được. Comment hướng dẫn hiện tại chưa thay thế yêu cầu này. |
| P1 | Quy tắc chấp thuận phần còn lại khi kết quả một phần; phát sinh ngoài revision đã duyệt và điều kiện khép hồ sơ | Service Request, Work Order (Khương), Inventory + người chốt nghiệp vụ | Không tính phát sinh ngoài chấp thuận; tránh vòng chờ giữa nộp báo cáo và xác nhận dùng phụ tùng. |
| P1 | Snapshot địa chỉ phục vụ khi tạo WO nếu cần chứng cứ địa chỉ tại thời điểm lịch sử | Work Order + Organization | Máy/site đổi thông tin không làm sai hồ sơ lịch sử; có chính sách với lệnh cũ thiếu snapshot. |
| P1 | Điều khoản/ngày hiệu lực bảo hành được đóng băng trong phiên bản biên bản gửi khách | Asset/bàn giao + người chốt nghiệp vụ | Khách đọc đúng bản đã chấp thuận, chỉnh chính sách hiện tại không đổi nội dung biên bản cũ. |
| P2 | Người chịu trách nhiệm dịch vụ riêng cho Request; mốc bắt đầu chờ và bộ lọc nhận việc | Service Request + web | Không dùng người kiểm tra bảo hành làm chủ hồ sơ; bàn giao trách nhiệm có lịch sử. |
| P2 | Lịch hẹn/độ trùng/lịch làm việc và tải kỹ thuật viên | Work Order + Dispatcher | Có contract và chính sách xử lý trùng; AVAILABLE/BUSY không thay thế kiểm tra lịch. |
| P2 | Báo cáo chất lượng, xử lý lại, thời gian chờ và phản hồi khách | Nhóm báo cáo + các service nguồn | Có định nghĩa chỉ số, mốc thời gian và mẫu số rõ ràng. Không đổi nhãn đếm WO thành mức hài lòng. |
| Bắt buộc trước nghiệm thu vận hành | Luồng thật qua Gateway, quyền 8 vai trò, nhiều tenant/customer, event trễ và phục hồi kho | QA + chủ các service | Chạy dữ liệu thật và lưu bằng chứng. UI QA fixture, unit test và build không thay thế bước này. |

## 5. File chính

- Shell/theme/menu: `apps/web/src/features/workspace/ServiceManagerShell.tsx`, `workshop.css`, `role-workspace.ts`, `apps/web/src/App.tsx`.
- Dashboard: `RoleDashboard.tsx`, `ServiceDecisionDesk.tsx`, `decision-queues.ts`, `RequestCoveragePreview.tsx`.
- WO/điều phối: `ServiceManagerWorkOrder.tsx`, `WorkOrderBoard.tsx`, `WorkOrderReadiness.tsx`, `TechnicianSchedule.tsx`, `TechnicianOrderContext.tsx`, `OperationsPages.tsx`.
- Hồ sơ/khép yêu cầu/bàn giao: `EquipmentPartsHistory.tsx`, `RequestCloseoutSummary.tsx`, `HandoverServiceContext.tsx`, `apps/web/src/routes/M2Pages.tsx`, `EquipmentHandovers.tsx`.
- Nhãn/định dạng dùng chung: `service-detail-data.ts`, `ServiceDetailUI.tsx`, `WorkspaceUI.tsx`, `components/Badges.tsx`.
- Kho/báo cáo: `features/inventory/InventoryPages.tsx`, `features/reports/WorkOrderReports.tsx`.
- Hồi quy: `apps/web/test/workshop.test.mjs`, `workshop-business.test.mjs` và các fixture import tương ứng trong test hiện có.

## 6. Kiểm tra

Kết quả lệnh và nghiệm thu trực quan được hoàn tất trước khi bàn giao; xem phần cập nhật cuối dưới đây. Không chạy thao tác ghi dữ liệu thật từ trang QA. Không tuyên bố đã nghiệm thu toàn bộ backend thật.

### Kết quả cuối

| Kiểm tra | Kết quả |
| --- | --- |
| `pnpm --filter web lint` | Đạt, exit 0. |
| `pnpm --filter web typecheck` | Đạt, exit 0; bước TypeScript cũng được chạy lại trong build cuối. |
| `pnpm --filter web build` | Đạt, exit 0; 1.976 module. JavaScript chính 686,45 kB, gzip 190,02 kB. Còn cảnh báo chunk vượt 500 kB; chưa chia tải module trong đợt này. |
| `pnpm --filter web test` | **85/85 đạt**, không bỏ qua ca kiểm thử. |
| `git diff --check` | Không có lỗi khoảng trắng. Có thông báo chuẩn hóa CRLF/LF ở một số file. |
| `git diff --stat -- apps/mobile` và `git status --short -- apps/mobile` | Không có kết quả: không có thay đổi mobile trong working tree. |

Các ca hồi quy bổ sung kiểm tra phạm vi queue và tham số API, không giữ hồ sơ cũ khi nguồn đổi/lỗi, điều hướng 8 vai trò, thiết bị đã đổi địa điểm hoặc lệnh thiếu địa điểm, kết quả sửa một phần, số lượng thập phân rất nhỏ, reservation bị giữ, lịch sử phụ tùng đảo/điều chỉnh, link công bố cho khách, dự toán đúng revision/tổng tiền và bảo hành tham chiếu.

### Kiểm tra trực quan

Dùng component ứng dụng thật trong trang QA riêng, với dữ liệu minh họa và chặn các lệnh ghi:

- Đã mở dashboard của đủ 8 vai trò.
- Đã mở bảng WO, lọc hoàn tất và hồ sơ kết quả một phần; nhìn thấy địa điểm của lệnh A cùng địa điểm hiện tại B, tình trạng chưa xác nhận và phụ tùng chưa đối soát.
- Đã mở hồ sơ kỹ thuật viên web: serial/mã máy, cảnh báo khác địa điểm và địa chỉ thực hiện theo lệnh.
- Đã mở lịch sử phụ tùng cho nhân viên và khách; khách đọc mã WO công bố, không có link WO nội bộ ở mục này.
- Đã mở hồ sơ bàn giao khách hàng có bảo hành tham chiếu, trang kho/tồn thấp và trang quản trị tenant theo theme chung.
- Desktop 1440 × 1000 và web màn hẹp 390 × 844 không có tràn ngang toàn trang ở dashboard. Đây là kiểm tra responsive web, không phải sửa hoặc nghiệm thu Flutter.
- Sau lần tải lại cuối, dashboard tải được dữ liệu QA và không có console error mới. Trong quá trình phát triển đã xử lý cache module dev/HMR và sửa fixture bàn giao gọi đúng nhóm API; không đưa fixture vào route sản phẩm.

Ảnh kiểm tra local nằm trong thư mục bị Git bỏ qua, không phải dữ liệu nghiệp vụ thật:

- `tmp/workshop-allroles-service-desk.png`
- `tmp/workshop-allroles-workorder.png`
- `tmp/workshop-allroles-customer-parts.png`
- `tmp/workshop-allroles-inventory.png`
- `tmp/workshop-allroles-platform.png`
- `tmp/workshop-allroles-narrow-web.png`

**Giới hạn nghiệm thu:** chưa thực hiện lại toàn bộ luồng ghi trên backend thật của 8 vai trò. Chưa thể kết luận hoàn chỉnh trải nghiệm vận hành hoặc đã giải quyết các mục backend trong bảng bàn giao ở phần 4. Bản UI hiện có thể review theo các luồng trên; bước tiếp theo là triển khai/chốt các contract còn thiếu và nghiệm thu luồng thật.
