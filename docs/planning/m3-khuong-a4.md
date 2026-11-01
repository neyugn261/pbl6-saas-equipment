# M3-A4 — Projection file đã công bố cho Service Request

Ngày 01/11/2026. Owner: Khương / Work Order. Nhánh
`feature/khuong-m3-a4-attachment-projection`, base `origin/develop@d82c3a6`
sau merge A1 #46 và A2/A3 #47. Contract K8/ADR 0013 đã được chốt trước implementation.

## Đầu ra phía Work Order

| Route nội bộ | Hành vi |
| --- | --- |
| GET /internal/service-request-attachments/{serviceRequestId}?page=1&pageSize=20 | Gộp metadata file WO/report CUSTOMER của mọi WO đúng SR, tenant/customer/assignment scope; lọc trước count/phân trang |
| GET /internal/service-request-attachments/{serviceRequestId}/{attachmentId}/download | Kiểm tra lại source/scope/visibility/verified/tombstone, storage HEAD + ký GET 60 giây, recheck DB trước khi trả ticket |

Hai route dùng original caller token, `service_request:read`, user type
TENANT_STAFF/CUSTOMER và `Cache-Control: no-store`. Staff cần thêm
`work_order:read` và giữ scope đọc WO hiện hành (Technician-only từng/đang được
giao; role staff bổ sung vẫn cấp scope tương ứng). Customer lấy tenant/customer
duy nhất từ principal; thiếu customer membership trả 403 CUSTOMER_SCOPE_MISSING.
Không thêm role/permission/machine token hoặc gọi Identity/Organization/SR từ WO.

Source luôn nằm ở WO có `serviceRequestId` đúng path và không có Maintenance
origin. Report file join qua report → WO trong cùng tenant. Không phụ thuộc WO
hiện hành/terminal: SR có thể có nhiều WO do repair/reopen/replacement; file đã
được manager công bố của các WO đúng SR vẫn nằm trong lịch sử được phép đọc.

Metadata chỉ có **id, fileName, mimeType, sizeBytes, createdAt**. Không có WO/report
ID, uploader, key, checksum, visibility, notes hoặc URL trong page. INTERNAL,
deleted, unverified legacy và object chưa finalize không được tính vào total.
Sort createdAt/id tăng dần sau UNION WO/report; page ≥ 1, pageSize 1–100 theo DTO chung. List
existence/count/items dùng cùng RepeatableRead snapshot, không cộng hai trang
đã paginate riêng và không tải hết file vào memory để sort.

Download kiểm tra DB lại sau I/O; hide/delete hoặc local read scope đã mất tại
thời điểm kiểm tra cuối sẽ chặn ticket mới. Không giữ transaction DB trong HEAD/signing. Ticket đã được
phát từ trước vẫn có thời hạn tối đa 60 giây theo K8; A4 không thu hồi capability
đã cấp. Hai bảng legacy có UUID attachment trùng nhau thì download trả 404 thay
vì chọn tùy ý một parent.

## Handoff cho Huy — public SR composition C4

Public routes dự kiến **thuộc Service Request**, không được tạo trong A4 WO:

- GET /service-requests/{id}/result/attachments
- GET /service-requests/{id}/result/attachments/{attachmentId}/download

Gateway tương ứng `/api/service-requests/{id}/result/attachments[/{attachmentId}/download]`.
WO internal routes không có public Gateway mapping; cả direct `/internal`,
service-prefixed và encoded internal path tiếp tục bị Gateway chặn.

1. SR authenticate/authorize resource của mình trước bằng policy hiện có.
2. C4 thêm và validate `WORKORDER_SERVICE_URL` trong SR config/client. Biến này
   đã có ở root `.env.example`, nhưng SR hiện chưa consume/validate nó. URL trỏ
   trực tiếp WO origin, không trỏ Gateway vì internal route bị chặn.
3. Dùng `ServiceHttpClient` với `accessToken: principal.accessToken`; shared client
   tự forward correlation ID từ request context. Không dùng Tenant Admin token
   thay khách, không tin customerId/tenantId/WO ID client chọn.
4. Chỉ ánh xạ **list 404 + code WORK_ORDER_NOT_FOUND** thành empty page sau SR
   authorization. Không nuốt generic route 404 (sai host/path hoặc backend cũ),
   và không ánh xạ download 404 thành empty/success.
5. Source/network/storage lỗi → unavailable/503, giữ correlation ID; không thay
   bằng total=0. Link tải trả no-store, không cache/persist/log signed URL.

Recipe dưới đây minh họa phần gọi nguồn **sau** SR authorization, không phải code
đã thêm vào service của Huy:

```ts
try {
  return await workOrderClient.get<PublishedPage>(
    `/internal/service-request-attachments/${srId}`,
    { accessToken: principal.accessToken, query: { page, pageSize } },
  );
} catch (error) {
  if (error instanceof UpstreamError && error.status === 404 &&
      error.code === 'WORK_ORDER_NOT_FOUND') {
    return { items: [], page, pageSize, total: 0 };
  }
  // ServiceHttpClient wraps a source HTTP 503 in UpstreamError; preserve the
  // unavailable meaning explicitly (the default shared mapping is 502).
  if (error instanceof UpstreamError && error.status === 503) {
    throw new ServiceUnavailableException({
      code: 'UPSTREAM_UNAVAILABLE', message: 'Published files are unavailable',
    });
  }
  throw error;
}
```

Download dùng `get` sau SR authorization và giữ 404/503 đúng nghĩa. Không dùng
`getOrNull` để làm mất source error code. Connection-refused/timeout là
`UpstreamUnavailableError`, shared error filter hiện ánh xạ thành 503.

Fixture 200/page rỗng/404/503 và expected mapping nằm ở
[workorder-attachment-projection-fixtures.json](../api/workorder-attachment-projection-fixtures.json).
IDs/URL là ví dụ contract, không phải seed hoặc URL ký thực tế.

| Source outcome | SR behavior |
| --- | --- |
| 200 PublishedPage | Trả nguyên metadata/page đã được authorize |
| 200 empty page | Giữ empty; không suy ra SR thiếu |
| List 404 WORK_ORDER_NOT_FOUND | Có thể map empty sau khi SR đã authorize |
| Download 404 ATTACHMENT_NOT_FOUND | Giữ 404; INTERNAL/deleted/wrong source không lộ |
| 503 ATTACHMENT_SOURCE_UNAVAILABLE | Nguồn DB không đọc được; unavailable, không zero |
| 503 ATTACHMENT_STORAGE_UNAVAILABLE | Object/storage chưa sẵn sàng; không cấp link lỗi |
| Network/timeout | 503 UPSTREAM_UNAVAILABLE qua shared error handling |

## Kiểm tra và phạm vi bằng chứng

Không thay schema/migration, shared RBAC/event catalog, Gateway routing hoặc
controller/config của SR. WO sở hữu source authorization và dữ liệu file; Huy
sở hữu C4 public composition. UI customer và SR public controller không được
tính là nghiệm thu trong lượt A4 này.

Các lệnh service:

```sh
pnpm --filter workorder-service lint
pnpm --filter workorder-service typecheck
pnpm --filter workorder-service test --runInBand
pnpm --filter workorder-service test:e2e
pnpm --filter workorder-service test:e2e:db
pnpm --filter workorder-service test:attachments:storage
pnpm --filter workorder-service test:attachments:gateway
pnpm --filter workorder-service build
```

DB suite chạy trên đúng `workorder_test_db` qua helper bảo vệ hiện có. Trong lượt
A4 dùng PostgreSQL/MinIO container tạm riêng, không truncate/migrate DB demo.
`test:attachments:storage` hiện chạy A2/A3 và A4 với MinIO thật, mỗi suite tự tạo/
dọn bucket test. Bulk pagination/scope dùng DB fixtures được ghi rõ; download happy
path sử dụng file thật qua prepare/PUT/finalize/publish, không giả storage.

Gateway smoke được mở rộng: manager upload/publish → original customer token qua
shared HTTP client → WO projection → signed storage GET; staff CUSTOMER 403,
Gateway internal 404, delete lọc khỏi list và download 404. Identity token là
fixture ký/verify thật; không giả đây là SR public controller đã tích hợp.

DB cases kiểm tra hai tenant/customer, token thiếu/sai/hết hạn, membership thiếu,
Technician historical/mixed-role scope, 25 file WO/report phân trang ổn định,
INTERNAL/deleted/unverified/Maintenance/wrong-SR không lọt count/download,
hide/delete/scope/source outage giữa signing và response, storage object mất,
metadata allowlist, source 404 vs empty, source 503, UUID collision và original
token/correlation forwarding qua ServiceHttpClient thật.

## Kết quả thực thi

Đã chạy ngày 01/11/2026 trên PostgreSQL 17 + MinIO/Silo trong container tạm
riêng, credentials sinh cho lượt test. Không dùng/reset business DB hoặc shared
test DB của nhóm; test bucket/fixture được dọn và container tạm được gỡ sau lượt.

| Kiểm tra | Kết quả |
| --- | --- |
| WO lint/typecheck/build | PASS |
| WO unit | 22 PASS |
| WO bootstrap E2E | 2 PASS, fake DB |
| WO DB regression | 194 PASS = 177 regression A2/A3 + 17 A4; PostgreSQL thật/storage double |
| Real MinIO attachment suites | 45 PASS = 28 A2/A3 + 17 A4; source caller/download HTTP thật |
| Gateway E2E baseline | 25 PASS; A4 không sửa code Gateway |
| Gateway → WO → PostgreSQL → MinIO smoke | PASS, có customer projection/download, delete scope, staff 403 và internal/encoded 404 |
| OpenAPI parse/local refs | PASS, 92 local refs |
| JSON fixtures parse, Markdown links, git diff --check | PASS |

Các dòng real storage suite sử dụng file thật cho upload/download; các case scope/
pagination dùng DB fixture rõ ràng. DB/visibility/scope outage là fault injection
được ghi ở tên case. Worker warning khi inject storage outage là dự kiến.
Gateway suites còn DEP0060 và MaxListenersExceededWarning từ proxy setup hiện
hành; không thay dependency/routing để xử lý ngoài scope A4.

Shared ServiceHttpClient được thử với actual WO HTTP server, original customer
token, correlation ID, source 404 và source error. Đây là bằng chứng caller
contract cho Huy, **chưa phải public SR controller C4 hoặc customer web UI đã ghép**.
