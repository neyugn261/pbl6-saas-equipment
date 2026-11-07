# Bằng chứng Android giai đoạn 4

Thiết bị nghiệm thu: Android API 36 emulator `emulator-5556`. Backend thật từ
`develop@36f0257`, tám service/Gateway, DB test, RabbitMQ và MinIO với private
bucket riêng. App được build từ working tree của giai đoạn 4. Fixture dùng
tenant/tài khoản ngẫu nhiên; không đưa manifest chứa mật khẩu vào artifact.

[results.json](results.json) chứa kết quả, hash APK đã cài, các trường hợp và
tổng request an toàn. Hash này thuộc APK trỏ Gateway fixture. APK được build
lại cho Gateway mặc định sau UAT nên có hash khác.

Sau UAT có chỉnh điều kiện chỉ hiện nút khôi phục khi chọn tệp gặp lỗi, để
không hiện sau hủy thành công. Đã chạy lại 4 widget test, analyze và build;
không thay transport/lưu trữ trong chỉnh sửa giao diện này.

| Ảnh | Bằng chứng |
| --- | --- |
| [camera-process-recovered.png](camera-process-recovered.png) | App được tạo tiến trình mới sau khi camera trả ảnh, có lối mở WO gốc |
| [recovered-preview.png](recovered-preview.png) | Ảnh đã lưu trên máy, chưa gửi; không tự tải khi khôi phục |
| [uncertain-finalize.png](uncertain-finalize.png) | Server đã commit nhưng proxy làm mất phản hồi; app giữ receipt, chưa báo thành công |
| [restart-keeps-receipt.png](restart-keeps-receipt.png) | Restart vẫn giữ tệp và cùng lần tải để đối soát |
| [confirmed-without-duplicate.png](confirmed-without-duplicate.png) | Replay cùng prepare key đọc được attachment cũ; không PUT/finalize lần hai |
| [report-pdf-preview.png](report-pdf-preview.png) | PDF được chọn qua Android document picker cho report completed |
| [report-pdf-confirmed.png](report-pdf-confirmed.png) | API xác nhận PDF dưới đúng report |
| [paused-keeps-receipt.png](paused-keeps-receipt.png) | PUT chậm bị dừng, giữ file/receipt để tiếp tục hoặc hủy |
| [abort-confirmed.png](abort-confirmed.png) | Hủy intent được server xác nhận, không tạo attachment thứ hai |

Tổng cuối: 4 prepare request với 3 khóa khác nhau (ảnh, PDF report, lượt hủy),
3 PUT request, 2 complete và 1 abort. Ảnh chỉ có 1 PUT/1 complete; prepare
thứ hai đối soát cùng khóa sau restart. PUT bị hủy không được coi là attachment
thành công. Không có API bearer trong request đến storage.

Đây là kiểm thử Android emulator, chưa thay thế nghiệm thu thiết bị vật lý/iOS.
Hướng dẫn tái hiện và giới hạn: [mobile-stage-4.md](../../mobile-stage-4.md).
