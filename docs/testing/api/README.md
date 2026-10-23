# Bộ request M1 (Bruno)

Mở thư mục này trong Bruno, chọn environment `local` hoặc `gateway`. Thay `password` trong biến môi trường của Bruno bằng `SEED_DEMO_PASSWORD` trên máy; không commit mật khẩu. Chạy `Identity/Login` trước, chép `accessToken` từ response vào biến `accessToken`, và thay các ID mẫu bằng ID trả về từ seed/API. `local` trỏ thẳng service; `gateway` dùng đường dẫn `/api/<service-area>`.

Các request mới cho lời mời, membership và QR dùng `userId`, `activationToken`, `qrToken` lấy từ response thật. Đặt `newPassword` là biến bí mật cục bộ của Bruno khi thử kích hoạt; không ghi mật khẩu hoặc token thật vào các file `.bru`. Khi backend không trả `activationToken`, bỏ qua request Activate và kiểm tra web không hiện link kích hoạt. Request Review dùng operation D3 `/review`; chỉ chạy khi contract và backend của Service Request đã cập nhật.

Các request dựa trên `docs/api/{organization,asset,service-request}.yaml` và Identity README. Hai contract Organization/Asset/SR còn ở trạng thái nháp; khi owner chốt contract, cập nhật bộ request theo OpenAPI. Kết quả chạy thực tế ghi tại `../m1-test-cases.md`.
