# M3 của Minh — Biên bản nghiệm thu local và bàn giao tích hợp

Ngày: **02/11/2026**. Người lập: AI coding agent hỗ trợ Minh.
Đối tượng: code local trên nhánh `codex/minh-m3-inventory`, nền commit `79a4568`,
bao gồm các thay đổi chưa commit và file mới chưa được Git theo dõi.

## 1. Kết luận nghiệm thu

**ĐẠT nghiệm thu backend local trong phạm vi Inventory và phần tích hợp Asset do
Minh thực hiện. Đủ điều kiện bàn giao để các thành viên review và ghép luồng.**

Đã đối chiếu nhận xét nghiệp vụ người dùng gửi, đọc lại code/contract/schema,
đối chiếu API Work Order hiện có và chạy lại **75 kiểm thử đều PASS**. Lint,
typecheck, build của Inventory/Asset và kiểm tra drift Inventory đều PASS.
Trong phạm vi đã kiểm tra, chưa phát hiện lỗi nghiêm trọng còn mở ngăn bàn giao.

**Chưa nghiệm thu M3 toàn hệ thống hoặc trải nghiệm người dùng hoàn chỉnh.**
ISSUE thật còn chờ reservation phía Work Order; các luồng chi phí/bảo hành,
Notification và giao diện cần chủ sở hữu triển khai, tích hợp và xác nhận.
Kết quả này không thay thế peer review, CI trên PR hoặc UAT của các thành viên.

Trạng thái bàn giao:

- Code hiện vẫn ở máy local; chưa commit/push/merge đợt M3 này.
- Lượt nghiệm thu không fetch remote, nên không xác nhận remote mới nhất.
- Test dùng `inventory_test_db`, `asset_test_db` và RabbitMQ thật cho producer.
  Không migrate DB phát triển, không reset dữ liệu và không sửa `.env`.
- File này là tài liệu bàn giao trong repository; chưa gửi thông báo hoặc nhận
  xác nhận của bất kỳ thành viên nào.

## 2. Đối chiếu từng nhận xét và phần đã hoàn thành

| Nhận xét | Phần Minh đã triển khai và kiểm chứng | Kết luận/phần còn nối |
| --- | --- | --- |
| Xuất kho dễ bị hiểu là đã lắp | Tách đã xuất, đã trả, đã xác nhận dùng, đã xuất chưa trả và chưa đối soát. Xác nhận dựa trên WO COMPLETED, assignment COMPLETED và đúng tác giả Service Report. Trả và xác nhận cùng khóa lượng gốc; không vượt đã xuất. | Đạt local. Khương/Hatsady nối thao tác sau report. |
| Sửa xác nhận làm mất lịch sử | Đảo toàn bộ một xác nhận bằng bản ghi mới, có lý do/người thực hiện, chỉ đảo một lần. Lịch sử khách giữ bản gốc và bản sửa; lượng hiệu lực bằng 0 dù bản đảo ở trang khác. | Đạt local; UI cần hiển thị đúng bản sửa. |
| Hàng trả hỏng bị nhập vào tồn có thể xuất | RETURN bắt buộc GOOD/DAMAGED/PENDING_INSPECTION. Hàng không tốt vào cách ly; RELEASE/SCRAP liên kết đúng lần trả, giới hạn tổng lượng, chống ghi trùng và xử lý đồng thời. | Đạt local. Khương ghi linh kiện cũ tháo ra trong biên bản; Hatsady làm màn hình kiểm tra. |
| Trả sau khi WO đóng hoặc danh mục INACTIVE | Vẫn cho phép về đúng kho gốc; tổng đã trả và xác nhận không vượt đã xuất. RELEASE yêu cầu danh mục ACTIVE, SCRAP được xử lý khi INACTIVE. | Đạt local. |
| Thiếu câu chuyện thay phụ tùng cho khách | API lịch sử theo thiết bị gồm phụ tùng/số lượng xác nhận, lý do, WO/report liên quan, xử lý linh kiện cũ và bản sửa. Asset dossier có preview và API phân trang. Kiểm tra tenant/customer/thiết bị, loại dữ liệu kho nội bộ. | Backend phần Minh đạt; tên kỹ thuật viên, thời điểm sửa thực tế, kết quả sửa và UI còn cần ghép. |
| Giá kho dễ bị hiểu là giá khách trả | `unitCost` là giá tham chiếu nội bộ, cần đi cùng currency hoặc bỏ cả hai. Null không phải miễn phí. Lịch sử khách không trả giá vốn, không tự kết luận phí/bảo hành hoặc gia hạn bảo hành thiết bị. | Đạt về ý nghĩa và giới hạn công bố; Huy nối dự toán/quyết định bảo hành. |
| Lịch sử chưa đủ giải trình | Audit trước/sau cho danh mục/trạng thái/ngưỡng; snapshot tại giao dịch; nhập có chứng từ hoặc diễn giải; điều chỉnh có reasonCode/note. CORRECTION cùng hàng/kho, đúng chiều đối ứng, giới hạn cộng dồn theo giao dịch gốc. | Đạt local. Dữ liệu cũ thiếu snapshot vẫn thể hiện thiếu. |
| Đơn vị số lượng chưa sát thực tế | Phụ tùng mới mặc định số nguyên; chuẩn hóa alias; đơn vị đếm đã biết không bật số lẻ. Hàng đo lường có thể cho phép số lẻ. Unit/chính sách số lẻ bất biến; không làm tròn dữ liệu cũ. | Đạt local; UI phải thể hiện chính sách khi tạo danh mục. |
| Không rõ hàng đã xuất chưa khi mất mạng | Lưu operation bền vững và cùng Idempotency-Key; proof có stockOutcome, trạng thái đồng bộ, actor gốc, thời điểm chờ và bước xử lý tiếp. Quyền đọc giám sát tách quyền retry/abort. | Phía Inventory đạt; chưa chứng minh reservation/crash/race bằng hai service thật. |
| LowStock chưa thành quy trình sử dụng | Một sự kiện mỗi đợt thiếu, re-arm khi đạt ngưỡng; đổi ngưỡng đánh giá lại. Stock list trả tên hàng/kho, tồn hiện tại, thiếu bao nhiêu, tồn cách ly. Producer/retry/replay đã thử với RabbitMQ thật. | Huy nối consumer/audience, Hatsady nối inbox và danh sách thiếu hiện tại. |

Các quy tắc chi tiết nằm trong [ADR 0015](../decisions/0015-inventory-accountability-and-service-parts.md)
và [ADR 0014](../decisions/0014-inventory-m3-transactions-and-reservations.md).

## 3. Kết quả kiểm tra chạy lại trong lượt nghiệm thu này

| Kiểm tra | Lệnh/cách đã chạy | Kết quả |
| --- | --- | --- |
| Inventory unit | `pnpm --filter inventory-service test` | 24/24 PASS |
| Inventory HTTP pipeline | `pnpm --filter inventory-service test:e2e` | 8/8 PASS |
| Inventory DB, seed, broker | `node tmp/run-minh-inventory.cjs` gọi script `test:db` | 33/33 PASS: 30 business + 2 seed + 1 broker |
| Asset dossier DB | `node tmp/run-accountability-checks.cjs`, chạy riêng `test/dossier-db.integration.ts` | 10/10 PASS |
| Tổng các suite trên | 8 test suites | **75/75 PASS** |
| Lint | `pnpm --filter inventory-service --filter asset-service lint` | PASS cả hai service |
| Typecheck | `pnpm --filter inventory-service --filter asset-service typecheck` | PASS cả hai service |
| Build | `pnpm --filter inventory-service --filter asset-service build` | PASS cả hai service |
| Migrations so với Prisma | Helper Inventory với `db:check-drift` | Không có khác biệt |
| Test DB thực tế so với Prisma | Helper Inventory với `db:check-test-drift` | Không có khác biệt |
| Contract, CI YAML, ERD | `node tmp/validate-inventory-contracts.cjs` | 5 contract files, 211 references hợp lệ; YAML parse và SQL migrations 0003–0005 khớp ERD sau chuẩn hóa xuống dòng |
| Whitespace diff | `git diff --check` | PASS |

Các helper trong `tmp/` chỉ hỗ trợ môi trường local và không nằm trong gói source
được Git theo dõi. Chạy lại ở máy khác: cấu hình URL DB kiểm thử riêng theo README
của service, rồi dùng `pnpm --filter inventory-service test:db`; Asset dùng Jest
với `--config ./test/jest-db.json --runInBand --runTestsByPath test/dossier-db.integration.ts`.
Không dùng DB phát triển cho các bộ kiểm thử này.

Các tình huống đã có kiểm chứng bao gồm: concurrent ISSUE/RETURN/confirmation/
inspection; retry cùng key; vượt tồn/số lượng; rollback khi ghi ledger lỗi;
inactive/terminal return; tác giả report sai; tenant/customer khác; lọc dữ liệu
nội bộ; mất kết nối nguồn hồ sơ; đảo xác nhận qua hai trang; audit/snapshot sau đổi tên.

Giới hạn bằng chứng:

- PostgreSQL và RabbitMQ của các suite trên là thật. Work Order/Asset reference
  của Inventory và nguồn remote của Asset được mô phỏng bằng fixture.
- Source Work Order hiện tại đã được đối chiếu: complete kết thúc assignment;
  Inventory đọc lịch sử COMPLETED, không yêu cầu currentAssignment còn active.
- Broker test chứng minh phía producer; không chứng minh Notification đã gửi
  đến đúng người dùng. Bằng chứng lượt chạy nằm ở `tmp/inventory-low-stock-evidence.json`.
- Chưa chạy toàn bộ monorepo, CI GitHub, đăng nhập seed demo end-to-end hoặc UAT web.
  Parse file CI không phải là chạy CI.

## 4. Điểm phát hiện và xử lý trong nghiệm thu

Đã sửa mô tả OpenAPI của `quantityPhysicalAtWarehouse` trong
[inventory.yaml](../api/inventory.yaml): đây là tổng available + quarantine,
có thể vượt 10 chữ số phần nguyên dù từng cột riêng vẫn hợp lệ. Trường trả về
được mô tả là số thập phân dạng chuỗi chỉ đọc, không tái dùng giới hạn đầu vào
của một loại tồn. Không thay đổi runtime, schema DB hoặc số liệu kho.

Sau sửa đã chạy lại validator contract: 211 references hợp lệ. Báo cáo cải tiến
trước đó ghi 212 references là kết quả ở phiên bản trước khi bỏ reference này.

## 5. Việc cần thành viên khác triển khai/nghiệm thu

Mọi mục dưới đây hiện **CHỜ XÁC NHẬN**. Có contract bàn giao không có nghĩa runtime
đã tồn tại; các mục ghi “triển khai” cần làm code trước khi nghiệm thu.

| Mã | Chủ trì / phối hợp | Việc cần làm | Bằng chứng để đóng mục |
| --- | --- | --- | --- |
| NT-01 — chặn ISSUE thật | Khương / Minh, Nguyên | Triển khai durable WO reservation và khóa mọi đường complete/cancel theo ADR 0014. Ghép reserve/settle/proof, không tự hết hạn hold. | Hai service thật: ISSUE cạnh tranh complete/cancel, mất phản hồi reserve, crash sau ghi kho, retry/abort; không trừ kho hai lần, không đóng WO vượt hold, đối soát xong được. |
| NT-02 — phụ tùng sau report | Khương / Hatsady, Minh | Nối Technician xác nhận theo đúng completed report, disposition linh kiện cũ và tra cứu số chưa đối soát. Bổ sung dữ liệu tên người thực hiện/thời điểm sửa/kết quả được phép công bố. | Đúng kỹ thuật viên xác nhận được sau complete; người khác bị từ chối; report và lịch sử thiết bị cùng phản ánh lượng xác nhận. |
| NT-03 — phí và bảo hành | Huy / Khương, Hatsady | Ghép SR/estimate đã duyệt với phụ tùng, currency, revision/line và quyết định bảo hành. Xác nhận thay đổi phạm vi/chi phí trước thực hiện. | Khách thấy căn cứ và số tiền đúng; chưa biết khác miễn phí; không dùng unitCost làm giá bán; ngoài bảo hành kể cả 0 đồng vẫn theo approval ADR 0006. |
| NT-04 — hoàn tất hồ sơ | Huy / Khương, Minh | Review điều kiện customer final-close khi còn lượng chưa đối soát. Phân biệt WO hoàn tất kỹ thuật và hồ sơ phụ tùng đã đối soát. | Có quy tắc được chốt và ca thử đóng hồ sơ còn thiếu; không tạo vòng chờ đòi xác nhận sau report trước khi report được sinh. |
| NT-05 — cảnh báo | Huy / Hatsady, Nguyên | Nối LowStock vào Notification inbox, audience, tenant scope và dedup theo eventId; link đến tồn hiện tại. | Replay không sinh thông báo trùng; đúng người nhận; đợt thiếu mới có thông báo mới; đã hết thiếu hiển thị đúng theo stock hiện tại. |
| NT-06 — giao diện và UAT | Hatsady / các owner | Màn hình kho/cách ly/inspection, đối soát WO, audit, recovery; hồ sơ phụ tùng khách có phân trang và bản sửa. | Chạy các kịch bản mục 7 bằng tài khoản thật; trạng thái lỗi/thiếu dữ liệu hiển thị rõ, không lộ dữ liệu nội bộ. |
| NT-07 — vận hành tích hợp | Nguyên / Minh | Review Gateway, CORS cho Idempotency-Key và header recovery, config URL, CI và thứ tự deploy migration/client. | Chạy qua Gateway thật; internal paths không public; CI trên PR đạt; migrate môi trường tích hợp và xác minh client mới tương thích. |

Hướng dẫn triển khai cụ thể theo người:
[Bàn giao nghiệp vụ sau review](../plans/minh-m3-business-review-handoff.md).
Contract reservation: [inventory-reservations.yaml](../api/inventory-reservations.yaml).

## 6. Giới hạn còn cần quyết định/phối hợp, không được đánh dấu đã hoàn tất

- **Mất/hỏng phụ tùng tại công trường chưa trả về kho:** hiện lượng đó còn chưa
  đối soát. Chưa có workflow kết sổ chênh lệch/custody riêng. Minh và Khương cần
  cùng người quyết định nghiệp vụ chốt cách xử lý nếu đưa vào tiêu chí vận hành;
  không giao hoàn toàn cho người khác, không giả là đã lắp hoặc trừ kho lần hai.
- **Bảo hành riêng của phụ tùng thay thế:** chưa triển khai chính sách tự sinh
  hoặc gia hạn; Inventory chỉ công bố rằng không tự gia hạn bảo hành thiết bị.
  Nếu cần, Minh phối hợp Huy/Khương làm rõ chính sách và nguồn dữ liệu trước khi triển khai.
- **Lịch sử cũ:** thiếu snapshot hoặc xác nhận vẫn thiếu; không khôi phục bằng
  suy đoán. `recordedAt` là lúc ghi nhận, không phải thời điểm lắp đã chứng thực.
- **Recovery:** thao tác treo có dữ liệu tra cứu và actor gốc; chưa có cơ chế
  phân công xử lý tự động/escalation. Cần quy trình người trực kho theo dõi.

Các giới hạn này không làm thất bại các chức năng local đã kiểm thử, nhưng ngăn
tuyên bố rằng mọi tình huống vận hành thực tế và mọi thông tin khách cần đều đã đủ.

## 7. Checklist nghiệm thu tích hợp chung

- [ ] Nhập 5, xuất 3, xác nhận dùng 1, trả tốt 1: tồn có thể xuất 3; chưa đối soát 1;
  khách chỉ thấy 1 đã xác nhận dùng. Người nghiệm thu: ______; bằng chứng: ______.
- [ ] Hàng trả hỏng/chờ kiểm tra không tăng tồn có thể xuất; release/scrap một phần;
  hai người xử lý cùng lúc không vượt nguồn. Người nghiệm thu: ______; bằng chứng: ______.
- [ ] Trả và xác nhận tranh cùng lượng: một thao tác bị từ chối, không chồng lấn.
  Người nghiệm thu: ______; bằng chứng: ______.
- [ ] Đổi tên danh mục vẫn giữ tên lịch sử; correction truy được giao dịch gốc và
  người sửa. Người nghiệm thu: ______; bằng chứng: ______.
- [ ] Khách/tenant khác bị từ chối; khách đúng chỉ thấy dữ liệu cho phép; bản đảo
  không bị cộng thành lần thay mới dù phân trang. Người nghiệm thu: ______; bằng chứng: ______.
- [ ] Mất mạng sau xuất: proof cho biết đã xuất/chờ đồng bộ; retry cùng key không
  xuất hai lần; complete/cancel tuân thủ reservation. Người nghiệm thu: ______; bằng chứng: ______.
- [ ] Lịch sử khách liên kết kết quả sửa, người thực hiện, thời điểm, phí/bảo hành
  và dự toán đúng. Người nghiệm thu: ______; bằng chứng: ______.
- [ ] LowStock đúng audience, không lặp do replay, trạng thái thiếu hiện tại cập
  nhật sau nhập hàng. Người nghiệm thu: ______; bằng chứng: ______.
- [ ] Dependency lỗi hiển thị UNAVAILABLE/RESTRICTED/NOT_CONFIGURED phù hợp;
  không giả thành lịch sử rỗng. Người nghiệm thu: ______; bằng chứng: ______.

Chỉ chuyển kết luận sang **đạt tích hợp M3** sau khi đóng các mục bắt buộc ở mục 5,
chạy checklist này và ghi nhận quyết định cho các giới hạn ảnh hưởng phạm vi demo.

## 8. Gói bàn giao và lưu ý triển khai

- Code chính: `apps/inventory-service/src/inventory/`, `src/events/`, `src/demo/`,
  Prisma và các suite Inventory; `apps/asset-service/src/dossier/` và test dossier.
- Migration Inventory mới của M3: `0003_inventory_runtime`,
  `0004_inventory_accountability`, `0005_internal_cost_currency`.
- Contract: [Inventory](../api/inventory.yaml),
  [Accountability](../api/inventory-accountability.yaml),
  [Reservations](../api/inventory-reservations.yaml),
  [Equipment dossier](../api/equipment-dossier.yaml).
- Tổng hợp thay đổi trước nghiệm thu:
  [Báo cáo cải tiến](2026-11-02-minh-m3-business-improvements.md).

Client cần cập nhật cùng đợt tích hợp: RETURN bắt buộc condition; ADJUST có
reasonCode; RECEIVE có note hoặc documentReference; unitCost đi với currency;
`quantityConsumed` mang nghĩa xác nhận thực tế, `quantityUsed` vẫn là alias cũ
cho đã xuất. Không đổi nhãn UI mà giữ công thức đã xuất trừ đã trả là đã lắp.

Migrate DB đích đã xác nhận bằng `pnpm --filter inventory-service db:migrate`,
rồi khởi động lại Inventory/Asset và các client phù hợp. Các URL liên service
theo `.env.example`. Bước migrate môi trường phát triển/tích hợp chưa thực hiện
trong nghiệm thu này. ISSUE chỉ có thể demo thật sau NT-01.

Minh tiếp tục chịu trách nhiệm giải đáp contract, sửa lỗi thuộc Inventory/Asset
được phát hiện khi ghép và cùng các owner chạy lại các ca liên service; phần bàn
giao không được hiểu là loại bỏ trách nhiệm phối hợp tích hợp của Minh.
