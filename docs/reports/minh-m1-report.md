# Báo cáo phần việc M1 của Minh (Member B)

> **Trạng thái sau merge ngày 24/10/2026:** Xem [báo cáo công việc ngày 24/10/2026](2026-10-24-minh-m1.md). Các mục bên dưới là lịch sử rà soát trước khi ba PR #16–#18 được merge.

> **Cập nhật 24/10/2026:** Mục 1–6 bên dưới là ảnh chụp trạng thái ngày 23/10 và được giữ lại làm lịch sử rà soát. Trạng thái mới nhất nằm ở mục 7; không dùng các câu “PR #7/#8 chưa merge” bên dưới để kết luận hiện tại.

**Ngày rà soát:** 23/10/2026

**Phạm vi:** Asset Service và phần chuẩn bị contract Maintenance cho M2.

**Mục đích:** báo cáo kết quả, bằng chứng kiểm tra và các điểm cần trưởng nhóm review.

## 1. Kết luận và trạng thái Git

Minh đã triển khai API nghiệp vụ Asset trong nhánh `feature/minh-asset-m1` và mở [PR #7](https://github.com/neyugn261/pbl6-saas-equipment/pull/7) vào `develop`. Contract Asset ở [PR #3](https://github.com/neyugn261/pbl6-saas-equipment/pull/3) đã merge. Bản nháp contract/ADR Maintenance nằm ở nhánh `feature/minh-maintenance-contract`, [draft PR #8](https://github.com/neyugn261/pbl6-saas-equipment/pull/8). **PR #7 và #8 chưa merge.** Vì thế kết quả code M1 của Minh đã sẵn để review, còn việc tích hợp và nghiệm thu trên `develop` vẫn chưa hoàn tất.

| Hạng mục Git | Trạng thái khi rà soát |
| --- | --- |
| Nhánh làm việc | `feature/minh-asset-m1`, HEAD `d457a8a`, khớp `origin/feature/minh-asset-m1`; hơn `origin/develop` 4 commit, không thiếu commit từ remote `develop` |
| Thay đổi A2–A6 | PR #7 mở, không phải draft; 42 file, 2.199 dòng thêm, 13 dòng xóa; GitHub ghi nhận mergeable |
| Contract A1 | PR #3 đã merge vào `develop` tại `410a16c` |
| Chuẩn bị A7 | PR #8 mở dưới dạng draft, 2 file tài liệu; chưa merge. [CI #25](https://github.com/neyugn261/pbl6-saas-equipment/actions/runs/39931246046) hoàn tất success |
| CI PR #7 | Workflow [CI #24](https://github.com/neyugn261/pbl6-saas-equipment/actions/runs/39931213309) hoàn tất **success** ở cả hai job: lint/typecheck/unit/build và migration/drift/e2e |
| Review | Chưa có approval của người review trên PR #7 hoặc #8. Copilot chỉ để lại thông báo không review được vì hết quota; đó không phải kết quả review code |
| Checkout cục bộ | Nhánh `develop` cục bộ chậm `origin/develop` 24 commit; điều này không làm nhánh Asset bị chậm. File báo cáo này là thay đổi cục bộ mới, chưa commit/push |

Theo `CONTRIBUTING.md`, PR cần một người duyệt ngoài tác giả; PR liên quan auth, tenant isolation hoặc file trung tâm cần Member D duyệt. CI xanh chưa thay cho review nghiệp vụ và smoke test.

## 2. Checklist công việc và mục đích

| Đợt | Việc Minh đã làm | Mục đích/người dùng hưởng lợi | Bằng chứng và trạng thái |
| --- | --- | --- | --- |
| **A0 — Khảo sát** | Đọc Asset, contract Organization/Asset, ADR, ERD, migration, script và test; phân chia A1–A7 và các điểm cần quyết định. | Xác định phần nào thuộc Asset, ranh giới database và contract trước khi code. | Đã thực hiện trong quá trình lập kế hoạch; không có commit riêng cho A0. |
| **A1 — Contract Asset** | Hoàn thiện `docs/api/asset.yaml`: 16 operation, DTO/response nullable, pagination/filter/sort, quyền/scope, mã lỗi, EquipmentRef, warranty-status, history và QR. | Cho Service Request của Huy và màn hình/mock của Hatsady một hợp đồng API để tích hợp. | PR #3 đã merge. Lúc A1: YAML đọc được, 130 `$ref` resolve, không có khóa trùng; chưa có xác nhận bằng OpenAPI semantic validator. |
| **A2 — Nền tảng Asset/Model** | Làm list/create/PATCH Equipment Model; validate input, tenant scope, unique key; thêm `OrganizationClient` HTTP adapter, fake test và validate `ORGANIZATION_SERVICE_URL`. | Cho phép quản lý catalog Model của tenant và xác thực tham chiếu customer/site/location qua API Organization. | Commit `7a53cfd` trong PR #7; code ở `apps/asset-service/src/equipment-models/` và `src/organization/`. Quyền list Model được chốt TENANT_STAFF trong contract sửa ở PR #7. |
| **A3 — Equipment** | Làm đăng ký, list/filter/detail, PATCH/chuyển site/trạng thái, `GET /internal/equipment/{id}` và lịch sử phân trang. Ghi REGISTERED/MOVED/STATUS_CHANGED/DETAILS_UPDATED cùng transaction; RETIRED là trạng thái cuối. | Quản lý thiết bị đã bàn giao; cung cấp EquipmentRef tối thiểu cho Service Request; giữ lịch sử thao tác nhất quán. | Commit `02ffb2a`; commit `a9f3497` kiểm tra lại trạng thái ACTIVE của Model dưới khóa khi đăng ký. PR #7 còn xử lý race location-only PATCH khi site đã đổi (`409 EQUIPMENT_SITE_CHANGED`). |
| **A4 — Warranty** | Làm list/add/void và `warranty-status`; lấy ngày mặc định theo `Asia/Ho_Chi_Minh`; đọc kỳ ACTIVE đang bao phủ hoặc kỳ ACTIVE kết thúc gần nhất; giữ bản VOID. Khóa Equipment khi ghi để chặn overlap, ghi history cùng transaction. | Cho Service Manager biết thiết bị còn hay hết bảo hành, giúp Service Request lưu snapshot quyết định. | Commit `d457a8a`; code ở `src/warranties/` và `src/equipment/`. DB test xác nhận biên đầu/cuối và hai request thêm kỳ trùng đồng thời chỉ một thành công. |
| **A5 — QR** | Làm cấp/in lại/thu hồi/resolve QR; token ngẫu nhiên 32 byte dạng base64url; URL từ cấu hình; xác thực và áp scope ở endpoint resolve; tạo lại và thu hồi mã cũ trong một transaction. | Nhận diện thiết bị khi quét QR mà vẫn kiểm tra quyền; bảo đảm tối đa một QR active cho mỗi thiết bị. | Commit `d457a8a`; code ở `src/qr/`. DB test chứng minh hai lệnh in lại đồng thời còn một QR active, token cũ hết hiệu lực và rollback khi ghi lỗi. |
| **A6 — Seed/test** | Seed 2 Model, 3 Equipment, 2 Warranty và lịch sử REGISTERED với ID cố định; seed chỉ ghi `asset_db`, không chạy production. Bổ sung unit, HTTP e2e và PostgreSQL DB integration; cập nhật README và fixture IDs. | Có dữ liệu demo ổn định, chứng minh tenant/customer isolation, ràng buộc DB và các thao tác đồng thời. | PR #7; seed đã được báo cáo chạy hai lần thành công trên `asset_test_db`. Lượt rà soát này chạy lại 18 unit, 15 HTTP e2e và 7 DB integration: đều đạt. Phần tích hợp thật của A6 còn ở mục 4. |
| **A7 — Chuẩn bị M2** | Soạn `docs/api/maintenance.yaml` cho Plan/Task và ADR 0007 dự thảo về snapshot customer/site, lịch lặp, downtime và retry Work Order. | Đưa các quyết định và phụ thuộc Maintenance ra review trước khi code M2. | Draft PR #8; 6 operation, 10 schema, 55 `$ref` theo kiểm tra trong PR. Chưa có schema/migration/ERD được áp dụng hoặc chốt; xem mục 4. |

## 3. Phạm vi kỹ thuật đã kiểm tra

- **Quyền và dữ liệu:** các endpoint nghiệp vụ dùng `@RequirePermissions` và user type; tenant/customer lấy từ token. ID ngoài scope trả 404. Customer chỉ đọc Equipment/Warranty/QR/History của customer trong token; quản lý Model/Equipment/Warranty/QR dành cho staff có quyền tương ứng.
- **Organization:** Asset dùng HTTP client chuyển tiếp bearer token và correlation ID tới endpoint nội bộ của Organization. 404 được hiểu là tham chiếu không tồn tại; lỗi upstream được chuyển thành 502/503. Không truy vấn `organization_db` trực tiếp và không dùng fake khi chạy production.
- **Cơ sở dữ liệu:** không sửa Prisma schema hoặc migration Asset trong PR #7. Dùng constraint đã có: asset code duy nhất theo tenant, serial theo `(tenant, model)`, và partial unique index một QR active/thiết bị. Equipment, warranty, QR và history được ghi trong transaction theo thao tác.
- **Contract với Huy:** `EquipmentRef` trả `id`, `customerId`, `customerSiteId`, `locationId`, `assetCode`, `status`; `WarrantyStatus` có `result`, `warrantyId` và `endDate` nullable. Client HTTP của Service Request hiện gọi đúng hai đường dẫn Asset này, nhưng chưa có bằng chứng chạy luồng thật qua cả hai service với fixture và gateway.
- **Lịch sử:** M1 ghi các event phát sinh trong Asset. Consumer ghi history từ Service Request/Work Order thuộc M2 theo kế hoạch, chưa triển khai ở M1.
- **Migrations/CI:** CI #24 đã áp migration toàn repo hai lần, kiểm tra drift và chạy Asset HTTP e2e. CI hiện **chưa chạy `asset-service test:db`**; bộ 7 DB integration test được chạy riêng trên `ASSET_TEST_DATABASE_URL`.

Các lệnh chạy lại trong lượt rà soát này đều đạt: `pnpm --filter asset-service lint`, `typecheck`, `test --runInBand`, `test:e2e`, `build`, `test:db`. Môi trường pnpm cục bộ yêu cầu thêm `--config.verify-deps-before-run=false` vào lệnh để tránh tự cài lại modules; việc này không thay đổi dependency hoặc mã nguồn. `git diff --check origin/develop...HEAD` cũng đạt.

## 4. Điểm chưa hoàn tất và cần review

1. **Tích hợp M1:** Chưa xác nhận một request thành công Asset → Organization với DEMO customer/site/location thật trong lượt rà soát này. Lần thử trước adapter đã gọi tới Organization, nhưng database phát triển khi đó chưa có DEMO fixture nên chỉ kiểm tra được đường 404. Chưa chạy `pnpm smoke:m1` qua Identity → Gateway → Organization → Asset → Service Request với seed đầy đủ. Script smoke có trong `scripts/smoke-test-m1.mjs`; không ghi kết quả là pass khi chưa chạy.
2. **Bàn giao cho consumer:** Chưa có bằng chứng Huy/Hatsady đã kiểm thử trực tiếp hai API Asset và contract màn hình. PR #7 là nơi họ có thể review. Quy trình nhóm vẫn cần người review trước khi merge.
3. **Ca biên bảo hành:** Có test ngày bắt đầu/kết thúc, trước kỳ, khoảng trống, VOID, năm nhuận và overlap đồng thời. Chưa thấy test riêng cho bảo hành đúng **một ngày** và **hai kỳ sát nhau không chung ngày**, vốn được nêu trong kế hoạch A4.
4. **Sai khác seed:** Kế hoạch gốc ghi cả ba tình huống còn/hết/không bảo hành cho `DEMO-CUST-01`. Seed hiện đặt thiết bị không bảo hành (`DEMO-ASSET-03`) ở `DEMO-CUST-02` để kiểm tra customer isolation. Cần ghi nhận sai khác này trong kịch bản demo/test của nhóm.
5. **Contract và tài liệu:** Code PATCH có `409 EQUIPMENT_SITE_CHANGED`, còn `asset.yaml` chỉ dùng response Conflict chung và chưa mô tả rõ mã này. `apps/asset-service/README.md` còn câu nói `warranty-status` “remains A4” dù endpoint đã có. README root vẫn mô tả Asset chưa có API nghiệp vụ. Những mô tả này cần đồng bộ trước khi dùng làm tài liệu nghiệm thu.
6. **Phạm vi PR #7:** PR chứa `.env.example` và chỉnh `docs/api/asset.yaml` bên cạnh code Asset. `CONTRIBUTING.md` yêu cầu file dùng chung và thay đổi contract đã merge có PR riêng/review tương ứng. Trưởng nhóm cần xem rõ phần này khi review PR; không coi CI xanh là đã duyệt quy trình.
7. **A7 còn là dự thảo:** PR #8 chưa có migration snapshot `customer_id/customer_site_id`, cập nhật ERD hay quyết định backfill. Tài liệu giữ các câu hỏi về thiết bị chuyển site, RETIRED, lịch ngày/tháng/năm, downtime và retry sau Work Order hủy. Còn một lỗi schema cần sửa trước khi chốt contract: `Plan` dùng `allOf` với `PlanInput` có `additionalProperties: false`; một response Plan chứa `id`, `tenantId`, `status` sẽ không hợp lệ theo chính `PlanInput` đó.

## 5. Checklist để trưởng nhóm review

- [x] Xác nhận A1 đã merge; PR #7 chứa code Asset và CI #24 đã xanh.
- [x] Xác nhận unit, HTTP e2e, DB integration và build/lint/typecheck của Asset đạt trong lượt rà soát này.
- [ ] Review quyền/scope và các thao tác ghi đồng thời trong PR #7, đặc biệt quyền list Model, QR khi Equipment RETIRED và customer/site INACTIVE.
- [ ] Xem sai khác seed `DEMO-CUST-02` và thống nhất kịch bản demo.
- [ ] Bổ sung/kiểm tra các ca biên warranty còn thiếu; đồng bộ mã lỗi PATCH và README.
- [ ] Chạy luồng M1 với Organization fixture thật và `pnpm smoke:m1` qua gateway; lưu kết quả.
- [ ] Bổ sung `asset-service test:db` vào CI nếu nhóm muốn DB concurrency test là gate bắt buộc của PR Asset.
- [ ] Review A7, quyết định snapshot/backfill và sửa schema OpenAPI trước khi merge contract Maintenance hoặc bắt đầu M2.
- [ ] Có approval theo `CONTRIBUTING.md`, sau đó mới merge PR #7/#8 theo thứ tự phù hợp.

## 6. Tài liệu và mã nguồn tham chiếu

- Kế hoạch gốc: “Kế hoạch giai đoạn & phân công 5 người”, mục **M1 — Member B — Asset Service**; kế hoạch triển khai Minh, mục **A0–A7**.
- Contract: [`docs/api/asset.yaml`](../api/asset.yaml), [`docs/api/fixtures.md`](../api/fixtures.md), [ADR 0006](../decisions/0006-m0-review-decisions.md).
- Code và hướng dẫn chạy: [`apps/asset-service/README.md`](../../apps/asset-service/README.md); test DB: [`equipment-db.integration.ts`](../../apps/asset-service/test/equipment-db.integration.ts).
- Quy trình review: [`CONTRIBUTING.md`](../../CONTRIBUTING.md); workflow: [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml).
- PR: [#3 — A1 đã merge](https://github.com/neyugn261/pbl6-saas-equipment/pull/3), [#7 — Asset A2–A6](https://github.com/neyugn261/pbl6-saas-equipment/pull/7), [#8 — Maintenance A7 draft](https://github.com/neyugn261/pbl6-saas-equipment/pull/8).

## 7. Cập nhật theo GitHub và “Review cuối M1” — 24/10/2026

Đây là trạng thái của lượt rà soát ban đầu, trước khi đồng bộ Git và mở các PR ở mục 9.

Nguồn review: `C:\Users\Admin\Downloads\Review cuối M1.md` (bản chốt ngày 23/10). Các đầu việc M1/M2-prep trong file này là kế hoạch của nhóm; trạng thái dưới đây chỉ ghi những gì kiểm chứng được từ GitHub và checkout hiện tại.

- [PR #7](https://github.com/neyugn261/pbl6-saas-equipment/pull/7) (Asset A2–A6) đã merge vào `develop` tại `8c3f0dc` ngày 23/10. [PR #8](https://github.com/neyugn261/pbl6-saas-equipment/pull/8) (Maintenance draft) cũng đã merge tại `8396e48`. Vì vậy phần kết luận cũ về hai PR chưa merge đã hết hiệu lực.
- `develop` trên GitHub hiện ở `d064224` (24/10); ref `origin/develop` trong checkout này vẫn ở `44243e6`. Nhánh đang checkout `feature/minh-asset-m1` ở `d457a8a`, khớp ref remote của chính nhánh đó. Chưa đồng bộ local refs hoặc chuyển nhánh trong lần rà soát này.
- Sau bản review, GitHub đã merge [ADR 0008, PR #9](https://github.com/neyugn261/pbl6-saas-equipment/pull/9), [Identity M1, PR #10](https://github.com/neyugn261/pbl6-saas-equipment/pull/10), [Web M1, PR #11](https://github.com/neyugn261/pbl6-saas-equipment/pull/11), [Organization D1/D10 tests, PR #13](https://github.com/neyugn261/pbl6-saas-equipment/pull/13) và [Work Order M2 contract, PR #15](https://github.com/neyugn261/pbl6-saas-equipment/pull/15). Commit Service Request `04aed55` cũng đã vào `develop` qua merge `d064224`. Việc merge cho thấy code/tài liệu đã được đưa vào nhánh chung, chưa tự chứng minh đủ tám tiêu chí nghiệm thu M1.
- [CI của `d064224`](https://github.com/neyugn261/pbl6-saas-equipment/actions/runs/40085355732) **thất bại**. Job lint/typecheck/unit/build đạt; trong job DB, migration/drift, Identity e2e, Organization e2e và Asset e2e/DB integration đều đạt. Bước Service Request DB e2e thất bại 10/10 test với `TypeError: request(...).set is not a function` tại `requests.e2e-spec.ts:74`; bước smoke M1 qua Gateway bị skip. Đây là lỗi đang chặn xác nhận CI xanh và smoke M1, chưa phải bằng chứng các nghiệp vụ Service Request đều sai.
- Hai mục Asset trong review vẫn cần kiểm chứng ở code mới nhất: M1 (`test:db` có globalSetup migrate) và M2 (chặn warranty/QR mới cho RETIRED, escape `%`/`_`, sửa mô tả YAML). Checkout hiện tại chưa có globalSetup cho `test:db`; CI mới đã chạy `Asset integration tests` thành công nhưng migration toàn repo được áp dụng trước đó. Trong code của nhánh hiện tại, `warranty-status` vẫn bị mô tả “remains A4” trong `apps/asset-service/README.md`, và root README vẫn ghi Asset chưa có API nghiệp vụ. Đây là lệch tài liệu cần đồng bộ.
- Theo [trạng thái nhánh `develop` trên GitHub](https://github.com/neyugn261/pbl6-saas-equipment/tree/develop), branch protection hiện báo `protected: false`. Chưa ghi M1 là hoàn tất hoặc đã gắn tag vì CI mới nhất chưa xanh và chưa có bằng chứng nghiệm thu G3.

## 8. Phần Minh thực hiện trước khi mở PR — 24/10/2026

Đây là ảnh chụp trạng thái trước khi tách ba PR ở mục 9. Các thay đổi bắt đầu từ `origin/develop` tại `d064224`:

- **M1:** `asset-service test:db` có globalSetup kiểm tra `ASSET_TEST_DATABASE_URL` chứa `test` rồi chạy Prisma migration trên database đó. Bước Asset integration test của CI gọi thẳng `pnpm test:db`, không migrate thủ công trước; lần chạy cục bộ xác nhận globalSetup thực thi và 9 test DB đạt. CI của nhánh thay đổi này chưa chạy.
- **M2 (mã việc thuộc M1):** Từ chối cấp warranty hoặc QR mới cho Equipment `RETIRED` bằng 409 `EQUIPMENT_RETIRED` sau khi khóa row; QR và warranty cũ vẫn đọc được. Tìm kiếm Equipment và Equipment Model escape ký tự `%`, `_` và `\` như ký tự thường. DB integration test xác nhận cả hai ca.
- **M3 (mã việc thuộc M1):** Asset tạo URL `<base>/portal/qr/<token>`; web trên `develop` đã có route `/portal/qr/:token`, nên đường dẫn đã khớp ở mức contract. Chưa kiểm thử quét QR qua stack thật trong lượt này.
- Đã đồng bộ README Asset/root, mô tả 409/QR và đặt dấu nháy cho toàn bộ error response description của `asset.yaml` để bao phủ mục A4 dù review không nêu ba dòng cụ thể. YAML parse được và không có khóa trùng theo kiểm tra cục bộ.

Kiểm tra cục bộ: Asset lint, typecheck, build, 18 unit test, 15 HTTP e2e, 9 DB integration test và `git diff --check` đều đạt. Đây là kiểm tra của nhánh làm việc, không thay thế CI/ nghiệm thu trên `develop`.

## 9. PR M1 và kết quả CI — 24/10/2026

Local `develop` và `origin/develop` đã fast-forward đến `d064224`. Ba nhánh M1 được commit và push riêng từ commit này, theo quy tắc tách code, API contract và file `.github` trong `CONTRIBUTING.md`:

| PR | Nội dung | Commit |
| --- | --- | --- |
| [#16](https://github.com/neyugn261/pbl6-saas-equipment/pull/16) | GlobalSetup cho Asset `test:db`, chặn warranty/QR trên RETIRED, tìm kiếm literal, DB test và README | `0767469` |
| [#17](https://github.com/neyugn261/pbl6-saas-equipment/pull/17) | Sửa OpenAPI Asset: error descriptions, 409 cho RETIRED, tài liệu tìm kiếm literal | `e9788cc` |
| [#18](https://github.com/neyugn261/pbl6-saas-equipment/pull/18) | CI gọi trực tiếp Asset `pnpm test:db` | `118db38` |

Trên CI của #16, job lint/typecheck/unit/build đạt. Asset HTTP e2e đạt 15/15 và Asset DB integration đạt 9/9 trên PostgreSQL của CI; globalSetup đã migrate `asset_test_db`. Job DB chung thất bại ở bước **Service Request database e2e** với `TypeError: request(...).set is not a function` trong `requests.e2e-spec.ts:74`; smoke Gateway bị skip. Đây là lỗi đang có trên `develop`, ngoài thay đổi của Minh. #17 cũng đã đạt job lint/typecheck/unit/build, và job DB báo cùng lỗi Service Request. #18 đạt job lint/typecheck/unit/build nhưng bước Asset DB thất bại vì PR CI chạy độc lập trên `develop`, chưa có globalSetup của #16 nên thiếu bảng `equipment_models` trong `asset_test_db`. Cần ghép #16 trước #18 rồi chạy lại CI.

M3: Asset phát `<base>/portal/qr/<token>` và web đã khai báo `/portal/qr/:token`, có HTTP e2e kiểm tra URL được trả. Theo yêu cầu của người dùng ngày 24/10, không cần xin xác nhận riêng từ Hatsady. Chưa kiểm thử quét QR qua stack thật. Ba PR chưa được merge; chưa tuyên bố hoàn tất M1 của toàn nhóm.
