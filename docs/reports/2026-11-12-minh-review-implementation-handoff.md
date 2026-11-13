# Bàn giao phần Minh theo review ngày 12/11/2026

> Cập nhật 13/11: Task 1.4 đã được triển khai backend local sau bàn giao Khương.
> Xem [bản bàn giao PartRequest/ReturnRequest mới](2026-11-13-minh-part-requests-handoff.md).
> Các kết quả và giới hạn bên dưới là lịch sử lượt 12/11. Task 1.3 vẫn chưa thêm ngày dự kiến.

Ngày thực hiện: 12/11/2026. Nguồn phân công: bản review làm việc local `2026-11-12-review-loi-va-phan-cong.md`, đã được người dùng yêu cầu thực hiện phần Minh. Bản review local được giữ ngoài nhóm thay đổi triển khai này.

Baseline đầu lượt: `develop` tại `48f86d5` theo lần kiểm tra Git ngay trước công việc. Các chỉnh sửa Web và các tài liệu chưa commit đã có từ trước được giữ nguyên. Lượt triển khai bổ sung code Asset, kiểm thử và tài liệu. Người dùng sau đó yêu cầu commit riêng phần đã hoàn thành; chưa yêu cầu push/merge.

## 1. Kết quả theo từng task

| Task Minh | Đầu ra | Trạng thái và giới hạn |
| --- | --- | --- |
| 1.1 — bảo hành danh sách | List API trả `warranty` cùng quy tắc chọn/đánh giá như detail và warranty-status; có kiểm thử ngày biên, hết hạn, VOID, tương lai, không có bảo hành. | **Đã triển khai và kiểm thử backend.** Nguyên cần nghiệm thu hiển thị thật trên Web. |
| 1.2 — QR dossier | Đọc lại QR đang tồn tại, trả section QR theo quyền trong dossier; GET không cấp/thu hồi/xoay token. | **Đã triển khai và kiểm thử backend.** Chưa thêm ảnh/nút in Web; phần này thuộc Nguyên. |
| 1.3 — ngày bàn giao | Xác minh chỉ ngày bàn giao thực tế bắt buộc khi hoàn tất, thêm hồi quy API/DB; có đề xuất ngày dự kiến tách riêng và contract hiện hành được diễn giải rõ. | **Đã rà soát, kiểm thử và hoàn thành đề xuất thiết kế.** Chưa thêm trường ngày dự kiến/migration, chờ quyết định trong proposal. |
| 1.4 — Part Request/đề nghị trả | Thiết kế ownership, quyền, state machine, API, idempotency, cấp một phần, receipt thực nhận, concurrency, phục hồi và checklist bàn giao. | **Đã hoàn thành bản thiết kế đề xuất; chưa chốt contract, chưa triển khai API/schema mới.** Confirm-use và RETURN hiện có được tái sử dụng trong thiết kế. |

Không kết luận bốn task đã hoàn tất toàn bộ tính năng vận hành: hai task đầu có code backend; task 1.3/1.4 có phạm vi thiết kế/đối chiếu theo phân công và còn quyết định/phối hợp trước khi code luồng mới.

## 2. Bảo hành danh sách — contract triển khai

`GET /api/assets/equipment` bổ sung `items[].warranty`, gồm equipmentId, date, result, warrantyId, endDate, policyVersionId và policySnapshot, thống nhất cấu trúc với detail.

- Ngày đánh giá lấy một lần theo múi giờ Việt Nam, dùng chung với bộ lọc để tránh khác ngày trong cùng một request.
- Bản ghi ACTIVE đang bao phủ ngày được chọn trước; nếu không có thì chọn ACTIVE đã kết thúc gần nhất. Thứ tự endDate giảm dần, id tăng dần để ổn định.
- VOID và bản ghi chưa đến ngày bắt đầu không tham gia. Theo contract hiện tại, chỉ có bảo hành tương lai thì kết quả là NO_WARRANTY; không thêm enum mới trong lượt này.
- Query quan hệ giới hạn một bản ghi mỗi thiết bị; không gọi warranty-status từng dòng. Không trả mảng Warranty thô/tenantId trên response danh sách.
- Đây là tình trạng thời hạn bảo hành, không phải kết luận sự cố đủ điều kiện bảo hành.

Nguyên: nối cột `item.warranty.result` đang có, kiểm tra bộ lọc cùng kết quả hiển thị và nhãn NO_WARRANTY trong trường hợp chỉ có kỳ tương lai. Nếu sản phẩm muốn phân biệt “chưa hiệu lực”, cần thay đổi contract/enum có phối hợp riêng.

## 3. QR đọc lại và dossier — contract triển khai

API mới: `GET /api/assets/equipment/{equipmentId}/qr-codes`.

- TENANT_STAFF với `qr:manage`, kiểm tra equipment scope tại repository; thiếu quyền trả 403, không tìm thấy trong phạm vi trả 404.
- Trả `equipmentId`, `state`, `code`, `canIssue`, `canPrint`, `reason`.
- `state=ACTIVE`: code chứa id, equipmentId, token, url, createdAt; dùng url làm nội dung QR khi render/in.
- `NOT_ISSUED`: chưa có mã; `REVOKED`: không còn mã hiệu lực; cả hai code=null, canPrint=false.
- `INELIGIBLE`: thiết bị RETIRED, code=null, canIssue=false, canPrint=false, reason=EQUIPMENT_RETIRED. Việc scan mã cũ giữ quy tắc hiện hành, vẫn cần đăng nhập/phạm vi.
- Trả `Cache-Control: no-store`. Không tạo token, không sửa DB, không ghi QR_REPRINTED khi chỉ đọc/in lại mã đang có.

`GET /api/assets/equipment/{id}/dossier` bổ sung `qr` theo dạng Section:

```json
{
  "qr": {
    "status": "AVAILABLE",
    "data": {
      "equipmentId": "<uuid>",
      "state": "ACTIVE",
      "code": {
        "id": "<uuid>",
        "equipmentId": "<uuid>",
        "token": "<existing-token>",
        "url": "<configured-portal-base>/portal/qr/<existing-token>",
        "createdAt": "<timestamp>"
      },
      "canIssue": true,
      "canPrint": true,
      "reason": null
    },
    "fetchedAt": "<timestamp>"
  }
}
```

Người không có quyền quản lý QR, bao gồm khách hàng, nhận `{ "status": "RESTRICTED", "data": null }`. Không truy vấn payload QR quản lý cho nhóm này. Dossier vẫn kiểm tra quyền thiết bị trước khi tổng hợp và cũng trả no-store.

Nguyên cần:

1. Render QR từ `qr.data.code.url` khi AVAILABLE/ACTIVE. Không gọi POST lúc mở hồ sơ hoặc bấm in lại mã hiện có.
2. Tách nhãn “In mã hiện có” và “Cấp mã thay thế”; POST hiện hành tạo token mới và làm mã cũ mất hiệu lực.
3. Đọc lại dữ liệu trước in; không lưu token vào localStorage, lịch sử công khai hoặc log ứng dụng. QR có thể bị thu hồi sau lần đọc, UI không cam kết mã còn hiệu lực vĩnh viễn.
4. Hiển thị lý do khi chưa có/đã thu hồi/thiết bị ngừng sử dụng; không hiển thị nút quản lý khi RESTRICTED.
5. Kiểm tra route Gateway `/api/assets` và trang scan thực tế trong nghiệm thu Web; chưa tuyên bố đã chạy E2E trình duyệt qua Gateway trong lượt này.

## 4. Ngày dự kiến và Part Request — bàn giao thiết kế

Chi tiết tại [proposal task 1.3/1.4](../plans/2026-11-12-minh-dates-and-parts-contract-proposal.md).

- Task 1.3: đề xuất `plannedHandoverDate` trên Registration draft, nullable, riêng với ngày thực tế, không tự kích hoạt bảo hành/bảo trì. Cần chốt nhu cầu và cách công bố/dời lịch trước migration.
- Task 1.4: Inventory sở hữu nhu cầu/fulfillment/đề nghị trả/receipt. ISSUE tiếp tục dùng durable WO reservation; đề nghị trả không tăng tồn; chỉ receipt kho mới tạo RETURN. Confirm-use vẫn sau báo cáo COMPLETED.
- Chưa thêm permission/role, event, schema hoặc route cho các đề xuất trên. Các đường dẫn trong proposal đều ghi rõ chưa triển khai.

| Người nhận bàn giao | Việc tiếp theo |
| --- | --- |
| Chủ nghiệp vụ + Minh | Chốt phạm vi ngày dự kiến, quyền tạo nhu cầu, giao nhận và trách nhiệm khi đổi kỹ thuật viên. |
| Khương | Review điều kiện WO/assignment, quyền kỹ thuật viên sau khi WO đóng/đổi người; xác nhận contract tham chiếu và reservation phù hợp. |
| Nguyên | Nghiệm thu hai API Asset, tích hợp QR Web; review UX hàng chờ cấp một phần và nhận trả thiếu. |
| Người phụ trách Mobile | Sau khi Part Request contract được chốt và backend tồn tại: gửi nhu cầu/đề nghị trả và gọi confirm-use hiện có. |
| Huy | Nếu nhóm cần thông báo phụ tùng: thống nhất người nhận và sự kiện sau commit, chống gửi trùng. |

Mục 11 hỗ trợ liên chi nhánh tiếp tục hoãn, không phụ thuộc để triển khai các phần trên.

## 5. Kiểm tra đã chạy và bằng chứng

| Kiểm tra | Kết quả |
| --- | --- |
| `pnpm build:packages` | Đạt; khắc phục artifact package cũ thiếu export của baseline mới. |
| `pnpm --filter asset-service typecheck` | Đạt sau build packages; gồm code và registration test TypeScript. |
| `pnpm --filter asset-service lint` | Đạt. |
| `pnpm --filter asset-service build` | Đạt, Prisma generate và Nest build thành công. |
| Unit test Asset qua Jest `--runInBand` | 8 suite, 70 test đạt. |
| `pnpm --filter asset-service test:e2e` | 4 suite, 20 test đạt; HTTP Nest với repository/dependency giả lập, không phải browser E2E. |
| Jest `test/jest-db.json`, chọn `equipment-db`, `dossier-db`, `registration-db` | 3 suite, 34 test đạt; dùng PostgreSQL test riêng và kiểm tra Asset/Maintenance liên quan. |

Tổng các lượt test thành công được liệt kê: **124 test**. Không chạy toàn bộ suite mọi service hoặc nghiệm thu Web/Mobile trong lượt này.

Ba file OpenAPI đã parse YAML thành công và không thiếu `$ref` nội bộ. Các liên kết local trong tài liệu review/proposal/bàn giao đã được kiểm tra hợp lệ, bảng nhất quán số cột; `git diff --check` đạt.

Lần thử DB ban đầu không vào được schema engine; kiểm tra tiếp xác định Docker/PostgreSQL chưa hoạt động. Sau khi khởi động Docker Desktop nền và container postgres, lượt chạy lại đã đạt. Migrations có sẵn của baseline được áp dụng lên DB test bởi harness; không thêm migration mới cho sản phẩm và không reset/seed DB demo.

Các ca đáng chú ý:

- Chọn cùng bản ghi bảo hành giữa list/detail ở ngày bắt đầu/kết thúc; không chọn VOID hoặc kỳ tương lai; bộ lọc thống nhất projection.
- GET QR kiểm tra quyền trước đọc payload, chéo tenant 404, trả no-store; không gọi issue/revoke.
- Hai lần mở dossier giữ nguyên token, số bản ghi QR và số lịch sử; khách không nhận token; thu hồi xong token không resolve.
- Chỉ có handoverDate vẫn hoàn tất được; thiếu handoverDate bị chặn; từng ngày thực tế tương lai bị từ chối.

## 6. File chính thay đổi trong lượt này

- [Equipment repository](../../apps/asset-service/src/equipment/equipment.repository.ts), [service](../../apps/asset-service/src/equipment/equipment.service.ts), [repository tests](../../apps/asset-service/src/equipment/equipment.repository.spec.ts).
- [QR repository](../../apps/asset-service/src/qr/qr.repository.ts), [service](../../apps/asset-service/src/qr/qr.service.ts), [controller](../../apps/asset-service/src/qr/qr.controller.ts), [unit tests](../../apps/asset-service/src/qr/qr.service.spec.ts).
- [Dossier service](../../apps/asset-service/src/dossier/dossier.service.ts), [controller](../../apps/asset-service/src/dossier/dossier.controller.ts).
- [Equipment HTTP tests](../../apps/asset-service/test/equipment.e2e-spec.ts), [Equipment DB tests](../../apps/asset-service/test/equipment-db.integration.ts), [Dossier DB tests](../../apps/asset-service/test/dossier-db.integration.ts), [Registration DB tests](../../apps/asset-service/test/registration-db.integration.ts).
- [Asset API](../api/asset.yaml), [Dossier API](../api/equipment-dossier.yaml), [Registration API](../api/equipment-registration.yaml).
- [Proposal ngày/phụ tùng](../plans/2026-11-12-minh-dates-and-parts-contract-proposal.md). Bản review làm việc local có liên kết kết quả và tiếp tục được giữ ngoài commit này.

Các thay đổi chưa commit của Web và tài liệu đã có từ trước không thuộc kết quả triển khai code của lượt này. Chưa sửa code Mobile hoặc triển khai phần của Huy/Khương/Nguyên.
