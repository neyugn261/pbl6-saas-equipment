# K8 — Attachment contract bàn giao M3

Owner: Khương. Ngày 28/10/2026. Bản contract phía owner đã xác định hành vi để
web/mobile triển khai theo mock; **cần Nguyên/Hatsady review và Huy review phần
SR composition**. Không ghi nhận approval thay các thành viên. OpenAPI:
[workorder-attachments.yaml](workorder-attachments.yaml). API này chưa có trong M2;
request vào các route mới hiện không được xem là upload đã triển khai.

## Quyết định của contract

- JPEG/PNG/PDF, 1–10 MiB, SHA-256 hex; 10 slot/parent gồm file đã attach và intent
  chưa hết hạn, WO và report tính riêng. Đây là giới hạn owner chọn cho MVP M3.
- Upload signed PUT 300 giây, download signed GET 60 giây; mọi ticket/link trả
  Cache-Control:no-store. Browser/Flutter dùng đúng headers trong ticket, không
  gửi JWT của API tới storage. Không lưu/log signed URL hoặc storage credentials.
- Client không chọn tenant/customer/uploader/storageKey. Tên file chỉ basename,
  không path/control characters; backend cấp key ngẫu nhiên theo tenant/target.
- Upload intent gắn tenant + uploader userId + parent + MIME/bytes/checksum/
  visibility bất biến. JWT refresh không thay userId; account/permission/scope
  được kiểm tra lại ở finalize. Quota reservation và idempotency phải có DB lock.
- Idempotency-Key UUID bắt buộc cho prepare/finalize, scope tenant + user +
  logical operation; cùng key đổi parent/payload → 409. Retry giữ key, không
  gia hạn TTL. Intent hết hạn cần ý định mới với key mới, không tự retry vô hạn.
- PUT chỉ ghi **staging object**. Finalize đọc/kiểm tra actual bytes, MIME và
  hash, rồi tạo final object riêng từ chính bytes/version đã kiểm tra. Không
  ký PUT vào final key; tránh ghi đè file đã verify bằng URL staging còn hạn.
- Object storage và DB không có transaction nguyên tử: chỉ publish metadata
  sau verification/final object thành công; DB attachment + intent ATTACHED
  nguyên tử. Orphan/abort/expire/delete có durable cleanup retry; không xóa final
  object của một attachment hợp lệ khi dọn staging.
- Metadata không chứa storageKey hoặc URL cố định. Download ký lại sau kiểm tra
  attachment-parent-tenant/scope/visibility. Hide/delete không thu hồi tức thì
  URL đã cấp; quyền đó hết hạn trong tối đa 60 giây theo contract.

## Quyền và trạng thái

| Thao tác | Actor/trạng thái |
| --- | --- |
| Read WO/report files | TENANT_STAFF + work_order:read, giữ scope Technician từng/đang được giao như API WO |
| Upload WO | work_order:manage, hoặc Technician hiện có assignment ACCEPTED với work_order:execute; WO ACCEPTED/TRAVELLING/IN_PROGRESS/ON_HOLD đối với Technician; manager được WO non-terminal |
| Upload report | WO COMPLETED, report đã tồn tại; work_order:manage hoặc Technician tác giả report có service_report:submit + work_order:execute |
| Finalize | Chính uploader và quyền/state còn hợp lệ; đổi assignment hoặc parent terminal sai target → từ chối, không attach |
| Publish CUSTOMER / đổi visibility | work_order:manage; Technician upload INTERNAL; manager có thể publish sau completion |
| Delete | Manager hoặc uploader còn quyền mutation của target; WO non-terminal, report COMPLETED; audit/tombstone và cleanup retry |
| CUSTOMER | Chỉ đọc CUSTOMER files qua SR composition; không gọi staff WO/report API, không đếm INTERNAL |

Default INTERNAL theo ADR 0006. FileName cũng là nội dung được công bố khi manager
chọn CUSTOMER; UI phải hiển thị rõ trước khi publish. Không đổi catalog role/quyền.

## Error codes để client xử lý

| HTTP | Code | Hành vi client |
| --- | --- | --- |
| 400 | VALIDATION_FAILED | Sửa metadata/query/header; field ngoài whitelist bị từ chối |
| 401 | INVALID_ACCESS_TOKEN | Refresh/đăng nhập rồi kiểm tra lại quyền; không gửi JWT tới storage |
| 403 | FORBIDDEN | Actor thiếu quyền, Technician yêu cầu CUSTOMER hoặc CUSTOMER vào staff API |
| 404 | UPLOAD_NOT_FOUND / ATTACHMENT_NOT_FOUND / WORK_ORDER_NOT_FOUND / SERVICE_REPORT_NOT_FOUND | Không phân biệt record thiếu với record ngoài scope |
| 409 | IDEMPOTENCY_KEY_REUSED | Không retry key đó với payload/target khác |
| 409 | ATTACHMENT_LIMIT_REACHED | Bỏ intent/file không dùng trước khi thêm slot mới |
| 409 | ATTACHMENT_PARENT_STATE_CONFLICT | Refresh parent/allowedActions; không tự reset trạng thái |
| 409 | UPLOAD_NOT_READY / UPLOAD_EXPIRED / UPLOAD_ALREADY_ATTACHED | Chờ PUT, tạo ý định mới sau expiry, hoặc dùng attachment đã trả tùy code |
| 413 | ATTACHMENT_TOO_LARGE | Chọn file trong giới hạn |
| 415 | ATTACHMENT_TYPE_UNSUPPORTED | Chọn JPEG/PNG/PDF |
| 422 | UPLOAD_VERIFICATION_FAILED | Không công bố file; kiểm tra bytes/type/hash và tạo intent phù hợp |
| 503 | ATTACHMENT_STORAGE_UNAVAILABLE | Giữ key/uploadId để retry khi storage phục hồi |

## Web/mobile flow

1. Chọn file, kiểm tra loại/kích thước, tính hash; giữ file tạm trên thiết bị.
2. WO evidence: prepare → PUT staging → finalize → refresh danh sách file. Không
   báo “đã đính kèm” chỉ vì PUT trả thành công.
3. Report evidence: gọi complete WO với Service Report hiện có trước. Khi đã
   nhận/xác minh WO COMPLETED và report tồn tại, prepare/upload/finalize report
   attachments. Mất response complete thì GET WO/report để phục hồi; không tạo
   report mới. Upload lỗi không rollback report; retry riêng các file còn thiếu.
4. Network error retry cùng uploadId/key. 401 refresh token rồi kiểm tra lại;
   409 parent/expiry/idempotency cần phản hồi rõ; 413/415 yêu cầu chọn file khác;
   422 không publish attachment. Bỏ intent cũ bằng abort khi người dùng hủy.
5. Download lấy link mới khi người dùng bấm; không prefetch/cache link vào
   localStorage. Danh sách có loading/empty/error; unavailable không phải zero.

## SR owner handoff — cần Huy review trước M3 implementation

Public routes đề xuất ở SR: `GET /service-requests/{id}/result/attachments` và
`GET /service-requests/{id}/result/attachments/{attachmentId}/download`. SR tự
authorize request theo ADR 0003 rồi gọi các internal projection routes trong
OpenAPI WO bằng **token người gọi**, correlation ID, theo ADR 0004.

WO internal projection chỉ trả file CUSTOMER của WO có serviceRequestId đúng
path, tenant/customer đúng claims; report attachment truy ngược report → WO → SR.
Staff vẫn giữ WO/assignment scope; CUSTOMER không được raw WO/report. Attachment
ID của SR khác hoặc file INTERNAL/deleted → 404; list/count cùng filter. Không
gộp Maintenance files vào SR. ParentId/uploaderId/storageKey/internal notes bị
loại khỏi public metadata. Gateway tiếp tục chặn /internal; đây không phải mở
permission work_order:read cho CUSTOMER hoặc tạo machine token giả.

WO internal không có WO phù hợp scope → 404; không đoán ownership của một SR
chưa có trong dữ liệu local. Sau khi tự authorize SR, SR owner có thể ánh xạ
source 404 thành trang rỗng. Có WO đúng scope nhưng không có file công bố → 200
trang rỗng; INTERNAL không xuất hiện trong count.
Nguồn WO unavailable phải trả lỗi/section unavailable, không giả trang rỗng.
SR paths chưa được thêm vào service-request.yaml hoặc implementation trong K8;
Huy sở hữu phần tích hợp đó và review contract trước khi M3 code.

## Persistence cần chuẩn bị khi triển khai M3

Các bảng attachment hiện có chỉ lưu key/name/MIME/visibility/actor/time; chưa
có upload intent, byte size/hash, idempotency result hoặc tombstone/cleanup claim.
M3 phải có ADR/ERD và migration **mới** cho các dữ liệu này trước implementation.
K8 không apply schema mới, không sửa migration visibility 0002.

Nguyên cấu hình public storage host để browser/Android truy cập được và CORS cho
origins/method/header cần thiết khi triển khai M3. Không hardcode hostname local
vào URL ký trong code; không bật public bucket để làm upload/download hoạt động.

Lifecycle intent đề xuất: INITIATED → ATTACHED; INITIATED → EXPIRED/ABORTED.
Verification failure giữ intent chưa attach để báo lỗi; không publish file lỗi.
Expired/aborted không sống lại khi PUT đến muộn. ATTACHED lưu attachmentId và
fingerprint để finalize replay trả cùng kết quả; deleted attachment không được
recreate bởi replay. Cleanup pending phải bền vững qua restart. Thời gian giữ
idempotency/tombstone ít nhất dài hơn URL/retry window; chi tiết retention vật
lý được reviewer shared/schema xác nhận trong ADR M3, chưa tự đặt job purge.

## Acceptance matrix cho M3

- Upload → verified final file → metadata; MIME/hash/size thực tế khác khai báo
  không attach; replay staging PUT sau finalize không đổi final bytes.
- Same key/payload và same upload nhiều lần chỉ một attachment; reused key khác
  target/body → 409; finalize đồng thời/slot thứ 11 không vượt quota.
- Hai tenant/hai customer, guessed IDs/keys, wrong parent/source, unassigned
  Technician, past assignee không phải report author; INTERNAL metadata/count
  không leak. CUSTOMER vẫn 403 ở staff WO/report.
- Role/assignment/state đổi giữa prepare và finalize → không attach; report
  chưa có → 404/409 đúng contract; báo cáo hoàn thành không phát event lần hai.
- Intent expiry, abort, delete, old signed URL TTL; DB failure sau storage write,
  storage outage sau DB deletion, cleanup restart; không mất retry claim.
- Filename path/header injection, loại ngoài allowlist, zero/oversize, checksum
  sai, object thiếu; signed URLs không vào log/analytics/cache.

K8 bàn giao OpenAPI + semantics + quyền + test matrix. Owner review nội dung và
consumer approvals cần được ghi trong PR; không gọi mock OpenAPI là test upload
MinIO thực tế. Upload/MinIO implementation vẫn thuộc M3.
