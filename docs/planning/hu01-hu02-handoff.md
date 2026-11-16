# HU-01/HU-02 — bàn giao Nguyên và Khương

Baseline `70829ff`; không đổi event contract, enum, WO production code hay Web/Gateway.

## Khảo sát

- Dùng API WO hiện có: Gateway `POST /api/workorders/work-orders`, body
  `{ "serviceRequestId": "<uuid>", "type": "INSPECTION" }`.
- Service Manager đúng tenant/branch, SR `REVIEWING` hoặc `ACCEPTED`, đã có branch,
  tham chiếu equipment/customer hợp lệ. Không đổi SR sang ACCEPTED để vượt guard.
- WO đang hoạt động cùng SR: 409 `ACTIVE_WORK_ORDER_EXISTS`. Không đủ điều kiện:
  422 `SERVICE_REQUEST_NOT_READY_FOR_INSPECTION`; thiếu routing:
  422 `BRANCH_ROUTING_REQUIRED`. Scope/quyền: 404/403 theo contract hiện có.
- API tạo WO hiện không có idempotency key nghiệp vụ; unique/lock đảm bảo chỉ một
  WO active. Retry tạo lặp trả 409, client đọc WO hiện có trước khi thử tiếp.
- Created → SR PROCESSING; INSPECTION completed → REVIEWING, resolvedAt null.
  Kết quả, WO number, customer summary và checklist lưu theo projection hiện có;
  ledger giữ receipt/report ID và lý do nội bộ. Không tự tạo estimate hoặc đóng SR.
- Khảo sát không phát sinh phí trong luồng này. Dự toán sửa chữa dùng API SR hiện có,
  không đưa phí khảo sát vào dòng dự toán. Chỉ khách đúng customer được phản hồi bản SENT.
- Consumer dùng ledger đã có để bỏ duplicate và bảo vệ occurrence mới khi event cũ replay.
  Notification phân biệt khảo sát hoàn tất với sửa chữa thành công.

## Hàng chờ

- Admin: `GET /api/service-requests?unallocated=true`.
- Allocate: `PATCH /api/service-requests/:id/branch` với
  `{ branchId, expectedBranchId, reason }`; row lock + expected branch kiểm tra cạnh tranh.
  409 `BRANCH_VERSION_CONFLICT` yêu cầu tải lại. No-op cùng branch không ghi history/event.
- Manager: `GET /api/service-requests?followUp=UNRESOLVED` hoặc
  `PARTIALLY_RESOLVED`; filter giao với tenant/branch và trạng thái nghiệp vụ hiện hành.
- `followUp`: result, reason, workOrderId/workOrderNo, recordedAt, responsibleRole,
  nextAction. Reason chỉ lấy từ occurrence COMPLETED khớp hiện trạng và quyền đọc nội bộ.
  Customer không được dùng hàng chờ và không nhận reason nội bộ.
- `UNRESOLVED`: cảnh báo đỏ ở UI do Nguyên nghiệm thu. Đọc notification không xóa ca
  khỏi hàng chờ. Khi WO mới hoạt động/đã xử lý, cảnh báo hiện hành không dùng WO cũ.
- Deep link dùng resourceType/resourceId hiện có; không thay routes. Không rewrite
  notification lịch sử hoặc giả số unread khi 403.

## Phụ thuộc còn mở

- Nguyên nghiệm thu dashboard/Web thật và Identity review; phiên này chỉ tự động hóa API.
- Khương: SIGNED cần owner chốt bắt buộc signerTitle/signature file và quy tắc ký lại
  khi nội dung đổi. Source hiện có sign-off nhưng các field này còn optional.
- Minh: chưa thấy bulk handover endpoint/contract trong checkout; không thay bằng loop
  tạo từng phiếu rồi tuyên bố hoàn thành API bulk.
- Khương: API báo cáo hiện có created/completed counts; chưa có KPI theo người thực sự
  hoàn tất, tỷ lệ thành công bỏ INSPECTION, on-time. Fixture nghiệm thu đề xuất:
  1 REPAIR RESOLVED đúng hạn, 1 WARRANTY UNRESOLVED trễ hạn, 1 INSPECTION RESOLVED;
  completed=3, mẫu số sửa chữa=2, sửa thành công=1. Khi đổi assignment, công cho actor
  hoàn tất thật; kiểm hai branch, biên thời gian có offset và scheduledEnd null riêng.
- H01/H02/H03 đầy đủ được nhắc trong prompt nhưng review 12/11 xác nhận một số contract
  chưa ở source. Không dùng bảng DB cũ làm chứng cứ chức năng đã merge.
