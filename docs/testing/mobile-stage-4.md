# Mobile — giai đoạn 4: vòng đời camera và tải tệp

Ngày: 07/11/2026. Nhánh `feature/mobile-m3-stage-0-1`. Trước khi thực hiện,
đã fetch `origin/develop` và fast-forward lên `36f0257` (merge PR #64, gồm
giai đoạn 0–3). Phạm vi: camera/chọn ảnh/PDF, giữ tệp và thông tin đối soát
qua vòng đời Android. Dùng contract K8 hiện có, không đổi backend/schema/RBAC.

## Checklist hoàn thành

| Công việc | Kết quả |
| --- | --- |
| Camera, thư viện, tài liệu | DONE, JPEG/PNG/PDF 1 byte–10 MiB; kiểm tra tên, đuôi và chữ ký nội dung |
| Preview và chủ động gửi | DONE, chọn/khôi phục chỉ lưu nháp; ảnh có preview, PDF hiện tên/kích thước; nút tải riêng |
| Ghi trước khi mở picker | DONE, journal mã hóa ghi Gateway/tenant/user/WO/loại cha/assignment hoặc report ID/khóa thao tác trước Activity ngoài |
| Mất tiến trình khi camera mở | DONE Android, gọi `retrieveLostData()` khi khởi động, đưa ảnh về chủ sở hữu và WO gốc trước khi khôi phục session |
| Chuyển ảnh khỏi cache | DONE, copy vào vùng riêng của app; checkpoint trước/sau ghi, tệp tạm có flush rồi rename |
| Restart/logout | DONE, metadata mã hóa và bytes app-private tách Gateway/tenant/user/WO; không gán cho tài khoản đăng nhập tiếp theo |
| Giữ prepare/finalize key | DONE, giữ file/checksum/khóa cho toàn bộ lần thử lại; lưu uploadId trước PUT |
| Mất phản hồi complete | DONE, giữ receipt; người dùng tiếp tục → prepare replay → attachment ID → đọc metadata đúng cha, không tạo lần tải mới |
| Mất mạng/hết hạn URL | DONE, báo lỗi, giữ receipt; lấy ticket cùng khóa; không lưu URL ký/header hay tự đổi khóa |
| Progress | DONE, truyền xong chưa phải đính kèm thành công; chỉ metadata API xác nhận mới kết thúc |
| Dừng/rời màn hình | DONE, dừng PUT và giữ file/receipt; chờ thao tác đang chạy trước khi rời; đổi tab giữ state |
| Hủy/xóa nháp | DONE, hủy intent có xác nhận; không xóa attachment hoàn tất. Xóa local có cảnh báo riêng khi kết quả chưa rõ |
| Đổi phân công/trạng thái | DONE, đọc lại WO và assignment ID gốc trước PUT/finalize; report kiểm tra report ID và Technician tác giả |
| File mất/hỏng, lỗi disk | DONE, giữ receipt, không thay nội dung hoặc gửi khi chưa lưu; vẫn cho đối soát/hủy |
| Chống gửi trùng | DONE, một lượt chạy cho mỗi WO; cùng khóa dùng chung lượt; receipt cũ không xóa receipt mới |
| WO/report khác cha | DONE, tệp WO trước terminal, report sau completed; tệp WO chưa gửi chặn complete, tệp report không tạo vòng chặn |
| Nháp giai đoạn 1 | DONE, cập nhật section tuần tự, giữ report/checklist draft |
| Storage/backup | DONE Android, không gửi API bearer sang MinIO; secure storage/flush hiện có; app files loại khỏi backup/transfer |

Camera dùng chụp hiện trạng/bằng chứng. Không thêm camera quét QR cho Technician;
thiết bị vẫn lấy theo WO, luồng QR Customer Portal giữ theo thiết kế hiện hành.

## Luồng sử dụng

WO → **Tệp** → **Chụp ảnh / Chọn ảnh / Chọn tệp**, xem lại nháp rồi bấm
**Tải tệp lên**. Khôi phục app không tự gửi POST/PUT. Kết quả chưa rõ dùng
**Kiểm tra và tiếp tục lần tải**, giữ nguyên khóa và nội dung.

**Dừng và giữ tệp** giữ nháp cho lần sau. **Hủy lần tải** xử lý intent trên
server khi có uploadId rồi mới dọn local; nếu attachment đã ghi nhận thì chỉ
xác nhận kết quả, không xóa attachment. **Xóa nháp trên máy** chỉ bỏ local
sau xác nhận, không khẳng định đã hủy phía server. Prepare chưa trả uploadId
thì chưa có PUT/finalize; reservation không rõ ID tự hết hạn theo backend.

Xử lý tệp WO đang chờ trước complete. Sau complete, đính kèm vào **Tệp báo cáo**
theo quyền tác giả report. Backend vẫn thực thi quyền, scope và trạng thái.

## Lưu trữ và đối soát

`upload_picker.dart` sở hữu journal của một lần mở picker toàn app, mã hóa
trong namespace `pbl6_session_v1` với adapter flush hiện có. Khi picker trả
kết quả, ghi đường dẫn nguồn vào journal trước copy: có thể thử lại nếu plugin
đã tiêu thụ lost data nhưng ghi file lỗi. Document picker chưa trả đường dẫn
mà tiến trình bị đóng thì báo gián đoạn để chọn lại; không giả định FilePicker
có khả năng lost-data như image_picker.

`upload_store.dart` lưu bytes trong Application Support, thư mục scope băm
SHA-256, tên file UUID. Bytes thuộc vùng riêng của app, **không mã hóa thêm
bởi Dart**. Metadata/khóa/checksum ở encrypted workspace record; receipt không
chứa token, password, URL ký, header hoặc thời hạn ticket. File thiếu/checksum
sai vẫn giữ receipt. Gỡ app/xóa dữ liệu app làm mất nháp; không cam kết khôi
phục khi thiết bị hỏng.

`attachment_client.dart` checkpoint trước prepare, PUT, finalize và cleanup.
Chỉ phản hồi PUT thành công mới được lưu là `putSucceeded`; chỉ metadata
Gateway mới xác nhận attachment. Lỗi finalize không tự thành công/tạo khóa
mới. Checkpoint attachment đã xác nhận trước xóa bytes để crash giữa cleanup
vẫn đối soát được.

Prepare replay của K8 không gia hạn reservation 300 giây. Nếu PUT chưa được
xác nhận và ticket đã hết hạn, cần chủ động hủy/xử lý lần cũ rồi chọn lại;
app không âm thầm đổi khóa hoặc tạo upload mới. Tệp đã finalize vẫn được đối
soát qua metadata, kể cả WO sau đó đã đổi trạng thái/phân công theo quyền đọc.

Tham chiếu chính thức: [image_picker — Android lost data và cache camera](https://pub.dev/packages/image_picker),
[path_provider — Application Support](https://pub.dev/packages/path_provider).
Pin hiện tại: image_picker 1.2.4, file_picker 13.3.1, path_provider 2.1.6;
path_provider chỉ chuyển từ transitive sang direct, không nâng phiên bản.

## Kiểm tra đã chạy

| Kiểm tra | Kết quả |
| --- | --- |
| Flutter analyze | PASS, không issue |
| Flutter suite đầy đủ | PASS 194 test, 2 suite backend opt-in SKIP |
| Test mới | 26 test: recovery, lỗi I/O, expiry, scope/reassignment, single-flight, pause/abort, picker ownership, preview/complete gate và lỗi Gateway an toàn |
| APK debug | PASS, bản Gateway fixture và bản Gateway mặc định sau UAT |
| Backend thật | PASS fixture 0–3: tám service/Gateway, DB test, broker; thêm private MinIO và proxy mất phản hồi/PUT chậm |
| Android API 36 | PASS camera mở → kill tiến trình nền → trả ảnh → đúng WO/preview, không tự tải |
| Finalize chưa rõ | PASS server commit, proxy trả 503; restart/kiểm tra cùng khóa, một PUT/một complete cho ảnh, một attachment |
| PDF report | PASS Android document picker → report completed; khác cha với WO evidence |
| Dừng/hủy | PASS unit và Android: PUT chậm → dừng giữ receipt → hủy server; không tạo attachment thứ hai |

Bằng chứng: [ảnh, kết quả và hash APK](artifacts/mobile-stage04/README.md).
Hash UAT nhận diện APK trỏ Gateway fixture, khác bản build mặc định sau đó.
Hai suite opt-in không được tính là PASS Flutter; backend thật được kiểm tra
riêng qua fixture/Android nêu trên.

## Chạy lại

Chuẩn bị theo [giai đoạn 3](mobile-stage-3.md#chạy-lại): tám
`*_TEST_DATABASE_URL`, RabbitMQ và MinIO local với credential từ môi trường;
build shared packages, tám service và Gateway trước khi chạy harness.

```bash
node apps/mobile/tool/stage04_fixture.cjs --serve
python3 apps/mobile/tool/stage04_android.py --device emulator-5556 --reset-test-app
```

Mỗi lượt Android cần fixture mới vì có ghi attachment. Harness từ chối runtime
READY còn sống; Android tool từ chối fixture đã tải tệp, chỉ nhận emulator và
cờ cho phép reset app test. Tài khoản ngẫu nhiên chỉ ở
`/tmp/pbl6-mobile-stage04-runtime.json`, quyền `0600`, không upload manifest.
`--reuse-test-apk` chỉ dùng với APK đã build cho đúng Gateway fixture này.

Harness tạo private bucket `pbl6-test-mobile-stage04-<UUID>`, proxy loopback,
queue/exchange test riêng. Không mở public bucket/đổi policy bucket dev.
Test control chỉ nằm trong proxy UAT, không thêm endpoint backend. Ctrl+C đóng
stack/proxy, xóa bucket và queue/exchange riêng; DB test giữ UUID để điều tra.
Kết quả/ảnh ở `/tmp/pbl6-mobile-stage04-android`; không sao chép runtime hoặc URL ký.

Sau UAT:

```bash
cd apps/mobile
flutter analyze --no-pub
flutter test --no-pub --reporter expanded
flutter build apk --debug --no-pub
```

## Chuyển giai đoạn

Hoàn tất phạm vi giai đoạn 4 trên Android, đủ chuyển sang giai đoạn 5.
Chưa nghiệm thu điện thoại vật lý/iOS. Lỗi đồng bộ SR/WO cũ (giai đoạn 0–1)
và giữ bộ lọc Lịch sử khi pull-to-refresh (giai đoạn 3) còn là đầu việc riêng.
