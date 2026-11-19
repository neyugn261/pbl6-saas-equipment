# Yêu cầu màn tổng quan quản lý và tra cứu xuyên các phân hệ Web

Ngày 19/11/2026. Nguồn: yêu cầu mới nhất của người dùng về việc xem/lọc đủ thông tin ngay khi mở một mục. Đây là tiêu chí thiết kế và triển khai tiếp theo, không phải danh sách chức năng đã hoàn thành.

Liên quan: [luồng import người dùng chốt và so sánh code](../reports/2026-11-19-user-flow-vs-current-equipment.md), [thiết kế thiết bị/grid ban đầu](2026-11-19-equipment-batch-grid-proposal.md).

## 1. Yêu cầu trung tâm

Khi mở một mục, người dùng phải nhìn được tập hồ sơ đang quản lý, trạng thái, thông tin phân biệt từng hồ sơ, trách nhiệm và việc tiếp theo; tìm/lọc/xuất/thao tác với tập hồ sơ phù hợp mà không mở lần lượt mọi trang chi tiết.

Trang chi tiết dành cho lịch sử đầy đủ, tệp, bằng chứng hoặc nghiệp vụ sâu. Những thông tin thường dùng để nhận diện, so sánh, tìm kiếm và ra quyết định phải có ngay trong danh sách theo quyền. Có thể mở panel xem nhanh bên cạnh mà giữ bộ lọc/vị trí cuộn/lựa chọn.

Không áp một grid khổng lồ giống hệt cho mọi role. Mỗi mục có dữ liệu và thao tác theo công việc; bảng là hình thức chính cho tập hồ sơ, lịch/phân công có thể dùng lịch hoặc board bổ sung. Khách và nhân viên xem cùng sự việc nhưng khác cột và quyền.

## 2. Cấu trúc một màn quản lý

1. Tên mục và phạm vi đang xem: tenant/chi nhánh/khách/cơ sở theo quyền thực tế.
2. Tổng quan đúng bộ lọc: số hồ sơ, trạng thái quan trọng, việc thiếu thông tin/đang chờ. Không chỉ đếm các dòng trang hiện tại.
3. Tìm nhanh: những trường nhận dạng đặc trưng của phân hệ; cho biết tìm theo trường nào.
4. Bộ lọc theo trường, hỗ trợ kết hợp; có điều kiện đang áp dụng, xóa từng điều kiện/xóa tất cả và “chưa có dữ liệu”.
5. Danh sách/grid: cột lõi, tùy chọn cột, sắp xếp, phân trang, trạng thái/lý do bị chặn rõ ràng.
6. Chọn hàng/thao tác: nhận biết chọn trang này hay tập kết quả; thao tác hàng loạt có phạm vi rõ và theo quyền.
7. Xem nhanh và liên kết nguồn: không mất bộ lọc khi mở/đóng panel hoặc quay lại từ hồ sơ chi tiết.
8. Import/export theo khả năng API thật; không có nút báo thành công khi dữ liệu chưa được ghi.

## 3. Danh sách thiết bị cần đáp ứng trước

### Cột có cấu trúc

| Nhóm | Các trường cần xem/lọc |
|---|---|
| Nhận dạng | Mã thiết bị, serial, tên, hãng, model, loại/nhóm mặt hàng |
| Khách hàng | Mã/tên khách, thông tin liên hệ theo quyền, địa chỉ khách |
| Ngày nghiệp vụ | Ngày mua, ngày bàn giao thực tế, ngày lắp thực tế, ngày dự kiến, ngày cập nhật; các ngày độc lập |
| Giao nhận | Mã lô, đợt/nguồn biên bản, nơi nhận, kết quả giao nhận theo dữ liệu nguồn |
| Nơi lắp | Cơ sở, địa chỉ, khu/tòa/tầng/phòng/vị trí phù hợp; nhãn dự kiến/thực tế/chưa hoàn thiện |
| Trạng thái | Hồ sơ, giao nhận, lắp, vận hành được thể hiện riêng khi cần |
| Chính sách | Bảo hành từ/đến ngày nào, trạng thái/phiên bản, bảo trì và kỳ tiếp theo nếu có dữ liệu thật |
| Dịch vụ | Yêu cầu/WO đang mở, lần sửa/bảo trì gần nhất, linh kiện đã thay theo nguồn lịch sử |
| Trách nhiệm | Chi nhánh phục vụ, người/bộ phận phụ trách theo dữ liệu hiện có, đang chờ ai |
| Đặc thù | Thông số của model/máy có chọn cột phù hợp; không biến mọi thông số của mọi model thành hàng trăm cột mặc định |

**Ngày mua hiện chưa có trường tương ứng trong Asset schema/DTO đã rà soát.** Cần bổ sung thuộc tính và nguồn dữ liệu (ví dụ từ file), không lấy createdAt/handoverDate thay thế. Ngày mua là thông tin thiết bị; không kéo theo xây dựng đơn hàng, hóa đơn hay thanh toán. Máy cũ chưa có ngày mua phải có “chưa ghi nhận”, không điền ngày giả để lọc được.

Mốc bảo hành vẫn từ ngày bàn giao thực tế theo quyết định người dùng; bổ sung ngày mua không tự thay mốc bảo hành.

### Ví dụ tìm kiếm phải hỗ trợ

- Máy khách A/B mua trong một khoảng ngày, thuộc model X, đang lắp ở cơ sở Đà Nẵng.
- Máy đã bàn giao nhưng chưa có vị trí lắp chi tiết; phân biệt chưa biết địa điểm với đã biết cơ sở nhưng chưa có phòng/vị trí.
- Dán danh sách serial để đối chiếu các máy trong file; kết quả phải chỉ ra cả serial không tìm thấy/không được phép trả về theo chính sách an toàn.
- Máy còn bảo hành, sắp hết hạn, chưa cấu hình hoặc không áp dụng: các trường hợp riêng.
- Máy từng thay một loại phụ tùng hoặc có sự cố đang xử lý: lọc từ lịch sử/nguồn dịch vụ khi contract hỗ trợ, không chỉ tìm chuỗi trong tên máy.

## 4. Áp dụng tương tự cho các phân hệ

Đây là danh sách cột/filter yêu cầu, không khẳng định API hiện có đã hỗ trợ tất cả.

| Mục | Phải thấy ngay trong danh sách | Tìm/lọc quan trọng | Xem nhanh/thao tác theo quyền |
|---|---|---|---|
| Khách hàng | Mã/tên, cơ sở, liên hệ, chi nhánh phục vụ, lượng thiết bị và ca đang mở từ nguồn thật | Mã/tên, cơ sở, trạng thái, chi nhánh, thông tin còn thiếu | Liên hệ, thiết bị, công việc đang chờ, sửa thông tin được phép |
| Thiết bị | Các nhóm ở mục 3, đủ phân biệt máy cùng tên/model | Khách/model/loại/serial/ngày mua/ngày giao/vị trí/trạng thái/bảo hành/lô | Xem nhanh thông tin và nguồn lịch sử; cập nhật một/nhiều máy theo quy trình |
| Hồ sơ đăng ký/import | Mã lô/lần nhập, khách, số dòng, đã ghi/lỗi/không đổi, người/thời gian nhập | Khách, mã lô, ngày nhập, trạng thái, dòng còn lỗi | Xem lỗi trước/sau, đối soát kết quả, tải báo cáo; không gửi lại mù |
| Giao nhận | Khách, đợt/biên bản, tập máy, ngày/nơi nhận, kết quả theo nguồn file | Khách, ngày, lô/đợt, serial, kết quả/ngoại lệ | Xem tập máy và dữ liệu nguồn; luồng import mới không bắt xác nhận Portal lại |
| Service Request | Mã, tiêu đề, khách, máy/serial, nơi cần phục vụ, mức ưu tiên, tuổi hồ sơ, trạng thái, đang chờ ai | Khách/máy/vị trí, ngày, trạng thái, ưu tiên, chờ khách/đội kỹ thuật, kết quả bảo hành nếu có | Xem mô tả/bảo hành/trao đổi gần nhất và bước xử lý được phép |
| Work Order | Mã, yêu cầu nguồn, khách/máy, địa điểm công việc, KTV, lịch, tiến độ, lý do chặn, kết quả | KTV, chi nhánh, khách/máy/vị trí, lịch, trạng thái, ưu tiên, thiếu vật tư | Xem phân công, vật tư, checklist/báo cáo; không dùng vị trí máy hiện tại thay địa điểm WO cũ |
| Kỹ thuật viên | Tên/mã, chi nhánh, kỹ năng, trạng thái, công việc/lịch trong khoảng đang xem | Kỹ năng, chi nhánh, khoảng lịch, trạng thái | Xem lịch/tải việc thật và phân công theo quyền; AVAILABLE không chứng minh trống mọi khung giờ |
| Bảo trì | Máy/khách/vị trí, plan/task, chu kỳ, kỳ đến, trạng thái, WO liên kết, điều kiện bị chặn | Khoảng đến hạn, quá hạn, máy/model/khách/vị trí, trạng thái | Xem lịch sử/kỳ tiếp theo, xử lý đúng plan/task; không gộp hai entity làm một |
| Phụ tùng/tồn | SKU/tên/đơn vị, kho/chi nhánh, tồn và trạng thái tồn, ngưỡng, giá theo quyền | SKU, kho, chi nhánh, tồn thấp, active/inactive, giá nếu có API | Xem sổ giao dịch/cấp-trả-dùng; phân biệt giá vốn với niêm yết |
| Phiếu phụ tùng | Mã phiếu, WO/máy, KTV, kho, yêu cầu/đã cấp/còn thiếu/đã trả, người chịu trách nhiệm | WO/KTV/kho/ngày/trạng thái/phụ tùng | Xem dòng phiếu, cấp/trả theo reservation và quyền; không biến phiếu thành xuất kho tự động |
| Dự toán | Khách/yêu cầu, phiên bản, tổng, thời hạn, trạng thái xác nhận và phạm vi | Khách, mã yêu cầu, ngày, trạng thái, hết hạn | Xem nội dung đúng phiên bản; không sửa bản đã duyệt bằng giá danh mục mới |
| Báo lỗi QR | Máy/model, thông tin người gửi theo quyền, chi nhánh tiếp nhận, ngày gửi, trạng thái/kết quả | Máy, thời gian, chi nhánh, trạng thái, nội dung phù hợp | Xem báo lỗi và ghi xử lý; không tự suy ra đã tạo SR/WO |
| Thông báo | Nội dung, thời gian, đọc/chưa đọc, loại sự kiện, hồ sơ nguồn | Loại, khoảng thời gian, trạng thái đọc | Mở đúng hồ sơ theo quyền hiện tại; thông báo không cấp quyền xem hồ sơ |
| Báo cáo | Phạm vi, khoảng ngày, chỉ tiêu đúng nghĩa, trạng thái nguồn dữ liệu | Thời gian, chi nhánh, nhóm dữ liệu theo endpoint | Drill-down vào danh sách đã lọc tương ứng; không gọi lượng WO là mức hài lòng |

## 5. “Tìm theo bất kỳ thông tin liên quan” phải có nghĩa rõ

Không giải quyết bằng một textbox tuyên bố tìm mọi thứ nhưng thực tế chỉ tìm tên/serial. Cần danh mục trường tìm kiếm, nguồn dữ liệu, phép so sánh, quyền và trạng thái hỗ trợ.

1. **Trường có cấu trúc của chính hồ sơ:** ngày, mã, tên, địa điểm, model, trạng thái, số lượng/giá theo quyền. Phải có bộ lọc phù hợp kiểu dữ liệu.
2. **Thông tin liên quan:** khách hàng, phụ tùng từng dùng, WO đang mở, lần bảo trì gần nhất. Cần query/aggregation/read model rõ, không tìm giả bằng chuỗi ở một trường khác.
3. **Nội dung dài/lịch sử/tài liệu:** ghi chú, báo cáo, tệp. Tìm nội dung văn bản cần phạm vi và nguồn rõ; tìm bên trong PDF/ảnh là năng lực riêng, chưa tự coi là có từ việc thêm ô tìm kiếm.

Mục tiêu là mọi trường nghiệp vụ được công bố trong thiết kế đều có đường xem/tra cứu phù hợp. Không hứa tìm mọi byte trong mọi tệp hoặc dữ liệu ngoài quyền.

## 6. Quy tắc kỹ thuật và trải nghiệm

- Lọc toàn bộ tập dữ liệu trên server; kết hợp AND giữa nhóm, OR trong danh sách nhiều giá trị. Có so sánh chính xác/chứa/khoảng/chưa có giá trị theo trường.
- Ngày mua, ngày nhập hệ thống, ngày giao, ngày lắp, ngày xác nhận là các trường khác nhau; khoảng ngày có quy tắc bao gồm hai đầu và múi giờ nghiệp vụ rõ ràng.
- Cột hiển thị không quyết định phạm vi tìm kiếm: vẫn có thể lọc ngày mua khi cột ngày mua đang ẩn; chip điều kiện phải cho thấy đang lọc theo ngày mua.
- Cột/filter chưa có backend được đánh dấu trong tài liệu thiết kế; không đưa thành control hoạt động giả trong sản phẩm.
- API trả tên/mã phục vụ danh sách theo batch hoặc read model phù hợp; tránh gọi thêm nhiều API cho mỗi hàng và không JOIN DB của service khác.
- Trường tổng hợp có trạng thái chưa tải được và thời điểm tổng hợp khi cần; không hiển thị 0 thay lỗi.
- Nhớ filter/sort/trang theo URL hoặc người dùng; đổi tenant/role/phạm vi phải bỏ dữ liệu và lựa chọn không còn hợp lệ.
- Export đúng filter, cột và scope; backend kiểm quyền lại, không chỉ ẩn nút trên Web.
- Grid hỗ trợ bàn phím, focus rõ, tiêu đề cột, trạng thái không chỉ bằng màu; thông tin dài mở được và không bị cắt mất vĩnh viễn.
- Chọn nhiều dòng cho biết rõ số lượng/phạm vi. Thao tác hàng loạt kiểm quyền, version và điều kiện từng hồ sơ; không lấy việc có checkbox làm bằng chứng API bulk đã tồn tại.

## 7. Thứ tự triển khai đề xuất

1. Làm Thiết bị thành màn mẫu: danh mục trường/nguồn dữ liệu, grid, panel xem nhanh, bộ lọc và trạng thái thiếu thông tin. Bổ sung ngày mua như dữ liệu độc lập.
2. Nối luồng import theo yêu cầu mới nhất: không cố định 50, CSV/XLSX chi tiết, kết quả xác nhận ngoài hệ thống, per-row nơi lắp, cập nhật từ file.
3. Áp dụng cùng tiêu chí cho Request và WO: nhìn rõ khách/máy/nơi phục vụ, trách nhiệm, tuổi hồ sơ và việc bị chặn.
4. Làm Bảo trì và Kho/phiếu phụ tùng, giữ các phân biệt nghiệp vụ đang có.
5. Hoàn thiện các màn còn lại và kiểm tra xuyên role; không ép role nào cũng thấy cùng thông tin.

Chưa tự triển khai schema/API lớn từ tài liệu này. Các thay đổi ngày mua, site chưa xác định, nguồn xác nhận ngoài hệ thống và tổng hợp liên service cần contract/ADR/migration theo quy trình repository.

## 8. Tiêu chí nghiệm thu

- Người dùng tìm được tập máy theo ngày mua và vị trí lắp mà không mở từng hồ sơ.
- Kết quả khớp trên nhiều trang; bộ đếm và export khớp cùng bộ lọc/quyền.
- Phân biệt không có dữ liệu, chưa hoàn thiện, chưa tải được và không có quyền.
- Người dùng thấy được thông tin quan trọng để xử lý ca ngay trong danh sách; mở chi tiết chỉ để đi sâu.
- Quay lại từ chi tiết giữ nguyên tập đang làm việc và không dùng lựa chọn cũ ngoài scope.
- Các phân hệ trong ma trận có cột/filter/thao tác đúng ý nghĩa và được nghiệm thu bằng dữ liệu thật, không chỉ ảnh UI hoặc HTTP 200 của Vite.
