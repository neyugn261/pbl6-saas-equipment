# Giao task — Hồ sơ thiết bị, nhập file, tổng quan, bộ lọc và xuất Excel/CSV

Ngày lập: 19/11/2026.

**Cập nhật Nguyên ngày 21/11:** [bảng trạng thái N01–N17, code, kiểm thử và UAT](../testing/nguyen-web-tasks-2026-11-21.md). Đã mở rộng filter URL/cột/xem nhanh/export/mapping file và các màn Web; các checkbox dưới đây giữ nguyên nếu chưa đạt đầy đủ contract, backend và nghiệm thu của từng task. Đặc biệt, import hiện vẫn tạo DRAFT; quyền SM phía backend và báo cáo Portal chưa hoàn tất.

**Bổ sung sau phản hồi cùng ngày:** mục 14 ghi rõ các yêu cầu Service Manager, bố cục Đội ngũ kỹ thuật, Lịch sử sự kiện, tham khảo bộ lọc hiện có và Báo cáo cho khách hàng. Tổng cộng 75 task; các yêu cầu này chưa được coi là đã triển khai.

## 1. Mục tiêu và cách dùng

Tổng hợp những yêu cầu người dùng và AI đã thống nhất trong cuộc trao đổi về lô thiết bị, nơi lắp, dữ liệu đủ chi tiết, màn quản lý và tra cứu. Đây là backlog triển khai, không phải báo cáo các chức năng đã hoàn thành.

**Có bao gồm:** tìm/lọc trên toàn bộ dữ liệu theo quyền và **xuất XLSX/CSV của chính kết quả đã lọc**, không chỉ trang đang mở; tùy chọn xuất các hàng được chọn và các cột được phép.

Phân công đề xuất dùng nguồn UX mới nhất ngày 19/11: Minh — Asset/Inventory, bổ sung Maintenance theo ownership hiện hành; Huy — Organization/Identity/Request/Notification; Khương — Work Order/Technician/Reports; Nguyên — Web. Tài liệu cũ có phân công khác; khi thực hiện vẫn phải phối hợp owner thư mục và quy trình review trong CONTRIBUTING, không coi tài liệu này tự thay CODEOWNERS.

Trạng thái đầu: các ô checklist bên dưới đều chưa được nghiệm thu cho yêu cầu mới. Chỉ đánh dấu sau khi có code, API/migration nếu cần và bằng chứng kiểm tra tương ứng. Các nền tảng đã có được ghi riêng để tái sử dụng.

## 2. Quy tắc đã chốt — không thiết kế lại trái yêu cầu

1. Số máy theo lô thực tế, có thể nhỏ hoặc lớn. **50 là ví dụ, không phải giới hạn nghiệp vụ hoặc giới hạn file mặc định của thiết kế mới.** Giới hạn tài nguyên kỹ thuật phải dựa trên kiểm tra và công bố riêng.
2. File CSV/XLSX chứa dữ liệu từng máy; một dòng là một thiết bị vật lý. Một lô của cùng khách có nhiều model và nhiều địa điểm/vị trí lắp.
3. Xác nhận theo nhóm được thực hiện ngoài hệ thống trước upload. Luồng import mới ghi nhận dữ liệu/kết quả đó; **không xây thêm bước bắt khách xác nhận lại trên Portal**. Không tự tắt luồng Portal cũ ở các trường hợp khác.
4. Địa chỉ doanh nghiệp khách, nơi nhận hàng và nơi lắp là các thông tin riêng. Nơi/vị trí lắp phải chi tiết phù hợp thực tế. Có thể bổ sung sau theo giai đoạn; không được gọi là đủ thông tin lắp nếu còn thiếu.
5. Giao nhận thực tế diễn ra trước lắp đặt. Phân biệt ngày thực tế và thời điểm nhập liệu, cho đối soát khai báo muộn có căn cứ.
6. Bảo hành của mọi máy bắt đầu từ **ngày bàn giao thực tế**. Ngày mua, ngày import, ngày xác nhận và ngày lắp là các ngày khác; không tự thay thế hoặc dời thời hạn bảo hành.
7. Một máy giữ nguyên định danh khi cập nhật lắp đặt hoặc chuyển vị trí. Không tạo lại máy để bổ sung thông tin.
8. Mỗi màn quản lý phải cung cấp tổng quan, thông tin quan trọng trong danh sách, bộ lọc, xem nhanh và thao tác đúng quyền. Không buộc mở từng hồ sơ để tìm dữ liệu cơ bản.
9. Filter, sort, đếm và export chạy trên toàn tập theo scope, không chỉ lọc các dòng đang có trong browser.
10. Giữ kiến trúc service sở hữu DB riêng, RBAC và tenant/customer/branch scope hiện hành. Không sửa mobile trong đợt Web này. Không mở rộng thành đơn hàng, kho thành phẩm, kế toán hoặc thanh toán.

## 3. Hiện có để tái sử dụng và khoảng trống

| Nền tảng hiện có | Giữ/tái sử dụng | Khoảng trống cần task mới |
|---|---|---|
| Bulk CSV cơ bản | Parser, preview, uniqueness, Idempotency-Key và kết quả lô | Đang giới hạn 50/100 KB, site chung, tạo DRAFT; chưa XLSX/cập nhật/kết quả xác nhận ngoài hệ thống |
| Equipment/Model/History | Định danh, model, thông số, ngày giao/lắp, lịch sử | Chưa có ngày mua; site đang bắt buộc; thiếu mô hình nơi nhận/nơi lắp chưa xác định và schema file mới |
| Organization | Customer, Site, Location phân cấp, Contact, Branch | Cần lookup theo mã và hỗ trợ dữ liệu địa điểm chi tiết cho import lớn đúng quyền |
| Bảo hành/Model policy | Mốc ngày giao, phiên bản và snapshot | Cần áp dụng đúng qua nguồn xác nhận ngoài hệ thống, không bỏ qua policy hoặc giả actor Portal |
| Danh sách thiết bị | Bảng và một số filter API | Thiếu cột/filter theo yêu cầu, ngày mua và xuất kết quả lọc |
| Web các phân hệ | Shell/route, trang chi tiết, một số list/filter | Chưa nhất quán màn tổng quan, xem nhanh, số đếm toàn tập và export |
| Giá phụ tùng, QR, consumer phụ tùng báo giá | Không làm lại phần đã có | Producer báo giá còn thiếu là việc tích hợp cần theo dõi riêng, không khẳng định đã hoàn thành |

## 4. Phân công tổng quan

| Người | Trách nhiệm chính | Đầu ra |
|---|---|---|
| Minh | Asset/Equipment/Registration/Handover theo nguồn file, import/export thiết bị, bảo hành, lịch sử; Inventory/Maintenance phần mình sở hữu | Contract, migration, API, xử lý file, query, audit, test và bàn giao dữ liệu |
| Huy | Customer/Site/Location/Contact và scope; Request/Estimate/Notification | Lookup/contract dữ liệu liên quan, các list/filter/summary/export thuộc service mình |
| Khương | WO/Technician/Reports; liên kết lịch sử và vị trí công việc | Query/projection/summary/export đúng quyền và đúng ý nghĩa nghiệp vụ |
| Nguyên | Web grid/filter/import/export/quick view; áp dụng chuẩn các màn | UI hoạt động với API thật, giữ filter/lựa chọn đúng scope, kiểm tra trải nghiệm theo role |
| Cả nhóm | Contract, migration compatibility, UAT | Review owner/consumer, dữ liệu demo, evidence, hướng dẫn và PR theo quy trình |

## 5. P0 — Chốt dữ liệu và contract trước code lớn

| Check | ID | Việc phải làm | Chủ trì / phối hợp | Phụ thuộc | Tiêu chí nghiệm thu |
|---|---|---|---|---|---|
| [ ] | C01 | Lập danh mục trường: tên, kiểu, bắt buộc theo giai đoạn, nguồn, đơn vị, quyền xem/sửa/tìm/xuất | Minh + Huy; Nguyên review | Không | Phân biệt rõ ngày mua/giao/lắp/xác nhận/import; trường thiếu có nghĩa rõ, không điền giả |
| [ ] | C02 | ADR luồng import nguồn xác nhận ngoài hệ thống và các trạng thái hồ sơ/giao nhận/lắp/vận hành | Minh; Huy, Khương, Nguyên review | C01 | Không bắt xác nhận Portal lại; không đánh đồng nhập file với máy chạy tốt; không giả danh người xác nhận |
| [ ] | C03 | Thiết kế nơi nhận/nơi lắp, site chưa xác định và chi nhánh chịu trách nhiệm khi chưa biết site | Minh + Huy; Khương review | C01–C02 | Không site giả, không hồ sơ vô chủ, không mở rộng scope; địa điểm cũ giữ snapshot/lịch sử |
| [ ] | C04 | Contract list/filter/sort/summary/export dùng cùng ý nghĩa điều kiện | Minh + Nguyên; Huy/Khương phần nguồn mình | C01 | Có schema query, null, multi-select, khoảng ngày, stable sort, lỗi; export khớp filter và quyền |
| [ ] | C05 | Contract file CSV/XLSX và import create/update: mapping, version, preview, trạng thái/kết quả lệnh | Minh + Nguyên; Huy lookup | C01–C03 | Có template có version, trường cấm sửa, lỗi theo dòng, idempotency, no-op, retry và báo cáo kết quả |
| [ ] | C06 | Đối chiếu ERD/SQL/Prisma và ảnh hưởng tới consumer trước thay site/ngày/trạng thái | Minh; các owner consumer và owner shared review | C02–C05 | Danh sách migration/backfill/compatibility/rollback được review; không sửa schema trước contract |

Ưu tiên: C01 → C02/C03 → C04/C05 → C06. Không chờ hoàn thiện toàn bộ UI mới phát hiện thiếu trường hoặc sai state machine.

## 6. Task Minh — Equipment và nhập/cập nhật/xuất file

| Check | ID | Đầu việc | Phụ thuộc | Tiêu chí nghiệm thu |
|---|---|---|---|---|
| [ ] | M01 | Migration theo C06: ngày mua, nguồn dữ liệu cần thiết, nơi nhận/nơi lắp và trạng thái/quan hệ đã chốt | C06 | DB cũ giữ hồ sơ; ngày mua cũ là chưa ghi nhận, không sao chép ngày giao; tenant/customer không bị nới |
| [ ] | M02 | Ánh xạ dữ liệu file vào model/customer/site/location qua mã nghiệp vụ và API owner | C05, H01–H02 | Không bắt nhập UUID; model/địa chỉ mơ hồ được chỉ ra; không tự tạo master data hoặc JOIN DB khác |
| [ ] | M03 | Parser CSV và XLSX theo cùng schema; hỗ trợ nhiều model và per-row site/location | M02 | Cùng nội dung cho kết quả tương đương; giữ text serial/số 0; ngày không mơ hồ; cột ngoài schema được giải thích |
| [ ] | M04 | Preview toàn file: nhóm model, nhận dạng máy, dữ liệu thiếu/lỗi, dữ liệu trước/sau, version và trạng thái sẽ ghi | M03 | Không ghi DB trong preview; thay file/mapping/khách làm preview cũ hết hiệu lực; có báo cáo lỗi tải xuống |
| [ ] | M05 | Luồng tạo mới ghi nhận dữ liệu/kết quả giao nhận đã có ngoài hệ thống | M01–M04, C02 | Dữ liệu đầy đủ không bị bắt qua Portal lại; thiếu/lỗi không tự được ghi hoàn tất; ngày/bằng chứng theo từng máy |
| [ ] | M06 | Luồng cập nhật thiết bị bằng file, gồm bổ sung lắp đặt | M01–M04 | Khớp đúng máy/model/serial; giữ equipmentId; ô trống giữ nguyên; xóa có chủ đích; chặn sửa chủ sở hữu/nhận dạng trái luồng |
| [ ] | M07 | Xử lý lô lớn bằng tiến độ, khối nội bộ/checkpoint khi cần; tra cứu kết quả và retry an toàn | M04–M06 | Không chặn nghiệp vụ tại 50; không bắt người dùng chia lô thành lô nghiệp vụ 50 máy; có kết quả từng dòng/phần, không timeout rồi ghi trùng |
| [ ] | M08 | Kiểm tra uniqueness, idempotency, concurrency và quyền tại thời điểm ghi | M05–M07 | Cùng key/nội dung trả kết quả cũ; key mới không tạo trùng máy; file cũ không ghi đè âm thầm; preview không vượt quyền hiện tại |
| [ ] | M09 | Audit import/update và hiệu chỉnh dữ liệu đã ghi nhận | M05–M08 | Có người import, nguồn/lô, thời gian, trước/sau, lý do hiệu chỉnh; không sửa snapshot bàn giao quá khứ |
| [ ] | M10 | Nối bảo hành theo ngày giao thực tế và đúng policy/snapshot trong luồng mới | M01, M05, C02 | Không tính từ ngày mua/import/lắp; không tạo trùng warranty; sửa ngày đã ghi nhận phải đối soát tác động |
| [ ] | M11 | API list Equipment có đủ trường/cột và filter theo C04 | M01–M02, H01–H02 | Ngày mua/giao/lắp, model/loại, khách/site/location, lô, trạng thái, bảo hành và thiếu thông tin có thể query đúng scope |
| [ ] | M12 | Tìm nhanh + dán nhiều mã/serial; sort/phân trang ổn định, null rõ | M11 | Tìm toàn tập, chính xác/chứa không lẫn; biết số khớp và phần không tìm được theo chính sách scope; không chỉ tìm tên |
| [ ] | M13 | API summary Equipment cùng bộ lọc | M11–M12 | Tổng số/các nhóm trạng thái đúng toàn tập; lỗi nguồn không biến thành 0 |
| [ ] | M14 | API export toàn bộ danh sách thiết bị đã lọc sang XLSX và CSV | M11–M13, C04 | Xuất toàn bộ kết quả nhiều trang; cùng filter/sort/scope; số lượng/cột/nội dung đúng; không chỉ xuất dữ liệu browser đang giữ |
| [ ] | M15 | Export hàng được chọn và tùy chọn cột được phép; mẫu cập nhật có ID nghiệp vụ/version | M14, C05 | Kiểm quyền lại từng máy/cột; lựa chọn rõ; template cập nhật nhập lại được mà không mất serial/ngày |
| [ ] | M16 | Export lớn: tiến độ/trạng thái, thời điểm dữ liệu, tải file đúng người/phạm vi | M14–M15, M07 | Không treo giao diện; không link download công khai trái quyền; dữ liệu thay đổi khi xuất có quy tắc nhất quán được ghi rõ |
| [ ] | M17 | Regression nguồn liên quan: QR, dossier/history, warranty, Maintenance, Request/WO references khi chưa có hoặc đổi site | M01, M05–M11; Huy/Khương | Scope không bị mất; QR không trở thành bằng chứng giao/lắp; hồ sơ/địa điểm lịch sử vẫn đúng |
| [ ] | M18 | Dataset và tài liệu tích hợp cho các quy mô, nhiều model/site, hai khách và hai chi nhánh | M03–M17 | Chạy không reset dữ liệu người demo; có template, API/error mẫu, bằng chứng, bước thử và giới hạn thật |

### Chi tiết bắt buộc của M14–M16

- Định dạng: `.xlsx` và `.csv` UTF-8; bảo toàn serial/mã, ký tự tiếng Việt và ý nghĩa ngày/null.
- Phạm vi: mặc định người dùng chọn rõ “Toàn bộ kết quả đã lọc”; có “Các dòng đã chọn”. Xuất trang hiện tại chỉ là tùy chọn bổ sung, không thay thế toàn tập.
- Cột: theo chế độ xem hoặc người dùng chọn; “Tất cả cột” chỉ gồm cột được phép. Cột ẩn trên Web không phải cơ chế bảo vệ dữ liệu.
- Filter vẫn có tác dụng khi cột tương ứng đang ẩn. File ghi rõ phạm vi/điều kiện/thời điểm kết quả bằng metadata phù hợp từng định dạng hoặc báo cáo đi kèm.
- Dùng chung logic lọc với list/summary. Không viết một bộ query export có nghĩa khác, không tự bỏ filter khó xử lý.
- Sắp xếp ổn định khi nhiều máy cùng giá trị. Xác định thời điểm/tập bản ghi của export và cách xử lý thay đổi trong lúc xuất; không hứa snapshot nguyên tử xuyên mọi service.
- Kiểm quyền khi tạo tác vụ và khi tải kết quả. Tài khoản đổi scope/tenant hoặc file hết hạn phải có kết quả phù hợp, không chỉ dựa vào nút UI.
- Không thực thi công thức/macro; bảo vệ CSV/XLSX trước formula injection theo kiểu cột và giữ khả năng round-trip của template chính thức.

## 7. Task Huy — Organization, quyền và Request/Estimate

| Check | ID | Đầu việc | Phụ thuộc | Tiêu chí nghiệm thu |
|---|---|---|---|---|
| [ ] | H01 | Lookup Customer/Site/Location/Contact theo mã trong scope, hỗ trợ nhiều dòng; phối hợp model lookup do Minh sở hữu | C01, C03, C05 | Không trả dữ liệu tenant/khách khác; phân giải rõ mã trùng tên; giảm gọi API từng hàng |
| [ ] | H02 | Site/Location chi tiết và dữ liệu phục vụ filter: địa chỉ, đường dẫn vị trí, chi nhánh liên quan | C03 | Máy ở nhiều cơ sở vẫn thuộc đúng khách; địa chỉ nhận không bị ép thành nơi lắp; không tạo vị trí giả |
| [ ] | H03 | Rà soát RBAC/customer/branch scope và actor nguồn xác nhận ngoài hệ thống | C02–C03; Minh phối hợp | Người import không bị ghi giả thành khách ký Portal; không mở quyền từ ô Excel; giữ hệ role hiện hành |
| [ ] | H04 | Contract/projection list Request/Estimate đủ tên khách/máy, vị trí, tuổi hồ sơ và trạng thái chờ; filter/summary/export theo service | C04; Khương/Minh nguồn liên quan | Nguyên dựng được màn quản lý mà không mở từng hồ sơ; thống kê không chỉ trong trang; không lộ nội dung nội bộ cho khách |
| [ ] | H05 | List Customer và dữ liệu 360 tối thiểu cho grid/quick view theo quyền | H01–H02, C04 | Nhận biết đúng khách/cơ sở/liên hệ và nguồn số liệu; lỗi nguồn thể hiện rõ |
| [ ] | H06 | Nối producer dữ liệu liên quan nếu dùng làm cột/filter: ví dụ snapshot phụ tùng báo giá đã duyệt còn thiếu | Contract hiện hành và review Minh/Khương | Có producer/outbox thực và test với consumer; không dùng dữ liệu giả để đánh dấu hoàn tất |
| [ ] | H07 | Dataset/tài liệu và kiểm tra scope xuyên list/filter/export thuộc phạm vi mình | H01–H06 | Khách A không tìm/xuất máy hay Request của B bằng query/ID/file; quyền download cũng được kiểm tra |

H01 không chuyển quyền sở hữu Model sang Organization; Minh vẫn sở hữu Model. Huy cung cấp lookup dữ liệu Organization/Identity, Minh cung cấp model lookup và hai bên thống nhất contract gọi.

## 8. Task Khương — WO, KTV, báo cáo và lịch sử

| Check | ID | Đầu việc | Phụ thuộc | Tiêu chí nghiệm thu |
|---|---|---|---|---|
| [ ] | K01 | Rà soát WO/reference/scope với máy chưa biết nơi lắp hoặc thay site về sau | C03, M17; Huy | Không tạo công việc đến địa chỉ giả; địa điểm WO cũ không bị thay bằng vị trí máy hiện tại |
| [ ] | K02 | WO list/filter/summary đủ khách/máy, nơi công việc, KTV, lịch, ưu tiên, trạng thái/lý do chặn và kết quả | C04; H04 | Lọc toàn tập, đúng branch/customer theo quyền; đủ dữ liệu cho grid/xem nhanh |
| [ ] | K03 | KTV list và lịch/tải việc trong khoảng đang xem | C04 | Không diễn giải AVAILABLE là trống mọi lịch; trả tên/mã/kỹ năng/branch đúng quyền |
| [ ] | K04 | Projection lịch sử sửa chữa, phụ tùng liên quan và lần gần nhất để Asset tổng hợp/tìm theo khả năng đã chốt | M11, C04; Minh | Dữ liệu có nguồn, phân trang/nhóm đúng; không gọi nhiều API cho từng dòng hoặc truy vấn DB Asset/Inventory trực tiếp |
| [ ] | K05 | Export/report WO theo điều kiện và drill-down đúng danh sách nguồn | K02–K04 | File/summary/drill-down cùng ý nghĩa filter; không gọi số WO là chất lượng/hài lòng nếu không có dữ liệu đo |
| [ ] | K06 | Regression luồng WO/reservation khi tham chiếu Equipment/Location thay đổi | K01–K05; Minh | Không phá ISSUE/reservation/report/confirm-use hiện hành, không yêu cầu sửa mobile cho nhánh Web này |

## 9. Task Nguyên — Web dùng được trên danh sách

| Check | ID | Đầu việc | Phụ thuộc | Tiêu chí nghiệm thu |
|---|---|---|---|---|
| [ ] | N01 | Thiết kế grid/toolbar/filter/summary/quick view/thao tác và trạng thái tải-lỗi-trống | C01, C04 | Người dùng nhận diện và xử lý thông tin phổ biến ngay trong danh sách, không mở từng máy; có thiết kế theo role |
| [ ] | N02 | Grid Thiết bị: cột lõi, cột tùy chọn/đổi thứ tự, cố định nhận dạng, cuộn ngang, dữ liệu dài xem đủ | N01, M11 | Có ngày mua/giao/lắp, khách/model/địa chỉ/vị trí, trạng thái và bảo hành theo quyền; không nhồi mọi trường vào cột mặc định |
| [ ] | N03 | Filter Thiết bị: đa lựa chọn, khoảng ngày, vị trí phân cấp, chưa có dữ liệu, mã/serial nhiều dòng | N01, M11–M12, H01–H02 | Điều kiện hiển thị rõ, xóa được, giữ theo URL/chế độ xem; lọc cột ẩn vẫn đúng; không lọc 20 dòng ở client |
| [ ] | N04 | Summary và xem nhanh, quay lại giữ vị trí/filter; đổi session/scope bỏ dữ liệu cũ | N02–N03, M13 | Tổng đúng toàn tập; lỗi khác 0; không lóe dữ liệu người trước hoặc mất công việc khi mở chi tiết |
| [ ] | N05 | Import wizard create/update CSV/XLSX theo schema mới, mapping cột và preview trước/sau | C05, M03–M09 | Nhiều model/site; phân biệt tạo/cập nhật; sửa lỗi dễ; không bắt Portal lại; có progress/tra cứu kết quả và retry đúng |
| [ ] | N06 | Nơi/vị trí lắp chi tiết và form sửa từng máy | C03, M06, H02 | Bổ sung sau rõ trường còn thiếu; vị trí phù hợp thực tế; sửa vài máy không bắt export/import cả lô |
| [ ] | N07 | **Xuất Excel/CSV từ bộ lọc đang áp dụng**: định dạng, phạm vi, chọn cột và tiến độ | N03–N04, M14–M16 | Đúng toàn bộ kết quả hoặc tập hàng chọn, không chỉ trang hiện tại; phản hồi lỗi rõ; không nút thành công giả |
| [ ] | N08 | Quick view và bộ lọc Request/Estimate/Customer theo cùng tiêu chí | N01, H04–H05 | Đủ khách/máy/nơi phục vụ/tuổi/trách nhiệm và các điều kiện thực sự được API hỗ trợ |
| [ ] | N09 | Grid/xem nhanh/filter WO/KTV/Reports và liên kết hồ sơ nguồn | N01, K02–K05 | Giữ ngữ nghĩa vị trí công việc, kết quả sửa, lịch và phạm vi quyền; export/drill-down khớp |
| [ ] | N10 | Áp dụng chuẩn cho Maintenance/Inventory/PartRequest/QR inquiry/Notification | N01, S01–S03 và API owner tương ứng | Cột/filter đủ công việc; không đổi nghĩa kho/phụ tùng hoặc lẫn plan/task; không mở dữ liệu ngoài quyền |
| [ ] | N11 | Vai trò và khả năng truy cập: Customer, SM, kho, KTV, TA; bàn phím/focus/tên cột | N02–N10 | Preset/cột/thao tác đúng role; không chỉ dựa màu; trường nhạy cảm không xuất hiện qua menu cột |
| [ ] | N12 | Template, hướng dẫn, trang demo, bằng chứng browser và báo cáo bàn giao | N02–N11; mọi owner | Link hồ sơ thật, dataset đúng role; phân biệt UI demo/API đã nối; chưa có nguồn không gọi là hoàn tất |

Các thư viện grid/XLSX nếu cần thêm phải chọn sau khi kiểm tra repo, tách thay đổi dependency và review theo CONTRIBUTING. Không đổi framework Web hoặc đưa chi tiết triển khai vào flow sản phẩm.

## 10. Task nối các phân hệ còn lại

| Check | ID | Nội dung | Chủ trì / phối hợp | Tiêu chí nghiệm thu |
|---|---|---|---|---|
| [ ] | S01 | Maintenance list/filter/summary theo máy/khách/nơi lắp/kỳ đến hạn/trạng thái và WO liên kết | Minh + Nguyên; Khương/Huy dữ liệu liên quan | Giữ Plan/Task riêng; xác định máy chưa lắp tác động thế nào mà không tự đổi lịch gốc ADR; dữ liệu lỗi không thành không có |
| [ ] | S02 | Inventory/PartRequest list/filter/summary và xuất dữ liệu đúng quyền | Minh + Nguyên; Khương reference | Tồn/phiếu/cấp-trả-dùng/chưa đối soát rõ; giá vốn chỉ đúng quyền; giữ reservation; filter có contract thật |
| [ ] | S03 | QR inquiry và Notification: tìm/lọc, trạng thái xử lý và liên kết nguồn | Minh — inquiry, Huy — notification; Nguyên UI | Không coi báo lỗi QR là SR/WO; link không cấp quyền; tên/máy/thời gian/trách nhiệm đủ xử lý |

## 11. Thứ tự làm và các mốc bàn giao

| Mốc | Task chính | Đầu ra được review trước khi sang bước sau |
|---|---|---|
| A — Chuẩn dữ liệu | C01–C06 | ADR, schema file, API/filter/export, migration plan và ma trận quyền |
| B — Thiết bị mẫu | M01–M04, M11–M13; H01–H03; N01–N04 | Grid và truy vấn dữ liệu thật, đủ nhận dạng/ngày/địa chỉ; không demo filter giả |
| C — Nhập và cập nhật | M05–M10, M17–M18; N05–N06 | File mới nhiều model/site, nguồn xác nhận ngoài hệ thống, cập nhật lắp và audit |
| D — Xuất theo filter | M14–M16; N07 | XLSX/CSV đúng kết quả lọc, mọi trang, cột/quyền và dữ liệu lớn |
| E — Các màn còn lại | H04–H07, K01–K06, S01–S03, N08–N11 | Áp dụng cùng tiêu chí, giữ ý nghĩa nghiệp vụ từng service |
| F — Nghiệm thu | Q01–Q08, N12 | Bằng chứng kiểm tra, hướng dẫn, task còn thiếu và PR được review |

Phụ thuộc trong bảng task là điều kiện làm phần tích hợp; thiết kế UI/contract có thể làm song song. Chưa gán ngày hứa hẹn khi chưa có người nhận và ước lượng công việc. Nguyên không phải chờ toàn bộ backend của mọi service mới làm màn mẫu.

## 12. Nghiệm thu chung

| Check | ID | Kịch bản | Kết quả bắt buộc |
|---|---|---|---|
| [ ] | Q01 | Lô 1, 7, 50, 51, 500 và 2.000 máy ở môi trường kiểm thử phù hợp | Không có chặn nghiệp vụ 50; đo thời gian/bộ nhớ/dung lượng thực, có progress và kết quả, không chia thành các lô nghiệp vụ giả |
| [ ] | Q02 | Nhiều model/site/location, serial có số 0 và tiếng Việt, CSV/XLSX cùng nội dung | Dữ liệu tương đương; không gán nhầm model; không tạo site giả hoặc sai khách |
| [ ] | Q03 | File nguồn đã xác nhận; giao nhiều đợt/ngày; lắp bổ sung sau | Ghi đúng từng máy, không yêu cầu Portal lại cho đường import mới; warranty từ ngày giao; vị trí bổ sung không tạo máy mới |
| [ ] | Q04 | Cập nhật file cũ, ô trống, sửa đồng thời, mất response và gửi lại | Không xóa/ghi đè/tạo trùng ngoài ý muốn; version/no-op/retry và audit đúng |
| [ ] | Q05 | Lọc khách A/B + model + ngày mua + nơi lắp + trạng thái; dữ liệu nằm nhiều trang | List/summary đúng toàn tập, filter đang áp dụng rõ; không lấy ngày giao thay ngày mua |
| [ ] | Q06 | **Xuất XLSX và CSV của kết quả Q05, rồi xuất tập hàng được chọn** | Đủ mọi trang, đúng thứ tự/cột/số lượng; cột ẩn vẫn lọc được; serial/ngày/null đúng; không chứa dữ liệu ngoài quyền |
| [ ] | Q07 | Tenant/khách/chi nhánh khác, đổi scope trước khi export/download; thử cột giá vốn/ghi chú nội bộ | Backend chặn đúng cả list/filter/summary/export/download/import; không chỉ ẩn UI |
| [ ] | Q08 | Mở các màn qua browser thật với đúng role, dịch vụ phụ lỗi, tải file và quay lại danh sách | Xem/lọc/thao tác được; lỗi khác dữ liệu trống; giữ filter; không kết luận chỉ từ test harness hoặc HTTP 200 của Vite |

Số 2.000 ở Q01 là dữ liệu kiểm thử đề xuất để chứng minh đã bỏ ràng buộc 50 và đo tải, không phải giới hạn nghiệp vụ mới. Chỉ báo đạt sau khi thực chạy trên môi trường ghi rõ cấu hình/kết quả.

### Điều kiện hoàn thành từng task

- Có code và API/event/migration/docs tương ứng khi thay đổi contract/dữ liệu; không đánh dấu chỉ vì đã có file kế hoạch hoặc ảnh UI.
- Chạy kiểm tra thực tế phù hợp: nghiệp vụ/quyền/DB/query/export/import; lint/typecheck/build cho phần bị ảnh hưởng.
- Contract owner/consumer được review, PR theo quy trình; chưa có ngoại lệ CI/review mới thì không suy từ các lần user đã cho phép merge trước.
- Handoff có file thay đổi, endpoint, template, lỗi/retry, dữ liệu demo, bằng chứng và phần chưa xong/đầu mối phụ thuộc.
- Không sửa mobile, reset dữ liệu local hoặc commit/merge trong khi người dùng mới yêu cầu lập file giao task.

## 13. Tài liệu đầu vào và thứ tự ưu tiên

1. Các quyết định mới nhất của người dùng tóm tắt ở mục 2 tài liệu này.
2. [So sánh yêu cầu với code hiện tại](../reports/2026-11-19-user-flow-vs-current-equipment.md).
3. [Chuẩn màn tổng quan và tìm kiếm các phân hệ](2026-11-19-web-management-overview-and-search.md).
4. [Rà soát nghiệp vụ khắt khe](../reports/2026-11-19-equipment-flow-critical-review.md), áp dụng theo phần điều chỉnh mới nhất; không xây lại xác nhận Portal cho import và không giữ giới hạn 50 làm yêu cầu.
5. [Bản đề xuất grid/import ban đầu](2026-11-19-equipment-batch-grid-proposal.md), tham khảo phần còn phù hợp.
6. [Bàn giao code UX Minh đã làm](../reports/2026-11-19-minh-ux-handoff.md), để tái sử dụng nền tảng, không nhầm thành mọi task mới đã hoàn thành.

## 14. Bổ sung yêu cầu cụ thể của Service Manager và khách hàng

### 14.1 Kiểm tra độ bao phủ của bản giao task trước

| Yêu cầu người dùng vừa nêu | Bản trước đã có đến đâu? | Bổ sung rõ để tránh bỏ sót |
|---|---|---|
| Service Manager bỏ tạo/gửi Service Request | Chưa có task riêng; code hiện còn role route và permission create | C07, H08, N13, Q09 |
| Sửa bố cục Đội ngũ kỹ thuật | K03/N09 có dữ liệu/lịch nhưng chưa giao thiết kế bố cục cụ thể | N14, Q10; tái sử dụng K03 |
| Danh sách thiết bị thiếu thông tin/bộ lọc | Đã có M11–M15, N02–N04, N07 | Giữ các task này; thêm N17/Q13 để kiểm tra cách dùng thực tế và tính nhất quán |
| Đổi Lịch sử thiết bị của Service Manager thành Lịch sử sự kiện | Chưa có task rõ | M19, N15, Q11 |
| Tham khảo và bổ sung bộ lọc từ trang lịch sử cho Thiết bị/Kho và các list | Có chuẩn filter chung nhưng chưa nêu nguồn UI và phạm vi tái sử dụng | N17, Q13; nối N03/N10/S02 |
| Báo cáo trong Tiện ích phải có cho khách hàng | Có report/drill-down chung, chưa chỉ định menu/route/API cho CUSTOMER | C07, H09, K07, N16, Q12 |

**Kết luận kiểm tra:** bản trước chỉ bao gồm một phần. Không diễn giải task tổng quát về report/KTV thành các yêu cầu cụ thể này đã được giao hoặc hoàn thành.

### 14.2 Task bổ sung

| Check | ID | Đầu việc | Chủ trì / phối hợp | Phụ thuộc | Tiêu chí nghiệm thu |
|---|---|---|---|---|---|
| [ ] | C07 | Cập nhật ma trận hành động/cột/menu/route theo role: SM không tạo/gửi SR; khách có báo cáo phù hợp | Huy + Nguyên; Minh/Khương consumer | C01, C04 | Mô tả rõ quyền bị bỏ và quyền giữ; báo cáo khách không dùng quyền quản trị hoặc tự mở dữ liệu toàn tenant |
| [ ] | H08 | Bỏ quyền tạo Service Request của role SM ở catalog/backend; kế hoạch đồng bộ DB role/permission và phiên đang đăng nhập | Huy; owner shared review, Nguyên UI | C07 | Gọi API tạo bằng SM bị từ chối; không chỉ ẩn nút. SM vẫn đọc/tiếp nhận/thẩm định/xử lý/phân công WO theo quyền hiện hành. Không bỏ quyền gửi SR của khách. Seed/test hiện dùng SM tạo SR phải đổi đúng actor khách, không sửa giả dữ liệu để vượt quyền |
| [ ] | H09 | Projection/summary Request/Estimate phục vụ báo cáo khách, filter theo thời gian/máy/cơ sở và dữ liệu được công bố | Huy; Minh/Khương/Nguyên | C07, H04, C04 | Scope khách lấy từ principal; không tin customerId tùy ý; không trả ghi chú nội bộ, giá vốn hoặc số liệu khách khác. Kết quả/thời điểm có định nghĩa rõ |
| [ ] | M19 | Rà soát nguồn lịch sử và contract lọc Lịch sử sự kiện: loại sự kiện, ngày, máy/model/serial, khách/site/location, nguồn hồ sơ và người thực hiện theo quyền | Minh; Huy/Khương nguồn liên quan | C01, C04, M11, K04 | Phân biệt sự kiện đăng ký/bàn giao/cập nhật/chuyển vị trí/chính sách/QR với lịch sử sửa chữa/bảo trì. Chỉ công bố event thật trong nguồn, không gọi Asset history là toàn bộ audit nền tảng |
| [ ] | K07 | API báo cáo WO/kết quả dịch vụ dành cho khách và nguồn drill-down/export, phối hợp số liệu thiết bị/Request | Khương; Huy/Minh/Nguyên | C07, H09, K02, K05 | Khách xem số liệu của mình theo thời gian/máy/cơ sở: ca mở/đã xử lý/kết quả được công bố. Không lộ KPI nội bộ của KTV, ghi chú hoặc dữ liệu ngoài khách; không dùng report tenant chung rồi chỉ lọc trên browser |
| [ ] | N13 | Bỏ toàn bộ lối tạo/gửi SR của Service Manager: menu, CTA ở dashboard/list/dossier/QR, shortcut, route mới và alias cũ | Nguyên; Huy | C07, H08 | SM không thấy CTA tạo SR và không mở được form qua URL trực tiếp/alias. Giữ nút tiếp nhận/xử lý yêu cầu và tạo WO đúng ngữ nghĩa. Customer vẫn tạo SR bình thường |
| [ ] | N14 | Thiết kế lại bố cục tab Đội ngũ kỹ thuật cho SM | Nguyên; Khương | N01, K03 | Có tiêu đề/phạm vi, tổng quan đúng dữ liệu, thanh tìm/lọc theo tên/mã/kỹ năng/chi nhánh/trạng thái/lịch, bảng đội ngũ và quick view/lịch bên cạnh. Không trải thành các textbox rời rạc; không phải mở từng KTV để biết thông tin chính/tải việc. Chỉ số bận/rảnh ghi rõ khoảng lịch và nguồn |
| [ ] | N15 | Đổi nhãn menu/tiêu đề/breadcrumb SM thành “Lịch sử sự kiện”, mô tả phạm vi; phân biệt với lịch sử dịch vụ trong từng máy | Nguyên; Minh | M19, N01 | Đổi tên đúng ngữ nghĩa, giữ đường dẫn cũ hoặc redirect tương thích nếu thay route; không làm mất filter/bookmark. Hiển thị thời gian, loại, máy, mô tả thay đổi, nguồn và actor theo dữ liệu/quyền. Không tự đổi quyền/history khách khi mới đổi nhãn của SM |
| [ ] | N16 | Thêm mục Báo cáo cho khách trong nhóm Tiện ích, route Portal, màn summary/danh sách/drill-down và export được phép | Nguyên; Khương/Huy/Minh | C07, H09, K07, M13–M16 | CUSTOMER_ADMIN/CUSTOMER_USER có trải nghiệm đọc theo scope/quyền đã chốt, chọn khoảng ngày/máy/cơ sở, nhìn rõ dữ liệu của doanh nghiệp mình. Không hiện dashboard KPI quản trị nội bộ. File xuất khớp số liệu/filter và được backend bảo vệ |
| [ ] | N17 | Rà soát bộ lọc trang lịch sử hiện có làm mẫu, chuẩn hóa và mở rộng phù hợp từng tab Thiết bị/Phụ tùng/Tồn kho/WO/Request | Nguyên; owner từng API | N03, N10, M19, C04 | Tái sử dụng cách chọn khoảng ngày/điều kiện/chips/reset/áp dụng/URL; không sao chép filter loại sự kiện sang trang không có khái niệm đó. Thiết bị có ngày mua/giao/lắp/vị trí; kho có SKU/kho/branch/trạng thái/tồn thấp; ngày giao dịch dùng cho sổ kho. API thật hỗ trợ và export dùng đúng bộ lọc |
| [ ] | Q09 | Kiểm tra SM mất chức năng tạo SR qua mọi đường truy cập và API, trong khi khách gửi được | Cả nhóm; Huy/Nguyên chính | H08, N13 | CTA/route/alias/API/phiên cũ xử lý đúng; seed/demo không còn phụ thuộc SM tạo SR; SM vẫn làm được công việc xử lý yêu cầu/WO |
| [ ] | Q10 | UAT bố cục Đội ngũ kỹ thuật bằng dữ liệu thật, nhiều KTV và lịch khác nhau | Cả nhóm; Nguyên/Khương chính | N14 | Tìm đúng người, xem tải/lịch và mở quick view được; đủ dữ liệu ở list; lỗi nguồn không biến thành rảnh; bàn phím và bố cục Web dùng được |
| [ ] | Q11 | Kiểm tra Lịch sử sự kiện: nhãn/phạm vi, filter, nguồn, quyền và điều hướng | Cả nhóm; Minh/Nguyên chính | M19, N15 | Không lẫn lịch sử sự kiện với chỉ lịch sử bảo trì/sửa chữa; kết quả lọc đúng nhiều trang; không lộ actor/nội dung ngoài quyền; link nguồn đúng hồ sơ |
| [ ] | Q12 | UAT Báo cáo bằng hai khách/role khách, kiểm tra drill-down và XLSX/CSV | Cả nhóm; Khương/Huy/Nguyên chính | H09, K07, N16 | Khách A không xem/xuất báo cáo B hoặc tenant KPI bằng sửa URL/query; tổng khớp danh sách cùng điều kiện, thiếu nguồn hiển thị đúng, menu/route Portal dùng được |
| [ ] | Q13 | UAT thông tin và bộ lọc Thiết bị/Kho theo mẫu lịch sử, trên nhiều trang và khi export | Cả nhóm; Minh/Nguyên chính | N17, N02–N07, S02 | Người dùng tìm được máy theo ngày mua/vị trí/model/khách và vật tư theo kho/SKU/tồn mà không mở từng hồ sơ; export đúng kết quả đã lọc; không có control hoạt động giả |

### 14.3 Bố cục và phạm vi cần giữ đúng

- “Bỏ gửi yêu cầu dịch vụ” của SM là bỏ tạo/gửi **Service Request mới**, không bỏ tiếp nhận, thẩm định bảo hành, trả lời/bổ sung hoặc tạo/điều phối Work Order đang thuộc trách nhiệm SM.
- “Lịch sử sự kiện” cần mô tả nguồn/phạm vi thật. Lịch sử chi tiết của một thiết bị vẫn có trong hồ sơ; không đổi nhãn rồi tuyên bố đã có audit mọi service.
- Bộ lọc lịch sử là mẫu tương tác để tham khảo. Mỗi tab phải dùng trường nghiệp vụ của nó và API hỗ trợ thật; không thêm ô ngày mua nếu backend lại lọc createdAt.
- Báo cáo khách là báo cáo thiết bị và chất lượng/kết quả phục vụ có dữ liệu thực, không tự khẳng định mức hài lòng hoặc mở KPI nhân sự nội bộ. Các số đo chưa có nguồn không hiển thị như đã được tính.
- C07 là đầu vào sớm; N13/N14/N15/N16/N17 là các đầu việc cụ thể trong giai đoạn áp dụng chuẩn màn quản lý; Q09–Q13 bổ sung cổng nghiệm thu cuối. Không cần chờ xong mọi phân hệ mới sửa đường tạo SR của SM.
