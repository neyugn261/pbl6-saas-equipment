# K8 — Attachment contract bàn giao M3

Owner: Khương. Tạo 28/10/2026; chốt Q1 phía owner ngày **01/11/2026** theo yêu cầu
của Khương. [ADR 0013](../decisions/0013-workorder-attachment-lifecycle.md) ghi
thiết kế persistence, replay, fencing và cleanup. Bản contract phía owner đã xác định hành vi để
web/mobile triển khai theo mock. **Khương xác nhận review đã chốt ngày 01/11/2026**;
ghi nhận theo phiên làm việc, không tự tạo link approval GitHub. OpenAPI:
[workorder-attachments.yaml](workorder-attachments.yaml). API này chưa có trong M2;
**A2/A3 đã triển khai các staff routes; A4 đã triển khai internal SR projection.**
Runtime/kiểm thử: [bàn giao A2/A3](../planning/m3-khuong-a2-a3.md).

## Quyết định của contract

- JPEG/PNG/PDF, **1 byte–10 MiB** (1..10485760 bytes), SHA-256 hex;
  10 slot/parent gồm attachment chưa xóa (kể cả legacy chưa verify) và intent
  INITIATED chưa hết hạn, WO và report tính riêng. Intent ATTACHED không tính
  thêm slot. Đây là giới hạn owner chọn cho MVP M3.
- Upload signed PUT 300 giây, download signed GET 60 giây; mọi ticket/link trả
  Cache-Control:no-store. Browser/Flutter dùng đúng headers trong ticket, không
  gửi JWT của API tới storage. Không lưu/log signed URL hoặc storage credentials.
- Client không chọn tenant/customer/uploader/storageKey. Tên file chỉ basename,
  không path/control characters; backend cấp key ngẫu nhiên theo tenant/target.
- Upload intent gắn tenant + uploader userId + parent + MIME/bytes/checksum/
  visibility khai báo bất biến. JWT refresh không thay userId; token/catalog và
  scope được kiểm tra lại ở finalize. Account/role revocation giữ độ trễ token
  theo ADR 0004 (tối đa 15 phút), không thêm online session check. Finalize mới
  kiểm tra mutation state; finalize đã commit được replay theo read scope như
  bảng dưới. Quota reservation và idempotency phải có DB lock.
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
| Finalize mới | Chính uploader và quyền/state còn hợp lệ; đổi assignment hoặc parent terminal sai target → từ chối, không attach |
| Finalize đã ATTACHED | Chính uploader còn staff read scope; trả metadata hiện tại của cùng ID kể cả WO đã terminal; file deleted → 404 |
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
| 409 | UPLOAD_ABORTED | Ý định đã hủy; tạo key mới nếu còn quyền upload |
| 409 | UPLOAD_IN_PROGRESS | Một finalize attempt còn lease; chờ ngắn rồi retry cùng key/uploadId |
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

## Q1 — Replay đã chốt phía owner

Authorize target trước khi tra key; so fingerprint trước quota/new-transition
checks. PREPARE dùng cùng namespace cho WO/report, parent nằm trong fingerprint.
FINALIZE dùng fingerprint của uploadId; cùng UUID key ở operation khác là độc lập.
Default visibility INTERNAL và UUID lowercase được chuẩn hóa trước hash; tên
file được validate, không tự đổi tên. Fingerprint version/field order ở ADR 0013.

| Thao tác/trạng thái | Response |
| --- | --- |
| Prepare replay INITIATED, chưa hết hạn, còn mutation scope | 201 cùng uploadId/headers/expiresAt, không tăng slot hoặc gia hạn URL |
| Prepare replay ATTACHED | 409 UPLOAD_ALREADY_ATTACHED với details.attachmentId nếu còn read scope; nếu result deleted → 404 ATTACHMENT_NOT_FOUND |
| Prepare/finalize EXPIRED hoặc ABORTED | 409 UPLOAD_EXPIRED / UPLOAD_ABORTED sau kiểm tra scope phù hợp |
| Finalize ATTACHED | 200 metadata hiện tại của cùng attachment; chỉ cần same uploader + current staff read scope, không áp lại mutation state |
| Finalize ATTACHED nhưng đã xóa | 404 ATTACHMENT_NOT_FOUND; key không tạo lại file |
| Finalize INITIATED có attempt khác còn lease | 409 UPLOAD_IN_PROGRESS |
| Cùng key đổi parent/body/uploadId | 409 IDEMPOTENCY_KEY_REUSED sau authorize target |

Prepare terminal-state replay chỉ cần read scope và uploader identity; prepare
INITIATED và finalize mới vẫn cần mutation scope. Finalize sau ATTACHED bằng key
mới cũng hội tụ về cùng ID, lưu key binding mới. Replay không trả response JSON
cũ chứa visibility đã bị manager đổi. Đổi actor không được nhận intent của actor cũ.
Abort lặp trả 204 và delete lặp trả 204 dưới read scope + manager/original uploader;
lần đầu vẫn kiểm tra mutation state. ATTACHED abort trả 409 UPLOAD_ALREADY_ATTACHED.

## SR owner handoff — internal A4 đã có, public composition thuộc Huy

Public routes đề xuất ở SR: `GET /service-requests/{id}/result/attachments` và
`GET /service-requests/{id}/result/attachments/{attachmentId}/download`. SR tự
authorize request theo ADR 0003 rồi gọi các internal projection routes đã triển khai trong
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
List gộp WO/report file của mọi WO đúng SR, sort createdAt/id tăng dần rồi phân
trang một lần; count/list dùng cùng snapshot RepeatableRead. Chỉ metadata đã
verify được phục vụ. Source DB lỗi trả 503 ATTACHMENT_SOURCE_UNAVAILABLE; lỗi
storage hoặc object mất trả 503 ATTACHMENT_STORAGE_UNAVAILABLE. Nguồn WO
unavailable phải trả lỗi/section unavailable, không giả trang rỗng.
Download 404 không được ánh xạ thành trang rỗng. WO completion có thể đến trước
report upload/publish; notification hoàn tất không đồng nghĩa file đã sẵn sàng.
SR public paths chưa được thêm vào service-request.yaml hoặc implementation SR;
Huy sở hữu phần đó. Chỉ ánh xạ source list 404 code WORK_ORDER_NOT_FOUND sau SR
authorization; không nuốt generic route 404 khi cấu hình sai endpoint. Download
recheck sau storage I/O để không trả ticket mới nếu file vừa hide/delete hoặc
actor mất scope. Bàn giao/fixture và recipe cho Huy: [A4](../planning/m3-khuong-a4.md).

## Persistence cần chuẩn bị khi triển khai M3

Schema và migration **mới** `0005_attachment_lifecycle` bổ sung metadata verify,
tombstone và last visibility actor/time vào hai bảng hiện có; thêm intent,
idempotency và cleanup jobs. Không sửa migration visibility 0002. A1 chuẩn bị persistence; A2/A3 đã bổ sung staff route/worker/storage. Không apply business DB
trước shared/schema review và quyết định xử lý legacy.

size/hash/verifiedAt của legacy để NULL cùng nhau; không backfill giả. API M3
phải loại row chưa verify; backfill từ storage thật thuộc rollout có kiểm soát.
Audit attach/visibility/delete dùng work_logs nội bộ, cùng transaction, không
ghi key/URL/fileName/content và không phát lại Completed.

Nguyên cấu hình public storage host để browser/Android truy cập được và CORS cho
origins/method/header cần thiết khi triển khai M3. Không hardcode hostname local
vào URL ký trong code; không bật public bucket để làm upload/download hoạt động.

Lifecycle intent: INITIATED → ATTACHED; INITIATED → EXPIRED/ABORTED.
Verification failure giữ intent chưa attach để báo lỗi; không publish file lỗi.
Expired/aborted không sống lại khi PUT đến muộn. ATTACHED lưu attachmentId và
fingerprint để finalize replay trả cùng ID; deleted attachment không được
recreate bởi replay. MVP không tự purge intent/idempotency/tombstone/cleanup rows.
Row legacy chưa verify không được phục vụ. Row đã backfill verify nhưng thiếu
cleanup ownership không được báo delete thành công; cần owner đối soát trước.
File orphan vẫn phải dọn theo retry/claim và reconciliation ở ADR 0013.
STAGING cleanup sớm nhất expiry + 60 giây, kể cả abort sớm; dọn ngay có thể bị
PUT còn hạn tạo lại object. Final attempt/key và cleanup được ghi trước storage
I/O; fencing ngăn worker/finalizer cũ attach hoặc xóa file hợp lệ. Không giữ
transaction DB trong khi đọc/ghi storage. Thông số lease/retry/reconcile ở ADR.

Đầu vào env/dependency và Q5 reporting: [bàn giao A1](../planning/m3-khuong-a1.md).

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

K8 bàn giao OpenAPI + semantics + quyền + test matrix. Review đã được Khương xác
nhận; A2/A3 có bằng chứng PostgreSQL/MinIO thật trong bàn giao. A4 internal projection đã có; public SR
composition (Huy) và UI web/Android nghiệm thu riêng; không dùng API tests thay UI.
