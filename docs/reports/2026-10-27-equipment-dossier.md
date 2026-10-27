# Triển khai hồ sơ thiết bị và lịch sử chi tiết — 27/10/2026

> **Cập nhật cuối ngày:** đã merge contract/backend qua PR #29/#30; Asset DB hiện
> 21 ca và tổng hai service 93 ca. Xem
> [báo cáo bàn giao cuối ngày](2026-10-27-minh-daily-handoff.md) cho trạng thái hiện tại.
> Các con số và trạng thái working tree bên dưới là ảnh chụp trước bước kiểm tra/merge cuối.

Thực hiện sau khi chủ dự án đồng ý đề xuất trải nghiệm cho nhà cung cấp/khách hàng.
Phạm vi triển khai: backend Asset và Maintenance của Minh. Đây là phần bổ sung
sau [báo cáo M2](2026-10-27-minh-m2.md), không thay thế kết quả M2 trước đó.

## 1. Thay đổi đã làm

| Nhóm | Kết quả |
| --- | --- |
| Hồ sơ thiết bị | Tên hiển thị, mô tả, thông số theo từng đơn vị thiết bị, ngày commissioning; giữ serial/model/khách hàng/site/location và ngày bàn giao/lắp đặt |
| Tình trạng thực tế | UNKNOWN/OPERATIONAL/DEGRADED/NOT_OPERATIONAL; manager xác nhận kèm lý do, thời gian/người xác nhận; không tự suy từ kết quả WO |
| Hồ sơ tổng hợp | API dossier đọc hồ sơ/model/bảo hành; thông tin khách hàng/site/contact/location; SR/WO liên quan; tổng quan và lịch sử Maintenance; kết quả dịch vụ đã ghi nhận gần nhất |
| Truy cập từng nguồn | AVAILABLE/RESTRICTED/UNAVAILABLE/NOT_CONFIGURED/NOT_FOUND; chuyển tiếp token/correlation; không truy cập DB của service khác |
| Nhật ký Asset | Trước/sau, actor/role/system, xảy ra/ghi nhận, bối cảnh thiết bị, lý do nội bộ tách ghi chú khách hàng; mọi thay đổi Equipment/Warranty/QR qua API nằm cùng transaction với nhật ký |
| Tra cứu lịch sử | Feed tổng theo tenant/customer, timeline thiết bị có filter, chi tiết từng dòng, lịch sử bảo hành và ledger Model riêng |
| Request/WO chi tiết | Kiểm tra đúng thiết bị/khách hàng trước khi đọc lịch sử/bình luận/phân công/log/report; trả allowedActions gốc; Customer không đi vòng vào WO nội bộ |
| Bảo hành | Tách khoảng bảo hành theo ngày hiện tại và kết luận kiểm tra đã lưu tại từng SR; lịch sử thêm/hủy có snapshot và nội dung công bố riêng |
| Nhật ký Maintenance | Tạo/sửa Plan, đồng bộ snapshot, sinh Task/đẩy lịch, link/kết quả/hủy WO, yêu cầu WO thay thế, cập nhật lần hoàn thành; idempotent theo inbox |
| Hành trình Task | Các WO cũ/mới và lần yêu cầu thay thế, ai đang cần xử lý, allowedActions phù hợp quyền, lịch sử phân trang |
| Tổng quan Maintenance | Đếm trên toàn bộ phạm vi, kỳ đến hạn sớm nhất, Task mở quá hạn, preview cần chú ý giới hạn 5 và tổng số thật; Task list lọc equipmentId |
| Dữ liệu cũ | Giữ nguyên; đánh dấu LEGACY_SUMMARY/context không đủ; không dựng ngược lịch sử không từng được lưu |

## 2. File/nhóm file chính

- Asset schema và migration `20261027140000_equipment_dossier_history`.
- `apps/asset-service/src/dossier/`: đọc tổng hợp và drill-down theo thiết bị.
- `apps/asset-service/src/history/`: snapshot/delta, redaction, feed/detail/resource histories.
- Equipment/Model/Warranty/QR repositories/services: ghi dữ liệu và audit nguyên tử.
- Asset consumer: lưu customerSummary, before/after trạng thái/kết quả, nguồn event và loại context.
- Maintenance schema và migration `20261027141000_maintenance_history`.
- `apps/maintenance-service/src/common/audit.ts`, `src/plans/journey.*`: audit và API hành trình/tổng quan.
- Plan repository, scheduler và event consumers: ghi nhật ký cùng transaction nghiệp vụ.
- `docs/decisions/0010-equipment-dossier-and-history.md`: quyết định thiết kế và giới hạn dữ liệu.
- `docs/api/asset.yaml`, `equipment-dossier.yaml`, `maintenance.yaml`, `maintenance-history.yaml` và SQL tham chiếu ERD.
- [Bàn giao giao diện và owner](../plans/equipment-dossier-handoff.md): danh sách màn hình/API, quy tắc trải nghiệm, luồng demo.

## 3. Kiểm thử đã chạy

| Kiểm tra | Kết quả |
| --- | --- |
| Asset unit | 18/18 |
| Asset HTTP/bootstrap regression | 15/15 |
| Asset PostgreSQL integration | 20/20, gồm 8 ca dossier/audit mới với fake nguồn HTTP được khai báo rõ |
| Maintenance unit | 19/19 |
| Maintenance HTTP/bootstrap | 2/2 |
| Maintenance PostgreSQL integration | 18/18, gồm hành trình/lịch sử/filter/scope/tổng quan mới |
| Lint/typecheck/build từng service | Đạt |
| Drift migrations → Prisma từng service | Không khác biệt |
| API YAML và local/external document refs | Parse được; 256 tham chiếu được kiểm tra |
| `git diff --check` | Đạt |

Tổng **92 ca** của hai service, cộng script tích hợp thật:

- Asset move → Maintenance snapshot → scheduler → TaskDue → Work Order thật.
- WO phân công/tiếp nhận/thực hiện/report/hoàn thành → Task + Asset service history.
- Dossier qua Gateway đọc WO/report/assignment/history và tổng quan Maintenance.
- Customer đọc được kết quả customerSummary đã công bố, WO nội bộ vẫn RESTRICTED.
- WO hoàn thành không tự đổi tình trạng thiết bị UNKNOWN.
- WO hủy → Task PENDING → yêu cầu thay thế bền vững/idempotent.
- Seed hai lần giữ nguyên Plan/lịch/Task.

Script dùng PostgreSQL/RabbitMQ và app Asset/Maintenance/WO/Gateway thật;
JWT và tham chiếu Organization là fixture công khai của bài test. Không tuyên bố
đã kiểm thử giao diện, Identity login thực hoặc toàn luồng SR/Estimate ở đây.

## 4. Migration và chạy thử

Hai migration mới đã áp dụng thành công vào **database phát triển và test**,
không reset database. URL các nguồn lấy từ cấu hình đang có trong `.env.example`.
Máy khác sau khi lấy code cần chạy:

```powershell
pnpm --filter asset-service db:migrate
pnpm --filter maintenance-service db:migrate
pnpm dev:backend
# Terminal khác, nếu muốn mở frontend hiện có:
pnpm dev:web
```

API chính qua Gateway: `GET /api/assets/equipment/{id}/dossier` bằng token người dùng.
Giao diện hiện có chưa tự xuất hiện các màn hình dossier mới chỉ vì backend đã có API.

## 5. Giới hạn và việc tiếp theo

1. Web/Mobile owner nối màn hình theo file bàn giao. Đây chưa phải bản UX mới đã hoàn thiện trên web.
2. Consumer tạo WO thay thế của Khương vẫn được bàn giao riêng theo lựa chọn trước đó của chủ dự án.
3. Asset feed có các thao tác Asset, trạng thái SR và WO completion đã consume;
   Maintenance có feed riêng. Toàn bộ assignment/log đọc theo WO tại source.
   Chưa có một feed hợp nhất mọi log của toàn bộ microservice.
4. Event hiện hành thiếu bối cảnh vị trí/model tại lúc sửa. Context event là
   `AT_EVENT_PROCESSING`; không khẳng định đó là vị trí gốc của ca sửa.
5. Actor có ID/role; chưa có tên người thực hiện lịch sử được snapshot từ Identity.
6. Phụ tùng/chi phí ngoài contract hiện có, file đính kèm, xác nhận lịch hẹn và
   notification mới tiếp tục theo milestone/chủ phần việc tương ứng.
7. Các API/schema/shared docs mới cần review nhóm trước khi merge. Implementation
   đang ở working tree nhánh `codex/minh-maintenance-foundation`; chưa commit/push/PR mới.
