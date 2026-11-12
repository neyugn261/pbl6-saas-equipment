# Khương — Đề xuất thiết kế Field Sign-off (Xác nhận nghiệm thu hiện trường)

Ngày: 13/11/2026.  
Liên quan: **Task 3.3** trong bản phân công và mục 13, tiêu chí kiểm thử `RV-13` trong `2026-11-12-review-loi-va-phan-cong.md`.  
Chủ sở hữu: **Khương** (Work Order Service & Mobile). Phối hợp: **Huy** (Service Request & Notification), **Nguyên** (Web Portal & UI).

---

## 1. Bối cảnh & Vấn đề giải quyết

Trong quy trình dịch vụ kỹ thuật thực tế (Field Service Management):
- Khi Kỹ thuật viên (KTV) hoàn thành công việc tại hiện trường, đại diện khách hàng (Customer Staff/Admin) cần kiểm tra hoạt động của thiết bị và ký xác nhận vào biên bản nghiệm thu (Service Report).
- **Vấn đề cốt lõi cần giải quyết (tránh sai lầm thiết kế)**:
  1. **Không tạo vòng lặp khóa cứng (Circular deadlock)**: Không được bắt buộc 100% mọi ca đều phải có chữ ký trực tiếp thì mới cho phép KTV nộp báo cáo kỹ thuật. Nếu khách hàng vắng mặt (sửa ca đêm, khách bận họp, thiết bị đặt tại địa điểm không người trực) hoặc khách từ chối ký, KTV vẫn phải nộp được báo cáo kỹ thuật để kết thúc phiên làm việc.
  2. **Tách biệt rõ hai khái niệm**:
     - **Hoàn tất kỹ thuật (`Technical Completion`)**: Do KTV chịu trách nhiệm (đã kiểm tra, đã thay thế linh kiện, kết quả kỹ thuật là `RESOLVED` / `PARTIALLY_RESOLVED` / `UNRESOLVED`).
     - **Xác nhận của khách hàng (`Customer Acceptance / Sign-off`)**: Ghi nhận ý kiến, họ tên, chữ ký của người đại diện bên khách hàng, hoặc lý do tại sao không ký được.
  3. **Bằng chứng số bền vững**: Chữ ký cảm ứng (vẽ tay trên màn hình cảm ứng điện thoại) được lưu thành ảnh PNG và tải lên MinIO Object Storage thông qua hạ tầng đính kèm `report_attachments` có sẵn (ADR 0013).

---

## 2. Mô hình trạng thái Nghiệm thu hiện trường (`SignOffStatus`)

Trường `sign_off_status` trên `ServiceReport` hỗ trợ 4 trạng thái rõ ràng:

| Trạng thái | Ý nghĩa nghiệp vụ | Dữ liệu bắt buộc đi kèm |
| :--- | :--- | :--- |
| `SIGNED` | Khách hàng đã kiểm tra và ký xác nhận tại chỗ. | `signerName` (Họ tên người ký). Khuyến nghị kèm `signatureAttachmentId` (ảnh chữ ký trên MinIO). |
| `CUSTOMER_ABSENT` | Đại diện khách hàng vắng mặt tại thời điểm KTV hoàn tất. | `notes` (Ghi chú giải trình lý do vắng mặt). |
| `CUSTOMER_REFUSED` | Khách hàng có mặt nhưng từ chối ký biên bản. | `notes` (Bắt buộc ghi rõ lý do khách không đồng ý ký). |
| `NOT_APPLICABLE` | Ca dịch vụ không yêu cầu chữ ký tại chỗ (ví dụ WO khảo sát nội bộ, hỗ trợ từ xa). | Không bắt buộc thông tin phụ (mặc định nếu không cung cấp). |

---

## 3. Thiết kế Database Schema (`workorder_db`)

Mở rộng bảng `service_reports` thông qua migration `20261113093000_service_report_field_sign_off`:

```sql
ALTER TABLE "service_reports"
  ADD COLUMN "sign_off_status" VARCHAR(30) NOT NULL DEFAULT 'NOT_APPLICABLE',
  ADD COLUMN "signer_name" VARCHAR(100),
  ADD COLUMN "signer_title" VARCHAR(100),
  ADD COLUMN "signer_phone" VARCHAR(30),
  ADD COLUMN "signed_at" TIMESTAMPTZ(6),
  ADD COLUMN "signature_attachment_id" UUID,
  ADD COLUMN "sign_off_notes" TEXT;

ALTER TABLE "service_reports"
  ADD CONSTRAINT "service_reports_sign_off_status_check"
    CHECK ("sign_off_status" IN ('SIGNED', 'CUSTOMER_ABSENT', 'CUSTOMER_REFUSED', 'NOT_APPLICABLE'));
```

### Giải thích các trường:
- `sign_off_status`: Trạng thái xác nhận (mặc định `NOT_APPLICABLE` để tương thích hoàn toàn dữ liệu cũ).
- `signer_name`: Họ tên người đại diện ký biên bản (ví dụ "Nguyễn Văn A").
- `signer_title`: Chức vụ/vai trò của người ký (ví dụ "Trưởng ca vận hành", "Quản lý tòa nhà").
- `signer_phone`: Số điện thoại người ký (dùng đối soát nếu cần).
- `signed_at`: Thời điểm ký thực tế.
- `signature_attachment_id`: ID tham chiếu đến file ảnh chữ ký lưu trữ trong hệ thống attachments (MinIO).
- `sign_off_notes`: Ghi chú hoặc lý do từ chối / vắng mặt.

---

## 4. Thiết kế API Contract

### 4.1. Nộp báo cáo hoàn thành kèm chữ ký ngay lập tức
API hiện tại: `POST /api/v1/work-orders/{id}/complete`  
Trong body `report`, thêm trường tùy chọn `signOff`:

```json
{
  "problemDescription": "Máy bơm áp lực bị rò rỉ van cấp",
  "rootCause": "Gioăng cao su bị lão hóa và nứt gãy",
  "solution": "Thay thế bộ gioăng chịu nhiệt mới",
  "result": "RESOLVED",
  "customerSummary": "Đã thay gioăng van cấp, máy chạy thử 15 phút không rò rỉ",
  "signOff": {
    "status": "SIGNED",
    "signerName": "Trần Thị B",
    "signerTitle": "Kỹ thuật viên vận hành xưởng A",
    "signerPhone": "0987654321",
    "signatureAttachmentId": "b3e34b12-9c12-4e56-8a71-6c24387d8901"
  }
}
```

Nếu khách vắng mặt hoặc từ chối:
```json
{
  "signOff": {
    "status": "CUSTOMER_REFUSED",
    "notes": "Khách hàng cho rằng tiếng ồn động cơ vẫn hơi lớn, yêu cầu theo dõi thêm trước khi ký."
  }
}
```

### 4.2. Endpoint cập nhật chữ ký độc lập sau khi báo cáo đã lập
`POST /api/v1/work-orders/{id}/service-report/sign-off`
- **Mục đích**: Cho phép KTV hoặc Service Manager bổ sung chữ ký/xác nhận sau khi Service Report đã được tạo (ví dụ KTV nộp báo cáo kỹ thuật trước, sau đó đưa khách ký; hoặc khách gửi biên bản giấy có chữ ký sau).
- **Quyền**: `work_order:execute` (KTV được phân công) hoặc `work_order:manage` (Service Manager).
- **Payload**: Chính là object `SignOffInputDto` ở trên.

### 4.3. API xem chi tiết Service Report
`GET /api/v1/work-orders/{id}/service-report`
Trả về kèm object `signOff`:
```json
{
  "id": "...",
  "workOrderId": "...",
  "technicianId": "...",
  "problemDescription": "...",
  "solution": "...",
  "result": "RESOLVED",
  "customerSummary": "...",
  "signOff": {
    "status": "SIGNED",
    "signerName": "Trần Thị B",
    "signerTitle": "Kỹ thuật viên vận hành xưởng A",
    "signerPhone": "0987654321",
    "signedAt": "2026-11-13T09:30:00.000Z",
    "signatureAttachmentId": "b3e34b12-9c12-4e56-8a71-6c24387d8901",
    "notes": null
  }
}
```

---

## 5. Event Contract (`WorkOrderCompletedV2`)

Trong `packages/event-contracts/src/catalog.ts`, bổ sung thông tin sign-off tùy chọn vào `WorkOrderCompletedV2`:

```typescript
export interface WorkOrderSignOffPayload {
  status: 'SIGNED' | 'CUSTOMER_ABSENT' | 'CUSTOMER_REFUSED' | 'NOT_APPLICABLE';
  signerName?: string | null;
  signerTitle?: string | null;
  signerPhone?: string | null;
  signedAt?: string | null;
  signatureAttachmentId?: string | null;
  notes?: string | null;
}

export interface WorkOrderCompletedV2 extends WorkOrderCompletedV1 {
  customerChecklist?: CustomerChecklistResult[];
  customerSummary: string;
  unresolvedReason?: string | null;
  signOff?: WorkOrderSignOffPayload | null;
}
```

---

## 6. Phân công và Lộ trình tích hợp

| Đầu mối | Trách nhiệm |
| :--- | :--- |
| **Khương** | Viết migration `service_reports_signoff`, DTO, service logic, endpoint `POST .../sign-off`, event payload và tests DB/Unit. |
| **Khương (Mobile)** | Thêm bước Signature Pad vẽ tay trên Flutter trước khi gọi hoàn thành WO. |
| **Nguyên (Web)** | Hiển thị thông tin người ký, ảnh chữ ký trên giao diện xem Service Report của Service Manager. |
| **Huy (SR)** | Lưu nhận diện signOff nếu cần chiếu lên Customer Portal. |
