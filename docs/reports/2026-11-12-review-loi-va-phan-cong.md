# Đánh giá và hiệu chỉnh bản “Lỗi và phân công”

- Ngày: 12/11/2026.
- Tài liệu nguồn: `Lỗi và phân công.md`, bản người dùng cung cấp trong thư mục Downloads, ngày cập nhật 12/11/2026.
- Mục đích: đánh giá 14 nhận xét, chỉnh hướng xử lý, đề xuất thứ tự triển khai, đầu mối phối hợp và tiêu chí nghiệm thu.
- Cơ sở: đối chiếu code local trong lượt rà soát; chưa chạy nghiệm thu toàn bộ UI/backend và chưa kiểm tra lại trạng thái CI trên GitHub trong lượt xuất tài liệu này.
- Trạng thái: tài liệu đề xuất; không phải xác nhận các chức năng đã được triển khai hoặc kiểm thử đạt.

> **Quyết định phạm vi của nhóm:** Mục 11 — điều động kỹ thuật viên hỗ trợ liên chi nhánh — chưa thực hiện trong giai đoạn hiện tại. Chỉ lưu làm hướng phát triển sau; không giao task, không tính là thiếu sót chặn nghiệm thu hiện tại và không đưa vào điều kiện phụ thuộc của các việc khác. Giữ nguyên kiểm soát phân công cùng chi nhánh hiện hành.

## 1. Kết luận đánh giá

Bản review nhận diện được nhiều bất tiện thực tế: kho chưa nhận nhu cầu vật tư một cách liền mạch, người tiếp nhận thiếu hướng dẫn bước tiếp theo, thiết bị thiếu thông tin dễ nhận diện và luồng khảo sát trước báo giá chưa hoàn chỉnh.

Tuy nhiên, chưa nên dùng nguyên văn làm đặc tả triển khai. Một số chỉ dẫn dùng trường dữ liệu không tồn tại, đề xuất viết lại API hoặc enum đã có, hoặc bỏ kiểm tra dữ liệu mà chưa phân biệt ý nghĩa nghiệp vụ. Những thay đổi liên quan trạng thái, phân quyền và xác nhận khách hàng cần được thống nhất trước khi sửa schema/API.

Cần phân biệt ba loại công việc:

1. **Sửa lỗi tích hợp hoặc trình bày:** bổ sung dữ liệu bảo hành danh sách, tên vị trí phân cấp, mã/tên dễ nhận diện.
2. **Hoàn thiện trải nghiệm dựa trên chức năng có sẵn:** QR trong dossier, hành động tiếp theo khi thẩm định, hiển thị kết quả chưa xử lý được, kết nối API xác nhận dùng phụ tùng.
3. **Thiết kế luồng mới:** yêu cầu cấp vật tư, khảo sát trước dự toán, đề nghị trả phụ tùng, ngày dự kiến và bằng chứng xác nhận hiện trường. Đây không chỉ là thêm nút hoặc đổi nhãn.

## 2. Bảng đánh giá 14 nội dung

| Mục | Nhận xét trong bản gốc | Kết luận sau đối chiếu | Hướng xử lý đã hiệu chỉnh | Phạm vi/ưu tiên |
| --- | --- | --- | --- | --- |
| 1 | Kho tự tìm WO để xuất phụ tùng | Nhu cầu bổ sung đầu vào từ hiện trường là hợp lý. Không cần loại bỏ hoàn toàn thao tác xuất trực tiếp có quyền nếu vẫn phục vụ tình huống hợp lệ. | Tạo yêu cầu cấp vật tư gắn WO, người yêu cầu, số lượng, lý do; kho nhận hàng chờ và cấp một phần/đủ. Yêu cầu cấp chưa làm giảm tồn. | Thiết kế sớm, triển khai sau khi chốt contract. |
| 2 | Mobile chỉ đọc phụ tùng | Cần thao tác cho kỹ thuật viên, nhưng không nên tạo API trùng hoặc cho tự tăng tồn kho. | Tái sử dụng API xác nhận dùng; tách đề nghị trả của kỹ thuật viên và xác nhận nhận hàng của kho. | Bàn giao cho người phụ trách Mobile; tài liệu này không cho phép sửa Mobile. |
| 3 | Cột bảo hành trống | Có khoảng trống giữa dữ liệu list API và UI. Đề xuất dùng `coverageResult` sai vì Warranty không có trường này. | Trả projection bảo hành thống nhất với API chi tiết, xét ngày và bản ghi hợp lệ; không lấy tùy ý một ACTIVE bằng `take: 1`. | Làm sớm. |
| 4 | Dossier thiếu QR | Tích hợp QR giúp thao tác dễ tìm hơn. Không phải mọi người xem hồ sơ đều cần hoặc được phép cấp/in lại QR. | Hiển thị QR và hành động theo quyền; xử lý rõ chưa có mã, mã bị thu hồi và thiết bị không được cấp mã. Đọc dossier không tự xoay token. | Làm sớm sau khi thống nhất contract đọc QR. |
| 5 | Bắt đủ ba ngày, cấm ngày tương lai | Hàm kiểm tra chỉ bắt buộc ngày bàn giao thực tế khi hoàn tất; không bắt đủ cả ba ngày. Cấm ngày thực tế tương lai có ý nghĩa bảo vệ dữ liệu. | Nếu cần lập lịch, thêm hoặc sử dụng trường ngày dự kiến riêng. Giữ ngày thực tế đúng ý nghĩa; không tự điền ngày lắp đặt/vận hành như thể sự kiện đã xảy ra. | Hiệu chỉnh yêu cầu trước khi code. |
| 6 | Vị trí dạng danh sách phẳng | Đúng về nguy cơ trùng tên và chọn nhầm. Cấu trúc phân cấp đã tồn tại. | Hiển thị Customer Site và đường dẫn tòa/xưởng → tầng → phòng; tìm kiếm theo đường dẫn, chỉ chọn vị trí thuộc site hiện tại. | Làm sớm. |
| 7 | Tiếp nhận yêu cầu bị đứt đoạn | Nhu cầu hướng dẫn bước tiếp theo hợp lý; chưa cần mặc định viết lại toàn bộ thành wizard cứng. | Đưa thông tin sự cố, kết luận bảo hành và hành động tiếp theo vào cùng ngữ cảnh; cho xem lại dữ liệu và lịch sử dễ dàng. | Hoàn thiện UI sau khi chốt các nhánh xử lý. |
| 8 | Ngoài bảo hành không chuyển báo giá | Cần làm rõ việc tiếp theo; giữ REVIEWING chưa tự nó là lỗi trạng thái. | Hiển thị cần dự toán hoặc cần khảo sát. Ưu tiên dữ liệu suy ra từ trạng thái/kết quả sẵn có; chỉ thêm trạng thái/cờ khi chứng minh cần và có quy tắc đồng bộ. | Phối hợp mục 7 và 9. |
| 9 | Báo giá trước khi khám máy | Là khoảng trống nghiệp vụ quan trọng. `INSPECTION` đã có; tạo WO từ SR hiện vẫn yêu cầu SR ACCEPTED. | Thiết kế nhánh khảo sát trước duyệt sửa chữa, thống nhất phí khảo sát nếu có, phạm vi được phép làm, kết quả chẩn đoán và chuyển sang dự toán. | Ưu tiên thiết kế cao. |
| 10 | Yêu cầu chưa có chi nhánh dễ bị bỏ quên | Cần giải quyết trách nhiệm và khả năng phát hiện tồn đọng. Bộ lọc `unallocated` đã tồn tại; `branchId` đang là UUID. | Trước mắt dùng quy trình Tenant Admin phân bổ theo quyền hiện hành, làm rõ hàng chờ/cảnh báo. Nếu mở quyền SM nhận việc, phải chốt quyền và chống nhận trùng trước. | Không tự mở quyền toàn tenant. |
| 11 | Phân công hỗ trợ liên chi nhánh | Là khả năng mở rộng, chưa thuộc nhu cầu nhóm hiện tại. | Giữ nguyên quy tắc phân công cùng chi nhánh. Ghi nhận nghiên cứu sau khi có nhu cầu và thiết kế quyền đầy đủ. | **HOÃN — ngoài phạm vi hiện tại, không chặn nghiệm thu.** |
| 12 | UNRESOLVED bị nuốt, không có thông báo | Code có lưu kết quả và Notification có xử lý WO hoàn tất. Chưa đủ bằng chứng kết luận không gửi thông báo nào. | Nghiệm thu người nhận và mức nổi bật; hiển thị chưa xử lý được, lý do, người chịu trách nhiệm và hành động tiếp theo. Chỉ thêm event riêng khi có nhu cầu contract rõ. | Ưu tiên tránh bỏ sót ca cần xử lý lại. |
| 13 | Thiếu chữ ký nghiệm thu | Nhu cầu bằng chứng hợp lý; khẳng định mọi ca B2B bắt buộc ký tại chỗ là quá rộng. | Tách hoàn tất kỹ thuật và xác nhận của khách; xác định chữ ký/OTP xác nhận nội dung gì, ai có quyền xác nhận và các trường hợp vắng mặt/từ chối. | Chốt nghiệp vụ trước khi triển khai. |
| 14 | UUID/tiếng Anh khó nhận diện | Nên sửa khả năng đọc hiểu và ngữ cảnh thông báo. | Dùng mã hồ sơ + thiết bị + khách/site phù hợp quyền; có nhãn dự phòng khi thiếu dữ liệu. Giữ ID kỹ thuật trong dữ liệu/đường dẫn nếu cần, không dùng làm nhãn chính. | Làm sớm theo từng màn hình. |

## 3. Các quy tắc cần giữ khi triển khai

### 3.1. Yêu cầu, cấp, dùng và trả phụ tùng

Luồng đề xuất:

1. Kỹ thuật viên hoặc người có quyền lập yêu cầu phụ tùng cho WO, ghi nhu cầu và lý do.
2. Kho thấy yêu cầu thuộc phạm vi mình, kiểm tra tồn và ghi số lượng có thể cấp; hỗ trợ cấp một phần và giải thích phần còn chờ.
3. Thao tác xuất dùng cơ chế Inventory/WO reservation hiện hành; không giảm tồn chỉ vì đã gửi yêu cầu.
4. Có thông tin giao nhận đủ xác định ai đang giữ phụ tùng; quy tắc xác nhận giao nhận cần chốt trong contract.
5. Kỹ thuật viên xác nhận lượng dùng bằng API hiện có theo điều kiện báo cáo.
6. Phần thừa được lập đề nghị trả. Kho xác nhận thực nhận, số lượng và tình trạng trước khi ghi RETURN; hàng hỏng/chờ kiểm tra không mặc định trở thành tồn khả dụng.
7. Lượng chưa dùng/chưa trả phải còn hiển thị để đối soát; không tự coi phần chưa giải thích là đã sử dụng.

**Ràng buộc quan trọng:** luồng hiện hành xác nhận dùng dựa trên báo cáo của WO đã COMPLETED. Không thêm điều kiện phải confirm-use xong mới được hoàn tất báo cáo, vì sẽ tạo vòng chờ. Nếu muốn đổi thứ tự, phải thiết kế và sửa contract liên quan cùng lúc.

Giữ kiểm tra số lượng, quyền, idempotency và quy tắc trả về đúng kho xuất. Không biến đề nghị trả từ hiện trường thành giao dịch kho đã nhận hàng. Part Request là yêu cầu nội bộ phục vụ WO, không mở rộng thành mua hàng hoặc procurement.

### 3.2. Bảo hành, ngày thiết bị và QR

- Phân biệt **còn thời hạn bảo hành** của thiết bị và **sự cố được chấp nhận bảo hành**. Nhãn danh sách thiết bị không được thay cho kết luận thẩm định sự cố.
- List và detail phải cho kết quả nhất quán tại cùng ngày đánh giá; định nghĩa rõ không có bảo hành, hết hạn, bị vô hiệu và chưa đến thời điểm hiệu lực theo contract hiện hành hoặc contract đã sửa.
- Ngày dự kiến dùng để lập kế hoạch. Ngày thực tế ghi nhận việc đã xảy ra và có thể ảnh hưởng hiệu lực bảo hành/bảo trì. Không bỏ kiểm tra ngày thực tế để giải quyết nhu cầu lập lịch.
- QR dùng nhận diện thiết bị; vẫn kiểm tra tenant/customer/quyền khi truy cập. GET dossier không phát sinh thao tác tạo, thu hồi hoặc xoay QR.
- Cần kiểm tra lại luồng xem/in mã hiện hành trước khi quyết định thêm `qrUrl` hay payload vào dossier; không hứa trả dữ liệu mà cơ chế lưu token hiện tại chưa hỗ trợ.

### 3.3. Khảo sát, dự toán và sửa chữa

Luồng đề xuất cho ca chưa đủ thông tin: tiếp nhận sự cố → xác định cần khảo sát → khách chấp thuận phạm vi/phí khảo sát nếu có → WO khảo sát → kết quả chẩn đoán → dự toán sửa chữa → khách chấp thuận → công việc sửa chữa.

Không bắt mọi ca đi khảo sát. Ca đã đủ căn cứ vẫn có thể lập dự toán trực tiếp. Khảo sát không mặc nhiên cho phép thay linh kiện tính phí; khách chấp thuận phí khảo sát không đồng nghĩa đồng ý mọi chi phí sửa chữa.

Cần chốt trước khi code:

- Điều kiện cho tạo WO khảo sát khi SR chưa ACCEPTED theo luồng sửa chữa hiện tại.
- Cách phân biệt hoàn tất khảo sát với giải quyết xong sự cố; WO khảo sát hoàn tất không tự đóng SR như đã sửa thành công.
- Dùng WO riêng cho sửa chữa hay chuyển mục đích WO; phải giữ dấu vết phạm vi từng lần khách đồng ý.
- Xử lý khách từ chối dự toán sau khảo sát, khảo sát chưa tìm ra lỗi, và phát sinh ngoài phạm vi đã duyệt.
- Chống tạo trùng WO và xử lý sự kiện đến trễ; không tạo hai công việc sửa chữa trùng mục đích do gửi lại thao tác.

### 3.4. Hàng chờ và kết quả chưa thành công

- Mỗi hàng chờ cần trả lời: đang chờ ai, từ khi nào, vì sao và bước tiếp theo là gì.
- Mục 10 là **phân bổ yêu cầu chưa có chi nhánh**, khác mục 11 là **mượn kỹ thuật viên từ chi nhánh khác**. Hoãn mục 11 không có nghĩa bỏ hàng chờ chưa phân bổ.
- Giữ quyền hiện hành làm mặc định: Tenant Admin phân bổ; không cho mọi Service Manager đọc toàn bộ hồ sơ chưa phân bổ khi chưa thống nhất phạm vi.
- WO COMPLETED chỉ thể hiện công việc kỹ thuật kết thúc. Luôn trình bày riêng kết quả RESOLVED/PARTIALLY_RESOLVED/UNRESOLVED và tình trạng xác nhận khách hàng.
- Với UNRESOLVED, hiển thị kết quả lần trước và nguyên nhân, đưa vào hàng chờ xử lý tiếp. Không tự cam kết đổi máy; đây là quyết định nghiệp vụ riêng.
- Cảnh báo phải đến đúng người trong phạm vi, tránh gửi trùng khi event retry. Thông báo là công cụ nhắc việc, hàng chờ hồ sơ mới là nơi quản lý trách nhiệm lâu dài.

### 3.5. Xác nhận hiện trường

Phải phân biệt xác nhận kỹ thuật viên đã đến, xác nhận đã nhận báo cáo, đồng ý kết quả sửa chữa và đồng ý chi phí. Một ảnh chữ ký không tự chứng minh khách đã chấp thuận tất cả các nội dung này.

Bằng chứng đề xuất gồm người xác nhận và tư cách, nội dung/phiên bản được xác nhận, thời điểm, phương thức và tệp liên quan theo quyền. Nếu báo cáo thay đổi sau xác nhận, phải thể hiện khác phiên bản và có quy tắc xác nhận lại.

Cần xử lý khách vắng mặt, người tại chỗ không có quyền duyệt, khách từ chối, chỉ sửa được một phần và mất mạng. Không bắt buộc có chữ ký mới cho lưu kết quả kỹ thuật trong mọi trường hợp; trạng thái chờ khách phải rõ ràng. Nhân viên xác nhận thay cần có căn cứ, không gắn nhãn như khách tự xác nhận.

## 4. Phân công đề xuất và điều chỉnh task bản gốc

Tên đầu mối dưới đây kế thừa bản review bốn người, chưa thay thế quyết định phân công chính thức của nhóm. Cần xác nhận lại đầu mối Web/Mobile và vai trò Hatsady nếu cơ cấu năm người trước đây vẫn còn áp dụng. Với luồng nhiều service, cần một người chịu trách nhiệm nghiệm thu toàn luồng cùng các thành viên phối hợp.

| Đầu mối đề xuất | Task nguồn | Nội dung sau hiệu chỉnh | Phối hợp/đầu ra |
| --- | --- | --- | --- |
| Minh | 1.1 | Projection bảo hành danh sách, dùng quy tắc nhất quán với chi tiết. | Nguyên nối UI; API contract và test ngày/VOID/không có bảo hành. |
| Minh | 1.2 | Kiểm tra khả năng đọc QR hiện hành, bổ sung contract cần thiết cho dossier theo quyền. | Nguyên hiển thị và in; không xoay mã khi đọc. |
| Minh | 1.3 | Giữ kiểm tra ngày thực tế; xác định nhu cầu ngày dự kiến trước khi sửa schema. | Nguyên thiết kế form/nhãn; chốt ảnh hưởng đến hiệu lực bảo hành. |
| Minh | 1.4 | Thiết kế Part Request và đề nghị trả; tái sử dụng confirm-use/RETURN hiện có. | Khương xác nhận điều kiện WO, Nguyên làm màn kho, người phụ trách Mobile nối API sau. |
| Huy | 2.1 | Làm rõ next action sau NOT_COVERED; phối hợp nhánh khảo sát trước dự toán. | Nguyên UX, Khương vòng đời WO; không thêm trạng thái chỉ để điều khiển hộp thoại. |
| Huy | 2.2 | Rà người nhận/kết quả UNRESOLVED, hàng chờ và cơ chế nhắc xử lý tiếp. | Khương cung cấp kết quả, Nguyên dashboard; cân nhắc event riêng sau khi chốt contract. |
| Huy | 2.3 | Nội dung thông báo tiếng Việt có ngữ cảnh và giới hạn dữ liệu theo quyền. | Dùng contract/API hợp lệ để có tên/mã; tránh phụ thuộc đọc DB service khác. |
| Huy + Nguyên | 2.4 | Hoàn thiện hàng chờ chưa phân bổ với `unallocated` và quyền hiện hành. | Người sở hữu Organization/Identity tham gia nếu thay đổi quyền; không tự mở quyền SM toàn tenant. |
| Khương | 3.1 | **Hoãn hỗ trợ liên chi nhánh.** | Không có đầu việc triển khai hoặc gate nghiệm thu trong đợt này. |
| Khương | 3.2 | Kế hoạch kết nối thao tác phụ tùng trên Mobile sau khi contract sẵn sàng. | Bàn giao riêng; lượt xuất review không sửa Mobile. |
| Khương + Huy | 3.3 | Chốt ý nghĩa xác nhận hiện trường, quyền và phiên bản bằng chứng. | Nguyên và người phụ trách Mobile thiết kế trải nghiệm; chỉ triển khai sau khi chốt ngoại lệ. |
| Khương + Huy | 3.4 | Hoàn thiện luồng INSPECTION đã có để khảo sát trước dự toán sửa chữa. | Phối hợp state machine SR/WO và event; không chỉ thêm enum. |
| Nguyên | 4.1 | UI tiếp nhận thể hiện bước tiếp theo, lý do bị chặn và nhánh khảo sát. | Tích hợp với Huy/Khương; giữ khả năng xem lại dữ liệu. |
| Nguyên | 4.2–4.4 | QR theo quyền, location breadcrumb, mã/tên dễ đọc. | Minh cung cấp projection; kiểm tra UI theo vai trò và dữ liệu thiếu. |
| Nguyên/chủ repo | 4.5 | Kiểm tra trạng thái CI thực tế và khôi phục kiểm tra tự động nếu còn lỗi. | Vấn đề billing trước đây là thông tin lịch sử. Chỉ chọn self-hosted runner sau khi cân nhắc người vận hành, cô lập và secrets. |

## 5. Thứ tự thực hiện đề xuất

| Đợt | Công việc | Điều kiện hoàn thành |
| --- | --- | --- |
| A — Sửa các điểm đã rõ | Mục 3, 6, 14; mục 4 sau kiểm tra contract QR. | UI/API nhất quán, đúng quyền, có kiểm thử trường hợp dữ liệu thiếu và trùng tên. |
| B — Làm rõ việc chờ xử lý | Mục 7, 8, 10, 12 trong quyền và trạng thái đã thống nhất. | Người dùng biết bước tiếp theo; hồ sơ chưa phân bổ/chưa sửa được có hàng chờ và đầu mối rõ. |
| C — Hoàn thiện luồng nghiệp vụ | Mục 1–2 và 9; có thể chuẩn bị thiết kế song song với A/B. | Chốt contract, quyền, vòng đời và kiểm thử toàn luồng trước khi đóng task từng service. Mobile do đầu mối riêng thực hiện theo phân công. |
| D — Bổ sung sau khi chốt quyết định | Mục 5 về ngày dự kiến; mục 13 về xác nhận hiện trường. | Thống nhất ý nghĩa dữ liệu và ngoại lệ, cập nhật tài liệu/API/test rồi mới triển khai. |
| Tương lai | **Mục 11: hỗ trợ liên chi nhánh.** | Không thuộc kế hoạch hiện tại; chỉ mở lại khi nhóm chủ động quyết định. |

Không dùng mục 11 làm điều kiện cho luồng khảo sát, vật tư hoặc tiếp nhận. Các luồng hiện tại vẫn vận hành trong cùng chi nhánh với quyền đã có.

## 6. Tiêu chí nghiệm thu đề xuất

Các ca dưới đây **chưa chạy trong lượt review**. Đây là tiêu chí để viết test và nghiệm thu sau triển khai, không phải bảng kết quả PASS.

| Mã | Tình huống | Kết quả cần đạt |
| --- | --- | --- |
| RV-01 | Thiết bị có/không có bảo hành, ngày biên hiệu lực, hết hạn, VOID. | List và detail thống nhất; không nhầm trạng thái thời hạn với kết luận bảo hành sự cố. |
| RV-02 | Mở dossier nhiều lần, xem/in QR theo các vai trò. | Không thay đổi token do đọc; hành động đúng quyền; thiết bị không đủ điều kiện được giải thích rõ. |
| RV-03 | Hai phòng cùng tên ở hai tòa hoặc hai site. | Người dùng phân biệt được đường dẫn; không chọn/gửi location thuộc site khác. |
| RV-04 | Lập lịch bàn giao tuần sau và ghi nhận bàn giao đã xảy ra. | Ngày dự kiến không tự trở thành ngày thực tế; ngày thực tế tuân thủ quy tắc hiện hành; không ép nhập sự kiện chưa xảy ra. |
| RV-05 | Thẩm định NOT_COVERED khi đã biết và chưa biết nguyên nhân. | Có hành động lập dự toán hoặc khảo sát phù hợp; không tự gửi dự toán hay cho sửa tính phí khi chưa chấp thuận. |
| RV-06 | Khảo sát hoàn tất, sau đó khách đồng ý/từ chối sửa chữa. | Kết quả khảo sát được giữ; không tự đóng SR như đã sửa xong; chi phí/phạm vi có căn cứ đồng ý. |
| RV-07 | Yêu cầu không có chi nhánh và thao tác phân bổ đồng thời. | Người có quyền thấy và phân bổ; chỉ một kết quả hợp lệ, có lịch sử; người không có quyền bị từ chối ở API. |
| RV-08 | WO kết thúc với ba loại kết quả kỹ thuật. | UI phân biệt kết thúc công việc với sửa thành công; ca một phần/chưa thành công có phần còn lại hoặc lý do và hành động tiếp. |
| RV-09 | Sự kiện WO được gửi lại hoặc đến trễ. | Không nhân đôi thông báo/hồ sơ, không ghi đè tiến trình mới bằng kết quả cũ. |
| RV-10 | Xin cấp phụ tùng, cấp một phần, gửi lại yêu cầu/thao tác xuất. | Số lượng cấp/chờ rõ; không giảm tồn khi mới xin cấp, không xuất trùng do retry; reservation vẫn bảo vệ giao dịch. |
| RV-11 | Báo cáo hoàn tất rồi xác nhận dùng. | Thực hiện đúng thứ tự contract hiện hành; không tạo vòng chờ; số dùng không vượt lượng được phép. |
| RV-12 | Kỹ thuật viên đề nghị trả, kho nhận thiếu hoặc nhận hàng hỏng. | Không tăng tồn khi chỉ đề nghị; giao dịch phản ánh thực nhận/tình trạng và phần còn phải giải trình. |
| RV-13 | Khách vắng mặt/từ chối ký/chỉ đồng ý một phần; báo cáo sửa sau ký. | Lưu được kết quả kỹ thuật; ý nghĩa xác nhận và phiên bản rõ; không hiển thị khách đã duyệt mọi nội dung. |
| RV-14 | Thông báo thiếu tên hoặc người xem không có quyền vào hồ sơ. | Nhãn dự phòng dễ hiểu; không lộ dữ liệu ngoài quyền; hành động mở hồ sơ có thông báo phù hợp. |
| RV-15 | Thao tác chéo tenant/customer hoặc ngoài phạm vi chi nhánh. | API từ chối, không chỉ ẩn nút; file, notification và liên kết hồ sơ cũng tuân thủ phạm vi. |

Nghiệm thu hiện tại không yêu cầu thao tác phân công hỗ trợ liên chi nhánh. Khi sửa vùng phân công/phạm vi dữ liệu, vẫn cần xác nhận quy tắc cùng chi nhánh hiện hành không bị phá vỡ.

## 7. Bằng chứng code và tài liệu tham chiếu

Các liên kết dưới đây phục vụ truy vết nhận xét; cần đọc lại khi bắt đầu triển khai nếu baseline đã thay đổi.

- [Equipment repository — dữ liệu danh sách và điều kiện bảo hành](../../apps/asset-service/src/equipment/equipment.repository.ts).
- [Equipment service — cách trả trạng thái bảo hành hiện hành](../../apps/asset-service/src/equipment/equipment.service.ts).
- [Asset schema — Warranty và các trường ngày](../../apps/asset-service/prisma/schema.prisma).
- [Registration service — kiểm tra ngày thực tế](../../apps/asset-service/src/registrations/registration.service.ts).
- [WO DTO — INSPECTION đã có trong danh mục loại](../../apps/workorder-service/src/work-orders/dto.ts).
- [WO service — điều kiện SR ACCEPTED khi tạo WO](../../apps/workorder-service/src/work-orders/work-orders.service.ts).
- [Inventory controller — API confirm-use hiện có](../../apps/inventory-service/src/inventory/inventory.controller.ts).
- [SR DTO — branchId UUID và bộ lọc unallocated](../../apps/service-request-service/src/service-requests/dto.ts).
- [WO event consumer của SR — lưu kết quả và chuyển trạng thái](../../apps/service-request-service/src/events/work-order-events.consumer.ts).
- [Notification event service — xử lý thông báo WO hoàn tất](../../apps/notification-service/src/events/notification-events.service.ts).
- [ADR 0022 — phạm vi chi nhánh và trách nhiệm dịch vụ](../decisions/0022-branch-service-management.md).
- [Bảng rà soát luồng nghiệp vụ trước đó](2026-11-10-business-flow-logic-review.md).

## 8. Các quyết định còn cần thống nhất

1. Chủ sở hữu dữ liệu và contract Part Request/đề nghị trả, bao gồm cấp một phần, từ chối và hủy yêu cầu.
2. Vòng đời khảo sát trước dự toán, phí khảo sát nếu có và cách liên kết với công việc sửa chữa sau đó.
3. Có cần mở quyền SM nhận yêu cầu chưa phân bổ hay giữ Tenant Admin phân bổ; trong lúc chưa chốt tiếp tục dùng quyền hiện hành.
4. Nhu cầu ngày dự kiến và ảnh hưởng đến quy trình bàn giao hiện có.
5. Nội dung, người có thẩm quyền và ngoại lệ của xác nhận hiện trường.
6. Phân công tích hợp Web/Mobile và người nghiệm thu từng luồng nhiều service.

**Mục 11 đã được quyết định hoãn, không nằm trong danh sách cần chốt để bắt đầu các việc trên.** Tài liệu này chỉ cập nhật review và đề xuất; không sửa code sản phẩm, không sửa Mobile và không tự thực hiện commit/merge.

## 9. Theo dõi thực hiện phần Minh

Cập nhật sau lượt triển khai ngày 12/11/2026: xem [bàn giao và kết quả kiểm tra](2026-11-12-minh-review-implementation-handoff.md).

- Task 1.1/1.2: đã bổ sung backend bảo hành danh sách và đọc QR/dossier, có kiểm thử; còn nghiệm thu tích hợp UI của Nguyên.
- Task 1.3: đã xác minh/kiểm thử quy tắc ngày thực tế, soạn thiết kế ngày dự kiến; chưa thêm schema ngày dự kiến.
- Task 1.4: đã soạn [contract đề xuất](../plans/2026-11-12-minh-dates-and-parts-contract-proposal.md); chờ thống nhất với các đầu mối trước triển khai schema/API mới.
- Mục 11 giữ trạng thái hoãn. Những thay đổi trên chưa được commit/merge trong lượt thực hiện.
