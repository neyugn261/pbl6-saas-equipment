# Minh M2 — bàn giao ngày 27/10/2026

Phạm vi theo M2-M1–M2-M8 trong [task list](m2-task-assignment.md).
Code nằm trên nhánh riêng `codex/minh-maintenance-foundation`; không đồng nghĩa
đã merge hoặc đã được các owner duyệt. Người dùng đã chọn chỉ sửa phần Minh,
bàn giao phần tạo Work Order thay thế cho Khương.

Phần hồ sơ thiết bị/lịch sử chi tiết được phê duyệt sau M2 có thiết kế ADR 0010,
contract `equipment-dossier.yaml` và `maintenance-history.yaml`; hướng dẫn nối
giao diện/bàn giao chủ phần việc ở [equipment-dossier-handoff.md](equipment-dossier-handoff.md).

## Khương: nối Work Order thay thế

Maintenance đã có `POST /maintenance-tasks/{id}/replacement`, yêu cầu quyền
`maintenance:manage` và body `{requestId: UUID}`. Task phải PENDING sau một WO
đã bị hủy. Request + outbox nguyên tử, retry giữ requestId và WO ID đã cấp.
Một task không có hai request đang pending. Scheduled date và task ID giữ nguyên.

Event mới để review: `MaintenanceWorkOrderReplacementRequested.v1`, producer
`maintenance-service`, aggregate `MaintenanceTask`, aggregateId = task ID,
tenant/correlation ở envelope. Payload:

```json
{
  "requestId": "UUID",
  "previousWorkOrderId": "UUID",
  "replacementWorkOrderId": "UUID do Maintenance cấp bền vững",
  "requestedBy": "UUID của Service Manager",
  "maintenanceTaskId": "UUID",
  "maintenancePlanId": "UUID",
  "equipmentId": "UUID",
  "customerId": "UUID",
  "customerSiteId": null,
  "scheduledDate": "2026-10-27",
  "title": "Tên kế hoạch"
}
```

Các bước cần ở Work Order (chưa sửa trong đợt của Minh):

1. Subscribe riêng event mới; giữ Due v1 là tạo lần đầu. Validate catalog,
   producer/tenant/aggregate và request/task/WO ID; không dùng token giả.
2. Inbox và khóa nguồn `maintenance-task:<task UUID lowercase>` như consumer
   hiện tại. Kiểm tra WO cũ đúng tenant/task/equipment/customer và CANCELLED;
   không có WO chưa hủy cho task. Retry cùng request không tạo thêm WO.
3. Tạo WO với **id = replacementWorkOrderId**, task/date/snapshot từ request,
   `createdBy = null`; `requestedBy` dùng audit hệ thống phù hợp contract, không
   gán giả thành phiên người dùng. WO/history/outbox Created v1/inbox cùng tx.
4. Phát các event Created/Completed/Cancelled hiện hành. Maintenance nhận đúng
   ID đã lưu và đánh dấu request LINKED; completion/cancel có thể đến trước Created.
5. Kiểm thử request trùng, hai request khác nhau cho cùng task, sai WO cũ, sai
   tenant, replay Due và cancellation cũ sau WO thay thế. Thêm phần producer thật
   vào `apps/maintenance-service/test/vertical-slice.cjs` sau review.

Triển khai queue/binding consumer mới trước khi bật thao tác thay thế trên UI.
Broker confirm chỉ xác nhận publish, không xác nhận nghiệp vụ đã tạo WO. Nếu đã
gửi request trước khi consumer có binding, đối chiếu request còn PENDING và
replay outbox với **cùng event ID/request ID** sau khi consumer sẵn sàng; không
tạo UUID mới để thử lại. Request và payload gốc vẫn được lưu trong Maintenance DB.

Hiện đã kiểm thử thật **Plan → Task → WO lần đầu → complete**, và **WO cancel →
Task PENDING → request thay thế** qua Gateway/RabbitMQ. Nhánh WO thay thế được
kiểm bằng fixture event trong Maintenance DB suite; chưa gọi nó là end-to-end.

## Nguyên: shared/schema/CI review

- Review EquipmentMoved v1, replacement event và [ADR 0009](../decisions/0009-maintenance-m2-runtime.md).
- Asset thêm `snapshot_version` + outbox; Maintenance thêm anchor, Task snapshot,
  equipment cursor, per-WO links và durable replacement requests. Hai migration
  mới giữ nguyên migration cũ; ERD/Prisma được đồng bộ.
- `.env.example`: scheduler enabled/interval. Maintenance test DB đã có từ nhánh
  nền tảng và develop; bộ test chỉ chấp nhận đúng tên DB test.
- CI đã chuẩn bị step chạy vertical slice trên DB test + RabbitMQ, cùng các DB
  suites đã được CI gọi. Shared patch cần review trước merge; chưa có kết quả
  GitHub Actions cho phần local này.
- Ranh giới khách hàng: CUSTOMER_ADMIN chỉ đọc Plan/Task trong customer; CUSTOMER_USER
  không có maintenance:read. Không có thay đổi role/permission ngoài catalog.

## Hatsady: API Maintenance

Gateway `/api/maintenance` + các path trong `maintenance.yaml`. Plan create chỉ
gửi equipmentId/name/description/frequencyUnit/frequencyValue/nextDueDate; không
gửi customer/site/tenant. Task do scheduler tạo, không có POST tạo task công khai.
Thao tác PAUSED → ACTIVE khởi động lại lịch từ ngày hiện tại ở Việt Nam; INACTIVE
là cuối. Sửa lịch không đổi task cũ. Completion không làm lệch ngày gốc.

Task giữ workOrderId của WO bị hủy khi về PENDING để xác định nguồn thay thế.
Frontend tạo một UUID requestId cho mỗi lần người dùng yêu cầu; retry giữ UUID.
Hiện nút này có thể tạo request bền vững nhưng chưa có WO mới cho đến khi Khương
nối consumer; hiển thị PENDING đúng thực tế, không báo đã phân công lại.

## Inventory M3-prep (M2-M8)

Đã soạn [inventory.yaml](../api/inventory.yaml) theo ERD và ADR 0006, chưa code
Inventory API. Các quy tắc đã có: decimal quantity NUMERIC(12,2), cost NUMERIC(14,2);
ISSUE và WorkOrderPart cùng transaction (F09); quantityUsed là số đã xuất,
net consumed = quantityUsed − quantityReturned; RETURN cập nhật ledger/stock/
quantityReturned nguyên tử; không vượt số đã xuất; không tồn âm.

Các đề xuất cần chốt với Khương/Huy/Nguyên trước M3:

| Điểm review | Đề xuất cụ thể |
| --- | --- |
| Idempotency | UUID header bắt buộc cho receive/adjust/issue/return; bảng bền vững unique tenant+key, hash endpoint/body và response; replay cùng nội dung trả kết quả cũ, khác nội dung 409; cần migration mới, chưa thêm ở M2. |
| WO terminal | Issue chỉ sau kiểm tra WO chưa COMPLETED/CANCELLED qua API nội bộ. Race WO hoàn thành trong lúc xuất không có transaction xuyên DB; cần chốt kiểm tra cuối, reservation hoặc chấp nhận eventual consistency. |
| Return sau WO kết thúc | Cho phép đối soát trả phần chưa dùng khi WO đã completed/cancelled; cùng tenant và số còn được trả; owner cần duyệt trước code. |
| INACTIVE | Không xuất/nhập mới cho Part/Warehouse INACTIVE; cần chốt có cho phép RETURN để đối soát hay phải active lại. |
| LowStockDetected | Dùng event v1 có sẵn. quantity < minQuantity và latch chưa bật → một outbox event; quantity >= minQuantity xóa latch. Cấu hình nâng minQuantity cũng xét crossing; Huy xác nhận rule nhận thông báo. |
| Quyền | Dùng catalog hiện hành inventory:read/manage/issue; CUSTOMER không được xem kho; không tự mở Technician tự xuất. |
| Môi trường/CI | Nguyên chuẩn bị INVENTORY_TEST_DATABASE_URL=inventory_test_db, shadow DB và chạy suite owner cung cấp; Prisma/migration/drift/seed hai lần, concurrency và rollback. Không triển khai API kho trong M2. |

Tài liệu này là bàn giao trong repository; chưa gửi tin nhắn cho thành viên khác
và chưa thay thế review chính thức của nhóm.
