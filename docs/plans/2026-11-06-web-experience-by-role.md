# Thiết kế trải nghiệm web theo 8 vai trò — PBL6

Ngày: 06/11/2026. Phạm vi: mở rộng đề xuất sáu trang Service Manager thành toàn bộ
web theo vai trò. Đây là yêu cầu thiết kế để triển khai UI; không phải báo cáo đã
hoàn thành UI/backend hoặc nghiệm thu các chức năng được đề xuất.

Phần đã triển khai và contract còn thiếu được cập nhật riêng tại
[bàn giao UI/backend](2026-11-06-ui-backend-contract-gaps.md).

## 1. Mục tiêu và nguyên tắc

Mỗi người dùng cần biết: việc cần xử lý, hồ sơ liên quan, người đang chịu trách
nhiệm, trạng thái đã xác nhận và hành động tiếp theo trong quyền của mình.

- Một ứng dụng web, ba không gian: quản trị nền tảng, vận hành tenant, cổng khách
  hàng. Trang chủ và điều hướng ưu tiên theo vai trò.
- Doanh nghiệp cung cấp thiết bị là tenant; khách mua thiết bị là customer của
  tenant. Không biến customer thành tenant hoặc mở quyền dữ liệu chéo.
- Dùng tám role có sẵn. Chủ doanh nghiệp thường dùng TENANT_ADMIN; việc duyệt
  nghiệp vụ dịch vụ thuộc SERVICE_MANAGER theo catalog quyền. Nếu tài khoản có
  nhiều role thì hiển thị các công việc được cấp, không tự cấp thêm quyền.
- Danh sách và chi tiết dùng chung component; dữ liệu và hành động theo scope,
  permission và allowedActions. Không nhân bản tám phiên bản cùng một nghiệp vụ.
- Tên/mã/serial là cách tìm và nhận diện; UUID nằm trong API hoặc chi tiết kỹ thuật.
- Trạng thái hiển thị bằng tiếng Việt, có giải thích bước tiếp theo và bên phụ trách.
- Tác vụ chưa có backend phải nêu rõ chưa gửi/chưa lưu. UI không báo thành công giả.
- Dữ liệu minh họa, nếu dùng để duyệt thiết kế, phải được bật chủ động và có nhãn
  liên tục. Không trộn mẫu vào số liệu thật hoặc gửi mutation từ bản minh họa.
- Không mở rộng sang CRM bán hàng, kế toán, thanh toán, procurement, GPS hay HR.

## 2. Platform Admin — quản trị nhà cung cấp SaaS

Mục tiêu: vận hành các doanh nghiệp dùng nền tảng, kiểm soát vòng đời tenant.

| Màn hình | Thông tin và thao tác cần có |
| --- | --- |
| Tổng quan nền tảng | Tenant theo trạng thái; việc quản trị đang chờ; cảnh báo vận hành có nguồn dữ liệu xác định. Không suy diễn doanh thu hoặc mức độ hài lòng từ số tenant. |
| Doanh nghiệp sử dụng | Tìm mã/tên, lọc trạng thái, tạo tenant, xem chi tiết, đổi trạng thái theo API và xác nhận ảnh hưởng. |
| Hồ sơ tenant | Tên/mã, thông tin liên hệ, trạng thái, lịch sử thay đổi và quản trị viên thuộc phạm vi được phép xem. |
| Nhật ký quản trị | Người/thời điểm/hành động/đối tượng/lý do; bộ lọc, chi tiết trước–sau; chờ API nếu chưa có nguồn audit. |
| Thông báo và tài khoản | Thông báo thuộc nền tảng, hồ sơ cá nhân, đăng xuất. |

Không mặc định xem WO, giá, người dùng hoặc hồ sơ khách hàng của các tenant. Các
chức năng hỗ trợ truy cập tenant khác, nếu phát sinh nhu cầu, cần thiết kế quyền
và audit riêng; không tạo nút đăng nhập thay người khác trong đợt UI này.

## 3. Tenant Admin — chủ/quản trị doanh nghiệp cung cấp thiết bị

Mục tiêu: thiết lập tổ chức và giám sát hoạt động dịch vụ của doanh nghiệp.

| Màn hình | Thông tin và thao tác cần có |
| --- | --- |
| Tổng quan doanh nghiệp | Công việc cần chú ý, thiết bị/yêu cầu/WO/bảo trì theo dữ liệu tổng hợp; bấm số mở danh sách đúng bộ lọc; chỉ đọc trong phạm vi quyền. |
| Chi nhánh | Mã/tên, liên hệ, địa chỉ, trạng thái; tạo/sửa theo API. |
| Người dùng | Tìm kiếm, lọc role/trạng thái, mời nhân viên, xem phạm vi, gán role hợp lệ, xử lý trạng thái theo quyền. |
| Vai trò và quyền | Giải thích role cố định, đối tượng được xem và hành động được phép. Không có trình tạo role tùy chỉnh. |
| Khách hàng và thiết bị | Danh mục, hồ sơ khách, địa điểm, thiết bị, model, bảo hành và bàn giao theo quyền. |
| Theo dõi dịch vụ | Đọc yêu cầu, WO, lịch sử/bảo trì và báo cáo. Không mặc định có quyền duyệt SR, xuất kho hay hoàn tất WO. |
| Kho để giám sát | Đọc tồn, tồn thấp và lịch sử thuộc inventory:read; không hiện hành động manage/issue khi không có permission tương ứng. |
| Thông báo và hồ sơ | Nội dung có liên kết đến việc cần xử lý, trạng thái đọc và thông tin tài khoản. |

Không tạo số lợi nhuận/giá vốn kế toán hoặc tỷ lệ SLA khi chưa có dữ liệu/chính sách.

## 4. Service Manager — quản lý dịch vụ

Mục tiêu: quyết định hướng xử lý và chịu trách nhiệm chất lượng dịch vụ sau bán.

| Màn hình | Thông tin và thao tác cần có |
| --- | --- |
| Hàng đợi công việc | Yêu cầu chờ đánh giá, chờ khách bổ sung/duyệt, WO có vấn đề, bảo trì cần chú ý; người phụ trách và bước tiếp theo. |
| Yêu cầu dịch vụ | Tìm tên/mã/thiết bị/khách; phân loại, ưu tiên, lịch sử, trao đổi công khai/nội bộ phân biệt rõ. |
| Đánh giá bảo hành và dự toán | Chính sách đã áp dụng, nguyên nhân, kết luận, lý do, phiên bản dự toán, hạng mục/currency/hiệu lực và trạng thái khách xác nhận. |
| Lệnh công việc | Giám sát, tạo từ nguồn đúng quy trình, phân công/đổi lịch/hủy khi allowedActions cho phép; liên kết SR/Task và Service Report. |
| Hồ sơ khách và thiết bị | Liên hệ, địa điểm, bàn giao, bảo hành, lịch sử sửa/bảo trì, phụ tùng đã xác nhận và lịch sử sửa sai. |
| Model và bàn giao | Cấu hình chính sách model trong phạm vi hiện có, đăng ký thiết bị, lập/gửi bàn giao, xem lý do từ chối và kích hoạt. |
| Bảo trì | Kế hoạch, kỳ đến hạn, task, WO, lịch sử; tạo/sửa/tạm dừng/ngừng theo quy tắc. |
| Nhân sự kỹ thuật và phụ tùng | Tra cứu kỹ năng/trạng thái; đọc kho phục vụ quyết định. Không tự thay quyền nhân viên kho. |
| Báo cáo/thông báo | Số liệu có định nghĩa, khoảng thời gian, nguồn và khả năng truy xuống hồ sơ. |

Chi tiết dịch vụ cần liên kết chuỗi: thiết bị → bàn giao/bảo hành → SR → dự toán →
WO → report → phụ tùng → kết quả. Chưa có kết luận phí không có nghĩa miễn phí.

## 5. Dispatcher — điều phối

Mục tiêu: giao đúng việc cho đúng người và duy trì lịch thực hiện rõ ràng.

| Màn hình | Thông tin và thao tác cần có |
| --- | --- |
| Bảng điều phối | WO chưa phân công, đang chờ nhận, bị từ chối và cần đổi lịch; bộ lọc ngày/chi nhánh/ưu tiên. |
| Lịch thực hiện | Chế độ danh sách/ngày/tuần; lịch dự kiến tách lịch khách đã xác nhận; sự kiện dẫn tới WO. |
| Phân công | Nội dung, địa điểm, kỹ năng cần, kỹ thuật viên phù hợp và thông tin lịch sẵn có; xác nhận trước gửi. |
| Kỹ thuật viên | Tìm tên/mã, lọc chi nhánh/kỹ năng/trạng thái; xem công việc liên quan. BUSY không tự đồng nghĩa quá tải. |
| Chi tiết WO | Liên hệ khách, thiết bị, lịch sử phân công, tiến độ, lý do tạm dừng và thay đổi lịch. |
| Tra cứu/thông báo | Đọc SR/thiết bị/bảo trì trong quyền để điều phối; thông báo nhận/từ chối/thay đổi. |

Cảnh báo xung đột lịch và tải công việc cần nguồn/API xác định. Kéo thả lịch phải
có kiểm tra backend; chưa có API thì UI chỉ cho xem, không giả đã cập nhật.
Dispatcher không duyệt bảo hành/chi phí hoặc thay kỹ thuật viên gửi báo cáo.

## 6. Technician — kỹ thuật viên

Mục tiêu: thực hiện việc được giao với thao tác ngắn, dùng tốt trên điện thoại.

| Màn hình | Thông tin và thao tác cần có |
| --- | --- |
| Công việc của tôi | Hôm nay/sắp tới/chờ nhận/đang làm/lịch sử; lịch, địa điểm, ưu tiên và hướng dẫn tiếp theo. |
| Chi tiết công việc | Vấn đề, thiết bị/model/serial, liên hệ, chính sách/checklist áp dụng, lịch sử liên quan được phép đọc. |
| Cập nhật tiến độ | Nhận/từ chối, di chuyển, bắt đầu, tạm dừng/tiếp tục theo trạng thái và allowedActions; lý do rõ. |
| Phụ tùng theo WO | Đã giao/đã trả/đã xác nhận dùng/chưa đối soát; xác nhận dùng đúng report, xử lý linh kiện cũ; yêu cầu phụ tùng chỉ gửi khi có contract. |
| Báo cáo và ảnh | Vấn đề, nguyên nhân, giải pháp, kết quả, checklist, ảnh/tệp và phần công khai cho khách; xem trước trước gửi. |
| Tra cứu thiết bị/QR | Tìm mã/serial/QR và lịch sử trong scope; QR không mở quyền ngoài tài khoản. |
| Thông báo/hồ sơ | Việc mới, đổi lịch, phản hồi; thông tin và kỹ năng đã được ghi nhận. |

Không gắn nhãn lưu offline/đồng bộ nếu chưa có cơ chế bền vững và xử lý xung đột.
Nếu giữ bản nháp trên máy: phân tách tenant/người dùng, thông báo phạm vi lưu và
không tự gửi lại khi đổi phiên. Mất mạng phải giữ nội dung đang nhập khi có thể.

## 7. Inventory Staff — nhân viên kho

Mục tiêu: giao nhận và giải trình đúng phụ tùng, kể cả hàng hỏng và thao tác treo.

| Màn hình | Thông tin và thao tác cần có |
| --- | --- |
| Công việc kho | Hàng chờ xử lý, tồn thấp, cách ly/chờ kiểm tra và operation cần đối soát; nguồn và người phụ trách. |
| Danh mục phụ tùng | SKU, tên, đơn vị/chính sách số lẻ, trạng thái, thông tin chi tiết và audit. |
| Kho và tồn | Kho/chi nhánh, có thể xuất/cách ly/ngưỡng/thiếu bao nhiêu; tìm kiếm và lịch sử. |
| Nhập/điều chỉnh | Chứng từ/diễn giải, số lượng, loại lý do; correction chọn giao dịch gốc đúng quy tắc. |
| Xuất cho WO | Chọn WO hợp lệ và người nhận, hiển thị tồn/đơn vị; reservation và cùng key khi phục hồi. Người nhận/yêu cầu nhận cần contract nếu chưa có. |
| Trả và kiểm tra | Đúng lần xuất/kho gốc, tình trạng GOOD/DAMAGED/PENDING; release/scrap theo nguồn và lượng chưa xử lý. |
| Sổ giao dịch/đối soát | Before–after, actor, chứng từ, liên kết gốc, xác nhận dùng và lượng chưa đối soát. |
| Phục hồi thao tác | Đã xuất/chưa xuất/chưa xác định, tình trạng đồng bộ, cùng key, retry/abort theo quyền và trạng thái. |

Không tự chuyển hàng mất ngoài công trường thành đã lắp hoặc trừ kho lần hai.
Quy trình chốt mất/hỏng ngoài kho cần quyết định nghiệp vụ riêng trước thực thi.

## 8. Customer Admin — quản trị doanh nghiệp mua thiết bị

Mục tiêu: biết doanh nghiệp mình đã nhận gì, đang được phục vụ ra sao và cần duyệt gì.

| Màn hình | Thông tin và thao tác cần có |
| --- | --- |
| Tổng quan của khách | Việc cần xác nhận, yêu cầu đang mở, lịch đã xác nhận, thiết bị cần chú ý trong customer scope. |
| Thiết bị của doanh nghiệp | Tìm mã/model/serial/địa điểm; hồ sơ, bàn giao, bảo hành, lịch sử dịch vụ và phụ tùng được công bố. |
| Bàn giao chờ xác nhận | Nội dung snapshot, tình trạng, địa điểm, hạn xác nhận; đồng ý/từ chối có lý do theo equipment_handover:respond. |
| Yêu cầu hỗ trợ | Tạo theo thiết bị, mô tả/ảnh/liên hệ; theo dõi và bổ sung thông tin. |
| Chi phí cần xác nhận | Dự toán đúng phiên bản/hạng mục/currency/hiệu lực; đồng ý/từ chối, giữ lịch sử theo cost_estimate:respond. |
| Tiến trình dịch vụ | Ai đang xử lý, đang chờ ai, lịch dự kiến/đã xác nhận, thay đổi và lý do, kết quả sửa công khai. |
| Bảo trì | Kỳ đến hạn, task/lịch sử trong quyền; ghi rõ ngày đến hạn không phải lịch hẹn. |
| Người dùng doanh nghiệp | Mời/quản lý Customer User thuộc customer của mình theo role và scope; không có quyền mời nhân viên tenant hoặc đọc customer khác. |
| Địa điểm/liên hệ/hồ sơ/thông báo | Thông tin được phép xem/sửa và việc cần thực hiện; chức năng sửa mới chờ API nếu hiện chỉ đọc. |

Phản hồi kết quả sửa cần gắn đúng hồ sơ. Nếu cần yêu cầu hỗ trợ tiếp thì ghi nhận
liên kết lần trước; không giả rằng bấm phản hồi là tự mở lại WO đã hoàn tất.

## 9. Customer User — người dùng của khách hàng

Mục tiêu: gửi yêu cầu nhanh và biết khi nào thiết bị được xử lý.

| Màn hình | Thông tin và thao tác cần có |
| --- | --- |
| Trang chủ đơn giản | Tạo yêu cầu, thiết bị trong phạm vi, yêu cầu đang theo dõi, cập nhật mới. |
| Thiết bị/QR | Nhận diện đúng thiết bị, địa điểm, bảo hành công bố và lịch sử dịch vụ được phép đọc. |
| Tạo yêu cầu | Chọn/scan thiết bị, vấn đề, mô tả/ảnh, ảnh hưởng vận hành, liên hệ; hiển thị thông tin chọn để kiểm tra trước gửi. Trường mới cần backend chỉ gửi khi đã có contract. |
| Theo dõi yêu cầu | Tiến trình, lịch đã xác nhận, trao đổi/bổ sung, kết quả công khai, hành động được phép. |
| Địa điểm/hồ sơ/thông báo | Dữ liệu trong scope; dễ mở đúng yêu cầu/thiết bị từ thông báo. |

Customer User không có cost_estimate:respond hoặc equipment_handover:respond theo
catalog hiện hành. Có thể biết đang chờ quản trị khách xác nhận khi được phép
đọc, nhưng không hiện nút duyệt thay Customer Admin. Bảo trì chi tiết theo role
CUSTOMER_ADMIN hiện có; mở rộng cho Customer User cần quyết định quyền riêng.

## 10. Các điểm phát hiện từ web hiện tại

Đối chiếu source local tại `b5f182b`; không đồng nghĩa đã kiểm thử tất cả role.

- Dashboard dùng cấu trúc chung, chưa ưu tiên công việc theo từng vai trò.
- Sidebar customer còn dùng nhóm route danh mục chung `/app/customers`,
  `/equipment`, `/requests`; cần đưa về ngôn ngữ và không gian portal rõ ràng.
- Customer Admin có quyền quản lý người dùng nhưng chưa có màn hình quản lý
  đầy đủ trong portal; việc mời người dùng đang đi qua mục chung.
- Service Manager/Technician có inventory:read trong catalog nhưng điều hướng kho
  hiện chỉ dành Tenant Admin/Inventory Staff. Cần view đọc phù hợp, không mở mutation.
- Tenant Admin có inventory:read, chưa có inventory:manage/issue. Các nút kho
  cần đối chiếu đúng permission thay vì suy luận admin có mọi quyền.
- Dispatcher có route bảo trì nhưng sidebar chưa cung cấp đường vào tương ứng.
- Platform audit/settings đang là trang chưa có chức năng; hồ sơ cá nhân hiện
  được khai báo trong portal, cần đường vào phù hợp cho các nhóm còn lại.
- Lệnh công việc/kỹ thuật viên/bảo trì dùng danh sách đơn giản; history/create
  plan còn nhập ID; trạng thái tiếng Anh và JSON còn xuất hiện ở luồng người dùng.
- Danh mục backend đã có q/chi nhánh/kỹ năng ở Technician và nhiều bộ lọc WO;
  tận dụng trước khi đề xuất API mới. Không suy ra mọi chức năng đang thiếu backend.

## 11. Phân biệt UI triển khai ngay và contract bổ sung

| Nhóm | Cách thực hiện |
| --- | --- |
| Có API hiện hành | Dùng dữ liệu thật, lọc/phân trang server, mutation thật theo permission; giữ xử lý phiên đăng nhập và idempotency. |
| Có dữ liệu nhưng thiếu tên | Resolve qua nguồn có quyền hoặc bổ sung projection; khi lỗi hiển thị chưa xác định, không dựng tên giả. |
| Chỉ thiếu tổng hợp | Đề xuất response thống kê với định nghĩa, scope, thời gian và asOf; không đếm một trang để làm số toàn hệ thống. |
| Chưa có API | UI mô tả rõ/khả năng xem trước hoặc bản nháp cục bộ có nhãn; nút không giả đã gửi. Tài liệu ghi endpoint/payload/permission/error cần bổ sung. |
| Cần quyết định nghiệp vụ | Ví dụ xác nhận lịch, phản hồi kết quả, chốt mất hàng ngoài kho, bảo hành phụ tùng. Ghi câu hỏi/đề xuất, không coi mock UI là quyết định đã được phê duyệt. |

Danh sách contract cần rà riêng: action center; appointment confirmation/change;
technician workload/availability; customer public service summary; scoped actor
names; notifications action links; platform audit. Mỗi contract cần owner, scope,
trạng thái, kiểm tra đồng thời/idempotency và acceptance, không chỉ tên trường.

## 12. Cấu trúc giao diện dùng chung

- Header: tên công việc, mô tả ngắn, một nút chính khi có quyền.
- Chỉ số tóm tắt: có nguồn/định nghĩa; nhấn mở danh sách lọc tương ứng.
- Bộ lọc: tìm kiếm nghiệp vụ, chọn tên, nhãn bộ lọc đang bật, xóa lọc; giữ trên URL.
- Danh sách: bảng desktop, card mobile; trạng thái/ưu tiên/next action dễ nhận diện.
- Chi tiết: thông tin chính, tiến trình, hồ sơ liên quan, lịch sử và thao tác đúng trạng thái.
- Dữ liệu rỗng: phân biệt chưa có dữ liệu và không khớp bộ lọc; hướng dẫn bắt đầu.
- Lỗi: phân biệt thiếu quyền/lỗi tải/phiên hết hạn/kết quả mutation chưa xác định.
- Trợ năng: label thật, keyboard/focus, dialog có tên và đóng được; trạng thái có
  chữ/icon, không chỉ màu; mục tiêu thao tác mobile dễ bấm.
- Riêng tư: customer không nhận note nội bộ, giá vốn, điều chỉnh kho hoặc dữ liệu
  customer khác. Kiểm tra từ API, không chỉ dùng CSS ẩn trường.

## 13. Thứ tự triển khai và nghiệm thu

1. Chuẩn hóa role/route/menu và component chung; lập danh mục API thật vs dự kiến.
2. Hoàn thiện hành trình khách: nhận thiết bị → đọc hồ sơ/bảo hành → gửi yêu cầu →
   bổ sung/duyệt theo role → theo dõi → đọc kết quả/lịch sử.
3. Hoàn thiện Service Manager và Dispatcher để thông tin khách thấy có người xử lý.
4. Hoàn thiện Technician và Inventory, liên kết report/phụ tùng và thao tác lỗi.
5. Hoàn thiện quản trị Tenant/Platform và số liệu dashboard đúng nguồn.

Các nhóm được triển khai theo từng phần, nhưng nghiệm thu phải dùng cùng một hồ
sơ xuyên role. Đây là thứ tự theo phụ thuộc, không cho phép bỏ qua nền tảng quyền
cần thiết ở bước đầu.

Tiêu chí: mỗi role tìm được đúng hồ sơ bằng tên/mã, biết việc cần làm và bên phụ
trách; khách hiểu phí/bảo hành/lịch/kết quả đã xác nhận; người không có quyền bị
từ chối; retry không ghi trùng; lịch sử sửa sai còn nguyên; dữ liệu minh họa và
mutation chưa có backend không bị hiểu là đã lưu. UAT cả desktop/mobile với dữ
liệu có bản ghi, rỗng, lọc rỗng, lỗi mạng và đổi phiên đăng nhập.
