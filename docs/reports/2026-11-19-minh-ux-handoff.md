# Bàn giao phần UX của Minh — 19/11/2026

Baseline: `develop@f0751a4`. Nhánh local: `codex/minh-ux-20261119`.
Nguồn: checklist phần Minh và file phân công UX người dùng gửi. Đây là thay đổi working tree, chưa commit/PR/merge.

**Cập nhật nghiệm thu local buổi tối:** đã bổ sung bộ dữ liệu DEMO UX riêng cho HCM/Đà Nẵng qua API thật, kiểm tra cả đường proxy Web và quyền chi nhánh. Xem mục 7. Kết quả 384 ca ở mục 5 là lượt kiểm tra code trước đó; không dùng để khẳng định đã nghiệm thu trình duyệt.

## 1. Kết quả thực hiện

| Task | Đã có trong lượt này | Giới hạn cần hiểu đúng |
|---|---|---|
| MINH-01 | Preview và tạo 1–50 thiết bị/hồ sơ trong một transaction Asset; CSV/JSON, kiểm trùng model+serial/asset code, kiểm tham chiếu, kết quả theo lô và retry cùng key; Web có wizard, template, chọn khách/site/model/vị trí mặc định và phục hồi sau mất phản hồi/đổi trang | Import tạo DRAFT. Chính sách, ngày thực tế và xác nhận khách tiếp tục qua hồ sơ từng máy. Chưa có XLSX trực tiếp hoặc một lần xác nhận tất cả chính sách của lô. |
| MINH-02 | Giá vốn/niêm yết nullable Decimal(14,2), VND; cập nhật có version/khóa và audit; ẩn giá vốn ở API gồm cả Part lồng trong tồn kho/audit; Web danh sách và form giá ở chi tiết | Nhân viên kho có inventory:manage mới sửa và xem giá vốn. Giá chưa cấu hình khác 0. Không sửa giá trong báo giá đã duyệt; chưa có kế toán hay quy đổi tiền tệ. |
| MINH-03 | Catalogue trả giá có search/pagination; contract snapshot đã duyệt; Inventory consumer/inbox và xử lý duplicate/stale/conflict; API và mục WO đối chiếu đề xuất với phiếu còn chờ, ISSUE pending, xuất/trả/dùng/chưa đối soát | **Chưa có producer thật từ Service Request.** Huy cần partId/snapshot/version/outbox; Nguyên nối picker khi contract Request có. Không tự tạo PartRequest, giữ tồn hay xuất hàng từ việc khách duyệt báo giá. |
| MINH-04 | QR public phải bật riêng; chỉ tên/model và trạng thái bảo hành; form HMAC 15 phút, single-form idempotency, rate limit; hàng chờ theo chi nhánh, quyết định kèm ghi chú/actor/time; tắt khi đổi/thu hồi mã, máy chuyển vị trí hoặc nhận event khóa tenant | Báo lỗi là thông tin chờ xác minh. Chưa tự tạo SR/WO; chưa upload media công khai, chưa có notification mới. Cần chính sách retention và hạ tầng limiter/log trước triển khai Internet. |

Trang Web được bổ sung ở phạm vi cần để demo các API này. Không sửa source Flutter, Work Order hoặc Service Request trong lượt này. Contract và file dùng chung cần owner/consumer review theo CONTRIBUTING trước merge.

## 2. Các page đã sửa hoặc bổ sung

Mặc định Web chạy tại `http://localhost:5173`. `:id`/`:token` bên dưới là giá trị hồ sơ thật, không nhập nguyên ký hiệu vào URL.

| URL | Mới/sửa | Tài khoản | Kiểm tra gì |
|---|---|---|---|
| `/app/equipment-registrations` | Sửa | Service Manager / Tenant Admin | Có nút **Nhập lô CSV** bên cạnh ghi nhận từng máy. |
| `/app/bulk-handovers` | Mới | Service Manager / Tenant Admin | Chọn khách/site/model/vị trí, tải mẫu CSV, kiểm tra dòng, tạo hồ sơ, mở từng máy. Thử serial trùng và mất phản hồi. |
| `/app/inventory/parts` | Sửa | Inventory Staff; SM chỉ đọc | Form thêm có giá vốn/niêm yết; bảng hiển thị giá theo quyền; để trống/0 được phân biệt. |
| `/app/inventory/parts/:id` | Sửa | Inventory Staff để sửa; SM để tra cứu | **Đơn giá tham khảo**, cập nhật giá, lỗi version khi hai tab sửa; SM không có giá vốn hoặc nút sửa. |
| `/app/equipment/:id` | Sửa | Service Manager / Tenant Admin | Khu QR có link cấu hình công khai; lịch sử có nhãn bật/tắt công khai. |
| `/app/equipment/:id/public-qr` | Mới | Service Manager đúng chi nhánh / Tenant Admin | Chủ động bật/tắt công khai. Cần mã QR hiệu lực và site đã phân bổ chi nhánh; có link mở trang công khai. |
| `/portal/qr/:token` | Mới cho public projection | Không cần đăng nhập | Tên/model, trạng thái bảo hành, form liên hệ/báo lỗi, mã tham chiếu; không lộ serial/khách/site/lịch sử. Mã chưa bật public có thông báo và đường đăng nhập. |
| `/portal/qr/:token/secure` | Điều chỉnh đường dẫn của trang tra cứu cũ | Tài khoản có quyền thiết bị | Hồ sơ đầy đủ vẫn kiểm tra đăng nhập/tenant/customer; không dùng public capability để vượt quyền. |
| `/app/public-qr-inquiries` | Mới + menu Service Manager | Service Manager | Lọc/phân trang báo lỗi, liên hệ xác minh, ghi kết quả hoặc từ chối. Đánh dấu đã liên hệ chưa tạo yêu cầu dịch vụ. |
| `/app/work-orders/:id` | Sửa | Service Manager | Mục **Phụ tùng theo báo giá đã duyệt**, giá snapshot và đối chiếu lượng. Khi chưa có producer, phải hiển thị chưa có dữ liệu đồng bộ; không tự dùng dữ liệu mẫu. |

Các trang `/app/equipment-registrations/:id`, báo giá và các phiếu xin/cấp/trả hiện có được tái sử dụng; không gọi chúng là chức năng mới của đợt này.

## 3. Chuẩn bị để bạn tự demo

Tại root repository, Terminal 1:

```powershell
pnpm infra:up
pnpm dev:backend
```

`dev:backend` hiện đã build packages và áp migration trước khi chạy các service. Chờ backend sẵn sàng; không dùng db push, reset hoặc sửa migration cũ.

Terminal 2:

```powershell
pnpm dev:web
```

Nếu đã mở bản Web cũ, tải lại trang. Dữ liệu demo/tài khoản dùng cấu hình sẵn của máy; không ghi mật khẩu vào báo cáo. Nếu là máy mới, làm theo README/demo-data; không cần reset dữ liệu máy đang dùng chỉ để thử các trang này.

### Demo A — Giá phụ tùng

1. Đăng nhập Inventory Staff, mở danh mục, tạo phụ tùng với giá trống; phải thấy “Chưa cấu hình”.
2. Mở chi tiết, đặt niêm yết 0 và giá vốn khác 0; tải lại thấy 0 được lưu đúng.
3. Mở hai tab cùng phụ tùng, lưu tab thứ nhất; tab thứ hai phải yêu cầu tải lại khi version cũ.
4. Đăng nhập Service Manager bằng phiên khác: thấy niêm yết, không thấy giá vốn và không có nút sửa giá.

### Demo B — Bàn giao lô

1. Từ danh sách bàn giao bấm Nhập lô CSV; chọn khách, site, model và vị trí nếu cần.
2. Tải mẫu, thay assetCode/serialNumber bằng mã chưa dùng; xuất CSV UTF-8 nếu soạn bằng Excel. Ngày thực tế có thể để trống và bổ sung sau.
3. Kiểm tra danh sách rồi tạo. Kết quả phải là các hồ sơ nháp, không báo đã kích hoạt bảo hành.
4. Vào mỗi hồ sơ để preview chính sách/ngày và submit theo luồng STORE/CUSTOMER_SITE hiện hành.
5. Thử một serial có sẵn hoặc dòng sai: không được sinh nửa lô. Nếu response bị mất, giữ mã lô và dùng kiểm tra/gửi lại đúng lô; không nhập lại bằng mã lô khác.

### Demo C — QR công khai đến hàng chờ

1. Chọn thiết bị đúng phạm vi, có QR đang hoạt động và site có chi nhánh phục vụ.
2. Mở cấu hình public từ hồ sơ thiết bị, bấm Bật. Mở link công khai bằng cửa sổ riêng không đăng nhập.
3. Kiểm tra chỉ có tên/model và tình trạng bảo hành. Gửi tên, điện thoại, mô tả và đồng ý cung cấp thông tin.
4. Phải nhận mã tham chiếu và trạng thái chờ xác minh. Khi gửi lại cùng form/nội dung, không có thêm bản ghi.
5. Service Manager đúng chi nhánh mở hàng chờ, đối chiếu máy, liên hệ và ghi kết quả. Nhân viên chi nhánh khác không thấy báo lỗi này.
6. Thử tắt public/thu hồi QR/chuyển vị trí máy rồi mở lại link: phải không còn tra cứu public. Khi đổi QR hoặc chuyển máy, cần kiểm tra và bật lại.

### Demo D — Phụ tùng theo báo giá

Hiện có thể nghiệm thu API/consumer bằng integration test PostgreSQL và fixture đúng contract. Trên Web thật, khi Huy chưa phát snapshot, mục WO phải hiển thị NO_SNAPSHOT/chưa đồng bộ. Không giả lập snapshot thành dữ liệu khách đã duyệt để tuyên bố toàn luồng PASS.

Sau khi Huy nối producer, nhóm chạy: chọn partId/giá tham khảo → gửi báo giá → khách duyệt → WO hiển thị snapshot → lập PartRequest theo quyền/trạng thái WO → kho fulfill qua reservation → báo cáo → confirm-use/trả → đối chiếu. Sửa giá danh mục phải không thay giá đã duyệt. Vật tư không có trong danh sách catalogue đã duyệt phải xuất hiện trong đối chiếu để nhân viên làm rõ phạm vi.

## 4. API và migration

- [API supplement](../api/minh-ux.yaml), đã nối từ asset.yaml/inventory.yaml.
- [ADR 0024](../decisions/0024-minh-ux-bulk-pricing-public-qr.md).
- Asset migration: `0011_bulk_and_public_intake`.
- Inventory migrations: `0007_part_pricing`, `0008_estimate_parts`, `0009_estimate_parts_inbox`.
- ERD SQL có phần bổ sung tương ứng. Không thay checksum migration đã có trên develop.

## 5. Kiểm tra và giới hạn bằng chứng

Đã đạt 384 ca trong phạm vi đã chạy: Asset unit 76 + Asset DB 52, Inventory unit 25 + Inventory DB 67, Web 133 và event-contracts 31. Build/lint/typecheck của phần ảnh hưởng đạt; migration chạy mới/lặp lại và drift Asset/Inventory đạt. Đây không phải toàn bộ gate CI của repository.

Kết quả cuối được ghi ở [evidence](2026-11-19-minh-ux-evidence.txt). Kiểm tra HTTP/DB dùng PostgreSQL tạm riêng; Organization và WO reference là fixture được công bố trong test. Consumer được gọi bằng envelope đúng contract; điều này chưa chứng minh producer Service Request hoặc toàn chuỗi RabbitMQ mới đã nối thật. Kiểm tra component Web dùng harness thực thi handler/effect; không thay cho nghiệm thu bố cục, bàn phím và trình duyệt của bạn.

Không áp migration mới lên DB demo, không reset/seed dữ liệu demo trong lượt kiểm tra. Lệnh dev:backend khi bạn chạy sẽ thực hiện migration local theo cấu hình của máy. Không khẳng định stack production hoặc CI đã được nghiệm thu từ kết quả local.

## 6. Việc cần phối hợp tiếp

| Người/phạm vi | Việc tiếp theo và điều kiện nghiệm thu |
|---|---|
| Huy — Request | Lưu partId cho dòng PART và snapshot giá/đơn vị; sequence sourceVersion theo Request; enqueue CostEstimatePartsSnapshot trong transaction approval/withdrawal/replacement. Chốt nhiều WO, khảo sát/sửa, phát sinh ngoài dự toán. |
| Nguyên — Estimate UI | Sau contract Request: chọn catalogue qua API Inventory, điền standardPrice nhưng cho sửa theo quyền; lưu partId, hiển thị nguồn và giá cuối cùng. Không gửi partId vào DTO cũ đang từ chối field lạ. |
| Huy — QR inquiry | Chốt xác minh/conversion có source reference và chống trùng, media public intent và notification audience; đầu mối không được tự động trở thành yêu cầu chính thức chỉ vì có số điện thoại. |
| Nguyên — vận hành Internet | TLS, proxy IP đáng tin, limiter edge/shared, tắt/che QR token trong access log; kiểm tra nhiều instance. |
| Nhóm/chủ dữ liệu | Chốt thời hạn lưu/xóa thông tin người gửi và quy trình xử lý báo lỗi tồn lâu; bản này chưa tự xóa dữ liệu liên hệ. |
| Khương | Nghiệm thu WO reference/current assignment và ISSUE/reservation với luồng báo giá mới. Không yêu cầu đổi reservation hoặc sửa Flutter ở đợt này. |
| Owner/consumer | Review ADR, schema, API/event; tách PR contract/code theo CONTRIBUTING trước khi merge. |
| Người dùng/nhóm UAT | Demo các page ở mục 2, kiểm tra kích thước màn hình, lỗi mạng, quyền và nội dung chữ; ghi bằng chứng đúng commit/build. |

Nhập XLSX trực tiếp và bulk policy preview/confirmation là mở rộng tùy chọn sau MVP CSV, cần giữ được snapshot từng máy và không giả lập transaction xuyên service.

## 7. Khắc phục thiếu dữ liệu và kiểm tra đường truy cập local

Nguyên nhân xác nhận trực tiếp: tài khoản/nhánh đã có nhưng chưa có hồ sơ đăng ký, phụ tùng/kho, báo lỗi QR và WO theo chi nhánh. WO cũ có branchId null nên Service Manager không thấy trong danh sách theo chi nhánh. Không sửa quyền để mở hồ sơ cũ ngoài phạm vi.

Thêm tiện ích `node scripts/demo/minh-ux.cjs`, dùng stack đang chạy tại localhost và tài khoản demo trong `.env`. Tiện ích tạo dữ liệu mới có nhãn DEMO UX, dùng API của từng service qua Web proxy, không reset database, không sửa giá/ngày/trạng thái của hồ sơ người dùng đã thao tác. Đăng nhập seed dùng trực tiếp Identity local giống các utility seed hiện có, tránh tiêu thụ hạn mức đăng nhập Web của người demo.

Đã tạo và đọc lại:

- Hai địa điểm/vị trí demo mới được phân bổ đúng chi nhánh, dùng hai khách hàng hiện có; không đổi phân bổ địa điểm cũ.
- Bốn hồ sơ bàn giao DRAFT qua hai lô, hai máy riêng cho QR/khảo sát.
- Ba phụ tùng (hai có giá, một chưa cấu hình), hai kho và sáu dòng tồn. Nhập tồn có Idempotency-Key cố định; chạy lại không cộng tồn lần nữa.
- Hai QR public, hai báo lỗi chờ xác minh và hai Request/WO khảo sát. Không tạo SR/WO từ báo lỗi vãng lai.
- Dossier, chi tiết đăng ký, private QR của đúng khách hàng, giá vốn theo quyền, QR/WO bị chặn ở chi nhánh khác. Preview CSV hợp lệ và CSV trùng serial đều được kiểm tra.
- Hai WO trả `NO_SNAPSHOT` cho phụ tùng báo giá, đúng giới hạn producer chưa triển khai; không dựng dữ liệu phê duyệt giả.

Chạy `node scripts/demo/minh-ux.cjs --verify` để kiểm tra lại dữ liệu hiện có. Lượt cuối kiểm tra 64 phản hồi API qua luồng này, có đăng nhập/logout utility qua Identity; seed chạy lại đạt 72 phản hồi và không thêm lô/tồn. Artifact local chứa URL QR thật và ID hồ sơ nằm ở `tmp/minh-ux-demo-links.md`, `tmp/minh-ux-demo-evidence.json`, cùng CSV `tmp/minh-ux-hcm.csv` và `tmp/minh-ux-dn.csv`; không đưa token QR vào Git.

Web bổ sung menu Nhập lô thiết bị và thông báo tiếng Việt cho lỗi 429 để người dùng hiểu thời gian chờ. Những lần kiểm tra nhiều role trước đó đã chạm limiter Gateway; việc chuẩn bị dữ liệu không thay cấu hình hạn mức bảo vệ. Test Web 134/134, build và lint Web đạt. Source mobile giữ nguyên.

Công cụ trình duyệt báo `Local browser use is disabled in Work settings`, vì vậy lượt này chưa có bằng chứng kiểm tra trực quan bằng browser. Phản hồi HTTP 200 của Vite chỉ chứng minh tải được trang/module, không chứng minh giao diện render hoàn chỉnh. Nhóm vẫn cần UAT trên trình duyệt thật theo các link local vừa xuất.

Seed toàn hệ thống (`demo:seed`) vẫn có lỗi trùng primary contact trên dữ liệu cũ; tiện ích chuyên biệt này không chạy lại hoặc che lỗi đó. Chưa bổ sung toàn bộ kịch bản bảo trì, hồ sơ KTV và dữ liệu vận hành cho các role ngoài phạm vi trang UX của Minh.

## 8. Sửa lỗi nhập lô sau khi chọn khách hàng

Ảnh người dùng cung cấp cho thấy route boundary sau khi chọn khách hàng. Nguyên nhân trong code: `GET /customers/:id/sites` trả `Site[]`, còn DirectoryPicker chỉ đọc `Page.items`, dẫn đến lỗi render khi response về. Đây là lỗi UI thực tế mà kiểm tra API và build trước đó chưa phát hiện.

DirectoryPicker bổ sung chế độ `responseShape="list"`: giữ nguyên URL của API không phân trang, lọc/tìm/phân trang tại client, đọc mảng đúng contract và hiển thị lỗi thay vì throw nếu response sai shape. Picker địa điểm trong nhập lô dùng chế độ này, remount khi đổi khách để bỏ tìm kiếm/trang cũ. Các picker khách hàng/model vẫn dùng paging phía server.

Đổi nhãn trang nhập lô, danh sách đăng ký và wizard để phân biệt hồ sơ nháp với xác nhận bàn giao. Thêm giải thích trên trang: nhập lô tạo nhiều đăng ký, không tự xác nhận khách đã nhận máy; tại cơ sở cần khách xác nhận, tại cửa hàng nhân viên hoàn tất theo ngày thực tế. Không đổi state machine, API hoặc quy tắc ngày bảo hành.

Regression test thực thi picker với mảng địa điểm, loại địa điểm inactive, tìm kiếm local, chọn địa điểm và response sai định dạng; test bulk kiểm tra đúng path và responseShape. Kết quả mới: Web 135/135 test. Giới hạn browser ở mục 7 vẫn áp dụng.
