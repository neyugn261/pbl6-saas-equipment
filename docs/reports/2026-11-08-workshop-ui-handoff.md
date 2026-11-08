# Bàn giao Workshop Web — việc đã làm và việc cần làm tiếp

Ngày: **08/11/2026 (UTC+7)**. Mốc code nghiệp vụ đối chiếu: **`develop@fbfab28`**. Phạm vi: web và đầu vào tích hợp API; **không sửa/giao lại Flutter/mobile**.

## 1. Kết luận và tình trạng Git

- Đã commit phần Workshop UI V2 tại **`fbee7ef`**, merge vào `develop` qua [PR #65](https://github.com/neyugn261/pbl6-saas-equipment/pull/65); merge commit **`fbfab28`**.
- PR giữ các commit của nhóm trên `develop` và checkpoint UI trước đó; không có xung đột nội dung. Không force-push. `apps/mobile` không có diff so với base `36f0257`.
- Local `develop` đã đồng bộ với remote và sạch sau merge. Bản Git bundle trước merge nằm tại `tmp/workshop-ui-v2-before-merge-20261108.bundle` trên máy tạo báo cáo; đây là file backup local bị Git bỏ qua, không phải artifact có sẵn khi clone repository.
- CI PR #65 **không khởi chạy** vì tài khoản chủ repository bị khóa billing. Người dùng đã xác nhận ngoại lệ merge dựa trên kiểm tra local; không ghi nhận CI xanh. [Run bị chặn](https://github.com/neyugn261/pbl6-saas-equipment/actions/runs/42440579968).
- Tài liệu này được bổ sung sau PR #65. Không xem file bàn giao này là một file đã nằm trong chính PR #65; trạng thái phát hành của đợt tài liệu xem lịch sử Git/PR chứa file.

**Có thể review UI và nhận task tích hợp. Chưa đủ điều kiện tuyên bố toàn bộ sản phẩm hoặc mọi luồng backend đã nghiệm thu.**

## 2. Những tài liệu đã có và những chỗ được cập nhật

README web và 5 báo cáo sau đã có trên remote `develop` qua PR #65:

1. [Workshop Service Manager](2026-11-07-service-manager-workshop-ui.md).
2. [Rà soát UI/nghiệp vụ](2026-11-07-ui-business-review.md).
3. [Mức độ đầy đủ UI theo người dùng](2026-11-08-ui-product-completeness-review.md).
4. [Triển khai web các vai trò](2026-11-08-workshop-web-rollout.md).
5. [Nghiệm thu UI V2](2026-11-08-workshop-ui-v2-acceptance.md).

Đợt bàn giao này còn sửa:

- [FRONTEND_IMPLEMENTATION.md](../FRONTEND_IMPLEMENTATION.md): bỏ mô tả lỗi thời rằng web còn dùng mock/localStorage, chưa có auth/API/pagination/upload/notification; cập nhật route, 8 role, dữ liệu thật và Studio DEV.
- Báo cáo UI V2: thay câu trạng thái “chưa commit/merge” bằng diễn biến đã commit/merge, giữ giới hạn nghiệm thu và ngoại lệ CI.
- Hai kế hoạch ngày 06/11: thêm liên kết tới bàn giao hiện hành; giữ chúng là tài liệu định hướng/lịch sử, không dùng nguyên danh sách cũ để giao lại việc đã có.
- README root, [README web](../../apps/web/README.md) và [mục lục hướng dẫn](../user-guide/README.md): dẫn tới một bản bàn giao thống nhất.

Các OpenAPI/ADR hiện hành không được viết thêm endpoint giả trong lượt tài liệu này. Field/hành vi đề xuất ở mục 6 phải được owner và consumer review trước khi cập nhật contract/schema/code.

## 3. Việc đã làm trong web vận hành

| Khu vực | Đã hoàn thành | Giới hạn cần nhớ |
|---|---|---|
| Nhận diện và điều hướng | Workshop dùng chung, menu theo role, không gian platform/tenant/customer; bàn quyết định Service Manager | Không tự cấp quyền server theo menu hoặc role selector studio |
| Dashboard | Nhóm việc theo trách nhiệm; các hồ sơ chờ bổ sung/duyệt/xử lý/kết quả/bàn giao/bảo trì có đường tra cứu | Chưa coi số WO là chất lượng phục vụ hay mức hài lòng |
| Yêu cầu mới | Máy đã chọn độc lập kết quả tìm kiếm; nhận dạng/serial/customer/site; thông tin mã lỗi/hiện trường/liên hệ; nháp và khóa khi kết quả gửi chưa rõ | Thông tin bổ sung đang nối vào **description**, chưa có field DTO riêng |
| Dự toán | Đọc đúng revision trước duyệt/từ chối, hạng mục/tổng/hạn/điều khoản, so sánh bản trước; phục hồi đọc lại vẫn hoạt động khi khóa ghi | Chưa có tổng hợp phát sinh/đối chiếu chi phí xuyên cả ca như studio |
| WO | Tách địa điểm lưu cùng lệnh và vị trí hiện tại của máy; kết quả sửa/vận hành/xác nhận khách; giải thích reservation HELD; board và readiness | Lịch tuần, khả dụng theo slot và khách xác nhận lịch còn là thiết kế mới |
| Báo cáo kỹ thuật | Textarea; nháp theo WO/user; preview nội dung khách đọc; báo cáo một phần/chưa được cần phần còn lại | Phần còn lại hiện nối vào **customerSummary**; chưa tạo entity follow-up riêng |
| Thiết bị/lịch sử | Hồ sơ máy, timeline và từng hồ sơ nguồn; phụ tùng đã xác nhận dùng/đảo/điều chỉnh; nội bộ tách phần công bố | Thư viện tài liệu thống nhất và bản in chuẩn chưa hoàn thiện như studio |
| Kho | Hiển thị/nhập số lượng chính xác tiếng Việt, phân biệt số nguyên/số lẻ, sửa lỗi ô mức tồn hàng nghìn; giữ idempotency và recovery hiện có | Phiếu giao nhận đầy đủ người giao/nhận và biên nhận chuẩn còn cần tích hợp |
| Bảo trì | Preview bốn kỳ giữ ngày gốc, rõ hạn bảo trì khác lịch đến làm; giữ task/WO đã sinh | POST plan trực tiếp chưa có cơ chế idempotency bền vững như registration |
| Bàn giao | Hồ sơ/snapshot, lịch sử phản hồi; hiển thị bảo hành tham chiếu rõ phạm vi | Bảo hành hiện tại không tự thay bản điều khoản khách đã chấp thuận |
| Nền frontend | Deep link mục hồ sơ; panel tải khi mở lần đầu, giữ editor; gộp GET đồng thời cùng scope; lazy nhóm route và màn lỗi tải bundle | Nháp chỉ trong tab, không có server draft/cross-device; chưa giải quyết toàn bộ N+1 |

PR #65 còn giữ commit `cfb03d4`: `prisma generate` trước Notification dev/debug startup. Đây là sửa script từ lượt trước, không phải triển khai API Notification mới.

## 4. Những gì mới chỉ là bản thiết kế tương tác

Chạy `pnpm --filter web dev`, mở **`http://localhost:5173/design/workshop`**. Không cần backend để xem studio. Studio không đổi phiên đăng nhập/quyền và không ghi dữ liệu thật; production loại module này.

| Hành trình | Nội dung đã thiết kế để chốt với người dùng |
|---|---|
| Sự cố | Đúng máy, mô tả/mã lỗi/thời điểm/ảnh hưởng/site/contact, nghi trùng, tệp lỗi, đọc lại, biên nhận, bổ sung |
| Trách nhiệm | Chủ ca, chờ ai/từ khi nào, trở ngại, mốc cập nhật, lý do và lịch sử, preview công bố/nội bộ |
| Chi phí | Hai phiên bản, khoản tăng/phạm vi loại trừ, quyết định đúng vai trò, biên nhận |
| Điều phối | Ngày/tuần, slot trùng, việc chưa có lịch, kỹ năng/site/contact, dự kiến/khách xác nhận, lý do đổi |
| Kỹ thuật | Chặn bỏ qua serial/checklist, vật tư, báo cáo/việc còn lại, preview phần khách đọc |
| Kho | Đúng kho, xuất/trả/nhập/điều chỉnh tăng, giới hạn được trả, cách ly, người giao/nhận, trước/sau |
| Kết quả | Đã duyệt/thực hiện/còn lại/phát sinh; hoàn toàn/một phần/chưa được; vận hành có nguồn/người/giờ riêng; tự phản hồi/xác nhận thay có căn cứ/tái diễn/chưa trả lời |
| Bảo trì | Ngày neo qua tháng ngắn/năm nhuận, sửa/tạm dừng/chấm dứt và tác động task/WO cũ |
| Bàn giao | Bản cố định gửi khách, khác bản trước, điều khoản/ngày bảo hành/tài liệu và phản hồi đúng bản |
| Quản trị | Kỳ/chi nhánh, số liệu mở hồ sơ nguồn, ca lặp/người phụ trách; vòng đời tenant và ảnh hưởng quản trị |
| Tài khoản | Khôi phục truy cập, hồ sơ liên hệ, lời mời hết hạn/đã dùng, khóa tài khoản/đổi role trước–sau |
| Tài liệu/thông báo/lịch sử | Bản/nguồn/phạm vi tài liệu, TXT/in mẫu; thông báo cần hành động; lọc lịch sử toàn máy/từng hồ sơ và mở chi tiết |

Không coi “đã lưu/đã gửi” trong biên nhận minh họa là bằng chứng API có thật. Không đưa nguyên fixture vào provider vận hành. Chưa có một ca mẫu duy nhất tự đồng bộ dữ liệu xuyên cả 12 hành trình.

## 5. API đã có — sử dụng lại, không giao xây mới

Các path dưới là path nghiệp vụ tại service; dùng base Gateway/client hiện hành, không hardcode URL. Có controller/DTO chỉ chứng minh code tồn tại, không thay nghiệm thu live.

| Domain | Nền đã có | Nguồn kiểm chứng |
|---|---|---|
| Request/Estimate | Tạo/đọc/sửa/lịch sử, review/request-info/accept/reject/cancel/confirm/reopen, comments; estimate CRUD/revision/send/approve/reject; đánh giá bảo hành theo chính sách | [SR controller](../../apps/service-request-service/src/service-requests/service-requests.controller.ts), [DTO](../../apps/service-request-service/src/service-requests/dto.ts) |
| WO/Technician | List/detail/assign/workflow/schedule, checklist có expectedVersion/history, work log, complete/report; kỹ thuật viên/kỹ năng | [workflow controller](../../apps/workorder-service/src/work-orders/workflow.controller.ts), [DTO báo cáo](../../apps/workorder-service/src/work-orders/workflow.dto.ts) |
| Attachment | Upload/complete/download, quyền công bố WO/report; SR có đọc/download tài liệu đã được công bố | [WO attachments](../../apps/workorder-service/src/attachments/attachments.controller.ts), [SR attachments](../../apps/service-request-service/src/attachments/service-request-attachments.controller.ts) |
| Asset | Dossier, timeline/history, danh sách/chi tiết từng Request/WO, service-parts; nhận dạng/QR/bảo hành; registration và applied policies | [Dossier](../../apps/asset-service/src/dossier/dossier.controller.ts), [History](../../apps/asset-service/src/history/history.controller.ts), [Applied policies](../../apps/asset-service/src/model-policies/applied-policies.controller.ts) |
| Bàn giao | Create/submit/cancel/accept/reject; snapshot thiết bị/khách/site/tình trạng, version/audit/supersededById | [Handover controller](../../apps/asset-service/src/handovers/handover.controller.ts), [Service](../../apps/asset-service/src/handovers/handover.service.ts) |
| Maintenance | Plan/task/history/summary, sửa trạng thái/chu kỳ, task→WO, yêu cầu WO thay thế; policy preview theo model | [Plan/task](../../apps/maintenance-service/src/plans/plans.controller.ts), [Journey](../../apps/maintenance-service/src/plans/journey.controller.ts), [Policy preview](../../apps/maintenance-service/src/model-policies/model-policies.controller.ts) |
| Inventory | Catalog, stock/lowStock filter, ledger nhập/điều chỉnh/xuất/trả, cách ly inspect, confirm-use/reverse, audit, key/operation lookup/retry/abort; reservation phối hợp WO | [Inventory controller](../../apps/inventory-service/src/inventory/inventory.controller.ts), [DTO](../../apps/inventory-service/src/inventory/dto.ts), [Schema](../../apps/inventory-service/prisma/schema.prisma) |
| Identity/Organization | Login/refresh/logout/me, invite/activate, roles/status, tenant/customer/site/contact/membership và display-name projections | [Auth](../../apps/identity-service/src/auth/auth.controller.ts), [Users](../../apps/identity-service/src/users/users.controller.ts), [Organization](../../docs/api/organization.yaml) |
| Notification/Reports | Inbox, unread-count, mark-read; báo cáo cơ bản WO theo kỳ | [Notification](../../apps/notification-service/src/notifications/notifications.controller.ts), [Reports](../../apps/workorder-service/src/reports/reports.controller.ts) |

**Các phân biệt dễ giao nhầm:**

- Inventory đã lưu `balanceBefore`/`balanceAfter`, `createdBy`, note/documentReference. Trọng tâm mới là ghép biên nhận/projection và người giao/nhận thực tế; `createdBy` không đồng nghĩa người nhận hàng. LowStock đã có API filter, phần deep link/lọc UI là việc frontend trước.
- SR đã có confirm/reopen, nhưng `confirm` hiện không nhận body căn cứ xác nhận thay. Đây là **mở rộng hành vi**, không xây lại endpoint đóng yêu cầu.
- WO đã có checklist/report/attachment; cần nối trải nghiệm theo bước và xem có thiếu metadata cụ thể trước khi đề xuất API mới.
- Asset đã có snapshot bàn giao và chính sách áp dụng; cần đối chiếu/bổ sung liên kết bất biến giữa đúng bản gửi khách và bộ điều khoản/tài liệu, không kết luận toàn bộ snapshot chưa tồn tại.
- Notification inbox đã có; lỗi 403 cần kiểm recipient/bootstrap/quyền/cấu hình thật, không tạo inbox mới hoặc giả số chưa đọc.

## 6. Backlog API/tích hợp cần hoàn thiện

Trạng thái: **Chưa chốt** = field/quy tắc cần owner review; **Cần mở rộng** = API nền đã có; **Nối UI** = ưu tiên dùng API hiện có. Mã dưới đây là task bàn giao mới, không đánh dấu các task M2/M3 cũ thành chưa làm.

### P1 — tính minh bạch và an toàn khi vận hành

| Mã | Loại / owner chính → phối hợp | Việc cần làm | Tiêu chí nghiệm thu |
|---|---|---|---|
| H01 | Cần mở rộng SR — **Huy** → Hatsady, Minh | Mã lỗi/thời điểm/ảnh hưởng/site thực tế/contact/window có cấu trúc; người chịu trách nhiệm dịch vụ, bên chờ/lý do/since/nextUpdateAt và history. Field là gợi ý, không mặc định tên cột/API | Old records vẫn đọc được; mốc cập nhật không phải cam kết SLA; đổi chủ ca giữ history; customer không thấy ghi chú nội bộ |
| H02 | Cần mở rộng confirm/reopen — **Huy** → Khương, Hatsady | Tách khách tự xác nhận và nhân viên ghi nhận thay; người phản hồi/kênh/căn cứ/thời điểm; kết quả một phần và việc còn lại; không đồng ý/tái diễn có liên kết lần trước | Không giả khách đã đồng ý; không dùng principal nhân viên làm danh tính khách; giữ phần việc chưa xong; phản hồi không tự mở WO nếu chưa qua điều kiện |
| H03 | Cần mở rộng writes SR — **Huy** → Nguyên, Hatsady | Idempotency/result lookup cho tạo Request và các quyết định cần khôi phục sau mất phản hồi; ràng buộc phiên bản/phạm vi dự toán và phát sinh | Cùng key+payload không tạo trùng; cùng key khác payload bị từ chối; tra cứu không vượt scope; không chấp thuận nhầm revision mới; không lấy giá vốn làm giá khách |
| H04 | Cần mở rộng WO — **Khương** → Huy, Hatsady | Khả dụng theo khoảng thời gian, nguồn cập nhật/tải việc; lịch dự kiến/khách xác nhận/đề nghị đổi và reason/revision; giữ đúng snapshot địa điểm/contact khi lập lệnh | Trùng slot phải kiểm lại server; đổi lịch cạnh tranh có xung đột rõ; customer chỉ thao tác theo quyền đã chốt; máy đổi site không sửa lịch sử lệnh cũ |
| H05 | Nối UI + mở rộng nếu thiếu — **Khương** → Minh, Huy, Hatsady | Dùng checklist/report/attachments hiện có; phần việc còn lại/public summary có cấu trúc; pause có đầu mối/bước hỗ trợ; đối soát vật tư sau báo cáo đúng trình tự | Không có vòng chờ report–confirm-use; WO hoàn tất khác máy tốt; reservation HELD vẫn chặn hoàn tất/hủy theo contract hiện có; customer chỉ đọc phần công bố |
| H06 | Nối UI + chốt bundle snapshot — **Minh (Asset)** → Huy, Hatsady | Gắn đúng phiên bản biên bản gửi khách với warranty/applied policy/tài liệu; so sánh trước–sau khi gửi lại; phần tham chiếu hiện tại hiển thị riêng | Đọc lại được chính nội dung đã đồng ý; không đổi ngày bảo hành vì accept bàn giao; không sửa snapshot cũ khi chính sách hiện tại đổi; legacy thiếu nguồn phải giải thích |
| H07 | Cần mở rộng create plan — **Minh (Maintenance)** → Nguyên, Hatsady | Key+fingerprint và lookup kết quả cho POST plan trực tiếp; dùng quy tắc neo ngày gốc để preview; giải thích tác động sửa/tạm dừng/chấm dứt | Retry sau reload không tạo hai plan; 31/1→28/2→31/3 và năm nhuận đúng scheduler; task/WO đã sinh giữ nguyên; INACTIVE là cuối |
| H08 | Nối UI + trường giao nhận — **Minh (Inventory)** → Khương, Hatsady | Phiếu nguồn, stock trước/sau hiện có, tối đa trả/dùng, người giao/nhận thực tế nếu chốt; LowStock/recovery deep link và bộ lọc | Đúng kho xuất; trả sau WO đóng/part/kho inactive theo quy tắc đã chốt, không quá phần chưa trả/chưa dùng; damaged cách ly; cùng key recovery, không sửa/xóa ledger gốc |

### P2 — tài liệu, quản trị và hoàn thiện trải nghiệm

| Mã | Loại / owner chính → phối hợp | Việc cần làm | Tiêu chí nghiệm thu |
|---|---|---|---|
| H09 | Cần mở rộng Identity — **Nguyên** → Hatsady, owner Organization | Quên mật khẩu, gửi lại lời mời hết hạn và kết quả gửi, sửa liên hệ theo quyền; trạng thái tenant/admin onboarding; audit quản trị scoped | Không lộ email tồn tại; link cũ dùng/hết hạn không tái sử dụng; không nhân bản user/tenant; không tự nâng quyền hoặc dựng role tùy chỉnh |
| H10 | Nối UI + metadata — **Minh (Asset)** → Khương, Huy, Hatsady | Thư viện hồ sơ máy từ các nguồn hiện có, phiên bản/tác giả/công bố, bộ lọc và in/tải có phạm vi rõ; tệp sự cố khách nếu bổ sung phải chốt owner upload | Dùng lại storage/attachment contract; SR hiện có đọc/download không có nghĩa đã có upload sự cố customer; file lỗi/kích thước/loại/permission rõ, không lộ tài liệu nội bộ |
| H11 | Nối UI + projection — **Huy (Notification)** → Khương, Minh, Hatsady | Link tới đúng hồ sơ/mục theo audience; mở thông báo cũ đọc trạng thái hiện tại; dữ liệu trách nhiệm/chi phí/kết quả đủ nội dung hành động | Đã đọc khác đã duyệt; đúng recipient/customer; replay không gửi trùng; 403 giữ nguyên lỗi nguồn và chẩn đoán cấu hình |
| H12 | Chưa chốt chỉ số — **Hatsady** → Huy/Khương/Minh (nguồn), Nguyên (scope) | Báo cáo ca kéo dài/lặp/khách ảnh hưởng/đang chờ theo kỳ/chi nhánh; drill-down cùng filter; không suy diễn hài lòng từ số WO | Tử/mẫu, kỳ/timezone và source rõ; count khớp danh sách; không nhân đôi một máy vì nhiều WO; chưa có dữ liệu thì ghi chưa đo |
| H13 | Nối UI/UAT — **Hatsady** → toàn nhóm | Chuyển từng hành trình từ studio vào route thật khi contract sẵn; lỗi cạnh trường/focus/bàn phím; back/filter/context, conflict và read-only; tài khoản nhiều role | Không nhập fixture vào dữ liệu thật; form giữ nháp đúng scope; read-only vẫn tra cứu/in được theo quyền; screen reader/keyboard và dữ liệu dài được kiểm tra |
| H14 | Vận hành repo — **Nguyên + chủ repository** | Sửa billing/khả năng chạy GitHub Actions và chạy lại CI đúng commit; review branch protection/CODEOWNERS theo quy trình nhóm | Có bằng chứng check thực sự chạy và đạt; không đổi workflow để che lỗi hoặc coi miễn trừ PR #65 là chấp thuận mặc định cho mọi PR |

Owner ở đây là đầu mối theo phân công hiện có, **chưa có nghĩa người đó đã nhận/duyệt task**. H12 là đầu mối đặc tả UI; backend metric phải được service sở hữu dữ liệu review. Field mới, event, quyền, schema và contract dùng chung cần PR/ADR theo CONTRIBUTING, không tự thêm vào service khác.

## 7. Checklist nhận việc theo người

### Minh — Asset / Maintenance / Inventory

- [ ] Review H06: chỉ ra phần snapshot/policy đã có, chốt phần cần bổ sung cho đúng bản khách xác nhận.
- [ ] Làm H07 trước khi quảng bá tạo plan có thể retry bền vững sau reload.
- [ ] Review H08: tận dụng ledger/balance/audit có sẵn; chốt người giao/nhận và biên nhận, phối hợp WO reservation.
- [ ] Review H10: thư viện/dossier/history theo nguồn và audience, không xây lại timeline/service-parts đã có.
- [ ] Hỗ trợ H05/H12 bằng dữ liệu phụ tùng, tình trạng vận hành và kỳ bảo trì đúng phạm vi.

### Huy — Service Request / Cost Estimate / Notification

- [ ] H01–H03: thông tin sự cố/trách nhiệm, xác nhận thay có căn cứ, phát sinh và recovery.
- [ ] H11: link/action/recipient; kiểm tra 403 trên môi trường thật.
- [ ] Phối hợp H05/H10/H12 cho public summary, tệp sự cố và số liệu ca dịch vụ.

### Khương — Work Order / Technician / Service Report

- [ ] H04: khả dụng theo slot và lịch khách xác nhận, đổi lịch có version/reason.
- [ ] H05: dùng API checklist/report/attachment đã có, chốt phần còn lại và pause/follow-up.
- [ ] Review H02/H08: quan hệ kết quả–request và đối soát phụ tùng/reservation.

### Nguyên — Identity / Gateway / phần dùng chung / phối hợp CI

- [ ] H09: phục hồi truy cập, lời mời, contact/audit/scope theo owner hiện có.
- [ ] H14 với chủ repo: billing/CI, không đánh dấu miễn trừ thành CI pass.
- [ ] Review contract/quyền/headers/key/error của H03/H04/H07 và Gateway; **không có task sửa mobile trong đợt này**.

### Hatsady — Web và nghiệm thu

- [ ] H13: chuyển từng mẫu thành route thật theo contract, giữ ngôn ngữ/trạng thái và quyền đã thiết kế.
- [ ] Phần UI-only của H08/H10/H11: filter/deep link/lịch sử/đúng bản tài liệu; không đợi backend cho phần API đã có.
- [ ] H12: chốt định nghĩa số liệu với owner, không tự đặt KPI thiếu nguồn.
- [ ] Lập bằng chứng UAT xuyên vai trò ở mục 9; cập nhật user guide khi hành vi route thật đổi.

## 8. Thứ tự làm đề xuất

1. **Đối chiếu và chốt contract H01–H08** theo từng owner; ghi rõ phần có sẵn/mở rộng, field bắt buộc, nguồn sở hữu, audience, version và điều kiện chuyển trạng thái. Không cần chờ toàn bộ 14 task mới bắt đầu phần độc lập.
2. **Tính an toàn khi quyết định:** H02/H03 và H07; đồng thời Hatsady làm phần UI-only H08/H13. Với Minh, bước triển khai độc lập đầu tiên nên là idempotency tạo plan trực tiếp H07.
3. **Luồng vận hành:** H01/H04/H05/H08; bảo toàn trình tự báo cáo → xác nhận vật tư → tổng kết/khách phản hồi theo contract, không tạo vòng chờ.
4. **Bàn giao và hồ sơ:** H06/H10; triển khai theo bản tài liệu thực sự được công bố và link nguồn.
5. **Quản trị/thông báo/báo cáo:** H09/H11/H12; H14 xử lý song song để mở lại cổng CI, không gỡ check để lách.
6. **UAT và chốt hoàn thiện UI:** H13 + mục 9; sau đó mới cập nhật Definition of Done/tài liệu hướng dẫn là đã nghiệm thu.

Mỗi slice hoàn tất phải có contract cập nhật, test server cho quyền/scope/race/retry liên quan, UI thật và bằng chứng nghiệm thu. Không tạo foreign key/truy vấn DB xuyên service; không giả transaction nguyên tử giữa Request/WO/Inventory/Maintenance.

## 9. Bộ tình huống nghiệm thu bắt buộc tiếp theo

- [ ] Thiết bị được bàn giao đúng serial/site/bản điều khoản; Customer Admin nhận, Customer User không duyệt thay role.
- [ ] Khách gửi sự cố: chọn máy xong tìm không ra vẫn gửi máy hợp lệ; mã lỗi/contact lưu đúng; tệp lỗi không báo tải xong; sự cố trùng hoặc tái diễn giữ liên kết.
- [ ] Mất phản hồi sau create/approve/complete/create plan: đọc lại kết quả đúng key/phiên bản, không tạo hồ sơ trùng; đóng/mở tab và đổi tài khoản không lộ nháp hoặc tự gửi lại.
- [ ] Máy chuyển A→B sau khi lập WO: địa điểm lệnh cũ vẫn A, hiện trạng B ghi nhãn riêng; điều phối cần xác minh.
- [ ] Hai người đổi lịch/phân công cùng lúc: server phát hiện conflict/slot trùng, form giữ nội dung, không ghi đè im lặng.
- [ ] Dự toán bản 1→2 và phát sinh: khách thấy đúng thay đổi, không approve bản đã thay; phần chưa duyệt không thành khoản đã đồng ý.
- [ ] Serial/checklist/báo cáo: phần còn lại bắt buộc cho partial/unresolved; nội bộ không tự công bố; thực dùng có thể xác nhận sau report.
- [ ] Reservation HELD còn treo: giữ chặn hoàn tất/hủy; return đúng kho, không vượt phần chưa đối soát; hàng hỏng cách ly, ledger sửa sai giữ cả hai dấu vết.
- [ ] Kết quả một phần: kỹ thuật kết thúc khác máy hoạt động khác khách đồng ý; xác nhận thay có khách/kênh/căn cứ; chưa phản hồi giữ việc theo dõi, tái diễn liên kết lần trước.
- [ ] Bảo trì 31/1 và 29/2, hoàn tất muộn, sửa chu kỳ/chấm dứt có task/WO: giữ ngày neo và hồ sơ đã sinh.
- [ ] Tenant/customer khác sửa ID, tải tệp/nháp/filter/history/notification phải bị chặn; không có dữ liệu thì khác nguồn lỗi hoặc không được xem.
- [ ] Đếm báo cáo mở đúng danh sách với kỳ/scope giống nhau; lịch sử toàn máy/từng hồ sơ có source/version/time và phạm vi công bố.
- [ ] Keyboard/focus/screen reader, read-only, nội dung dài, pagination nhiều hồ sơ, web màn hình hẹp và bản in tài liệu thật.

## 10. Bằng chứng kiểm tra và giới hạn hiện tại

**Đã thực hiện trên code PR #65:**

- `pnpm --filter web test`: 101/101 đạt; chạy lại sau merge cũng đạt.
- `pnpm --filter web lint`, `pnpm --filter web build` (gồm `tsc -b`): đạt.
- `pnpm lint`, `pnpm -r --if-present typecheck`: đạt.
- `git diff --check`: đạt; tree merge giống code đã kiểm tra, không có diff mobile; local/remote develop đồng bộ.
- Browser QA: mở menu theo 8 role và đủ 12 hành trình; kiểm tra trùng lịch, trạng thái lỗi/chỉ đọc/giữ form; viewport 1440×1000 và 390×844 trong phạm vi đã ghi ở báo cáo UI V2.

**Chưa chứng minh:** toàn bộ writes trên backend thật, mọi tổ hợp role, mọi race liên service, lịch sử/tệp quy mô lớn, WCAG/screen reader đầy đủ, người dùng thật hài lòng, hoặc CI toàn repository chạy đạt. Nháp chỉ trong tab; studio có state simulator chung, chưa là ma trận trạng thái riêng hoàn chỉnh của từng API/entity.

Ảnh QA trong `tmp/` chỉ có trên máy tạo ảnh, không phải artifact được commit. Test handler/effect frontend không thay E2E server. Lượt bàn giao này sửa Markdown, không chạy lại/backend không được triển khai thêm chỉ vì tài liệu mô tả task.

## 11. Điều kiện đóng task và bàn giao tiếp

1. Owner xác nhận contract/API hiện có và diff đề xuất; consumer review; cập nhật YAML/ADR/migration mới nếu thật sự thay thiết kế.
2. Triển khai đúng service, tenant/customer isolation và RBAC cố định; có version/idempotency/audit phù hợp hậu quả thao tác.
3. Hatsady nối UI thật, giữ fixture/Studio tách biệt; chụp bằng chứng bằng dữ liệu kiểm thử được công bố rõ.
4. Chạy ca hồi quy liên quan và UAT xuyên vai trò; ghi rõ pass/fail/chưa chạy, commit/môi trường/cách tái hiện.
5. Cập nhật tài liệu, đánh dấu task có bằng chứng thay vì chỉ đánh dấu giao diện có nút. Không đóng “hoàn thiện toàn bộ web” trước các bước này.
