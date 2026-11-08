# Workshop UI V2 — triển khai và đánh giá khắt khe

Ngày: 08/11/2026. Phạm vi: web. Căn cứ: `2026-11-08-ui-product-completeness-review.md` và yêu cầu triển khai của người dùng.

## 1. Kết luận nghiệm thu

**Đạt đợt sửa UI và thiết kế hành trình để review; chưa chốt toàn bộ UI sản phẩm là hoàn thiện.**

Đã sửa sáu nhóm lỗi F01–F06 và thêm studio tương tác cho 12 hành trình/8 vai trò. Những trường hoặc quyết định cần API mới có bản thiết kế riêng, không đưa nút lưu giả vào web vận hành. Kiểm thử frontend đạt; lượt này không chạy nghiệm thu ghi dữ liệu trên backend thật.

Không sửa `apps/mobile`, backend, schema, migration, event, quyền server. Không commit/push/merge. Các thay đổi local từ lượt trước được giữ lại; Git diff hiện tại chứa cả những lượt đó, không được hiểu toàn bộ là phát sinh trong riêng lượt này.

## 2. Mở bản thiết kế

```powershell
pnpm --filter web dev
```

Mở `http://localhost:5173/design/workshop`. Chọn góc nhìn và hành trình; dùng bộ chọn tình huống để xem loading/rỗng/nguồn lỗi/thiếu quyền/chỉ đọc/chưa rõ kết quả/xung đột.

- Studio chỉ tồn tại ở DEV; không gọi API, không đổi session, không giả đăng nhập role.
- Mọi màn đều ghi rõ dữ liệu minh họa. Biên nhận, bản in và TXT tải xuống không phải hồ sơ thật.
- Build production đã loại module studio; các route vận hành vẫn dùng API thật.
- Form studio giữ state khi đổi tình huống cùng hành trình. Đổi hành trình/role hoặc tải lại trang sẽ khởi tạo lại mẫu; đây không phải cơ chế lưu nháp nghiệp vụ.

## 3. Những gì đã sửa trong UI kết nối API

| Nhóm | Kết quả | Nơi chính |
|---|---|---|
| F01: khôi phục dự toán | Nút đọc lại hoạt động khi kết quả ghi chưa rõ; khóa ghi mới, không tự POST lại. Phân biệt POST đã thành công nhưng GET sau đó lỗi với việc chưa biết POST thành công hay chưa | `routes/EstimatePanel.tsx` |
| F02: chọn thiết bị | Máy đã chọn được đọc độc lập; danh sách tìm kiếm rỗng không khóa gửi nếu máy được chọn vẫn hợp lệ | `routes/NewServiceRequest.tsx` |
| F03: số lượng kho | Hiển thị chính xác theo tiếng Việt; nhận dấu phẩy/chấm tối đa hai số thập phân; kiểm tra số nguyên theo phụ tùng; không qua Number làm mất chính xác | `features/workspace/ui-values.ts`, `features/inventory/InventoryPages.tsx` |
| F04: giờ lịch | Nhánh lịch WO cũ dùng offset UTC+7 rõ ràng thay cho múi giờ trình duyệt | `routes/M2Pages.tsx` |
| F05: chấp thuận dự toán | Dialog đọc đúng revision, số yêu cầu/nhận dạng máy nếu tải được, hạng mục/tổng/hạn/điều khoản; so sánh bản trước; từ chối bằng textarea | `EstimatePanel.tsx`, `EstimateReview.tsx`, `App.tsx` |
| F06: báo cáo dài/nháp | Textarea nhiều dòng; nháp theo tài khoản và WO; preview phần khách đọc; kết quả một phần/chưa xử lý được cần phần còn lại | `routes/M2Pages.tsx` |

Yêu cầu mới thêm mã lỗi, thời điểm xuất hiện, địa điểm thực tế, liên hệ và giờ thuận tiện. Các trường này hiện nối vào **description với nhãn**, không gửi thuộc tính DTO chưa có. Nhãn mức ảnh hưởng giải thích bộ phận dịch vụ còn cần đánh giá ưu tiên.

Phần còn lại của báo cáo hiện nối vào customerSummary; tổng giới hạn nhập được giữ dưới 2.000 ký tự. Chưa tự tạo entity follow-up hoặc đổi trạng thái các service khác.

Form lập Maintenance Plan hiển thị bốn kỳ xem trước, giữ ngày gốc qua tháng ngắn/năm nhuận. Preview không phải lịch hẹn kỹ thuật hoặc bằng chứng scheduler đã sinh task.

### Các lỗi bổ sung tìm được và đã sửa trong lượt tự nghiệm thu

1. Giá trị `1000` của mức tồn tối thiểu không được nạp vào ô sửa dưới dạng `1.000` rồi gửi thành `1`. Đã tách chuỗi hiển thị có phân cách hàng nghìn và chuỗi nhập không có phân cách hàng nghìn; có kiểm tra round-trip cho `2000.50`.
2. Không cho nhảy qua bước đối chiếu serial/checklist trong studio báo cáo. Báo cáo một phần cần phần việc còn lại trước preview/gửi.
3. Phiếu trả đã mở preview nhưng sửa số lượng vượt mức vẫn phải khóa xác nhận cuối, không chỉ kiểm tra ở bước mở preview.
4. Nội dung chờ và phần công bố trong bàn trách nhiệm phải thay đổi theo lựa chọn, không cố định tên Minh hoặc luôn báo chờ khách bổ sung.
5. Trong studio, Service Manager đọc hành trình kỹ thuật; nút nộp báo cáo thuộc góc nhìn Technician. Customer User không được dùng màn dự toán để tự duyệt chi phí.

## 4. Các hành trình được thiết kế thêm

| Hành trình | Nội dung và quyết định có thể review |
|---|---|
| Khách báo sự cố | Nhận dạng máy, sự cố/mã lỗi/thời điểm/ảnh hưởng, site/liên hệ/giờ tiếp cận; nghi trùng cần lý do; chọn tệp có kiểm tra loại/kích thước/số lượng; đọc lại; biên nhận; bổ sung thông tin |
| Trách nhiệm ca dịch vụ | Chủ hồ sơ, bên đang chờ, trở ngại, mốc cập nhật tiếp theo và lý do; lịch sử thay đổi; preview nội bộ/khách |
| Dự toán | Bản cũ/bản mới 1,25 triệu → 1,5 triệu; giải thích phần tăng; khoản ngoài phạm vi; Admin duyệt/từ chối, User đọc và biết đầu mối |
| Điều phối | Lịch ngày/tuần, việc chưa có lịch, khung giờ kỹ thuật viên và xung đột tính từ slot mẫu; liên hệ/site; lịch dự kiến tách khách đã đồng ý; lý do và đọc lại |
| Thực hiện/báo cáo | Serial và thay đổi địa điểm; checklist; vật tư xuất/dùng/trả; báo cáo nháp; phần công bố; kết quả hoàn toàn/một phần/chưa được; không tạo vòng chờ báo cáo–xác nhận dùng |
| Phiếu kho | Nhập/xuất/trả/điều chỉnh tăng, đúng kho, người giao/nhận/căn cứ, lượng tối đa và tồn trước/sau; trả hỏng vào cách ly; preview/xác nhận mẫu |
| Kết quả | Đã làm/đã duyệt/thực tế/còn lại; vận hành tách kết quả sửa; khách đồng ý/không đồng ý/tái diễn/chưa phản hồi; nhân viên xác nhận thay có người phía khách/kênh/căn cứ; phát sinh chưa duyệt không biến thành chấp thuận toàn ca |
| Bảo trì | Kỳ neo ngày gốc; ngày 31, tháng ngắn/năm nhuận; sửa/tạm dừng/chấm dứt; tác động lên kỳ chưa sinh, giữ task/WO đã có; task thất bại/lệnh thay thế |
| Bàn giao | Bản v2 cố định, khác biệt so v1, serial/site/tình trạng/tài liệu, bảo hành đúng bản; khách đọc và phản hồi; không tự dời ngày bảo hành |
| Quản trị doanh nghiệp/nền tảng | Lọc chi nhánh/kỳ, số tính từ danh sách, bấm hồ sơ nguồn; ca lặp/người phụ trách; vòng đời tenant, ảnh hưởng đổi trạng thái và nhật ký mẫu, không đọc hồ sơ khách tenant vào trang nền tảng |
| Tài khoản | Hướng dẫn khôi phục, hồ sơ liên hệ, mời mới/hết hạn/đã dùng, tạm khóa và vai trò cố định trước/sau; phạm vi Customer/Tenant/Platform tách nhau |
| Tài liệu/thông báo/lịch sử | Bản tài liệu/nguồn/phạm vi công bố, TXT mẫu và in; thông báo cần hành động; timeline toàn máy và từng hồ sơ, lọc nguồn/hồ sơ/ngày/từ khóa, mở chi tiết nguồn, khách không thấy ghi chú nội bộ |

Tệp triển khai: `apps/web/src/features/design/WorkshopDesignStudio.tsx`, `StudioJourneys.tsx`, `StudioOperations.tsx`, `HistoryJourney.tsx`, `StudioUI.tsx`, `design-data.ts`, `studio.css`.

Các lựa chọn trong studio diễn tả hành vi đề xuất. Chúng không bổ sung quyền server, không thay quy tắc đã chốt và không chứng minh endpoint tương ứng tồn tại.

## 5. Nền kỹ thuật frontend

- `use-form-draft.ts` và `ui-draft.ts`: sessionStorage theo loại tài khoản, tenant, customer, user và form/resource; kiểm tra cấu trúc/version/giới hạn khi đọc. Nháp thông thường 12 giờ; pending chưa rõ kết quả không tự hết hạn để mở khóa gửi trùng.
- Request/Estimate/Report lưu dấu pending trước khi gửi; chỉ thành công chắc chắn/từ chối chắc chắn mới giải quyết dấu phù hợp. Không suy ra lỗi mạng có nghĩa server chưa ghi.
- `ServiceSections`: deep link `#section=...`, chỉ mount panel lần đầu được mở, giữ panel đã mở để giữ editor.
- `workspace-data.ts`: gộp các GET đồng thời cùng phiên/nguồn/path/revision. Không giữ cache kết quả lâu dài; refresh revision vẫn lấy mới. Không coi đây là giải pháp hoàn chỉnh cho mọi N+1.
- `App.tsx`: lazy từng nhóm route (kho, M2, tổ chức, danh mục, bàn giao, đăng ký, vận hành và form yêu cầu mới); Suspense và màn xử lý lỗi tải route.
- Production JS chính: **403,93 kB**, gzip **114,90 kB**, theo build cuối. Không còn cảnh báo chunk vượt 500 kB trong build này. Đây là kích thước build, chưa phải phép đo tốc độ mạng/thiết bị thật.

## 6. Kết quả kiểm tra

| Kiểm tra | Kết quả |
|---|---|
| `pnpm --filter web test` | 101/101 đạt; gồm 16 ca mới so với bộ 85 ca trước lượt này |
| `pnpm --filter web lint` | Đạt, exit 0 |
| `pnpm --filter web typecheck` | Đạt; build cuối cũng chạy `tsc -b` |
| `pnpm --filter web build` | Đạt, exit 0; studio không có trong output production |
| Trình duyệt — menu | Đã mở các màn theo 8 vai trò; cả 12 hành trình render được |
| Trình duyệt — điều phối | Trùng slot bị khóa; đổi giờ bằng bàn phím sang slot không trùng cho phép đọc lại |
| Trình duyệt — trạng thái | Đổi loading/rỗng/lỗi/thiếu quyền/chỉ đọc/uncertain/conflict khóa ghi và giữ giá trị form trong cùng hành trình |
| Trình duyệt — responsive | Kiểm tra 12 hành trình ở viewport 390×844: không tràn ngang toàn trang; lịch có vùng cuộn riêng |
| Trình duyệt — console | Không có error mới trong lần tải sạch và thao tác nghiệm thu cuối |

Test mới kiểm tra: số lượng chính xác, chu kỳ neo ngày, nháp/đổi tài khoản/malformed/expiry, panel lazy/hash, đọc lại revision trước POST, uncertain recovery không POST trùng, POST thành công nhưng GET lỗi, chọn máy khi kết quả tìm rỗng, GET đồng thời; serial/checklist/phần còn lại, đổi quantity sau preview, lịch trùng, căn cứ xác nhận thay, lọc lịch sử khách.

Các test component dùng harness React handler/effect hiện có của repository, không phải E2E trình duyệt với server. Không dùng kết quả đó để kết luận tenant isolation/RBAC/backend hay tính nguyên tử xuyên service đã được nghiệm thu.

Ảnh QA tại workspace (thư mục tmp không đưa vào Git): `tmp/workshop-v2-desktop.png`, `tmp/workshop-v2-narrow.png`.

## 7. Đánh giá khắt khe sau triển khai

### Góc khách hàng

Tốt hơn: nhìn được đúng máy/serial; biết đang chờ ai; dự toán và bàn giao có phiên bản; kết quả một phần có phần còn lại; không đồng nhất hoàn tất WO với máy tốt hoặc khách hài lòng. Lịch sử có đường xem toàn máy và từng hồ sơ.

**Chưa đủ để kết luận mọi khách sẽ hài lòng:** chưa có thử nghiệm tác vụ với khách thật; văn bản kỹ thuật vẫn cần kiểm tra với người không quen thuật ngữ. Những tình huống mới đang ở studio, chưa hiện xuyên suốt trong portal dữ liệu thật.

### Góc doanh nghiệp và nhân viên

Tốt hơn: trách nhiệm/mốc cập nhật rõ; lịch có xung đột; kho có trước/sau/người giao nhận; dự toán–thực tế–phát sinh được phân biệt; không tự tạo thanh toán hay quy trình ERP.

**Còn phải nghiệm thu UI liên tục trên hồ sơ thật:** nhiều người cùng xử lý, đổi chủ hồ sơ, đổi địa điểm sau lập lệnh, khách sửa yêu cầu, thiếu dữ liệu cũ, phát sinh sau báo cáo. Studio đang mô hình hóa các màn riêng; chưa phải một ca xuyên suốt duy nhất đồng bộ mọi hành trình.

### Góc kỹ thuật frontend và khả năng tiếp cận

Tốt hơn: nháp, phục hồi, khóa gửi trùng, exact decimal, múi giờ, lazy panel/route và giảm bundle có bằng chứng kiểm tra.

**Các giới hạn UI còn tồn tại, cần đưa vào đợt tiếp theo:**

1. Bộ chọn tình huống studio là mô phỏng chung, chưa thay thế ma trận trạng thái riêng của từng entity/field. Chế độ chỉ đọc hiện khóa bề mặt form; cần kiểm tra tinh hơn để vẫn thao tác lọc/in theo đúng từng trang khi tích hợp.
2. Chưa thống nhất toàn app về lỗi cạnh trường, tóm tắt lỗi có liên kết focus, phím tắt và keyboard navigation. Có focus lỗi và focus-visible tại các phần đã sửa, nhưng chưa chứng nhận WCAG/screen reader.
3. Nháp chưa đồng bộ giữa tab/thiết bị; lưu trữ trình duyệt có thể bị chặn hoặc bị xóa. Chưa có khôi phục server/cơ chế đối soát mọi thao tác ngoài kho bằng idempotency key.
4. Chưa kiểm tra UI ở quy mô hàng nghìn hồ sơ, chuỗi rất dài, tệp thật/virus scan/quyền tải, trình duyệt Safari/Firefox hay màn in A4 chuẩn biên bản. TXT/in studio là bản review.
5. Nhiều role cùng một tài khoản cần review riêng; role switcher studio không chứng minh trải nghiệm hợp nhất của tài khoản nhiều role. Luồng người duyệt vắng mặt mới xác định đầu mối, chưa thiết kế ủy quyền mới vì phạm vi RBAC không cho tự mở rộng cơ chế quyền.

**Không còn phát hiện P1 chưa xử lý trong nhóm sáu lỗi cụ thể đã sửa và các ca hồi quy đã chạy. Không suy rộng thành không còn lỗi P1 trên toàn hệ thống.**

## 8. Đầu vào cho backend và tích hợp sau khi chốt UI

| Phần sở hữu | Contract cần đối chiếu/bổ sung từ UI |
|---|---|
| Service Request | Chủ hồ sơ, bên chờ/lý do/since/nextUpdateAt; thông tin sự cố/liên hệ có cấu trúc; liên kết sự cố trùng/tái diễn; phản hồi kết quả và căn cứ xác nhận thay; idempotency/outcome lookup |
| Work Order | Lịch ngày/tuần, tải theo thời lượng, snapshot địa điểm/contact, proposed/confirmed lịch khách; checklist/bằng chứng theo bước; phần còn lại của báo cáo có cấu trúc; xung đột phiên bản |
| Asset/Bàn giao | Snapshot điều khoản, serial/site/tình trạng/tài liệu theo bản gửi; so sánh thay revision; quyền đọc tài liệu/lịch sử và thông tin nguồn chưa đầy đủ |
| Inventory | Phiếu giao nhận/người giao nhận/căn cứ; projection tồn trước/sau; lịch sử sửa sai; dùng contract reservation hiện có, không thay bằng kiểm tra WO một lần |
| Maintenance | Preview dùng cùng quy tắc scheduler; tác động sửa plan; task thất bại/lệnh thay thế; không thay ngày đến hạn bằng lịch hẹn |
| Identity/Organization | Khôi phục truy cập, cập nhật contact, lời mời hết hạn/gửi lại, impact và audit quản trị theo scope; giữ role cố định |
| Notification/Reports | Đường tới đúng hồ sơ/mục, thông báo cũ đã đổi trạng thái; số liệu có kỳ/filter/định nghĩa và drill-down cùng scope |

Trước khi nối từng contract: xác nhận field bắt buộc/nguồn sở hữu/quyền/phạm vi khách/phiên bản/tính bất biến, rồi chuyển hành trình tương ứng từ studio vào route thật với test contract. Không giả định transaction nguyên tử giữa DB/service.

## 9. Quyết định đề xuất

Cho phép review/chốt nội dung UI V2 theo từng hành trình. Giữ các sửa UI thật đã được kiểm tra. Chưa đóng hạng mục “hoàn thiện toàn bộ web” cho đến khi các hành trình mới được đưa vào route theo quyền, nghiệm thu phần còn thiếu ở mục 7 và có kiểm tra tác vụ với người dùng.
