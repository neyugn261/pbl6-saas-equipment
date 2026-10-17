## Mục đích

<!-- Làm gì và vì sao. Liên kết issue / task (vd. A2, B3). -->

## Thay đổi

-

## Cách chạy thử

```bash
# lệnh để reviewer tự kiểm tra
```

## Checklist

- [ ] `pnpm lint && pnpm typecheck && pnpm test` pass trên máy
- [ ] Test mới cho logic / lỗi / tenant isolation (ID tenant khác → 404)
- [ ] Endpoint mới có `@RequirePermissions` và khớp OpenAPI trong `docs/api/`
- [ ] Không sửa migration đã merge; migration mới đã qua `pnpm db:check-drift`
- [ ] Biến môi trường mới có trong `.env.example`
- [ ] Không có secret, token hoặc mật khẩu thật trong code, log, test
- [ ] Đổi contract / event: owner phía consumer đã được tag review
