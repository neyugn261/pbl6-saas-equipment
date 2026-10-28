# M2 — Tuần 3 của Khương

**Cập nhật 28/10/2026:** baseline develop `76c179b` đã nhận #26/#27 và backend
Maintenance của Minh. Issue #31 được triển khai trên
`feature/khuong-maintenance-replacement`: consumer replacement, migration WO
0004, khóa nguồn và integration producer thật. Kết quả/triển khai/replay:
[K6 replacement](../testing/m2-maintenance-replacement-test-cases.md).
Chờ review/merge; F09/F10/F11 của SR và K8 vẫn tách riêng. Phần ghi ngày 27/10
bên dưới lưu lịch sử trước khi tích hợp, không phải trạng thái hiện tại.

Cập nhật 2026-10-27. Baseline develop `988dbe0` đã nhận đầy đủ tuần 2 qua
[PR #25](https://github.com/neyugn261/pbl6-saas-equipment/pull/25), sau #22–#24.
[CI develop](https://github.com/neyugn261/pbl6-saas-equipment/actions/runs/40376976083)
SUCCESS. Implementation K6 bước đầu: `d658a56`.

## Tiến độ

| Task | Hiện trạng | Việc còn lại |
| --- | --- | --- |
| K4 | Đã merge develop qua #25, regression chạy lại đạt | Nghiệm thu UI với Nguyên/Hatsady trong K7 |
| K5 | Phía WO đã merge; DB/race và broker smoke đạt | H4 phía SR do Huy sửa; chưa nghiệm thu WO thay thế |
| K6 tạo lần đầu | Đã code/test local: MaintenanceTaskDue v1 → WO/history/outbox/inbox cùng transaction | Review/merge; tích hợp scheduler thật khi Minh sẵn sàng |
| K6 thay thế | Khương đã chốt Service Manager chủ động yêu cầu | Chốt contract kỹ thuật cùng Minh/Nguyên trước triển khai |
| K7 | Regression M1/M2 + maintenance fixture qua broker/Gateway đạt | Scheduler/Task state thật, Asset history, ngoài bảo hành/Estimate, UI Web/Android |
| K8 | Chưa bắt đầu | Contract upload/visibility cho M3, review với consumer; chưa code MinIO |

## PR review

| PR | Base | Phạm vi |
| --- | --- | --- |
| [#26](https://github.com/neyugn261/pbl6-saas-equipment/pull/26) | develop | Consumer K6 tạo lần đầu, helper cấp số dùng chung, tests và bằng chứng |
| [#27](https://github.com/neyugn261/pbl6-saas-equipment/pull/27) | develop | Queue registry dùng chung; Nguyên/Minh review |

Cả hai đã push, mở draft PR và **cùng target develop**; không cần đổi base.
Merge #26 trước hoặc cùng đợt #27. Chưa merge; CI mới nhất xem Checks của PR.
Smoke Maintenance riêng đã chạy local, chưa phải bước CI.

## K6 đã triển khai

- Queue `workorder-service.maintenance-tasks`, inbox handler
  `workorder-service.maintenance-task-due` chỉ nhận MaintenanceTaskDue v1.
- Validate catalog, tenant khác null, producer/aggregate và Task ID khớp; kiểm
  tra ngày lịch thực, gồm leap day. Metadata producer không thay broker ACL.
- Snapshot customer/equipment/site từ Maintenance; không gọi Asset/Identity
  bằng user/token giả, không đọc database service khác.
- MAINTENANCE/NORMAL/CREATED, `createdBy=null`, status history actor null,
  không có work log cho event hệ thống. Phát Created v1 giữ correlation ID.
- Dùng cùng sequence WO với create từ SR; khóa theo task UUID chuẩn hóa chữ
  thường trước kiểm tra tồn tại. Một task tạo lần đầu tối đa một WO, kể cả
  event ID khác; task đã COMPLETED/CANCELLED không được tự tạo lại từ Due.
- scheduledDate lưu tại scheduledStart là 00:00 ngày đó ở +07:00, scheduledEnd
  null. Đây là mốc biểu diễn ngày lịch; chưa phải giờ hẹn đã thống nhất với khách.
  Dispatcher/Manager vẫn sửa lịch theo API hiện hành.
- Không đổi schema/migration, RBAC, OpenAPI hoặc event catalog v1.

[Bằng chứng K6](../testing/m2-maintenance-test-cases.md) phân biệt PostgreSQL,
fixture producer và broker thật; chưa có bằng chứng Maintenance producer thật.
CI DB suite có sẵn tự tìm test mới; smoke Maintenance riêng đã chạy local,
chưa được thêm vào job CI. Lệnh và queue có trong README WO.

## Hợp đồng thay thế cần Minh/Nguyên review

D04 về nghiệp vụ đã chốt, không cần hỏi lại người dùng cùng quyết định. Các
điểm dưới đây là đầu vào thiết kế liên service, **chưa phải contract được duyệt**:

1. Maintenance sở hữu thao tác yêu cầu thay thế trên Task PENDING sau hủy;
   Service Manager có quyền quản lý bảo trì chủ động yêu cầu. Xác định endpoint,
   event/version và ai lưu request ID bền vững trước code.
2. Mỗi yêu cầu có request ID riêng; retry dùng lại ID đó. Giữ nguyên task ID,
   scheduledDate và ràng buộc không tạo WO nếu task đã hoàn tất hoặc có WO hợp lệ.
3. Phân biệt Due lần đầu với yêu cầu thay thế; không gán nghĩa mới cho replay
   Due v1 và không suy ra ý định người dùng từ một eventId mới.
4. Định nghĩa tương quan WO cũ/mới, quy tắc event đảo thứ tự và inbox rollback;
   cancellation cũ không được đè trạng thái WO mới/Task hoàn tất.
5. Chốt giới hạn retry/backoff/DLQ và thao tác vận hành; không retry tự tạo WO
   vô hạn. Transport hiện có tối đa 5 attempts, delay 2/4/8/16 giây trước DLQ;
   retry transport không thay thế idempotency nghiệp vụ.

Chưa sửa schema Maintenance hoặc thêm event/API khi các điểm này chưa review.
H4 của SR và consumer Task của Minh cần kiểm chứng riêng theo owner; không kết
luận lỗi cùng kiểu trên Maintenance đã được giải quyết chỉ vì phía WO tạo đúng.

## Việc tiếp theo

- Review PR K6 tạo lần đầu trên base **develop**; Nguyên review tenant isolation.
- Minh nối producer/scheduler và consumer Created/Completed/Cancelled; kiểm
  chứng Task state và Asset history bằng DB/broker thật.
- Huy sửa [H4](../testing/h4-stale-work-order-events.md) trước nghiệm thu nhánh
  SR thay thế; Khương không sửa SR thay owner trong PR K6 này.
- Sau contract thay thế được duyệt: triển khai K6 còn lại, tổng hợp K7 và làm K8.

Nhật ký 2026-10-27: xác nhận #25 merged develop/CI SUCCESS; triển khai K6 tạo
lần đầu `d658a56`, 79 DB + 183 unit/transport + 2 bootstrap tests PASS; smoke
M1/tuần 1/tuần 2 và Maintenance fixture qua broker thật PASS. Chờ review/merge K6.
