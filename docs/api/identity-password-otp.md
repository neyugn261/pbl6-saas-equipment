# Identity — đổi mật khẩu và khôi phục bằng OTP email

Trạng thái: contract cho Web/Gateway triển khai; backend đang chờ owner Identity
review trước khi merge hoặc phát hành. OpenAPI chuẩn nằm tại
[identity.yaml](./identity.yaml).

## Base path và xác thực

Qua API Gateway, dùng `/api/identity/auth`. Service trực tiếp dùng `/auth`.

| Endpoint | Authentication | Mục đích |
| --- | --- | --- |
| `POST /change-password` | Bearer access token | Đổi mật khẩu của tài khoản hiện tại |
| `POST /forgot-password` | Public | Yêu cầu hoặc gửi lại OTP qua email |
| `POST /reset-password` | Public | Dùng OTP đặt mật khẩu mới |

Không endpoint nào nhận `userId`, `tenantId` hay `passwordHash` từ client.
Tài khoản tenant gửi `tenantCode` như lúc đăng nhập; Platform Admin bỏ trường
này.

## Đổi mật khẩu

`POST /change-password`

```json
{
  "currentPassword": "CurrentPassword123!",
  "newPassword": "NewPassword123!"
}
```

- Cả hai trường là chuỗi; `currentPassword` dài 1–128 ký tự.
- `newPassword`: 8–128 ký tự, có chữ thường, chữ hoa, chữ số và ký tự đặc biệt;
  giới hạn thêm 72 byte UTF-8 để tránh bcrypt âm thầm cắt mật khẩu.
- Mật khẩu hiện tại phải đúng; mật khẩu mới không được trùng mật khẩu cũ.
- Thành công: `204 No Content`. Client xóa token hiện tại và yêu cầu đăng nhập
  lại.
- Giới hạn: 5 lần / tài khoản / 15 phút và 30 lần / IP / 15 phút.

## Yêu cầu hoặc gửi lại OTP

`POST /forgot-password`

```json
{
  "tenantCode": "ACME-VN",
  "email": "customer@example.com"
}
```

`tenantCode` là tùy chọn và dùng cùng quy tắc chọn phạm vi tài khoản như đăng
nhập. Với lần gửi lại, gọi lại endpoint này; challenge cũ bị vô hiệu hóa.

Thành công luôn trả `202 Accepted` với cùng cấu trúc và thông điệp, kể cả khi
tài khoản không tồn tại, bị vô hiệu hóa hoặc không có mật khẩu cục bộ:

```json
{
  "message": "Nếu tài khoản đủ điều kiện, mã xác nhận sẽ được gửi qua email.",
  "challengeId": "00000000-0000-4000-8000-000000000000"
}
```

`challengeId` là UUID ngẫu nhiên; `202` không xác nhận email đã được nhận hoặc
tài khoản có tồn tại. Giữ `challengeId` để gửi ở bước đặt lại. Giới hạn: 5 lần
/ phạm vi email / 15 phút và 20 lần / IP / 15 phút.

## Xác nhận OTP và đặt mật khẩu mới

`POST /reset-password`

```json
{
  "challengeId": "00000000-0000-4000-8000-000000000000",
  "otp": "123456",
  "newPassword": "NewPassword123!"
}
```

- `challengeId` là UUID; `otp` gồm đúng 6 chữ số.
- Chính sách mật khẩu giống endpoint đổi mật khẩu.
- OTP dùng một lần, mặc định hết hạn sau 5 phút (cấu hình cho phép 60–300 giây),
  tối đa 5 lần nhập sai cho mỗi challenge.
- Thành công: `204 No Content`; client xóa token và điều hướng về đăng nhập,
  không tự đăng nhập bằng mật khẩu mới.
- Hai yêu cầu đồng thời dùng cùng OTP nhiều nhất chỉ có một yêu cầu thành công.
- Giới hạn bổ sung: 10 lần / challenge / 15 phút và 30 lần / IP / 15 phút.

## Lỗi

Body lỗi theo convention Identity:
`{ "code": "...", "message": "...", "details": {} }`.

| HTTP | Mã / trường hợp |
| --- | --- |
| `400` | `VALIDATION_FAILED`, `CURRENT_PASSWORD_INVALID`, `PASSWORD_UNCHANGED`, `PASSWORD_TOO_LONG` hoặc `INVALID_PASSWORD_RESET` |
| `401` | `INVALID_ACCESS_TOKEN` hoặc phiên đổi mật khẩu không còn hợp lệ |
| `429` | `PASSWORD_RATE_LIMITED`; thử lại sau khi hết cửa sổ giới hạn |
| `503` | `PASSWORD_RECOVERY_UNAVAILABLE`; thiếu cấu hình OTP/email hoặc dịch vụ khôi phục chưa sẵn sàng |

Forgot-password không trả lỗi riêng để phân biệt email không tồn tại.

## Gửi email và cấu hình

OTP không xuất hiện trong response hoặc log. Challenge lưu HMAC có khóa; email
được đưa vào delivery queue bền vững dưới dạng ciphertext để worker có thể retry.
Lỗi SMTP giữ delivery ở trạng thái chờ retry; endpoint `202` chỉ xác nhận yêu
cầu đã được tiếp nhận.

Cấu hình cần có khi bật luồng:

- `IDENTITY_OTP_SECRET`: secret ngẫu nhiên riêng, ít nhất 32 ký tự; không dùng
  JWT secret.
- `IDENTITY_OTP_TTL_SECONDS`: tùy chọn, mặc định `300`, giới hạn `60`–`300`.
- `IDENTITY_ACTIVATION_ENCRYPTION_KEY`, `IDENTITY_ACTIVATION_URL_BASE`,
  `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM`.
- SMTP auth tùy chọn: cấu hình cả `SMTP_USER` và `SMTP_PASSWORD`; TLS qua
  `SMTP_SECURE` hoặc `SMTP_REQUIRE_TLS` theo provider. Không tắt kiểm tra
  chứng chỉ.

Mailpit phù hợp cho local/demo. SMTP thật và trusted-proxy/IP configuration cần
được xác nhận ở môi trường deploy; không đưa credentials vào source code.

## Phiên đăng nhập và yêu cầu cho Web/Gateway

Đổi hoặc đặt lại mật khẩu sẽ thu hồi refresh sessions trong Identity. Các API
Identity kiểm tra session từ chối session cũ; theo ADR 0004, service khác xác
minh access JWT offline nên JWT đã cấp có thể còn hiệu lực đến khi hết hạn
(mặc định tối đa 15 phút). Không coi đây là thu hồi access token tức thời toàn
hệ thống.

Web cần giữ `challengeId`, không suy diễn tài khoản từ response, xóa token sau
response `204`, rồi yêu cầu đăng nhập lại. Gateway cần chuyển tiếp ba endpoint
đúng authentication requirement và không làm lộ OTP. Trước production, cấu hình
trusted proxy chính xác để giới hạn theo IP dùng địa chỉ client thực.
