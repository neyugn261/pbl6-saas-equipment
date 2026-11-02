# Minh M3 — Báo cáo cải tiến nghiệp vụ sau review

Ngày 02/11/2026. Nhánh local `codex/minh-m3-inventory`, nền `79a4568`.
Thay đổi M3 và đợt cải tiến này chưa commit/push/merge. Không có bằng chứng CI
GitHub hoặc peer approval trong lượt này.

Yêu cầu: cải tiến nhận xét về trải nghiệm của chủ doanh nghiệp và khách hàng.
Đã đối chiếu code, schema, ERD, ADR 0006/0014 và file nhận xét người dùng gửi.
ADR 0015 ghi quy tắc bổ sung; phần thực thi thuộc Inventory và Asset của Minh.

## Những thay đổi đã làm

| Vấn đề | Thay đổi thực tế |
| --- | --- |
| Xuất chưa trả bị gọi là đã dùng | Tách quantityIssued / quantityOutstanding / quantityConfirmedUsed / quantityUnreconciled. quantityUsed giữ alias đã xuất để không viết lại lịch sử; quantityConsumed chuyển sang lượng đã xác nhận. |
| Chưa có bằng chứng sử dụng | API xác nhận từng phần từ Technician, đối chiếu completed WO, completed assignment và đúng Service Report qua API thật với JWT caller. Không sửa số tồn khi xác nhận. |
| Sửa xác nhận sai làm mất lịch sử | Có bản đảo đầy đủ một xác nhận, chỉ một lần, ghi người/lý do; giữ bản gốc, chống ghi trùng và chống trả vượt sau xác nhận. |
| Hàng hỏng trả về có thể xuất tiếp | RETURN bắt buộc GOOD/DAMAGED/PENDING_INSPECTION. Chỉ GOOD tăng tồn có thể xuất; hàng khác tăng cách ly. RELEASE/SCRAP theo phiếu trả gốc, có lý do và giới hạn tổng lượng. |
| Thiếu lịch sử để giải trình | Audit tạo/sửa danh mục, trạng thái và ngưỡng trong cùng transaction. Giao dịch/usage giữ snapshot danh mục; giữ null ở lịch sử cũ chưa có bằng chứng. |
| Nhập/điều chỉnh thiếu căn cứ | RECEIVE có chứng từ hoặc diễn giải. ADJUST có loại lý do và note; CORRECTION liên kết giao dịch cùng phụ tùng/kho, đối ứng đúng chiều và không vượt lượng gốc. ISSUE/RETURN không bị sửa âm thầm qua correction. |
| Số lẻ không phù hợp đơn vị | Part mới mặc định số nguyên; hàng đo lường cần allowFractional=true. Chuẩn hóa alias như pcs/chiếc → cái; đơn vị đếm đã biết không bật số lẻ. Chính sách bất biến; dữ liệu cũ giữ nguyên, không làm tròn. |
| Giá kho bị hiểu là giá khách trả | unitCost được định nghĩa là giá tham chiếu nội bộ, cần đi kèm unitCostCurrency hoặc bỏ cả hai. Null là chưa biết. Không đưa giá kho sang lịch sử khách hoặc tự xác định phí/bảo hành. |
| Khách thiếu lịch sử phụ tùng | API equipment/service-parts chỉ công bố xác nhận và bản sửa, lọc tenant/customer/equipment, kiểm tra quyền sống qua Asset. Asset dossier có preview và endpoint phân trang riêng; không lộ kho, giá vốn, actor ID hoặc note nội bộ. |
| Sửa sai bị cộng nhầm khi phân trang | Bản gốc đã đảo có isReversed=true và effectiveQuantity=0 dù bản đảo ở trang khác. REVERSE là bản sửa, không phải lần thay mới. |
| Lỗi mạng khó biết hàng đã xuất chưa | Proof bổ sung stockOutcome, trạng thái đồng bộ, actor chịu trách nhiệm gốc, pendingSince và hành động tiếp theo. inventory:read được giám sát, inventory:issue mới được retry/abort. |
| Cảnh báo cũ bị hiểu thành tồn hiện tại | Stock list có tên phụ tùng/kho, lượng có thể xuất/cách ly, thiếu bao nhiêu và isLowStock. Giữ một event mỗi đợt; không tự phát thông báo lặp. |

Điểm tương thích với WO thật đã kiểm tra trong source: complete kết thúc assignment,
nên currentAssignment/currentTechnicianId có thể null. Xác nhận dùng lịch sử
COMPLETED và technicianId của report. Không dựng điều kiện bất khả thi đòi active
assignment sau khi công việc đã xong. Report hiện sinh cùng complete, nên xác nhận
Inventory theo sau report; không tạo vòng chờ trước complete.

Khách đọc recordedAt là thời điểm ghi nhận xác nhận, không phải thời điểm lắp đã
được chứng thực. Tên kỹ thuật viên, thời điểm sửa thực tế, quyết định phí và bảo
hành cần nguồn công bố phù hợp ở WO/SR, không bịa từ các ID hoặc thời điểm hiện tại.

## File/chức năng chính

- `apps/inventory-service/src/inventory/`: DTO, quyền, service, repository, reference
  clients; xác nhận/đảo, trả/cách ly/kiểm tra, audit, snapshot và customer projection.
- `apps/inventory-service/prisma/schema.prisma` và migrations mới
  `0004_inventory_accountability`, `0005_internal_cost_currency`; không sửa 0001–0003.
- `apps/asset-service/src/dossier/` và config: composition serviceParts theo scope
  thiết bị đã xác thực; allowlist bổ sung và partial availability.
- Các suite Inventory unit/HTTP/PostgreSQL/broker/seed và Asset dossier PostgreSQL.
- OpenAPI Inventory/Accountability/Reservations, Asset/Dossier; ADR 0015, README,
  ERD và [bàn giao theo thành viên](../plans/minh-m3-business-review-handoff.md).

## Kiểm tra đã chạy

| Kiểm tra | Kết quả |
| --- | --- |
| Inventory unit | 24/24 PASS |
| Inventory HTTP pipeline | 8/8 PASS |
| Inventory PostgreSQL business + seed + broker | 33/33 PASS; gồm 30 business, 2 seed, 1 broker |
| Asset dossier PostgreSQL | 10/10 PASS |
| Tổng ca trong các suite trên | **75 PASS** |
| Inventory lint / typecheck / build | PASS |
| Asset lint / typecheck / build | PASS |
| Migrations ↔ Prisma và inventory_test_db ↔ Prisma | PASS, không drift |
| YAML/reference | PASS, 212 references trên 5 contract files; CI YAML parse PASS |
| ERD đối chiếu migrations 0003/0004/0005 | PASS sau chuẩn hóa CRLF/LF |
| git diff --check | PASS |

Các ca mới kiểm tra: số nguyên/alias; cost-currency thiếu cặp và null; lịch sử sau
đổi tên; giới hạn correction; cách ly không làm tăng tồn có thể xuất; inspection
retry và hai người xử lý đồng thời; trả sau WO đóng/INACTIVE; đúng tác giả report;
xác nhận và trả tranh cùng lượng; đảo một lần; customer scope, loại dữ liệu nội
bộ, sửa sai qua hai trang; quản lý đọc recovery; Asset giữ UNAVAILABLE thay vì
giả danh sách rỗng và từ chối dữ liệu lệch thiết bị.

Lỗi phát hiện khi kiểm tra và đã sửa: mock fetch dùng lại Response đã bị đọc body;
validator SQL ban đầu so byte CRLF/LF thay vì nội dung đã chuẩn hóa. Lượt unit/DB/
contract cuối phía trên đã pass sau sửa. Không ghi nhận các lượt lỗi là thành công.

Test dùng DB riêng inventory_test_db và asset_test_db, broker thật cho producer;
WO/Asset references trong suite Inventory và nguồn remote trong suite Asset là
fixture có khai báo. Không coi đó là bằng chứng reservation hai service hay UI thật.
Test setup áp dụng migration còn thiếu vào DB kiểm thử. Không migrate DB phát triển,
không sửa .env, không reset dữ liệu/volumes, không chạy seed login demo thật.

## Phần cần ghép tiếp

| Người phụ trách | Việc còn cần làm và bằng chứng nghiệm thu |
| --- | --- |
| Khương | Reservation WO thật và terminal locking; nối xác nhận sau report, disposition linh kiện cũ; safe summary kỹ thuật viên/thời điểm/kết quả cho khách. Test crash/race thật hai service. |
| Huy | Phí/bảo hành theo SR và estimate đã duyệt, xử lý thay đổi phạm vi/chi phí; review đối soát trước customer final-close. Notification audience/inbox/dedup thật. |
| Hatsady | Màn hình kho/cách ly/kiểm tra, usage đối soát, audit, recovery và hồ sơ khách; UAT toàn luồng. |
| Nguyên | Review contract/config/Gateway/CORS/CI và triển khai migration cùng client tương thích. |
| Minh phối hợp | Ghép và kiểm tra lại các contract sau khi runtime owner có; không giả định phần đã bàn giao là đã xong. |

**ISSUE toàn hệ thống vẫn bị chặn an toàn khi WO chưa có reservation API.** Khách
đã có nguồn lịch sử phụ tùng ở backend, nhưng UI và quyết định tính phí/bảo hành
chưa được nghiệm thu. Lượng chưa đối soát vẫn hiện rõ để điều tra; không tự coi
hàng mất ở công trường là đã lắp hoặc dùng ADJUST để trừ kho lần hai.

Để chạy code mới trên DB phát triển sau khi review:

```powershell
pnpm --filter inventory-service db:migrate
pnpm dev:inventory
```

Asset cần khởi động lại để nhận section mới; kiểm tra các URL hai service đã có
trong .env.example. Seed và dữ liệu demo hoàn chỉnh cần phần WO reservation trước
khi có thể demo ISSUE thật. Hướng dẫn trên không có nghĩa đã chạy migration dev.
