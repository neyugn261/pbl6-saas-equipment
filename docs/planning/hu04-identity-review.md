# HU-04 — changeset Identity độc lập

**PENDING_OWNER_APPROVAL — Nguyên review trước merge/phát hành.**

Phạm vi changeset: `apps/identity-service/**`, `docs/api/identity.yaml`,
`docs/erd/hu04-password-recovery.md`, file này. HU-01/HU-02 và báo cáo nghiệm thu
tổng hợp nằm ngoài changeset Identity. Không commit/push/merge trong phiên triển khai.

Patch độc lập: [hu04-identity.patch](../changesets/hu04-identity.patch), tái tạo bằng
`node scripts/export-hu04-changeset.cjs`. Script chỉ đọc git diff và file untracked
trong scope trên; kiểm tra reverse-apply bằng `--check`, không sửa index/working tree.
Không apply patch lại lên working tree hiện tại vì thay đổi đã ở đây.

## Cấu hình và triển khai

1. Review [schema delta](../erd/hu04-password-recovery.md) và [OpenAPI](../api/identity.yaml).
2. Chạy migration Identity trên DB test riêng, migration lần hai và drift trước release.
3. Cấu hình `IDENTITY_OTP_SECRET` ngẫu nhiên ≥32 ký tự, riêng với JWT/encryption key.
   `IDENTITY_OTP_TTL_SECONDS` mặc định 300, cho phép 60–300. Không cấu hình key thì
   cả ba endpoint trả 503; không có fallback secret.
4. Tái sử dụng `IDENTITY_ACTIVATION_ENCRYPTION_KEY` (64 hex),
   `IDENTITY_ACTIVATION_URL_BASE`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM` theo ADR 0017.
   SMTP có thể thêm `SMTP_USER` + `SMTP_PASSWORD`, `SMTP_SECURE=true` cho implicit TLS
   hoặc `SMTP_REQUIRE_TLS=true` cho STARTTLS. Không tắt xác minh chứng chỉ.
   Local Mailpit không cần authentication/TLS. SMTP ngoài máy cần Nguyên xác nhận
   cấu hình TLS, sender và provider. Không ghi credentials vào source.
5. Worker có tối đa 5 lần thử cho OTP, dừng khi hết hạn/đã dùng, xóa ciphertext.
   SMTP at-least-once: crash sau send có thể gửi lại cùng mã, không tạo mã mới.
6. JWT cũ: `/auth/me` và các endpoint đổi mật khẩu kiểm tra phiên trực tiếp;
   refresh bị thu hồi. Service khác vẫn chấp nhận access JWT đến expiry theo ADR 0004
   (mặc định 900 giây). Không tuyên bố logout tức thì trên toàn hệ thống.

## Nguyên: Web/Gateway

- Endpoint, DTO, status và budgets: OpenAPI. Password mới có policy activation,
  thêm giới hạn 72 byte UTF-8 do bcrypt; UI nhập lại để xác nhận, chỉ gửi `newPassword`.
- Forgot/resend gửi email và `tenantCode` như login; lưu `challengeId` mới, thay mã cũ.
  Không suy diễn account tồn tại từ 202. Không tự đăng nhập sau reset.
- 204 change/reset: xóa token phía client, chuyển về login. 400 hiện thông báo phù hợp,
  429 yêu cầu thử lại sau cửa sổ 15 phút, 503 báo tạm chưa khả dụng.
- Giữ route Identity hiện có; xác minh public route recovery qua Gateway thật.
  `request.ip` hiện dùng peer IP của Express; không tin X-Forwarded-For tùy ý.
  Cần owner cấu hình trusted proxy cụ thể trước production để IP budgets hoạt động
  theo client thật; nếu chưa cấu hình, các client qua Gateway dùng chung budget IP.
- Root `.env.example`, Gateway/Web, CI/Compose chưa sửa vì thuộc owner khác.
  Các biến ở trên là phần cần owner đưa vào cấu hình triển khai.

## Nghiệm thu

Unit tests kiểm tra hash/encryption, response chung, rate limit, hết hạn, replay guard.
`test/password-recovery.e2e-spec.ts` dùng PostgreSQL thật: API boundary, đổi mật khẩu,
revocation, concurrent redemption, resend, năm lần sai, expiry, disabled account.
Suite này không kiểm SMTP; cần nghiệm thu riêng Mailpit bằng email thật và Gateway.
Các giá trị budget, TTL, giới hạn thử và hành vi JWT cần owner duyệt trước release.
