# Rà soát khắt khe luồng đăng ký — giao nhận — lắp đặt — tra cứu

> **Bổ sung theo phản hồi mới nhất:** xem [mốc yêu cầu và so sánh mới](2026-11-19-user-flow-vs-current-equipment.md). Người dùng đã xác định số lượng tùy thực tế, xác nhận nhóm ngoài hệ thống trước upload, nơi/vị trí lắp chi tiết đến từng máy. Các đề xuất xây xác nhận nhóm trên Portal, bắt xác nhận lại sau import, hoặc trì hoãn file trên 50 dòng trong bản review này không còn là hướng triển khai cho luồng import mới. Giữ bản review để truy vết lập luận; ưu tiên mốc yêu cầu mới khi có mâu thuẫn.

Ngày 19/11/2026. Đối tượng: bản đề xuất equipment-batch-grid cùng ngày và các ràng buộc Asset hiện tại. Đây là đánh giá thiết kế, không phải chứng nhận đã triển khai hoặc nghiệm thu tính năng.

## 1. Kết luận

Hướng đi phù hợp với quản lý thiết bị sau bán hàng, nhưng bản đề xuất đầu chưa đủ để triển khai an toàn. Thiếu lớn nhất là phân biệt bằng chứng nhận hàng, lắp đặt, vận hành và quyền công bố hồ sơ; xử lý giao thiếu/sai/hỏng; xác nhận nhóm; quy tắc sửa dữ liệu đã xác nhận; trách nhiệm khi chưa biết nơi lắp.

Không nên triển khai toàn bộ bảng/grid trước rồi mới nghĩ cách xử lý các trạng thái này. Người dùng có thể thấy nhiều cột nhưng vẫn không biết máy nào thực sự đã nhận, ai phải xử lý hoặc thông tin nào đáng tin.

**Quy tắc đã được người dùng chốt được giữ nguyên:** bảo hành bắt đầu từ ngày bàn giao thực tế, kể cả lắp đặt muộn. Những khuyến nghị nghiệp vụ mới trong tài liệu này là đề xuất; không tự coi việc viết vào tài liệu là đã được người dùng phê duyệt.

## 2. Các điểm bất hợp lý và bổ sung

P0: phải xác định trước khi thay luồng dữ liệu/quyền; P1: cần cho demo nghiệp vụ đáng tin; P2: có thể làm sau phiên bản đầu. Đây là độ ưu tiên cho thiết kế, không đồng nghĩa lỗi đã khai thác được trong code.

| Ưu tiên | Điểm chưa hợp lý trong đề xuất trước | Ví dụ hậu quả | Hướng sửa đề xuất |
|---|---|---|---|
| P0 | Gộp xác nhận nhận hàng với xác nhận máy hoạt động | Khách nhận đủ thùng nhưng chưa lắp, hệ thống lại báo vận hành bình thường | Tách nhận hàng, lắp đặt và tình trạng vận hành. Xác nhận nhận hàng không bao gồm nghiệm thu kỹ thuật nếu nội dung chưa được kiểm tra |
| P0 | Bắt site lắp đặt trong khi cho phép chưa biết nơi lắp | Nhân viên điền tạm trụ sở rồi hồ sơ/QR/kỹ thuật viên đi sai địa điểm | Địa chỉ nhận hàng độc lập; nơi lắp được để chưa xác định. Không dùng site giả hoặc tự thay bằng trụ sở |
| P0 | Bỏ site nhưng chưa thiết kế trách nhiệm/scope thay thế | Máy không có chi nhánh phục vụ, ca bị bỏ quên hoặc vô tình mở rộng quyền | Xác định chi nhánh chịu trách nhiệm hồ sơ khi đăng ký; site phát sinh sau không tự cấp quyền. Chuyển trách nhiệm có lý do và lịch sử |
| P0 | Trạng thái tổng quát ACTIVE/Hoàn tất bị dùng như đã lắp/đã sẵn sàng phục vụ | Máy chưa lắp được giao bảo trì hoặc xuất hiện là hoạt động tốt | Giữ riêng trạng thái hồ sơ, giao nhận, lắp đặt, vận hành và thiết lập dịch vụ. Áp điều kiện cụ thể cho từng thao tác |
| P0 | Ngày bàn giao được nhập như trường dữ liệu thường | Nhân viên sửa ngày sau xác nhận, khách mất hoặc được thêm bảo hành ngoài ý muốn | Ngày gắn với bằng chứng và phiên bản giao nhận; sửa qua luồng hiệu chỉnh có quyền, lý do, đối soát thời hạn, giữ bản cũ |
| P0 | Idempotency được coi như đủ để tránh nhập trùng | Người nhập gửi lại cùng file với key mới hoặc đổi thứ tự dòng | Thêm kiểm tra nhận dạng ở DB, nhận diện bản ghi có sẵn, tra cứu lịch sử import; cập nhật không thay đổi phải báo no-op, không tự tạo lại |
| P0 | Preview có thể khác dữ liệu/quyền tại thời điểm ghi | Sau preview máy bị chuyển khách/địa điểm hoặc người dùng bị thu quyền | Xác nhận ràng buộc input, người dùng, tenant, version; kiểm tra lại quyền và điều kiện khi commit. Preview không phải giấy phép ghi vô thời hạn |
| P1 | “Mỗi máy một hồ sơ” bị biến thành 50 lần bấm xác nhận | Khách bỏ cuộc hoặc bấm đồng ý liên tục mà không đọc | Cho xác nhận nhóm có danh sách serial, tổng số và chính sách; chọn ngoại lệ theo từng máy. Vẫn giữ kết quả và bằng chứng đến từng máy |
| P1 | Chỉ có nhận đủ/từ chối cả hồ sơ | Thực nhận 48/50, một máy sai serial và một máy vỡ vỏ | Ghi rõ máy đã nhận, thiếu, sai, hỏng hoặc chưa kiểm tra. Không đánh dấu cả 50 đã nhận; phần chưa chấp nhận có người phụ trách |
| P1 | Một lô nhập bị hiểu thành một đợt giao | Máy giao nhiều ngày bị cùng ngày bảo hành | Phân biệt lô đăng ký và đợt giao nhận; một lô có nhiều đợt, một đợt chứa danh sách máy cụ thể |
| P1 | Chỉ cho phép lắp sau trạng thái điện tử đã hoàn tất mà không xét thời điểm thực tế | Đã ký nhận tại hiện trường nhưng Portal cập nhật muộn, dữ liệu lịch sử đúng lại bị chặn | Giữ quy tắc giao nhận trước lắp. Phân biệt thời điểm thực tế và thời điểm nhập liệu; trường hợp ghi muộn cần đối soát/căn cứ. Không tự mở đường bỏ xác nhận hiện hành |
| P1 | Coi lắp đặt là yêu cầu của mọi máy | Thiết bị cắm dùng ngay mắc ở trạng thái “chưa lắp” mãi | Có “không yêu cầu lắp đặt”, có căn cứ từ model/hồ sơ; không dùng ngày lắp giả để hoàn tất |
| P1 | Ngầm coi bên cung cấp luôn là người lắp | Khách tự lắp hoặc thuê bên thứ ba nhưng hồ sơ cứ chờ KTV nội bộ | Ghi đơn vị chịu trách nhiệm lắp và nguồn xác nhận; khách khai báo không tự biến thành kết quả kỹ thuật đã được nhà cung cấp kiểm chứng |
| P1 | Ngày bảo hành trôi trong lúc chờ lắp nhưng khách không biết | Chờ lắp hai tháng, khách tưởng còn đủ 12 tháng từ ngày lắp | Hiển thị ngày bắt đầu/kết thúc trước xác nhận và trên hàng “đã giao, chờ lắp”; nhắc người phụ trách khi chậm. Không tự dời mốc đã chốt |
| P1 | Bảo trì tự dùng cùng mốc với bảo hành | Chưa lắp đã có ca bảo trì/vệ sinh máy | Tách quy tắc bảo trì với bảo hành. Chốt điều kiện sinh/điều phối công việc trước khi máy sẵn sàng và cách xử lý kỳ đã đến; không tự đổi lịch gốc ADR hiện hành |
| P1 | Có người phụ trách chi nhánh nhưng không ai theo sát ca chờ lắp | Hồ sơ đủ dữ liệu vẫn tồn hàng tháng | Hiện “đang chờ ai, thiếu gì, từ bao giờ, bước tiếp theo”; có người/bộ phận liên hệ và ngày dự kiến. Chưa hứa SLA khi chưa có chính sách |
| P1 | Grid cố hiển thị toàn bộ thông tin ở một màn | 40 cột và thông số khác nhau giữa máy bơm/máy siêu âm khiến không đọc được | Bộ cột lõi, chế độ xem theo công việc, thông số theo nhóm model; lịch sử/tệp mở từ từng hàng. Đủ khả năng tra cứu không đồng nghĩa mọi trường bật mặc định |
| P1 | Dùng model mặc định cho lô hỗn hợp mà không cảnh báo | 10 máy khác loại được gán nhầm model dù serial vẫn hợp lệ | Preview cho biết nguồn model từng dòng và tổng theo model. Không đoán theo tên gần giống; yêu cầu đối chiếu rõ các dòng thiếu mã |
| P1 | Tên/địa chỉ file có thể âm thầm sửa master data | “An Phúc HCM” và “BV AP HCM” thành hai cơ sở, hoặc địa chỉ cả khách bị đổi | Phân giải theo mã trong đúng khách, hiển thị xung đột, cho chọn bản ghi đúng; tạo mới Organization là thao tác riêng có quyền |
| P1 | Chưa xác định hồ sơ nào khách được thấy | Nháp nội bộ sai serial đã xuất hiện trong danh sách “máy tôi đã mua” | Phân biệt nháp nội bộ, hồ sơ được công bố/chờ khách xác nhận, máy đã nhận. Không gán nhãn đã sở hữu/đã nhận chỉ từ import |
| P1 | Bổ sung nơi lắp chỉ là đổi vài cột | Không biết đây là lắp lần đầu, chuyển máy hay sửa địa chỉ sai | Phân biệt ba thao tác, yêu cầu lý do/căn cứ phù hợp; giữ nơi cũ và thời điểm thay đổi, không sửa phiếu giao nhận quá khứ |
| P1 | Chưa có đường xử lý thiết bị bị trả/đổi hoặc nhận nhầm | Sửa serial trên máy cũ thành máy thay thế, mất lịch sử sửa chữa | Giữ hai máy độc lập và liên kết lý do thay thế/điều chỉnh. Ngừng hồ sơ bàn giao sai có lịch sử; không mặc định RETIRED hay tự kết thúc bảo hành. Quy tắc chi tiết cần nhóm chốt, không xây quy trình kế toán/hoàn tiền |
| P2 | Cấu hình cột và filter quá rộng ngay MVP | Tốn nhiều thời gian xây grid nhưng luồng nhận hàng còn chưa dùng được | Ưu tiên vài chế độ xem nghiệp vụ và nhóm filter cần thiết; lưu cá nhân/biểu đồ/export lớn làm sau |
| P2 | Coi giới hạn 50 dòng import là giới hạn của một lô nghiệp vụ | Khách có 200 máy bị ép thành bốn lô giao nhận không đúng thực tế | 50 là giới hạn mỗi lệnh MVP; giữ riêng mã lô và lần import, có thể bổ sung nhiều lần theo cùng lô mà không đổi phạm vi khách |

## 3. Sửa lại mô hình diễn giải trạng thái

Không tạo một enum khổng lồ cho mọi tổ hợp. Các ý nghĩa sau cần tách biệt ở thiết kế UI và contract; tên enum cuối cùng phải đối chiếu code/ADR.

| Trục thông tin | Ví dụ thể hiện | Điều không được suy ra |
|---|---|---|
| Hồ sơ | Nháp, cần sửa, đủ thông tin, đã công bố | Đủ thông tin không chứng minh đã giao máy |
| Giao nhận | Chưa giao, chờ xác nhận, đã xác nhận, có sai lệch | Đã nhận không chứng minh máy chạy tốt |
| Lắp đặt | Không yêu cầu, chưa biết nơi lắp, chờ lịch, đang thực hiện, hoàn tất, đang vướng | Có địa chỉ không chứng minh đã lắp |
| Vận hành | Chưa xác nhận, hoạt động, suy giảm, không hoạt động | Hoàn tất lắp không tự khẳng định hoạt động nếu chưa kiểm tra |
| Bảo hành | Chưa chốt, chờ xác nhận dữ liệu, đang trong hạn, hết hạn, không áp dụng | Đang trong hạn không tự chấp nhận mọi sự cố thuộc bảo hành |
| Thiết lập dịch vụ | Chưa thiết lập, đang đồng bộ, đã thiết lập, cần xử lý lỗi | Bảo trì chưa đồng bộ không có nghĩa khách chưa nhận hàng |

Ví dụ hợp lệ: “Đã nhận ngày 01/11 · Chưa lắp · Tình trạng vận hành chưa xác nhận · Bảo hành 01/11–31/10 năm sau theo chính sách đã xác nhận”. Các khoảng ngày thực tế phải do quy tắc lịch của hệ thống tính; không dùng ví dụ này thay công thức thời hạn trong code.

## 4. Luồng cải tiến

### A. Đăng ký

1. Chọn khách và chi nhánh chịu trách nhiệm, tải mẫu phù hợp.
2. Nhập máy theo mã model/serial; preview nhóm theo model, loại lỗi và thông tin còn thiếu.
3. Tạo nháp nội bộ. Cho sửa trực tiếp vài dòng; không bắt mọi lỗi nhỏ phải xuất/nhập lại cả file.
4. Ghi rõ phần nào chưa biết: nơi nhận hàng, nơi lắp, người liên hệ. Chưa biết nơi lắp không chặn tạo nháp; chưa có nơi nhận phù hợp thì chưa đủ điều kiện hoàn tất giao nhận.

### B. Giao nhận

1. Chọn máy thực sự giao trong đợt này, ngày và nơi thực tế; đối chiếu serial.
2. Hiển thị nội dung khách sẽ xác nhận, bao gồm số lượng, từng máy, tình trạng khi nhận, chính sách và ngày bảo hành.
3. Nhận xác nhận đúng quyền/đúng phiên bản. Thao tác nhóm có phạm vi rõ; máy thiếu/sai/hỏng tách ngoại lệ.
4. Mỗi máy xác nhận thành công có bằng chứng riêng, dù người dùng chỉ làm một thao tác nhóm. Không tự đánh dấu các dòng còn lại.
5. Khi cần nhiều service xử lý sau xác nhận, hiển thị tiến độ và lỗi từng phần; không hứa toàn bộ DB hoàn tất nguyên tử.

### C. Lắp đặt và theo dõi

1. Với máy cần lắp, theo dõi nơi lắp/người liên hệ/lịch dự kiến và trách nhiệm.
2. Cập nhật qua form hoặc file xuất theo bộ lọc. Preview ràng buộc đúng máy và version.
3. Kiểm tra điều kiện giao nhận, ngày thực tế và phạm vi. Trường hợp nhập liệu muộn có bước đối soát, không ghi đè bằng chứng cũ.
4. Ghi kết quả lắp, vấn đề còn tồn và tình trạng vận hành được kiểm tra. Giữ bảo hành theo ngày giao.
5. Khi chuyển vị trí về sau, dùng luồng chuyển vị trí có lịch sử, không sửa ngược thông tin “lắp lần đầu”.

Máy do khách hoặc bên thứ ba lắp cần ghi nguồn thông tin, thời gian khai báo và mức độ kiểm chứng, không giả chữ ký/nghiệm thu của KTV nhà cung cấp. QR cũng chỉ là nhận diện: có mã QR không chứng minh đã giao/lắp; bật public vẫn phải có scope, trách nhiệm tiếp nhận và projection an toàn.

## 5. Giao nhận nhóm và ngoại lệ

Đối với 50 máy, phải tránh hai cực: 50 lần xác nhận hoặc một nút “đồng ý tất cả” thiếu đối chiếu.

UI đề xuất có số lượng đã chọn, danh sách mã/serial, nhóm model/chính sách, ngày/nơi nhận và bảng ngoại lệ. Khách có thể chọn các máy nhận đúng; máy sai/thiếu/hỏng cần ghi nội dung để nhân viên xử lý. Không diễn giải “có vết xước” mặc nhiên là từ chối sở hữu hoặc chấp nhận mất quyền bảo hành.

MVP có thể tách các máy có ngoại lệ thành hồ sơ cần xử lý trước khi chốt nhóm còn lại, chưa cần nhiều loại tranh chấp phức tạp. Contract cần xác định chính xác các kết quả nào được phép; bản review không tự bổ sung một hệ thống khiếu nại.

Nếu một máy trong nhóm đã đổi version hoặc bị người khác xác nhận, phải hiển thị kết quả mới và yêu cầu xem lại phạm vi. Không đổi toàn bộ lô nhập thành trạng thái đã giao.

## 6. Ngày và bằng chứng

Phải phân biệt ít nhất ngày giao thực tế, thời điểm khách/nhân viên xác nhận hợp lệ, ngày lắp thực tế và thời điểm người dùng nhập dữ liệu. Các ngày dự kiến là trường khác.

- Ngày giao thực tế gắn bằng chứng và chính sách trước xác nhận; không mặc định bằng ngày tạo/import.
- Ngày lắp không trước ngày giao. Nếu cần chứng minh thứ tự trong cùng ngày, dùng thời điểm hoặc bằng chứng/luồng công việc, vì chỉ hai trường DATE không phân biệt sáng và chiều.
- Chậm ghi nhận không được biến thành lịch sử giả. Ghi nhận bổ sung phải thể hiện dữ liệu khai báo muộn, người ghi, căn cứ và quy trình kiểm tra phù hợp.
- Sửa ngày đã xác nhận cần đối soát tác động tới bảo hành, lịch bảo trì và hồ sơ đang xử lý; không cập nhật âm thầm hoặc xóa bản cũ.
- Gửi sửa lại ngày không tự hủy quyền lợi khách hoặc dời kỳ bảo trì. Nếu cần sửa chính sách/lịch, xử lý theo contract/ADR riêng.

Với lựa chọn bảo hành từ ngày giao, UI cần nói rõ: “Máy chưa lắp, thời gian bảo hành vẫn đang được tính từ ngày …”. Nếu đơn vị cung cấp chậm lắp, phải thấy người chịu trách nhiệm và việc cần xử lý. Đây là yêu cầu minh bạch, không tự thay mốc người dùng đã chốt.

## 7. Nguyên tắc import bắt buộc trước MVP

1. Tạo mới và cập nhật là hai chế độ rõ ràng; khách/tenant không đổi từ file cập nhật lắp.
2. Nhận dạng chính bằng mã thiết bị trong tenant, đối chiếu model/serial; serial không được giả định duy nhất toàn cầu. Mã model cũng phải phân giải không mơ hồ theo quy tắc catalogue.
3. Preview dùng đúng dữ liệu sẽ ghi. File/mapping/khách thay đổi thì preview cũ hết hiệu lực. Kiểm tra lại uniqueness, version, quyền và trạng thái khi commit.
4. Ô trống mặc định giữ nguyên; cột xóa có chủ đích mới yêu cầu xóa. Trường không cho sửa bị chặn, không âm thầm bỏ qua rồi báo thành công.
5. Giữ text cho serial/mã. Phân biệt ngày Excel, ngày ISO và định dạng nhập; dữ liệu mơ hồ như 03/04 phải chọn cách hiểu rõ ràng trước ghi. Không dùng timezone máy người nhập để đổi ngày nghiệp vụ.
6. File XLSX chứa công thức/macros không được chạy. Giá trị công thức trong trường nhận dạng/ngày cần bị chặn hoặc xử lý theo chính sách rõ; không dựa ngầm vào cached value. Export bảo vệ trước formula injection mà vẫn bảo toàn dữ liệu khi nhập lại mẫu chính thức.
7. Với 50 máy, mặc định không ghi nếu còn lỗi. Cho người dùng sửa/chọn lại dòng, xuất danh sách lỗi và xác nhận lại. Không ghi từng phần bất ngờ.
8. Nếu cung cấp ghi các dòng hợp lệ, đó phải là lựa chọn riêng; có kết quả từng dòng và retry chỉ phần chưa thành công. Giới hạn nguyên tử trong Asset DB phải công bố đúng, không mở transaction xuyên service.
9. Idempotency theo command và uniqueness theo nghiệp vụ cùng tồn tại. Gửi lại cùng key/nội dung trả kết quả cũ; nội dung khác không dùng lại key. Key mới không được vượt kiểm tra trùng máy.
10. Khi đã import được một phần ở phiên trước, đối soát trạng thái server trước khi tạo lệnh mới. Ghi không thay đổi báo rõ “không có thay đổi”, tránh tạo bằng chứng cập nhật giả.

## 8. Bảng dữ liệu đủ dùng và dễ đọc

### Chế độ xem MVP

| Chế độ | Cột/điều kiện ưu tiên | Việc người dùng giải quyết |
|---|---|---|
| Tất cả thiết bị | Mã, serial, tên/model, khách, cơ sở, giao nhận, lắp, vận hành, bảo hành | Tìm đúng máy và mở hồ sơ |
| Chờ giao nhận | Đợt giao, danh sách máy, ngày/nơi nhận, tình trạng xác nhận, ngoại lệ | Đối chiếu giao đủ/đúng |
| Chờ lắp / thiếu thông tin | Nơi lắp, liên hệ, ngày dự kiến, người phụ trách, thiếu gì, chờ từ khi nào | Chuẩn bị và theo sát lắp đặt |
| Bảo hành | Ngày giao, thời hạn, ngày hết, tình trạng lắp/vận hành, công việc đang mở | Theo dõi nghĩa vụ phục vụ |

Khách hàng có các chế độ tương ứng trong phạm vi của mình; không mặc định thấy nháp nội bộ hoặc người/ghi chú chỉ phục vụ điều phối nội bộ.

### Những điều bảng không được làm sai

- Không gọi bộ số đếm trong trang hiện tại là thống kê toàn bộ.
- Không hứa sort/filter mọi cột tổng hợp nếu API chưa thực hiện được. Trường ngoài service cần contract read model/aggregation rõ ràng; nguồn không tải được hiển thị chưa tải được.
- Không giữ lựa chọn 50 dòng cũ sau khi người dùng đổi filter/tenant/tài khoản mà không thông báo phạm vi.
- “Toàn bộ kết quả đã lọc” phải xác định lại quyền khi export/cập nhật; không tin danh sách ID từ client.
- Không xuất ghi chú nội bộ/giá vốn/điện thoại bị hạn chế qua chức năng tùy chọn cột.
- Không đẩy mọi thông số riêng của 50 model thành hàng trăm cột mặc định. Cột chung + preset theo loại và bảng chi tiết thông số là đủ cho MVP.
- Lọc dữ liệu chưa có ngày/địa điểm là thao tác chính; không buộc gõ từ “Chưa xác định” để tìm null.

## 9. Phân định MVP và việc để sau

### Phải làm trước khi dùng luồng mới

- Tách giao nhận/lắp đặt/vận hành, địa chỉ nhận/lắp, scope khi thiếu site và quy tắc công bố cho khách.
- Giao nhiều đợt, xác nhận nhóm có ngoại lệ; bằng chứng theo máy.
- Bảo hành theo ngày giao đã xác nhận; hiệu chỉnh ngày có lịch sử.
- Nhập mới/cập nhật có preview, concurrency, idempotency, đúng quyền và audit.
- Bảng cột lõi, filter thiết yếu, xuất mẫu cập nhật và trạng thái lỗi/thiếu dữ liệu.
- Xác định tương tác bảo trì và QR khi chưa lắp/chưa có nơi lắp, giữ nguyên quyền truy cập.

### Có thể để sau

- Kéo/thả cột phức tạp, preset chia sẻ toàn nhóm, dashboard biểu đồ nâng cao.
- Import nhiều khách độc lập trong cùng lệnh, file vượt 50 máy và pipeline export lớn.
- OCR/chữ ký điện tử tích hợp, tự động đoán model/địa chỉ, workflow tranh chấp nhiều cấp.
- Luồng đổi/trả thương mại, hóa đơn/hoàn tiền, quản lý đơn hàng hoặc kho thành phẩm. Không đưa các phần này vào MVP chỉ vì phát hiện ngoại lệ giao nhận.

## 10. Ca nghiệm thu bổ sung

| Ca | Kết quả cần có |
|---|---|
| 50 máy/5 model, model mặc định sai ở 3 dòng | Preview chỉ rõ, người dùng sửa/chọn đúng; không âm thầm phân loại sai |
| Thực nhận 48/50, một máy hỏng vỏ | Chốt chính xác tập máy đã nhận; máy thiếu/hỏng có ghi nhận và việc tiếp theo; không xác nhận cả 50 đúng |
| Khách xác nhận 30 máy thuộc nhiều chính sách một lần | Thấy đúng phạm vi/chính sách trước thao tác; có bằng chứng theo từng máy |
| Máy chưa lắp sau 45 ngày | Bảng cho thấy đang chờ ai, việc còn thiếu và bảo hành vẫn trôi từ ngày giao |
| Thiết bị không cần lắp | Không bị treo ở hàng chờ lắp; vẫn không tự tuyên bố đã kiểm tra hoạt động |
| Nhận tại kho trung tâm, lắp ở hai cơ sở sau | Snapshot nơi nhận giữ nguyên; vị trí hiện tại và lịch sử lắp đúng từng máy |
| Khách đã ký nhận ngoài hiện trường nhưng nhập liệu muộn | Luồng đối soát lưu ngày thực tế và ngày ghi; không giả lập xác nhận Portal hoặc tự bỏ bằng chứng |
| Sửa ngày giao sau khi bảo hành có hiệu lực | Có quyền/lý do/phiên bản và xử lý tác động rõ, không sửa âm thầm |
| Bổ sung địa chỉ lần đầu rồi chuyển máy lần hai | Hai sự kiện khác nhau, không làm mất địa chỉ lắp đầu hoặc phiếu giao cũ |
| Preview đúng, trước commit máy đổi scope/version | Ghi bị chặn/đối soát đúng, không có dòng ngoài quyền bị cập nhật |
| Import lại file cũ bằng key mới | Không thêm máy; không lùi dữ liệu mới; no-op/duplicate được giải thích rõ |
| Một service phụ trợ chưa sẵn sàng | Hiện việc đã xác nhận và phần đang đồng bộ riêng; không báo tất cả thất bại hoặc tất cả hoàn tất |
| Chuyển filter rồi chọn export toàn bộ | File khớp điều kiện/phạm vi mới; lựa chọn cũ không bị dùng ngầm |
| Máy đổi/thay thế trong xử lý sau bán | Serial và lịch sử máy cũ còn nguyên; máy thay thế có hồ sơ riêng và liên kết, chưa tự đặt chính sách bảo hành mới |

## 11. Nhận định cuối

Nên giữ nhập lô, bổ sung lắp đặt bằng file, grid có bộ lọc và mốc bảo hành ngày giao. Cần sửa cách hiểu “hoàn tất”, xác nhận từng máy về mặt dữ liệu nhưng hỗ trợ thao tác nhóm, các ngoại lệ giao nhận và điều kiện phạm vi dữ liệu khi chưa có site.

Ưu tiên tiếp theo là chốt và mô tả các điều kiện nghiệp vụ trên bằng contract/UI cụ thể, sau đó mới thay schema và nối API. Chưa có cơ sở để gọi luồng mới là hoàn chỉnh chỉ vì file import và bảng dữ liệu đã xuất hiện.
