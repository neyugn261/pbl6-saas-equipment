# Android UAT — mobile giai đoạn 3, 07/11/2026

Android API 36, emulator dùng riêng, nối Gateway/Identity/Inventory/Work Order
và các database test thật. Cấp/trả, report, xác nhận dùng và đính chính được
tạo qua API thật; chỉ snapshot metadata của một dòng test được đặt null để
mô phỏng lịch sử cũ thiếu dữ liệu.

- [Đã cấp, đã trả, đã xác nhận dùng và chưa đối soát](issued-returned.png)
- [Trả tốt và hư hỏng](return-history.png)
- [Thông tin lịch sử chưa đầy đủ](legacy-metadata.png)
- [Số lượng sau report và xác nhận sử dụng](confirmed-quantities.png)
- [Bản ghi gốc và đính chính xác nhận](confirmation-history.png)
- [Trả chờ kiểm tra sau khi hủy WO](cancelled-return.png)
- [WO chưa được cấp phụ tùng](empty-parts.png)
- [Kết quả và hash APK UAT](results.json)

Không chứa password/token/runtime manifest. Hash thuộc APK trỏ cổng Gateway
test; bản debug bàn giao được build lại với Gateway mặc định sau nghiệm thu.
Phạm vi, ma trận kiểm tra và cách tái hiện: [giai đoạn 3](../../mobile-stage-3.md).
