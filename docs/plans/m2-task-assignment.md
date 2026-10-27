# M2 — Phân công công việc cho 5 thành viên

Ngày lập: **25/10/2026**. Mốc đối chiếu: `develop` tại commit `7cc48ba`.

Bản hiệu chỉnh sau khi đối chiếu **“Kế hoạch giai đoạn & phân công 5 người” ngày 17/10/2026** do người dùng cung cấp. Phân công và ranh giới M2/M3 theo kế hoạch 5 người; chi tiết nghiệp vụ theo ADR/contract Accepted mới hơn. Mã task cũ được giữ để tiện theo dõi; bổ sung K8 và H7 cho phần chuẩn bị M3 bị thiếu trong bản đầu.

**Trạng thái: kế hoạch đề xuất để nhóm review và theo dõi triển khai.** Các checkbox bên dưới là việc cần làm hoặc xác minh; tài liệu này không xác nhận tính năng đã hoàn thành hay thay thế quyết định nghiệp vụ đã được nhóm duyệt. Mã task có tiền tố `M2-` để tránh nhầm với mã M1–M4 trong bản Review cuối.

## 1. Mục tiêu và phạm vi

Cuối M2, bước tích hợp cần chứng minh luồng chính trên web + Android với backend và event thật. Trong thời gian phát triển, năm người làm song song bằng client giả/mock theo contract đã chốt; không phải chờ service của người khác hoàn thành. Hai luồng nghiệp vụ cần kiểm tra:

1. Service Request được chấp nhận → tạo Work Order → phân công Technician → tiếp nhận và thực hiện → hoàn thành với kết quả kỹ thuật → Service Request nhận tóm tắt → khách xác nhận hoặc yêu cầu xử lý lại.
2. Maintenance Plan đến hạn → Maintenance Task và outbox → Work Order tự động → Technician thực hiện → Task và lịch sử Equipment được cập nhật. Có kiểm thử nhánh Work Order bị hủy và được thay thế.

Với yêu cầu ngoài bảo hành: nhân viên lập Cost Estimate → khách chấp nhận/từ chối → Service Request chuyển trạng thái đúng → chỉ tạo Work Order khi đủ điều kiện.

**Phân biệt hai mức nghiệm thu frontend:** màn hình M1 phải dùng API thật; màn hình web M2 có thể hoàn thiện trên mock OpenAPI, chỉ các màn hình tham gia luồng tích hợp cuối M2 cần chuyển sang backend thật để chứng minh luồng đó. Việc chuyển toàn bộ màn hình web M2 sang API thật thuộc M3 theo kế hoạch gốc. Mobile phát triển với Identity thật + mock Work Order, rồi chuyển sang backend thật cho luồng Android cuối M2.

**Service Report thuộc M2** theo kế hoạch 5 người và các endpoint hiện hành. Cuối M2 có đủ ba đầu ra chuẩn bị M3: Minh soạn `inventory.yaml`; Huy soạn `notification.yaml` và bảng event → người nhận; Khương chốt contract upload đính kèm. API kho/phụ tùng, upload/MinIO, Notification và báo cáo thống kê triển khai ở M3. Không mở rộng M2 sang hóa đơn, thanh toán, GPS, tối ưu tuyến đường hoặc offline sync. Chụp/chọn ảnh và xử lý mất mạng của mobile nằm trong M3; kiểm tra scheduler dài ngày thuộc M4.

## 2. Hiện trạng và điều kiện đầu vào

| Hạng mục | Bằng chứng tại mốc đối chiếu | Việc cần làm tiếp |
| --- | --- | --- |
| M1 backend và tích hợp | CI của `7cc48ba` thành công, gồm DB tests và smoke qua Gateway | Giữ regression M1 trong CI M2 |
| M1 toàn nhóm | CODEOWNERS còn comment; `develop` chưa bật protection; bảng nghiệm thu còn Pending; chưa có tag `m1` | Hoàn tất G1/G3, không coi CI xanh là biên bản nghiệm thu đầy đủ |
| Asset của Minh | Code M1 và sửa review đã merge | Thêm producer EquipmentMoved và consumer lịch sử trong M2 |
| Contract Work Order | `workorder.yaml`, các event v2 và migration `0003_created_by_nullable` đã có | Không tạo lại migration D5; triển khai nghiệp vụ và test |
| Maintenance | Contract và ADR 0007 Accepted đã merge; service còn scaffold | Chốt chi tiết còn mở, nối nền tảng, migration snapshot, API, scheduler và consumer |
| Service Request | Workflow M1 và consumer WO đã có; chưa thấy API nghiệp vụ Cost Estimate | Bổ sung Cost Estimate và kiểm thử tích hợp consumer hiện có |
| Web/mobile | Web đã có luồng M1; mobile còn scaffold | Bổ sung màn hình và tích hợp M2 |
| Permission | Catalog trong code vẫn là `PROVISIONAL` | Khương/Nguyên đối chiếu bằng chứng duyệt danh sách M2 rồi cập nhật catalog/seed/migration nếu cần |

### Việc bàn giao M1 còn lại

- [ ] **M2-G0a — Nguyên + người có quyền admin repository:** xác nhận username GitHub của từng owner; kích hoạt CODEOWNERS, bảo vệ `develop`/`main` theo CONTRIBUTING: PR, approval, Code Owner review và hai job CI bắt buộc.
- [ ] **M2-G0b — Hatsady chủ trì, cả nhóm phối hợp:** chạy và ghi bằng chứng các ca M1 còn Pending trên backend thật; ghi commit, môi trường, Pass/Fail và issue. Chỉ đánh dấu ca thực sự đã chạy.
- [ ] **M2-G0c — Cả nhóm nghiệm thu; người được nhóm giao quản lý release thực hiện:** sau khi đạt checklist, ghi nhận chốt M1, tạo tag `m1` tại commit được nghiệm thu và hoàn tất PR `develop` → `main` theo CONTRIBUTING.

G0a–c vẫn cần hoàn tất để nghiệm thu M1 toàn nhóm. Các phần M2 độc lập, có đầu vào kỹ thuật đủ, có thể bắt đầu trong lúc xử lý G0; các việc quản trị hoặc ghi nhận nghiệm thu còn thiếu không tự động chặn mọi task. Không vì vậy đánh dấu M1 toàn nhóm đã nghiệm thu. Riêng phần code phụ thuộc quyết định nghiệp vụ chưa chốt vẫn phải chờ quyết định tương ứng.

## 3. Ownership và phối hợp

| Thành viên | Phần chính trong M2 | Phạm vi phối hợp |
| --- | --- | --- |
| **Khương — Member A** | Work Order, Technician/skill, assignment, work log, Service Report, API nội bộ WO; contract upload cuối M2 | Huy: SR/báo giá; Minh: Maintenance/events; Nguyên/Hatsady: client và màn hình |
| **Minh — Member B** | Maintenance, scheduler, snapshot; producer/consumer bổ sung trong Asset | Khương: WO và task thay thế; Nguyên: package/env/CI; Hatsady: web bảo trì |
| **Huy — Member C** | Cost Estimate, consumer WO trong Service Request; contract Notification và bảng người nhận cuối M2 | Khương: event và race hủy SR/WO; Hatsady: portal và màn hình báo giá |
| **Nguyên — Member D** | Chính: app Android Technician. Hỗ trợ: Gateway ngày đầu và phần dùng chung thật sự cần thay đổi | Review permission/dependency/test DB/event/CI theo PR riêng; tránh biến hỗ trợ thành điều kiện chờ chung cho cả nhóm |
| **Hatsady — Member E** | Web M1 dùng API thật và regression; màn hình M2 theo contract/mock; kịch bản test M2 | Chuyển các màn hình tham gia demo sang API thật ở bước tích hợp; phối hợp Nguyên kiểm tra mobile |

Owner sửa service của mình. Thay đổi `packages/**`, cấu hình root/lockfile, `.env.example`, CI, hạ tầng, ADR/ERD cần phạm vi PR riêng và Nguyên review theo CONTRIBUTING. Owner nghiệp vụ chuẩn bị nội dung cần thay đổi; không sửa service người khác chỉ để test của mình xanh.

## 4. Các điểm phải chốt trước phần code phụ thuộc

| Mã | Nội dung cần quyết định/đồng bộ | Người chuẩn bị → người phối hợp review | Chặn task |
| --- | --- | --- | --- |
| M2-D01 | Danh sách permission M2: đối chiếu bản nhóm đã duyệt với catalog, seed và DB; không tự thêm role/quyền | Khương + Nguyên → các owner API/client | N1 và các endpoint dùng quyền chưa chốt |
| M2-D02 | `EquipmentMoved`: payload/version, thông tin customer/site, cách sắp thứ tự và phát hiện event cũ, replay, xử lý snapshot đã biết bị cũ | Minh → Khương + Nguyên | M3, M4 và scheduler phụ thuộc snapshot |
| M2-D03 | Maintenance: anchor của lịch MONTH/YEAR, ngày 29/2, ảnh hưởng completion time, chuyển INACTIVE, sửa plan khi đã có task; quy tắc task FAILED và `lastCompletedAt` theo kết quả WO | Minh → Khương + Hatsady + Nguyên | Các nhánh tương ứng của M2, M4, M5 |
| M2-D04 | Hủy WO của Maintenance: ai yêu cầu WO thay thế, retry/backoff/giới hạn, event/operation cho lần thử mới; xử lý completed/cancelled đến trước created và event cũ của WO trước | Minh + Khương → Huy + Nguyên | K6, M5, nghiệm thu nhánh thay thế |
| M2-D05 | Migration snapshot: kiểm đếm plan hiện có, điều kiện DB rỗng hoặc cách backfill qua Asset API với người dùng hợp lệ | Minh → Nguyên | Migration snapshot và API/scheduler dùng cột bắt buộc |
| M2-D06 | Sửa câu “reports” ngoài M2 trong mô tả Work Order cho rõ: Service Report thuộc M2; báo cáo thống kê và attachment thuộc M3 | Khương → các consumer contract | Chỉ là đồng bộ câu chữ; không chặn K4/N5 đã có endpoint/schema rõ |

**Căn cứ cho M2-D06:** kế hoạch 5 người ghi rõ Work Order + Service Report ở M2 và thống kê/upload ở M3; contract có `/complete` và `/service-report`. Triển khai report với các trường bắt buộc theo contract, gồm `result` và `customerSummary` của ADR 0008. Không cần xin quyết định lại về việc Service Report có thuộc M2 hay không.

**Các quyết định đã có, không cần chốt lại:** D12a–e trong ADR 0007; D4/D4a, D5, D6/D6a, D11 trong ADR 0008. Cụ thể: plan đi theo thiết bị; không tạo plan cho RETIRED; PAUSED không phát task và resume không bù kỳ đã lỡ; lịch theo `Asia/Ho_Chi_Minh`, ngày thiếu thì lùi cuối tháng; downtime chỉ bù một kỳ gần nhất; WO bị hủy trả task về PENDING chờ thay thế. D01 là đối chiếu việc áp dụng permission; D02–D05 chứa phần kỹ thuật còn cần chốt theo ADR; D06 là sửa câu chữ tài liệu.

Kế hoạch ngày 17/10 giả định mọi event và dependency đã đủ. Code hiện tại cho thấy Maintenance/WO vẫn cần nối package và `EquipmentMoved` chưa nằm trong catalog. Vì vậy vẫn cần các PR bổ sung nhỏ theo quy trình; không bỏ các việc này chỉ vì kế hoạch cũ nói đã có sẵn.

## 5. Task của Khương — Work Order

- [ ] **M2-K1 — Rà soát contract và nối nền tảng.** Đối chiếu `workorder.yaml`, state machine, Prisma/migration, auth và event catalog; giải quyết M2-D06. Chuẩn bị dependency riêng, nối service-kit/auth/event-contracts/testing, Prisma, health và validation. Phối hợp N1/N2. **Đạt khi:** service khởi động, bootstrap test đạt, contract không còn mâu thuẫn về phạm vi report; giữ migration D5 đã merge.
- [ ] **M2-K2 — Technician và Skill.** API hồ sơ technician, `/technicians/me`, skill, trạng thái do manager đặt theo contract. Xác thực staff có role TECHNICIAN qua Identity và branch qua Organization bằng token người gọi. **Đạt khi:** kiểm tra tenant, tài khoản/branch không hợp lệ, quyền và uniqueness; chưa tự đổi OFF_DUTY/INACTIVE.
- [ ] **M2-K3 — Tạo và đọc Work Order.** List/detail/update/history và `GET /internal/work-orders/{id}` theo contract; tạo từ SR ACCEPTED với reference hợp lệ; bảo đảm quan hệ nguồn SR/task và constraint một WO đang hiệu lực theo schema. Ghi outbox `WorkOrderCreated.v1` cùng transaction. **Đạt khi:** tenant khác trả 404; Technician chỉ thấy WO được/đã được phân công; CUSTOMER không đọc WO; test tạo trùng đồng thời và upstream lỗi. Internal reference sẵn cho Minh dùng ở M3, không mở qua Gateway.
- [ ] **M2-K4 — Assignment, thực hiện, work log và Service Report.** Assign/reassign/accept/reject/start-travel/start/hold/resume/complete/cancel; trạng thái và quyền đúng contract. API đọc/thêm work log, lịch sử assignment và đọc Service Report. Assign phát `WorkOrderAssigned.v1`; complete ghi report, assignment/history và `WorkOrderCompleted.v2` cùng transaction. BUSY/AVAILABLE theo D11, khóa technician khi thay đổi. **Đạt khi:** chỉ một assignment hiện hành theo constraint/contract; chỉ người được giao mới accept/complete; kiểm thử mọi transition, thao tác đồng thời và rollback; không lộ ghi chú nội bộ qua summary.
- [ ] **M2-K5 — Hủy SR và WO theo D4/D4a.** Consume `ServiceRequestStatusChanged.v1` khi CANCELLED, phối hợp khóa với thao tác tạo WO theo contract; phát `WorkOrderCancelled.v2`. WO đã TRAVELLING/IN_PROGRESS/ON_HOLD không tự hủy; ghi nhận cảnh báo theo phạm vi M2. **Đạt khi:** test thứ tự create/cancel, event trùng, SR hủy trước/sau khi WO tạo và `cancelServiceRequest` đúng; không gọi đồng bộ từ SR sang WO.
- [ ] **M2-K6 — Tạo WO từ Maintenance Task.** Consume `MaintenanceTaskDue.v1`, dùng snapshot trong event, `created_by = NULL`, inbox + WO + outbox trong cùng transaction. Hỗ trợ WO thay thế theo M2-D04, không tái dùng event đã dedup để kỳ vọng tạo WO mới. **Đạt khi:** task không có nhiều WO chưa hủy; retry/replay không tạo trùng; phối hợp Minh chứng minh nhánh hủy và thay thế.
- [ ] **M2-K7 — DB tests, seed và bàn giao.** Seed trong DB Work Order theo fixtures đã thống nhất; test qua DB test riêng, migration/drift, transaction/concurrency; README, API mẫu cho web/mobile và integration cùng Huy/Minh. **Đạt khi:** owner chạy kiểm tra liên quan và có bằng chứng API thật qua Gateway.
- [ ] **M2-K8 — Chốt contract upload cuối M2 (M3-prep).** Chuẩn bị contract đính kèm cho WO/Service Report: presigned URL, loại/kích thước file, quyền tenant và visibility theo ADR 0006; review với Nguyên làm mobile và Hatsady làm web. **Đạt khi:** contract upload được chốt và bàn giao trước M3; chưa triển khai upload/MinIO hoặc thống kê trong task M2 này.

## 6. Task của Minh — Maintenance và Asset

Các task dưới đây tương ứng B1–B5 trong kế hoạch Minh; B1 được tách thành nền tảng, migration và Plan API để review riêng.

**Cập nhật 27/10/2026:** đã triển khai toàn bộ phần code phía Minh trên nhánh riêng,
đồng bộ `origin/develop` tại `780f8bc`. Bảng dưới phân biệt triển khai cục bộ và
nghiệm thu liên thành viên; checkbox nghiệm thu bên dưới vẫn cần review/CI/merge.
Người dùng xác nhận lịch giữ ngày gốc và các quy tắc lifecycle của ADR 0009;
đồng thời chọn bàn giao phần tạo WO thay thế cho Khương, không sửa Work Order.

| Task | Kết quả cục bộ 27/10 | Phần cần review/bàn giao |
| --- | --- | --- |
| M2-M1 | Nền tảng + migration snapshot cũ; bổ sung runtime migration, drift đạt | Shared/schema và CI review trước merge |
| M2-M2 | Plan list/create/detail/patch/status, scope và validation; Asset HTTP thật trong integration | Review API với web |
| M2-M3 | Asset producer/outbox có snapshotVersion; consumer và equipment cursor chống stale/replay, race create/move | Review event chung với Nguyên/Khương |
| M2-M4 | Scheduler fixed anchor, catch-up một kỳ, Task API, locks và transactional outbox; DB concurrency/rollback đạt | Kiểm tra dài ngày thuộc M4 |
| M2-M5 | Consumer WO v1/v2 đúng catalog, terminal tombstone, replacement request bền vững/idempotent; fixture ordering đạt | Khương thêm consumer tạo WO thay thế theo event mới |
| M2-M6 | Asset history inbox + allowlist, chống trùng và không lộ SR reason; regression M1 đạt | Review consumer contract |
| M2-M7 | Gateway + PostgreSQL + RabbitMQ thật: move → Plan → Task → WO → complete → Task/history; WO cancel → PENDING → request; seed chạy hai lần đạt | Chưa nghiệm thu producer WO thay thế thật vì thuộc Khương theo lựa chọn người dùng |
| M2-M8 | `inventory.yaml` nháp cùng decimal/F09/return/idempotency/low-stock và danh sách quyết định cần review | Khương/Huy/Nguyên review trước M3; không code Inventory M2 |

Bằng chứng và danh sách file: [báo cáo M2](../reports/2026-10-27-minh-m2.md).
Contract bàn giao cụ thể: [minh-m2-handoff.md](minh-m2-handoff.md).

- [ ] **M2-M1 — Nền tảng và migration snapshot (B1).** Nối package, Prisma, auth/validation, health và scripts theo mẫu Asset; chuẩn bị PR dependency riêng. Thêm migration mới cho customer/site snapshot theo ADR 0007 và M2-D05; cập nhật ERD trong phạm vi thiết kế. **Đạt khi:** không sửa migration cũ, không gán UUID giả, không truy vấn Asset DB; có kiểm tra migration và drift, dùng Maintenance test DB an toàn do N2 cấu hình.

  **Tiến độ 26/10:** đã triển khai và kiểm tra cục bộ trên nhánh `codex/minh-maintenance-foundation` (`6a65bc0`, `aae02cf`, `e14c177`). `maintenance_db` có 0 plan trước migration; migration đã áp dụng, test DB riêng và drift check đạt. Giữ checkbox mở đến khi tách PR đúng ownership, CI nhánh và review hoàn tất.
- [ ] **M2-M2 — Maintenance Plan API (B1).** List/create/detail/update/status, filter/pagination theo contract và M2-D03. AssetClient chuyển tiếp token/correlation id; snapshot lấy từ Asset, không tin customer/site do client gửi. **Đạt khi:** RETIRED bị chặn; tenant/customer isolation, quyền, date/frequency/state, upstream lỗi và rollback được kiểm thử. CUSTOMER_ADMIN chỉ đọc trong customer của mình; CUSTOMER_USER không tự được cấp maintenance:read.
- [ ] **M2-M3 — EquipmentMoved producer và snapshot consumer.** Sau M2-D02: Asset ghi event cùng transaction chuyển site; Maintenance xử lý qua inbox, cập nhật snapshot và từ chối event cũ theo cơ chế thứ tự đã chốt. **Đạt khi:** duplicate/replay/out-of-order, tenant sai, chuyển site nhiều lần được test; không dùng snapshot đã biết bị cũ để phát task.
- [ ] **M2-M4 — Scheduler, Task và outbox (B2).** Sau M2-D03 và snapshot sẵn sàng: một tick tạo Task + `MaintenanceTaskDue.v1` + cập nhật nextDueDate trong một transaction. Khóa/constraint chống trùng giữa nhiều instance; calendar date theo ADR 0007; task API có scope. **Đạt khi:** tháng thiếu ngày, năm nhuận, pause/resume, downtime chỉ bù kỳ gần nhất, concurrent tick, restart/rollback và broker down có test; scheduler không gọi service khác bằng token giả.
- [ ] **M2-M5 — Liên kết Task–WO (B3).** Consume `WorkOrderCreated.v1`, `WorkOrderCompleted.v2`, `WorkOrderCancelled.v2`; kiểm tra tenant/equipment/task/WO. Task hủy WO về PENDING, thay thế theo M2-D04; không để event cũ ghi đè WO mới hoặc task đã hoàn tất. **Đạt khi:** inbox và update nguyên tử; test duplicate, sai thứ tự, thiếu task và replay; cập nhật completed/lastCompletedAt đúng quy tắc đã chốt.
- [ ] **M2-M6 — Lịch sử Asset từ event (B4).** Consumer nhận `ServiceRequestStatusChanged.v1` và `WorkOrderCompleted.v2`; ghi history + inbox cùng transaction, chống trùng theo source event. **Đạt khi:** scope đúng, không dump payload/lý do nội bộ vào response CUSTOMER; test equipment chưa tồn tại, tenant sai, đến muộn và rollback; regression endpoint M1 của Asset vẫn đạt.
- [ ] **M2-M7 — Tích hợp và bàn giao (B5).** Chạy Plan → Task → WO → hoàn thành/hủy/thay thế với Khương; kiểm tra Task và history. Bổ sung fixture demo, README, hướng dẫn tick/retry/DLQ, test scheduler và consumer trên DB/RabbitMQ thật. **Đạt khi:** phân biệt rõ integration dùng event tự tạo với end-to-end có producer WO thật.
- [ ] **M2-M8 — Chuẩn bị Inventory cuối M2 (B5, M3-prep).** Soạn `inventory.yaml` cho Part/Warehouse/Stock và giao dịch; chốt decimal, idempotency, xuất/trả WO, quantityUsed/quantityReturned và LowStockDetected với Khương/Huy; gửi nhu cầu test DB/env/CI cho Nguyên. **Đạt khi:** contract và các quyết định còn mở được liệt kê để review; chưa tính API kho là phần code phải hoàn thành trong M2.

Lưu ý: prompt B3 trong tài liệu Minh cũ ghi event WO v1. Producer hiện hành phải dùng Completed/Cancelled **v2** theo catalog đã merge. Chỉ duy trì xử lý v1 nếu contract tương thích yêu cầu; không phát v1 cho luồng mới.

## 7. Task của Huy — Cost Estimate và Service Request

- [ ] **M2-H1 — Rà soát Cost Estimate trước code.** Đối chiếu API, state machine, schema/partial index, quyền và quy tắc ngày hết hạn. Làm rõ điểm thiếu trong contract bằng PR trước phần phụ thuộc. **Đạt khi:** thống nhất vòng đời DRAFT/SENT/APPROVED/REJECTED/EXPIRED/SUPERSEDED; Customer không thấy DRAFT; không thêm hóa đơn/thanh toán.
- [ ] **M2-H2 — Draft revision và chi tiết báo giá.** Create/list/update/delete DRAFT theo contract; tính total phía server bằng kiểu decimal phù hợp, ghi items và total cùng transaction, revision tăng an toàn. **Đạt khi:** chỉ một revision live mỗi SR; test cập nhật/trùng revision đồng thời, rollback, validation tiền/số lượng, tenant/customer isolation.
- [ ] **M2-H3 — Gửi, duyệt, từ chối, sửa và hết hạn.** Triển khai send/revise/approve/reject, lazy expiration theo state machine; thay đổi Estimate và SR trong cùng transaction và ghi event/history cần thiết. **Đạt khi:** khách đúng customer và có quyền mới phản hồi; test approve/reject/revise đồng thời, báo giá hết hạn, revision cũ và workflow ngoài bảo hành → ACCEPTED.
- [ ] **M2-H4 — Hoàn thiện consumer WO hiện có.** Kiểm tra lại consumer đã merge với producer thật của Khương; giữ D4/D4a và D6/D6a, tóm tắt gồm result/customerSummary/completedAt/workOrderNo. **Đạt khi:** duplicate/out-of-order và WO bị hủy/thay thế không làm SR sai trạng thái; không ghi đè SR terminal; lỗi được retry theo contract thay vì mất nghiệp vụ.
- [ ] **M2-H5 — Kết quả cho khách và quyền truy cập.** Kiểm tra detail/history/comment/estimate và object lồng nhau; chỉ tóm tắt dành cho khách, không lộ nội dung INTERNAL. Xác nhận confirm/reopen sau kết quả WO theo state machine. **Đạt khi:** test hai tenant/hai customer và response CUSTOMER trên DB thật.
- [ ] **M2-H6 — Regression, seed và tích hợp.** Giữ M1 tests; bổ sung DB tests cho báo giá và luồng SR ↔ WO, fixture ngoài bảo hành và API mẫu cho Hatsady. **Đạt khi:** luồng duyệt/từ chối báo giá và hoàn thành/hủy WO có bằng chứng qua Gateway/event thật; README và contract khớp code.
- [ ] **M2-H7 — Chuẩn bị Notification cuối M2 (M3-prep).** Soạn nháp `docs/api/notification.yaml` cho thông báo in-app: danh sách, số chưa đọc, đánh dấu đã đọc; lập bảng event → người nhận theo role/user/customer, dữ liệu được hiển thị và quy tắc chống trùng. Đối chiếu API Identity tìm người nhận với Nguyên và event WO/LowStock với Khương/Minh; review UI với Hatsady. **Đạt khi:** có contract và bảng “event nào báo cho ai” để làm M3; ghi rõ câu hỏi còn mở, chưa coi Notification đã được triển khai.

Notification in-app triển khai ở M3 của Huy; email activation theo ADR là phần phối hợp M3. M2 phải có đầu ra chuẩn bị H7, không chỉ chuẩn bị event.

## 8. Task của Nguyên — Mobile và nền tảng chung

**Ưu tiên M2 là mobile Android (N4–N6).** N1–N3 là phần hỗ trợ đầu giai đoạn/PR dùng chung; thực hiện theo nhu cầu thực tế, không yêu cầu Nguyên viết nghiệp vụ Maintenance/WO thay owner hoặc hoãn mobile đến khi mọi backend hoàn tất.

- [ ] **M2-N1 — Chốt và áp dụng permission M2.** Phối hợp Khương đối chiếu bằng chứng duyệt D9 với catalog hiện tại; cập nhật catalog/seed và migration Identity nếu có thay đổi dữ liệu cần version hóa. Không mặc định tạo migration `0003` khi chưa xem lịch sử mới nhất. **Đạt khi:** role/permission thống nhất trên backend, web và mobile; không tự mở WO cho CUSTOMER; test không làm mất quyền M1.
- [ ] **M2-N2 — Dependency, môi trường và CI.** Review các PR dependency của Maintenance/WO; bổ sung test DB/env/bootstrap cần thiết, CI migration/drift và DB suites; giữ hai job M1 xanh. Hoàn tất CODEOWNERS/branch protection với admin theo M2-G0a. **Đạt khi:** clone mới cài/build/test được theo README, không đưa secret vào repo, mỗi DB test qua kiểm tra tên an toàn.
- [ ] **M2-N3 — Gateway ngày đầu và contract dùng chung.** Kiểm tra/bổ sung route M2 đúng contract, gồm `/api/workorders/*`, Maintenance và các endpoint Estimate thuộc Service Request; chặn `/internal/*` qua Gateway, chuyển tiếp auth/correlation id và lỗi nhất quán. Route đã có thì xác minh, không tạo lại. Review event/package/ADR thay đổi từ các owner. **Đạt khi:** route và negative tests qua Gateway; không chuyển logic nghiệp vụ vào Gateway.
- [ ] **M2-N4 — Mobile nền tảng, My Jobs và thiết bị.** Flutter Android login/refresh/logout với Identity thật; lưu token và cấu hình URL theo môi trường; `/technicians/me`, My Jobs, chi tiết WO và thông tin thiết bị theo contract. Dùng mock OpenAPI WO trong phát triển. **Đạt khi:** luồng đọc chạy trên mock, đăng nhập thật, có widget test màn hình chính và trạng thái loading/empty/error/401/403/404; tích hợp thật kiểm tra scope ở N6.
- [ ] **M2-N5 — Mobile thực hiện WO và Service Report.** Accept/reject/start-travel/start/hold/resume, ghi chú và form Service Report/complete theo contract. Kiểm soát nút theo trạng thái, chống submit lặp, xử lý trạng thái bị đổi bởi người khác; customerSummary tách ghi chú nội bộ. **Đạt khi:** đầy đủ luồng Technician trên mock, widget test form/action và lỗi; không giả lập thành công khi API lỗi. Hoàn thành WO thật là tiêu chí tích hợp N6.
- [ ] **M2-N6 — APK Android và tích hợp cuối giai đoạn.** Build APK debug, cài được trên thiết bị hoặc emulator Android, ghi cách cài và cấu hình Gateway. Chuyển mobile sang backend thật; cùng các owner chuẩn bị smoke M2, seed orchestration và hướng dẫn chạy. **Đạt khi:** Flutter analyze/widget tests/build APK đạt; Technician hoàn thành WO thật, đổi ID không mở được việc ngoài scope; luồng 9/9 ở mục 11 có bằng chứng. Không yêu cầu iOS hoặc APK phát hành production trong M2.

## 9. Task của Hatsady — Web, Portal và kiểm thử

Giữ phần M1 đã gọi API thật và kiểm chứng lại; không quay về mock cho màn hình M1. Các task T2–T5 phát triển trên mock contract M2 nếu backend chưa xong. T6 chuyển các màn hình cần cho luồng tích hợp sang API thật; việc chuyển toàn bộ web M2 và màn hình Inventory/Notification/dashboard thuộc M3.

- [ ] **M2-T1 — Ma trận màn hình/quyền và API client.** Đối chiếu permission đã chốt và contract; bổ sung types/client, menu/routes cho M2 trên nền auth M1. **Đạt khi:** có ma trận role → màn hình → thao tác; route trái quyền có phản hồi rõ ràng; backend vẫn kiểm tra độc lập.
- [ ] **M2-T2 — Web điều phối Work Order.** List/filter/detail, tạo từ SR ACCEPTED, danh sách Technician để phân công, assign/reassign, schedule, history và cancel theo contract. **Đạt khi:** thao tác UI theo mock OpenAPI, xử lý 409 do trạng thái thay đổi, không hiện WO cho CUSTOMER. Tạo/assign WO bằng API thật trong luồng tích hợp T6; chưa tự mở rộng thành bộ UI quản trị skill đầy đủ.
- [ ] **M2-T3 — Web Maintenance.** Plan list/create/detail/update/status theo phần contract đã chốt; hiển thị task/reference WO cần thiết theo contract nếu có trong màn hình. CUSTOMER_ADMIN chỉ xem đúng customer nếu có quyền; không tự mở cho CUSTOMER_USER. **Đạt khi:** màn hình chạy theo mock, RETIRED/date/frequency/pause/resume và lỗi hiển thị đúng; không tự thêm quy tắc lịch ở frontend. Không bắt toàn bộ màn hình Maintenance dùng API thật để nghiệm thu riêng T3.
- [ ] **M2-T4 — Web/portal Cost Estimate.** Nhân viên lập/sửa/gửi revision; khách xem và approve/reject theo quyền; hiển thị trạng thái hết hạn/superseded. **Đạt khi:** UI theo mock contract, khách không thấy DRAFT/nội dung nội bộ hoặc phản hồi revision cũ; số tiền dùng dữ liệu response; không có luồng thanh toán. Ghép các thao tác cần cho kịch bản báo giá ở T6 khi backend sẵn sàng.
- [ ] **M2-T5 — Portal kết quả Service Request trong luồng tích hợp.** Bổ sung vào màn hình SR M1 để hiển thị result/customerSummary/completedAt/workOrderNo, confirm/reopen và trạng thái xử lý lại. Đây là phần nối màn hình M1 với kết quả M2 theo ADR 0008; có thể dựng payload mock cho trường mới trước. **Đạt khi:** hiển thị kết quả thật trong T6; không truy cập WO/Service Report trực tiếp bằng tài khoản CUSTOMER và không giả định event đồng bộ tức thì.
- [ ] **M2-T6 — Regression M1 và nghiệm thu M2.** Lập `docs/testing/m2-test-cases.md`, bổ sung request mẫu; chạy lại M1 với API thật và ghi kết quả từng ca. Trong 2–3 ngày tích hợp cuối giai đoạn, cùng owner chuyển các màn hình dùng trong kịch bản 9/9 sang Gateway thật và kiểm tra Android. **Đạt khi:** ghi commit/môi trường/case/kết quả/bằng chứng; phân biệt mock/integration/end-to-end; ghi rõ màn hình M2 còn mock để chuyển nốt ở M3. Chủ trì hoàn tất M2-G0b, không ghi Pass cho ca chưa chạy.

## 10. Thứ tự triển khai và phụ thuộc

Thời lượng dự kiến theo kế hoạch gốc: khoảng **3 tuần**, gồm **2–3 ngày tích hợp cuối giai đoạn**. Đây là ước tính để nhóm xếp lịch, không phải cam kết ngày giao. Các dòng sau là năm làn song song, không phải chuỗi backend xong mới bắt đầu frontend.

| Làn | Triển khai độc lập từ đầu giai đoạn | Cuối giai đoạn |
| --- | --- | --- |
| Khương | K1–K6 theo thứ tự nội bộ; fake SR/Identity/Organization/Asset đúng contract, envelope Maintenance tự tạo để test | K7 ghép service thật; K8 chốt upload cho M3 |
| Minh | M1–M6 theo phụ thuộc nội bộ; Asset đã có và envelope WO theo catalog; chốt D02–D05 chỉ cho phần bị ảnh hưởng | M7 ghép WO thật; M8 nháp Inventory |
| Huy | H1–H5 trong SR; test consumer bằng envelope WO, không chờ producer WO | H6 ghép WO thật; H7 nháp Notification và người nhận |
| Nguyên | Gateway N3 ngày đầu; N4–N5 với Identity thật + WO mock; N1/N2 hỗ trợ các PR cần thiết song song | N6 APK debug và Android dùng API thật |
| Hatsady | T1–T5: M1 thật, M2 mock theo contract; chuẩn bị checklist và regression M1 sớm | T6 tích hợp màn hình phục vụ 9/9, ghi bằng chứng và phần chuyển tiếp M3 |

Phụ thuộc cụ thể:

- M2-N1/N2 xử lý các thay đổi dùng chung phát sinh; không phải điều kiện phải hoàn thành toàn bộ trước khi năm người bắt đầu. Mỗi owner dùng các package hiện có và chuẩn bị PR nhỏ cho phần còn thiếu.
- M2-K3 dùng internal reference SR của Huy và Equipment của Asset; contract đã có thì test bằng fake đúng contract trong lúc tích hợp.
- M2-M4 cần snapshot và quy tắc lịch đã chốt; không bỏ qua M2-D02/D03/D05 để chạy scheduler sớm.
- M2-K6 và M2-M5 cần chung quyết định M2-D04 về WO thay thế.
- M2-K4 cung cấp producer hoàn thành khi tích hợp M2-H4/M5/M6; trước đó consumer dùng envelope tự tạo. N5 làm theo contract/report schema và mock, không chờ K4 hoàn thành.
- T2/T3/T4 được nghiệm thu mức UI trên mock contract. T6/N6 và checklist chung mới xác nhận luồng end-to-end thật; mock không chứng minh luồng thật đã hoàn thành.
- G0 là việc bàn giao chung còn thiếu; quyết định D02–D05 chỉ chặn phần code phụ thuộc tương ứng, không chặn cả milestone.

## 11. Điều kiện chốt M2

**Cụ thể hóa “vertical slice 9/9” của kế hoạch gốc để lập test case** (kế hoạch gốc không liệt kê tên từng bước):

| Bước | Thao tác cần chứng minh | Chủ trì bằng chứng |
| --- | --- | --- |
| 1 | Đăng nhập đúng vai trò trên web và Android bằng Identity thật | Nguyên + Hatsady |
| 2 | Khách chọn Equipment của mình và tạo SR trên web | Hatsady + Huy + Minh |
| 3 | Service Manager review bảo hành và đưa SR về ACCEPTED; ca ngoài bảo hành đi qua Estimate được khách duyệt | Huy + Hatsady |
| 4 | Tạo WO từ SR ACCEPTED qua Gateway; event cập nhật SR sang PROCESSING | Khương + Huy |
| 5 | Dispatcher phân công Technician trên web | Khương + Hatsady |
| 6 | Technician thấy My Jobs và accept công việc trên Android | Nguyên + Khương |
| 7 | Technician start và cập nhật tiến độ; có ca hold/resume theo contract | Nguyên + Khương |
| 8 | Technician nộp Service Report và complete trên Android; WO/assignment/event được ghi đúng | Nguyên + Khương |
| 9 | Event cập nhật summary SR và lịch sử Equipment; khách xem kết quả trên web, kiểm tra confirm/reopen theo state machine | Huy + Minh + Hatsady |

Luồng Maintenance và ca hủy/thay thế là các kịch bản bổ sung bắt buộc bên dưới. Từng ca xác định rõ dữ liệu và trạng thái đầu vào; không gộp nhiều nhánh loại trừ nhau vào một lần chạy.

- [ ] Mọi task bắt buộc của M2 có PR đã merge vào `develop`, được owner review theo CONTRIBUTING; M3-prep được báo cáo riêng.
- [ ] CI xanh: lint/typecheck/unit/build, migration/drift, DB tests cần thiết và smoke M1 không bị hỏng.
- [ ] Luồng SR trong bảo hành → WO → phân công → Technician hoàn thành → summary SR → khách xác nhận/reopen chạy thật.
- [ ] Luồng ngoài bảo hành gồm gửi/duyệt/từ chối/sửa/hết hạn Estimate chạy đúng contract.
- [ ] Luồng Maintenance → Task → WO → hoàn thành cập nhật Task và Asset history chạy qua broker thật.
- [ ] Hủy SR/WO, tạo WO thay thế, event trùng/sai thứ tự, retry/DLQ có bằng chứng; không tạo trùng và không âm thầm mất event nghiệp vụ.
- [ ] Scheduler được test với clock điều khiển, tháng/năm nhuận, downtime, pause/resume và nhiều instance; không cần chờ lịch thật để chứng minh logic.
- [ ] Tenant/customer isolation và Technician assignment scope có negative tests; Customer không thấy WO/ghi chú nội bộ.
- [ ] Màn hình M1 dùng API thật, regression có kết quả từng ca. Web + Android thực hiện 9/9 bước trên backend thật; APK debug cài được và widget test các màn hình mobile chính đạt. Màn hình web M2 chưa tham gia luồng tích hợp có thể còn mock và phải được liệt kê để chuyển sang API thật trong M3.
- [ ] Gửi cùng event hai lần vẫn chỉ có một kết quả nghiệp vụ/history tương ứng; lặp tick scheduler không sinh task trùng.
- [ ] Đầu ra cuối M2 đủ: K3 internal WO reference, K8 contract upload đã chốt, M8 nháp Inventory, H7 nháp Notification + bảng event/người nhận. Chưa yêu cầu code Inventory/Notification/upload ở M2.
- [ ] README, OpenAPI/event/ADR/ERD liên quan khớp implementation; hướng dẫn seed, test, replay và demo được bàn giao.
- [ ] Cả nhóm duyệt bảng nghiệm thu; sau đó người được giao quản lý release thực hiện PR `develop` → `main` và tag `m2` tại commit đã nghiệm thu.

## 12. Cách dùng checklist và tài liệu tham chiếu

Mỗi task nên thành một PR có phạm vi rõ, ghi mã task, phần đã làm, cách kiểm tra, kết quả thực và phụ thuộc chưa xong. Chỉ tick khi đã đạt tiêu chí của task; đang code/đang review chưa được coi là hoàn thành. Không cần giữ nhánh đã merge để lưu bằng chứng; dùng PR, commit và tag nghiệm thu.

Tài liệu nguồn:

- [CONTRIBUTING — ownership, PR và Definition of Done](../../CONTRIBUTING.md).
- [Packages dùng chung](../../packages/README.md).
- [Work Order API](../api/workorder.yaml), [Maintenance API](../api/maintenance.yaml), [Service Request/Cost Estimate API](../api/service-request.yaml).
- [State machines](../architecture/state-machines.md), [event catalog](../architecture/events.md).
- [ADR 0002 — Task/WO](../decisions/0002-workorder-maintenance-task-index.md), [ADR 0003 — customer scope](../decisions/0003-customer-scope.md), [ADR 0004 — auth](../decisions/0004-service-auth-and-authorization.md), [ADR 0005 — event transport](../decisions/0005-event-transport.md).
- [ADR 0007 — snapshot và lịch Maintenance](../decisions/0007-maintenance-snapshot.md), [ADR 0008 — quyết định review M1](../decisions/0008-m1-review-decisions.md).
- [Checklist M1](../testing/m1-test-cases.md); [CI tại mốc đối chiếu](https://github.com/neyugn261/pbl6-saas-equipment/actions/runs/40170313309).
- Tài liệu người dùng cung cấp: **`Kế hoạch 5 người.md` (17/10/2026)** là căn cứ phân công và ranh giới M2/M3; `Review cuối.md`, `Review cuối M1.md`, `ke-hoach-minh-va-prompts-ai.md` (kế hoạch Minh 21/10/2026) bổ sung việc review. Các prompt cũ được dùng làm tham khảo; nếu khác ADR/contract Accepted hiện hành thì cần đối chiếu trước khi thực hiện.

### Những điểm cập nhật so với kế hoạch ngày 17/10

- Giữ ownership 5 người và cách làm song song; bổ sung ngoại lệ PR dùng chung cho dependency/test DB/event thực tế còn thiếu, theo CONTRIBUTING.
- WorkOrderCompleted/Cancelled dùng v2 theo ADR 0008; Cancelled có thể đưa SR về CANCELLED hoặc ACCEPTED theo `cancelServiceRequest`, không mặc định luôn ACCEPTED như bản cũ.
- Queue Service Request theo implementation hiện hành là `service-request-service.work-orders`; không tạo queue mới chỉ để khớp tên `service-request-service.workorder` của kế hoạch cũ.
- Maintenance tuân thủ ADR 0007 mới Accepted; EquipmentMoved là phần bổ sung đã được quyết định về nghiệp vụ, còn cần chốt event contract/thứ tự xử lý.
- Web M1 đã chuyển sang Gateway từ các PR trước; task hiện tại là xác minh/regression, không làm lại. Web M2 vẫn được phát triển trên mock; toàn bộ web M2 dùng API thật là đầu ra M3.
- K8/H7/M8 là công việc cuối M2 để người khác bắt đầu M3, không được bỏ sót dù chưa code chức năng M3.
