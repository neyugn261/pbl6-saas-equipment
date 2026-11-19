# Rà soát khắt khe toàn hệ thống PBL6 — 12/11/2026

## 1. Kết luận dành cho nhóm

**Hệ thống đã vượt xa một bộ CRUD hoặc giao diện mẫu. Tuy nhiên, chưa đủ căn cứ để gọi là một sản phẩm vận hành hoàn chỉnh và đáng tin cậy.**

Nhóm đã xây dựng được nền nghiệp vụ sau bán hàng khá sâu: phân quyền đa tenant, thiết bị theo serial và địa điểm, chính sách bảo hành/bảo trì có phiên bản, bàn giao, yêu cầu dịch vụ, dự toán, Work Order, báo cáo kỹ thuật, phụ tùng, lịch sử và thông báo. Nhiều đoạn xử lý transaction, khóa dữ liệu, idempotency và cô lập khách hàng được làm nghiêm túc.

Điểm yếu lớn nhất nằm ở **những gì xảy ra giữa các bước và giữa các service**: sự kiện có thật sự tới nơi; tài khoản bị khóa có còn làm việc được; thiết bị đã thanh lý có còn sinh lịch; công việc đã đóng có đủ bằng chứng và đối soát hay chưa; người dùng có thao tác được nghiệp vụ đã có API hay không.

Phát hiện nặng nhất của lượt này: **đã tái hiện bằng RabbitMQ thật việc publish thành công nhưng mất sự kiện khi queue của consumer chưa tồn tại**. Có outbox/inbox và publisher confirm vẫn chưa giải quyết được tình huống này.

### Nhận định khách quan và chủ quan

| Góc nhìn | Nhận định |
|---|---|
| Khách quan từ code và chạy kiểm tra | Có hệ thống nghiệp vụ thật; 569 test Node/Web được chạy trong lượt này đều đạt; lint/typecheck Node/Web và build Web đạt. Đồng thời có lỗi và khoảng trống mô tả bên dưới. |
| Đánh giá kiến trúc chủ quan | Phạm vi và số lượng trạng thái phân tán đang lớn hơn khả năng nghiệm thu hiện tại của nhóm. Một vài phần được thiết kế rất kỹ, nhưng mức độ hoàn thiện giữa các phần không đồng đều. |
| Với tư cách hội đồng đồ án | Có nhiều chất liệu tốt để bảo vệ. Nhưng nhóm cần chứng minh hiểu các cơ chế mình dùng, đặc biệt giới hạn của transaction, event, retry và trạng thái kết thúc. |
| Với tư cách chủ doanh nghiệp | Chưa chấp nhận vận hành thật chỉ dựa vào việc giao diện đẹp và test xanh. Cần biết việc nào thất lạc, ai xử lý, dữ liệu nào chưa đối soát và khôi phục thế nào. |
| Với tư cách khách hàng | Có thể theo dõi hồ sơ, nhưng bằng chứng chấp thuận kết quả, phần việc còn lại, phát sinh chi phí và lịch sử phụ tùng cần hoàn thiện hơn. |

**Không xác nhận một lỗi P0 khai thác trái phép xuyên tenant từ Internet trong lượt này.** Không nên bịa ra “lỗ hổng chí mạng” để làm báo cáo có vẻ khắt khe. Các vấn đề P1 bên dưới đã đủ để ngăn việc tuyên bố hệ thống sẵn sàng vận hành thật.

## 2. Phạm vi, căn cứ và giới hạn

- Baseline: `develop`, commit `4f34fcbb6f81e10cc40a8dd9c01bb67e39239fcc`, sau merge PR #71 và #72. Đây là commit local được kiểm tra; lượt này không thực hiện fetch mới để xác nhận trạng thái remote theo thời gian thực.
- Rà soát cấu trúc toàn monorepo; đọc sâu các đường xử lý quan trọng của 8 service nghiệp vụ, Gateway, thư viện auth/event/service-kit, Web, Mobile và cấu hình triển khai/CI.
- Đối chiếu controller/guard → service → repository/schema → event consumer → điểm gọi từ UI. Quét các nhóm file, SQL động, quyền, thao tác ghi, đường xử lý lỗi và test.
- Đây là **audit theo rủi ro trên toàn hệ thống**, không phải cam kết đã đọc và chứng minh đúng từng dòng generated code, từng migration lịch sử, từng màn hình hay từng tổ hợp trạng thái. Không thực hiện pentest Internet, load test hoặc nghiệm thu đầy đủ bằng trình duyệt/thiết bị thật.
- Tài liệu cũ chỉ dùng để xác định quyết định đã được nhóm chấp nhận; không dùng checklist kế hoạch làm bằng chứng tính năng đã hoàn thành.
- Không sửa mã nguồn sản phẩm, không commit/merge. Mobile chỉ đọc và thử phân tích, không chỉnh mã nguồn.
- Ba file Web đang có sửa đổi local: `OperationsPages.tsx`, `ServiceManagerShell.tsx`, `role-workspace.ts`. Các nhận xét riêng cho chúng được đánh dấu **LOCAL**. Những thay đổi và tài liệu chưa commit có sẵn được giữ lại.

### Mức bằng chứng

- **A — thực nghiệm:** đã chạy trên thành phần thật, có kết quả quan sát.
- **B — kiểm chứng cô lập:** chạy phương thức từ source thật, thay I/O bằng mock; chưa phải E2E DB/HTTP thật.
- **C — phân tích tĩnh:** chỉ ra đường code/cấu hình cụ thể và tình huống dẫn đến vấn đề.
- **D — nhận định sản phẩm:** thiếu khả năng hoặc quy tắc cần chốt; không tự động là lỗi bảo mật.

P1: sửa trước nghiệm thu tương ứng hoặc trước triển khai thực tế. P2: hoàn thiện kế tiếp. P3: cải thiện bảo trì/trải nghiệm. Mức độ có điều kiện được ghi rõ.

## 3. Hệ thống hiện đã làm được gì?

“Có code” trong bảng không đồng nghĩa tất cả luồng đã được nghiệm thu lại trên backend thật ở lượt này.

| Thành phần | Khả năng hiện có | Phần cần nhìn nhận đúng |
|---|---|---|
| Identity | Login theo tenant, access token, refresh rotation/reuse detection, logout/me; mời/kích hoạt tài khoản; role/status; liên kết customer qua projection; email kích hoạt | Chưa có thu hồi access token tức thời trên mọi service; kích hoạt thiếu kiểm tra trạng thái tenant; chưa thấy luồng tự phục hồi mật khẩu hoàn chỉnh trong controller đã rà |
| Organization | Tenant, chi nhánh nội bộ, customer, customer site, location, contact, membership; primary branch; routing theo site | **Đã có xử lý chi nhánh và địa điểm khách hàng.** Phạm vi quyền customer hiện theo doanh nghiệp khách hàng, không phải quyền riêng từng site |
| Asset | Model, thiết bị/serial, customer/site/location; trạng thái vận hành riêng; warranty; QR; history và dossier; registration/bàn giao; snapshot chính sách | GET QR hiện hành và warranty trên danh sách đã có sau PR vừa merge. Cần khép vòng đời RETIRED với Maintenance/WO |
| Bàn giao/chính sách | STORE và CUSTOMER_SITE; bản nội dung gửi khách; customer acceptance; warranty/maintenance policy có version/hash; chống áp chính sách mới vào snapshot đã duyệt | Là điểm mạnh. Còn nhiều đường tạo/cập nhật legacy cần giữ quy tắc nhất quán, không nên mặc định mọi đường đều có cùng mức kiểm soát |
| Service Request | Tạo, xem xét, bổ sung thông tin, đánh giá phạm vi bảo hành; accept/reject/cancel; comments nội bộ/khách; dự toán nhiều phiên bản; confirm/reopen; nhận kết quả WO | Xác nhận thay khách thiếu căn cứ; chưa có quy trình phát sinh sau duyệt đủ rõ; đầu vào sự cố còn thiếu ảnh/tệp do khách tải lên |
| Work Order | Tạo từ yêu cầu/bảo trì, phân công, nhận/từ chối, di chuyển, thực hiện, tạm dừng, hoàn tất/hủy; checklist/version/history; report; attachments và công bố cho khách | Kết thúc kỹ thuật khác với sửa thành công và khách đồng ý. Lịch dự kiến chưa phải lịch hẹn được khách xác nhận |
| Maintenance | Plan/Task, lịch theo ngày gốc, kỳ MONTH/YEAR, thời hạn plan, scheduler, snapshot thiết bị, liên kết WO, replacement request và lịch sử | Lịch không trôi theo ngày hoàn thành là đúng lựa chọn đã chốt. Tạo plan thủ công chưa có business idempotency; trạng thái RETIRED chưa đi hết chuỗi |
| Inventory | Part/warehouse, available/quarantine, nhập/xuất/trả/điều chỉnh; ledger; khóa số lượng; idempotency; reservation WO; confirm-use/reverse; kiểm tra hàng trả; LowStock theo đợt | Backend sâu hơn UI. “Đã cấp”, “chưa trả”, “đã dùng”, “chưa đối soát” đã được phân biệt đúng; chưa đủ thao tác UI để người dùng khép quy trình |
| Notification | Inbox/read/unread; recipient projection có revision; xử lý membership và quyền; pending/reconciliation; fan-out theo event | Không thể coi có notification service là đảm bảo mọi thông báo tới nơi; còn phụ thuộc topology, durability và vận hành broker |
| Gateway/shared | Proxy, chặn internal, CORS, giới hạn login, correlation id, validation, error format, health; auth/scope; outbox/inbox/retry/DLQ | Gateway health mới kiểm tra chuỗi M1. Readiness của chức năng và tình trạng đồng bộ chưa đầy đủ |
| Web | Giao diện Workshop theo role, portal, danh mục, hồ sơ, quyết định, bàn giao, bảo trì, kho, thông báo, quản trị; loading/error/empty, kiểm soát phiên và một số nháp | Các route ứng dụng gọi API thật; `isMockMode=false`. Design studio là môi trường phát triển, không phải bằng chứng backend đã có mọi chức năng mẫu |
| Mobile | Technician: phiên bảo mật, danh sách/chi tiết WO, thao tác công việc, report/nháp, checklist, tải tệp, lịch, thông báo, tra cứu và phụ tùng | Có luồng thật, không chỉ mock. Phụ tùng hiện chủ yếu đọc; chưa nghiệm thu build/test Flutter trong môi trường SDK phù hợp |

## 4. Những điểm nên giữ

1. **Cô lập tenant/customer ở backend.** Guard, `dataScope`, scope repository và kiểm tra association ở dossier là nền tảng đúng. Không có bằng chứng để kết luận toàn hệ thống “chỉ ẩn nút UI để bảo mật”.
2. **Tách coverage với thời hạn bảo hành.** Còn hạn không có nghĩa mọi sự cố được miễn phí.
3. **Snapshot bất biến của nội dung khách đã duyệt.** Đặc biệt model policy và bàn giao; tránh thay đổi chính sách làm biến nghĩa xác nhận cũ.
4. **Khóa số lượng và đối soát kho.** Có transaction, ledger, fingerprint/idempotency, reservation và quy tắc lượng đã trả/đã dùng không vượt lượng xuất.
5. **Không tự hết hạn reservation rồi giải phóng mù.** Giữ trạng thái chưa rõ kết quả để đối soát là lựa chọn an toàn hơn việc giả định thất bại.
6. **Consumer có xử lý trùng và thứ tự.** SR có lifecycle receipt, conflict và khóa request; Notification có revision/pending. Các cơ chế này có giá trị dù vẫn còn rủi ro hạ tầng event.
7. **Attachment có kiểm tra byte/checksum, giới hạn đọc, quyền và cleanup.** Không kết luận upload đang đọc vô hạn vào RAM: code đã chặn kích thước khi đọc stream.
8. **Web/Mobile tránh tự gửi lại mutation khi kết quả chưa rõ.** Đây là phần nên phát huy, rồi bổ sung idempotency ở backend cho các lệnh còn thiếu.
9. **Phạm vi sản phẩm phù hợp after-sales.** Không cần thêm ERP, kế toán, thanh toán, GPS hay AI để đồ án có giá trị.

## 5. Các vấn đề ưu tiên cao

### F01 — P1: Publish thành công nhưng sự kiện mất trước lần consumer đầu tiên khởi động

**Bằng chứng A + C.** [Rabbit transport](../../packages/event-contracts/src/rabbitmq.ts#L117), [publish](../../packages/event-contracts/src/rabbitmq.ts#L164), [relay đánh dấu PUBLISHED](../../packages/event-contracts/src/relay.ts#L136), [Identity publisher](../../apps/identity-service/src/events/outbox-publisher.ts).

- Bus chỉ đợi các subscription **của chính instance đó** được bind. Publisher riêng của Identity không đăng ký subscription nào.
- `publish()` dùng confirm/persistent nhưng không có `mandatory`/return handler hoặc cơ chế chứng minh tất cả consumer bắt buộc đã có queue.
- Khi exchange mới chưa có queue tương ứng, broker vẫn xác nhận publish. Relay sau đó đánh dấu PUBLISHED.
- Consumer tạo queue về sau không nhận lại sự kiện đó.

**Thực nghiệm đã chạy:** exchange và queue có UUID riêng, không đụng queue nghiệp vụ. Gửi event trước binding → promise thành công → tạo queue/bind → không có event đầu. Gửi event thứ hai → nhận được event thứ hai. Tài nguyên thử đã được dọn.

**Hậu quả:** tenant/customer projection thiếu; recipient bootstrap thiếu; maintenance task không có WO; lịch sử thiếu. Retry consumer không cứu được một event chưa từng vào queue.

**Sửa:** bootstrap topology bắt buộc trước producer; danh mục queue/binding thống nhất và readiness thực sự; xử lý unroutable message; thêm khả năng replay/reconcile có kiểm soát. Chỉ thêm `mandatory=true` **chưa đủ**: một event đã vào queue A vẫn có thể thiếu queue B, broker không biết B là consumer bắt buộc.

**Nghiệm thu:** database/broker mới, producer chạy trước consumer; lần lượt trì hoãn Identity, Notification, Maintenance và WO; mọi projection cuối cùng phải đầy đủ, không có event nghiệp vụ biến mất.

### F02 — P1 khi tái tạo broker: RabbitMQ chưa có volume bền vững được khai báo

**Bằng chứng C.** [Compose demo](../../compose.demo.yml#L48), [Compose phát triển](../../docker-compose.yml).

PostgreSQL/MinIO có named volume; RabbitMQ không có mount dữ liệu bền vững được quản lý trong Compose. Không thể dựa vào queue `durable`/message `persistent` để đảm bảo dữ liệu còn sau khi xóa và tạo lại container hoặc mất storage của broker. Anonymous volume nếu image tạo ra cũng không phải chiến lược khôi phục ổn định của dự án.

**Hậu quả:** DB còn nghiệp vụ và outbox PUBLISHED nhưng queue đang chờ xử lý đã mất. Đây là mất tính nhất quán khó nhìn thấy, không chỉ mất vài notification.

**Sửa:** named volume cho dữ liệu RabbitMQ, node identity/hostname ổn định, backup/restore và bài kiểm tra khôi phục; kết hợp F01 để tạo lại topology và replay cần thiết. Không chạy thử `down -v` trên môi trường có dữ liệu để chứng minh lỗi.

**Giới hạn:** chưa phá/recreate broker có dữ liệu để kiểm chứng; đây là nhận xét cấu hình, không khẳng định đã xảy ra mất dữ liệu của nhóm.

### F03 — P1: Kích hoạt tài khoản có thể cấp token khi tenant đã bị khóa

**Bằng chứng B + C.** [activateAccount](../../apps/identity-service/src/users/users.service.ts#L222), [tạo phiên ngay sau activation](../../apps/identity-service/src/users/users.service.ts#L264), [ghi activation](../../apps/identity-service/src/users/users.repository.ts#L510).

Luồng kiểm tra token mời, hạn dùng và trạng thái INVITED rồi kích hoạt/cấp phiên. Không kiểm tra tenant hiện còn ACTIVE như `login()`/`refresh()`.

**Tình huống:** mời tài khoản → khóa tenant → người được mời mở link còn hiệu lực → activation vẫn trả access token mới. Kiểm chứng cô lập bằng phương thức thật cho thấy không gọi tenant lookup và cấp token TENANT_ADMIN. Repository activation đã đọc cũng không có chốt kiểm tra tenant.

Web gọi `/auth/me` sau activation có thể phát hiện và dừng UI, nhưng một client gọi API trực tiếp vẫn giữ token. Các API chỉ dùng shared verifier không tự kiểm tra trạng thái tenant.

**Sửa:** chốt điều kiện tenant/account khi activation và trước cấp session; tránh token mời cũ vượt quyết định khóa. Kiểm thử đồng thời activation–suspend và tài khoản platform không có tenant. Nên dùng quy tắc cấp phiên chung thay vì ba đường login/refresh/activation tự kiểm tra khác nhau.

**Giới hạn:** đây là service-level probe với mock persistence, chưa phải HTTP/DB E2E hoàn chỉnh.

### F04 — Rủi ro bảo mật đã được thiết kế chấp nhận: Thu hồi phiên/quyền chưa có hiệu lực tức thời

**Bằng chứng B + C; P2 với MVP, P1 nếu sản phẩm cam kết khóa tức thời.** [verifier](../../packages/auth/src/verifier.ts#L19), [auth module](../../packages/auth/src/auth.module.ts), [me](../../apps/identity-service/src/auth/auth.service.ts#L193), [ADR 0004](../decisions/0004-service-auth-and-authorization.md).

Đã kiểm chứng: `/auth/me` logic từ chối phiên revoked, nhưng cùng access token vẫn qua shared verifier và giữ quyền `equipment:manage`. Đây **không phải lỗi mới trái ADR**: ADR chủ động chấp nhận revocation trễ tới lần refresh.

Tuy nhiên cần nói chính xác với người dùng:

- Logout/khóa tài khoản/đổi role/gỡ customer membership không đồng nghĩa mọi token cũ mất quyền ngay.
- TTL mặc định 900 giây, nhưng cấu hình Identity cho phép tới 3600 giây; không được luôn quảng bá giới hạn 15 phút nếu deploy đổi cấu hình.
- Branch guard tra primary branch không phải kiểm tra session/account đang ACTIVE. Tenant Admin còn bypass branch lookup theo thiết kế.
- Notification có kiểm tra recipient snapshot riêng; không nên khẳng định mọi endpoint có hành vi giống nhau.

**Sửa vừa sức:** định nghĩa SLA thu hồi; áp session/security version hoặc introspection/cache có TTL cho thao tác nhạy cảm; thu hồi phiên khi thay đổi quyền phù hợp; UI nêu đúng hiệu lực. Không nhất thiết xây hệ thống authorization mới.

### F05 — P1 nghiệp vụ: RETIRED chưa dừng đầy đủ công việc tương lai

**Bằng chứng B + C.** [Asset patch](../../apps/asset-service/src/equipment/equipment.repository.ts#L429), [event chỉ phát khi moved](../../apps/asset-service/src/equipment/equipment.repository.ts#L504), [Maintenance subscriptions](../../apps/maintenance-service/src/events/events.service.ts#L36), [scheduler](../../apps/maintenance-service/src/scheduler/scheduler.service.ts#L63), [WO create](../../apps/workorder-service/src/work-orders/work-orders.service.ts#L52).

- Tạo plan mới chặn thiết bị RETIRED, nhưng chuyển thiết bị đang có plan sang RETIRED không có event vòng đời tương ứng để dừng plan.
- Scheduler dựa trên plan ACTIVE và snapshot địa điểm; snapshot không mang trạng thái thiết bị để ngăn sinh task.
- WO tạo từ SR kiểm tra SR ACCEPTED và quan hệ equipment/customer, không kiểm tra `equipment.status` trong resolver. Probe đã cho resolver đi qua với thiết bị RETIRED.

**Tình huống:** thiết bị có plan và SR đã ACCEPTED → thanh lý thiết bị → lịch vẫn có thể tạo Task/WO, hoặc SM tạo WO từ SR cũ. Người dùng thấy hệ thống điều phối bảo trì cho máy không còn phục vụ.

**Sửa:** chốt hành vi RETIRED: ngừng kỳ chưa sinh, chặn công việc mới, lập danh sách công việc đang mở cần xử lý; phát event lifecycle có version; consumer idempotent; giữ lịch sử cũ. Không tự xóa lịch sử hoặc tự hủy mọi WO đang thực hiện.

### F06 — P1 về tính minh bạch: Đóng yêu cầu thay khách thiếu bằng chứng

**Bằng chứng C + D.** [confirm](../../apps/service-request-service/src/service-requests/service-requests.service.ts#L1542), [quyền xác nhận](../../apps/service-request-service/src/service-requests/service-requests.service.ts#L1860), [UI closeout](../../apps/web/src/features/workspace/RequestCloseoutSummary.tsx).

SM có quyền review được xác nhận yêu cầu RESOLVED thành CLOSED. Dữ liệu ghi người thao tác/thời gian, nhưng không có người khách đồng ý, kênh xác nhận, lý do làm thay, căn cứ hoặc phạm vi nội dung được chấp nhận.

Không gọi đây là vượt quyền: backend hiện chủ động cho phép. Vấn đề là **“ai bấm nút” chưa chứng minh “khách đã đồng ý điều gì”**.

`PARTIALLY_RESOLVED` có thể đưa request sang RESOLVED rồi CLOSED; UI có nhắc phần còn lại, nhưng nhắc bằng chữ không thay thế snapshot nghiệm thu, phần chưa xong và kế hoạch xử lý tiếp.

**Sửa:** tách `CUSTOMER_SELF`/`STAFF_ON_BEHALF`; lưu actor, người xác nhận, kênh, thời gian, lý do/căn cứ và version kết quả. Với một phần: ghi rõ tồn tại, trách nhiệm, có tiếp tục xử lý hay chấp thuận kết thúc ở phạm vi nào. Không bắt toàn bộ trường hợp partial phải thất bại; cần quy tắc minh bạch.

### F07 — P1 về hoàn chỉnh luồng: Có API xác nhận phụ tùng nhưng chưa có đường thao tác UI

**Bằng chứng C.** [Inventory controller](../../apps/inventory-service/src/inventory/inventory.controller.ts#L255), [confirmUse](../../apps/inventory-service/src/inventory/inventory.service.ts#L309), [Web Inventory](../../apps/web/src/features/inventory/InventoryPages.tsx), [Mobile JobParts](../../apps/mobile/lib/features/workspace/job_parts.dart).

Backend có confirm-use, reverse và inspect hàng trả. Khi tìm điểm gọi trong toàn `apps/web/src` và `apps/mobile/lib`, không thấy client gọi các route confirm-use/usage-confirmations/inspect tương ứng. JobParts hiển thị dữ liệu và lịch sử; không có hành động xác nhận dùng. Trang giao dịch Web có nhập/xuất/trả/điều chỉnh và recovery nhưng chưa khép các thao tác trên.

**Hậu quả:** kỹ thuật viên hoàn thành report nhưng không ghi được đã dùng linh kiện nào qua ứng dụng; lịch sử phụ tùng thiết bị chỉ nhận xác nhận dùng nên có thể rỗng dù ngoài đời đã thay. Hàng trả cách ly cũng thiếu đường kiểm tra/giải phóng trên UI đã rà.

**Sửa:** ưu tiên Web cho Technician và kho; bàn giao Mobile theo owner, không tự sửa Mobile trong lượt này. Form phải có quantity, report, lý do công bố cho khách, xử lý linh kiện tháo ra, trạng thái chưa rõ kết quả và idempotency. Không cho SM hoặc kho tự giả danh kỹ thuật viên.

**Trình tự bắt buộc giữ đúng:** confirm-use hiện yêu cầu report/WO COMPLETED. Không chặn WO hoàn tất vì chưa confirm-use, sẽ tạo vòng chờ. Có thể đặt bước đối soát trước **khép hồ sơ dịch vụ**, sau hoàn tất kỹ thuật.

### F08 — P1 trong tình huống lệch đồng bộ: SR đã hủy, WO đang thực hiện chỉ được ghi warning

**Bằng chứng C, chưa chạy race E2E.** [SR cho staff hủy ACCEPTED](../../apps/service-request-service/src/service-requests/service-requests.service.ts#L61), [consumer cancellation](../../apps/workorder-service/src/events/service-request-events.consumer.ts#L75), [inbox](../../packages/event-contracts/src/inbox.ts).

Luồng phổ biến đã có bảo vệ: SR PROCESSING phải hủy WO trước; consumer tự hủy WO ở CREATED/ASSIGNED/ACCEPTED. Không nên nói dự án hoàn toàn chưa có consumer hủy.

Khoảng trống còn lại: event WO Created trễ, SR vẫn ACCEPTED trong khi WO đã TRAVELLING/IN_PROGRESS/ON_HOLD; staff hủy SR. Khi cancellation consumer nhận, nhánh đang thực hiện chỉ `logger.warn` rồi kết thúc handler. Inbox commit/transport ack; không có hồ sơ ngoại lệ bền vững hoặc người nhận trách nhiệm ở nhánh này.

**Hậu quả:** khách nhìn yêu cầu đã hủy, kỹ thuật viên vẫn có công việc; cảnh báo chỉ nằm trong log. Nếu có inventory hold, việc hủy còn có thể retry rồi vào DLQ và cần vận hành xử lý.

**Sửa:** lưu conflict/attention record có liên kết SR/WO và owner; tạo notification và màn hình xử lý; chốt `cancel requested`/reservation hoặc quy tắc phối hợp phù hợp. Không hủy mù công việc đang sửa ngoài hiện trường.

### F09 — P1 có điều kiện triển khai: Mailpit chứa link activation đang mở cổng ra ngoài

**Bằng chứng C; chưa kiểm thử truy cập từ Internet.** [Compose Mailpit](../../compose.demo.yml#L61), [Identity SMTP](../../compose.demo.yml#L132), [nội dung mail](../../apps/identity-service/src/users/activation-delivery.worker.ts).

`DEMO_MAILPIT_PORT:8025` không bind `127.0.0.1`; Compose không khai báo xác thực giao diện mail. Identity gửi link kích hoạt vào Mailpit. Nếu máy demo/VPS cho người khác truy cập cổng này, hộp thư thử có thể để lộ link kích hoạt tài khoản mới.

Đây là **rủi ro nghiêm trọng khi đem cấu hình demo lên môi trường dùng chung**, không phải khẳng định máy hiện tại đã bị truy cập hay bị chiếm tài khoản.

**Sửa:** bind localhost hoặc đưa sau xác thực/mạng riêng; không dùng mail catcher công khai cho người dùng thật; kiểm tra TLS/public URL/firewall khi triển khai. Tương tự, `docker-compose.yml` phát triển có cổng hạ tầng và mật khẩu mẫu, không được dùng nguyên trạng làm cấu hình public.

## 6. Các vấn đề tiếp theo cần sửa

| Mã | Mức / bằng chứng | Vấn đề và lý do | Hướng triển khai vừa sức |
|---|---|---|---|
| F10 | P2 / C | [Tạo Maintenance Plan thủ công](../../apps/maintenance-service/src/plans/plans.repository.ts#L144) luôn tạo row mới; DTO/controller create không nhận business idempotency key. Khóa theo equipment không chống hai lần submit cùng ý định. UI chỉ khóa trong phiên form; reload rồi tạo lại sau timeout vẫn có thể trùng | Key + fingerprint + replay response cho create. Không dùng unique equipment để chặn mọi plan: một máy có thể có nhiều hạng mục bảo trì hợp lệ |
| F11 | P2 / C | [Gateway health](../../apps/api-gateway/src/health/health.controller.ts) chỉ kiểm tra Identity/Organization/Asset/SR. Có thể báo OK khi WO/Maintenance/Inventory/Notification không dùng được; liveness không thể đại diện độ trễ event | Tách live/ready, báo dependency và đồng bộ theo chức năng; thêm outbox oldest age, failed count, DLQ/pending conflict; không đưa dữ liệu nhạy cảm vào endpoint public |
| F12 | P2 / C | [Presigned PUT](../../apps/workorder-service/src/attachments/s3-attachment.storage.ts#L69) ký content-type, chưa ràng buộc kích thước upload ở storage. API có giới hạn 10 slot/parent và đọc stream tối đa 10 MiB, nhưng file quá lớn vẫn có thể tới staging trước khi complete bị từ chối | Ràng buộc size tại upload gateway/storage policy, quota và lifecycle staging. Không kết luận hiện có lỗi OOM vì read đã giới hạn |
| F13 | P2 hardening / C | [Compose](../../compose.demo.yml#L128) dùng chung tài khoản DB `pbl6` cho các service; [bootstrap](../../infrastructure/postgres/init.sql) chỉ tạo DB, không tạo role riêng. HS256 cũng dùng chung signing secret theo ADR | Separate runtime DB role cho từng DB, tách migration role; cân nhắc asymmetric JWT. Một service bị chiếm không nên có quyền toàn DB và ký token cho cả hệ thống. Đây không phải bằng chứng service đang truy vấn chéo DB |
| F14 | P2 / C + D | Dự toán có version/approve nhưng chưa có luồng đầy đủ “phát sinh khi đang sửa → khách duyệt → thực hiện → đối chiếu khép hồ sơ”. [Closeout UI](../../apps/web/src/features/workspace/RequestCloseoutSummary.tsx) hiện chủ yếu nhắc đối chiếu | Một bổ sung phạm vi có version, lý do, chấp thuận; liên kết với report/phụ tùng. Không xây hóa đơn/kế toán ngoài phạm vi |
| F15 | P2 / C + D | [Report summary](../../apps/workorder-service/src/reports/reports.repository.ts#L16) đếm created/completed. COMPLETED có cả RESOLVED/PARTIALLY_RESOLVED/UNRESOLVED nên số hoàn tất không nói lên sửa thành công | Tách khối lượng, kết quả kỹ thuật, tuổi hồ sơ, reopen và chờ khách. Mỗi KPI có mẫu số/khoảng thời gian và hạn chế; không gọi là hài lòng khách khi chưa đo |
| F16 | P2 / D | Chưa có chủ trách nhiệm dịch vụ riêng cho từng case; “Cần tôi xử lý” chủ yếu là nhóm trạng thái/quyền. Nhiều SM có thể cùng nghĩ người khác đang làm | Owner case, thời điểm nhận, next action, reason blocked và chuyển trách nhiệm có lịch sử; không cần tạo role mới |
| F17 | P2 / C + D | Có skill/profile và scheduledStart/End, nhưng phân công chưa kiểm tra lịch giao nhau hoặc năng lực bắt buộc. [Workflow assign](../../apps/workorder-service/src/work-orders/workflow.service.ts) cho AVAILABLE/BUSY và cùng branch | Cảnh báo trùng lịch/tải công việc, khuyến nghị skill; nếu cho override cần lý do. Không cần GPS/tối ưu tuyến đường |
| F18 | P2 / C + D | Có bảng RequestAttachment trong schema nhưng các route attachment SR đã rà chỉ phục vụ **kết quả WO công bố**. Form request chưa có luồng tải ảnh sự cố của khách | Ảnh/tệp đầu vào có scope theo request/customer, giới hạn loại/dung lượng và quyền; phân biệt ảnh sự cố với bằng chứng kỹ thuật |
| F19 | P2 / D | Customer có nhiều site nhưng membership theo customer. Một customer user có thể làm việc trên hồ sơ cùng doanh nghiệp khách hàng theo quyền hiện tại | Chốt rõ người dùng được đại diện toàn công ty hay từng site. Chỉ thêm site scope nếu nhu cầu thực tế yêu cầu; không gọi dữ liệu cùng customer là cross-tenant leak |
| F20 | P2 trước vận hành / C | Chưa tìm thấy script backup/restore và bài diễn tập phục hồi trong scripts/infrastructure đã quét. DB, object storage, broker cần cùng kế hoạch phục hồi | Runbook backup, restore vào môi trường riêng, xác minh tệp/ledger/projection; thống nhất RPO/RTO đơn giản. Có volume không phải có backup |
| F21 | P2 / LOCAL | Diff local bỏ menu phân bổ chi nhánh và BranchScopeNotice; bỏ một số thông tin kết thúc kỳ bảo trì. Route phân bổ vẫn có trong App.tsx | Review riêng trước commit: khôi phục đường vào chức năng cần thiết hoặc cung cấp đường thay thế. Không kết luận remote đã mất chức năng |
| F22 | P3 / C | Service Request service rất lớn; App.tsx và OperationsPages/InventoryPages gom nhiều màn hình/nghiệp vụ; nhiều Row/Record và ép kiểu làm giảm khả năng phát hiện lệch API bằng typecheck | Tách theo use case, API types dùng chung/generated, typed state; ưu tiên vùng đang sửa. Không rewrite toàn hệ thống chỉ để đẹp code |

## 7. Người dùng còn thiếu gì để dùng thuận tiện và tin tưởng?

| Người dùng | Hiện đáp ứng | Chỗ chưa đạt | Tiêu chí hoàn thành |
|---|---|---|---|
| Platform Admin | Tenant, mời/quản lý Tenant Admin | Khóa tenant chưa xuyên suốt; quan sát đồng bộ/khôi phục còn thiếu | Activation không vượt suspension; thấy health chức năng và việc lỗi; không cần truy cập dữ liệu khách tùy tiện |
| Tenant Admin/chủ doanh nghiệp | Quản trị người/branch, tổng quan, routing | Báo cáo chất lượng chưa đủ; chưa rõ quyền “đã thu hồi có hiệu lực khi nào”; LOCAL menu phân bổ bị ẩn | Phân bổ được hồ sơ chưa có branch; xem đúng tồn đọng/chất lượng và trách nhiệm |
| Service Manager | Reception, coverage, estimate, WO, dossier | Chủ case, căn cứ đóng thay, phát sinh, ngoại lệ hủy và retired | Trả lời được ai đang xử lý, vì sao chờ, khách đã đồng ý gì và còn nghĩa vụ nào |
| Dispatcher legacy | Vẫn có quyền tương thích một phần | Không nên tiếp tục mở rộng một role mà quy trình mới đã gộp về SM; UI còn vài nhãn “phối hợp Dispatcher” | Nhãn và hướng dẫn nhất quán với role hiện hành; account legacy vẫn có đường chuyển đổi |
| Technician | WO/report/checklist/attachments/lịch; mobile có nháp và xử lý gián đoạn | Xác nhận phụ tùng đã dùng qua UI; lịch chồng; thông báo reservation trên Mobile còn bị gom thành lỗi công việc thay đổi | Hoàn tất kỹ thuật → ghi nhận vật tư → người tiếp theo đối soát; có cách phục hồi khi mất mạng |
| Inventory Staff | Nhập/xuất/trả/ledger/recovery | Inspect/reverse qua UI; nhu cầu đề nghị vật tư và bàn giao vật tư chưa thành flow hoàn chỉnh | Biết ai cần gì, đã giao gì, ai nhận, phần nào dùng/trả/cách ly; không phải gọi API thủ công |
| Customer Admin | Duyệt dự toán/bàn giao, xem thiết bị/site, quản lý user | Phát sinh sau duyệt, nghiệm thu đúng version, phần việc chưa hoàn tất | Hiểu và xem lại chính xác nội dung đã đồng ý; phân biệt xác nhận của mình với nhân viên làm thay |
| Customer User | Tạo/theo dõi request, comments, thiết bị và kết quả | Ảnh sự cố, liên hệ tại điểm lắp đặt, lý do chờ dễ hiểu; quyền đại diện từng site cần chốt | Gửi đủ thông tin, biết cần làm gì tiếp theo và khi nào được cập nhật |

### Những nhầm lẫn nghiệp vụ phải tránh

- Branch của vendor và Customer Site là hai khái niệm khác nhau; không cần biến mỗi site khách thành tenant.
- WO COMPLETED không đồng nghĩa máy đã sửa thành công, cũng không chứng minh máy đang hoạt động hay khách đã nghiệm thu.
- Số lượng đã xuất chưa trả không đồng nghĩa đã tiêu hao.
- Lịch bảo trì theo ngày không phải cuộc hẹn có giờ đã được khách đồng ý.
- Có lịch sử tổng hợp không có nghĩa lịch sử đầy đủ nếu event chưa tới hoặc thiếu thao tác ghi nhận.
- `200` hoặc “đã lưu” không đủ để kết luận toàn bộ service liên quan đã đồng bộ.
- Không nên bắt buộc xác nhận dùng phụ tùng trước report khi API hiện yêu cầu report hoàn tất trước.
- Không đưa yêu cầu hỗ trợ chéo chi nhánh đã được nhóm hoãn thành lỗi bắt buộc phải làm của đợt này.

## 8. Đánh giá kỹ thuật khắt khe

### 8.1 Kiến trúc: tốt về ý thức, còn thiếu bằng chứng vận hành

Database per service, outbox/inbox, event version, row/advisory locks và reservation là những quyết định có cơ sở. Nhưng hệ thống phân tán có chi phí thật: topology, replay, chậm đồng bộ, trạng thái không chắc chắn, tính sẵn sàng và quản lý khóa.

F01 là ví dụ rõ nhất: từng thành phần nhìn đúng riêng lẻ nhưng toàn luồng vẫn mất dữ liệu. **Nhóm phải chứng minh invariant xuyên service, không chỉ trình bày tên công nghệ.**

Không đề xuất bỏ microservices giữa chừng. Nên đóng băng mở rộng và hoàn thiện ba luồng quan trọng: bàn giao → phục vụ; yêu cầu → WO → kết quả → khách xác nhận; xuất → dùng/trả → đối soát.

### 8.2 Bảo mật: có nền, chưa phải chứng nhận an toàn

JWT giới hạn algorithm/issuer/audience, backend scope, forbidden internal, tách nội dung nội bộ và public là điểm tốt. Chưa tái hiện SQL injection/IDOR xuyên tenant trong phần đã kiểm tra; tên `queryRawUnsafe` không tự chứng minh SQL injection vì nhiều chỗ dùng tham số ràng buộc.

Rủi ro rõ nằm ở activation, thời gian hiệu lực thu hồi, cấu hình demo công khai, phạm vi credential và khả năng lạm dụng upload storage. Không có căn cứ để nói “hệ thống không có bảo mật”, nhưng cũng không thể tuyên bố “an toàn đa tenant” chỉ vì có trường tenantId.

### 8.3 Chất lượng mã: đang có dấu hiệu chi phí bảo trì tăng

Các file tập trung quá nhiều hành vi làm review khó; dịch vụ tự lặp việc chuyển trạng thái/xử lý scope có thể lệch nhau. Ba đường cấp session là một ví dụ thực tế. Web còn các lớp UI cũ, sample và design studio; dù runtime đã tách, nhóm cần biết thành phần nào dùng thật để không sửa nhầm.

Ưu tiên refactor nhỏ tại phần sửa lỗi, không tạo lớp abstraction lớn trước khi chứng minh nhu cầu.

### 8.4 Kiểm thử: nhiều và có giá trị, nhưng chưa bao phủ rủi ro quan trọng nhất

Test unit/policy, HTTP với fake và DB integration có vai trò khác nhau. Web có cả kiểm tra source và mô phỏng component/state; không được xem chúng là bằng chứng click thật, layout đúng, bàn phím/a11y đúng hoặc trải nghiệm người dùng tốt.

CI có khai báo nhiều gate và integration thực sự, không phải “không có CI”. Tuy nhiên, ngoại lệ merge do billing/review ở các PR trước không tạo ra một kết quả CI đạt cho commit hiện tại. Lượt này không kiểm tra lại billing GitHub theo thời gian thực.

Cần thêm test lỗi ranh giới, đặc biệt fresh broker, activate–suspend, retire–scheduler, cancel–event delay, mất response, chuyển branch/role khi còn việc tồn và phục hồi backup.

## 9. Kiểm tra đã thực hiện trong lượt này

| Kiểm tra | Kết quả | Giới hạn |
|---|---|---|
| `pnpm lint` | PASS | Các package Node/Web theo script repo; không bao gồm Flutter |
| `pnpm typecheck` | PASS | Có build packages/Prisma generate theo script; không chứng minh đúng runtime |
| Test 8 backend + Gateway + auth/service-kit/testing + Web | 540 PASS | Không phải toàn bộ DB/E2E; chạy script `test` của các package được chọn |
| Event contracts unit, loại riêng `rabbitmq.integration` | 29 PASS | Không cộng thành full suite Rabbit integration |
| Tổng test Node/Web trên | **569 PASS** | Không cộng ba probe hoặc test từ lượt trước vào số này |
| `pnpm --filter web build` | PASS | Có cả ba file Web local chưa commit |
| Probe thu hồi phiên | Tái hiện `/me` từ chối, verifier vẫn chấp nhận token | Service/mock + shared verifier thật; đúng trade-off ADR |
| Probe activation tenant | Tái hiện không lookup tenant, vẫn cấp token | Service source thật + mocked persistence |
| Probe WO với equipment RETIRED | Resolver vẫn cho đi qua | Không chạy INSERT DB thật |
| Probe producer trước consumer trên RabbitMQ thật | **Tái hiện mất event đầu dù publish thành công** | Exchange/queue thử riêng; không chạy toàn hệ thống |
| `flutter analyze --no-pub` | Không dùng làm kết luận lỗi source | Package config/dependency local chưa dùng được; phát sinh nhiều lỗi import dây chuyền |
| `flutter pub get --offline --enforce-lockfile` | Không thực hiện được | Dart cục bộ 3.12.2, dự án yêu cầu `^3.13.3`; không nâng SDK/đổi lockfile |
| Full DB suite / full E2E / browser / Android thật / load / restore | **CHƯA CHẠY trong lượt này** | Cần nghiệm thu riêng, không báo đạt thay cho nhóm |

Script probe và log cục bộ nằm trong `tmp/audit-20261112-*` (thư mục bị Git ignore). [Bản bằng chứng tóm tắt có thể bàn giao](2026-11-12-system-audit-evidence.txt) ghi lệnh, kết quả và giới hạn. Không chứa credential thật.

Docker Desktop và container RabbitMQ phát triển đã được khởi động để chạy probe. Không reset/seed DB; không tiêu thụ queue nghiệp vụ; exchange/queue thử đã dọn. Không thay đổi source Mobile.

## 10. Hướng xử lý đề xuất, theo thứ tự

Owner bên dưới là đề xuất theo phạm vi service đang sử dụng trong nhóm; cần owner review đối với hợp đồng dùng chung.

| Thứ tự | Công việc | Đầu mối | Điều kiện nghiệm thu |
|---|---|---|---|
| 1 | F01 topology/publish/reconcile và F02 persistence Rabbit | Shared infrastructure/Member D + mọi consumer owner | Fresh start không mất event; recreate broker có quy trình phục hồi; không chỉ test happy path |
| 2 | F03 activation và chốt SLA F04 revocation | Identity/Member D | Tenant khóa không cấp session mới; thử khóa/đổi role/membership với token còn hạn; tài liệu/UI nói đúng hiệu lực |
| 3 | F05 retired lifecycle | Minh (Asset/Maintenance) + Khương (WO) | Retire chặn việc mới; kỳ tương lai dừng theo quy tắc; WO đang mở hiện rõ cho người chịu trách nhiệm; không xóa lịch sử |
| 4 | F07 confirm-use/inspect/reverse UI | Hatsady/Web + owner Mobile; Minh cung cấp contract | User thực hiện được trên UI đúng quyền; confirmed parts xuất hiện trong dossier; return/confirm cạnh tranh không vượt số lượng |
| 5 | F06 nghiệm thu/đóng thay + F14 phát sinh | Huy/SR + Khương/report + Web; Minh hỗ trợ lịch sử/phụ tùng | Khách xem được snapshot đã duyệt; partial có phần còn lại; proxy confirmation có bằng chứng |
| 6 | F08 ngoại lệ hủy và đối soát sự kiện | Huy/SR + Khương/WO + Notification | Không chỉ có log; có case lỗi bền vững, owner và đường xử lý đúng quyền |
| 7 | F09/F12/F13 cấu hình deploy và hardening vừa đủ | Infrastructure + Identity/WO | Mail catcher không công khai; DB/runtime credential được giới hạn; upload không vượt quota staging |
| 8 | F10 idempotency plan và review F21 diff local | Minh + Web | Retry cùng ý định chỉ có một plan; chức năng branch allocation và thời hạn plan vẫn tìm được |
| 9 | Owner case, lịch, ảnh sự cố, báo cáo chất lượng | Owner từng domain + Web/Mobile | Hoàn thành một hành trình người dùng, không chỉ bổ sung cột hoặc endpoint |
| 10 | Test tích hợp lỗi + demo + restore | Cả nhóm | Có checklist bằng chứng, môi trường riêng, tài khoản nhiều tenant/site/branch; người khác tái chạy được |

Không đưa lịch ngày cố định khi chưa biết thời gian của từng thành viên. Mỗi mục nên thành một PR nhỏ có invariant, contract nếu đổi API/event, test thất bại trước sửa và tiêu chí nghiệm thu.

## 11. Bộ tình huống hội đồng có thể dùng để “đánh gãy” dự án

1. Start producer trước consumer trên broker trống; tạo tenant và kích hoạt chính sách. Sau khi đủ service, dữ liệu có tự đầy đủ không?
2. Publish đã thành công, consumer chưa xử lý; recreate broker theo quy trình triển khai. Chứng minh không mất nghĩa vụ nghiệp vụ.
3. Mời Tenant Admin, khóa tenant, rồi mở link kích hoạt. Có token và API nào vẫn dùng được?
4. Khóa tài khoản/đổi role/gỡ membership, giữ access token cũ. Trình bày chính xác thời điểm quyền mất hiệu lực.
5. Retire máy có lịch bảo trì và yêu cầu ACCEPTED. Scheduler và tạo WO sẽ làm gì?
6. Làm chậm event WO Created, cho kỹ thuật viên bắt đầu, hủy SR từ SM. Ai thấy ngoại lệ và giải quyết ở đâu?
7. Xuất hai phụ tùng, dùng một, trả một; report hoàn tất; kỹ thuật viên xác nhận dùng trên UI. Hồ sơ máy và ledger phải khớp.
8. Confirm-use và return đồng thời cùng phần lượng còn lại. Không được “cả hai đều thành công” vượt lượng xuất.
9. Khách đã duyệt dự toán A; cần phát sinh B. Bằng chứng chấp thuận B nằm đâu trước khi coi là nghĩa vụ khách?
10. Report PARTIALLY_RESOLVED; SM đóng thay khách. Chỉ ra ai đồng ý, phần nào còn lại và hồ sơ nào lưu căn cứ.
11. Mất response khi tạo plan rồi reload và thử lại. Không được âm thầm sinh hai chuỗi WO.
12. Khách có hai site; người dùng được phép làm gì ở mỗi site? Đối chiếu chính sách thật với code thay vì suy luận từ menu.
13. Chuyển primary branch của kỹ thuật viên khi còn WO cũ. Kế hoạch bàn giao và quyền xem/cập nhật công việc cũ phải rõ.
14. Storage có file lỗi/quá lớn; hoàn tất upload bị gián đoạn. Chứng minh giới hạn tài nguyên và cleanup.
15. Khôi phục từ backup sang máy khác; mở hồ sơ, tải file, kiểm ledger và projection. Không chỉ chụp ảnh container “Up”.

## 12. Kết luận cuối cùng

**Với đồ án sinh viên:** nền tảng kỹ thuật và độ sâu nghiệp vụ đáng giữ; đủ để tạo một đồ án có chất lượng nếu nhóm chứng minh được các luồng quan trọng và sửa các điểm P1. Không cần tiếp tục chạy đua số lượng chức năng.

**Với sản phẩm dùng thật:** chưa nên nghiệm thu. Thiếu bằng chứng về độ tin cậy event, các ranh giới vòng đời, tính minh bạch khi đóng hồ sơ và thao tác UI để hoàn thành công việc.

Ưu tiên đúng lúc này là **khép kín và chứng minh**, sau đó mới làm đẹp hoặc mở rộng. Một hệ thống ít chức năng hơn nhưng không thất lạc công việc, không làm người dùng hiểu sai và có khả năng phục hồi sẽ thuyết phục hơn một hệ thống nhiều trang nhưng còn phải nhờ lập trình viên gọi API để hoàn tất nghiệp vụ.
