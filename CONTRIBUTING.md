# Quy trình làm việc nhóm

Áp dụng từ M0 cho cả 4 thành viên. Bối cảnh nghiệp vụ và kiến trúc: [AGENTS.md](AGENTS.md).

## 1. Ownership

Mỗi thư mục có đúng một owner trong mỗi milestone; người khác chỉ sửa qua PR được owner duyệt. Kế hoạch chi tiết: doc "PBL6 Audit & Sprint Plan".

| Owner | M1 | M2 | M3 |
|---|---|---|---|
| Member A | `apps/organization-service/**`, `docs/api/organization.yaml` | `apps/workorder-service/**`, `docs/api/workorder.yaml` | `apps/workorder-service/**` (đính kèm, báo cáo) |
| Member B | `apps/asset-service/**`, `docs/api/asset.yaml` | `apps/maintenance-service/**`, `docs/api/maintenance.yaml`; consumer lịch sử trong `apps/asset-service` | `apps/inventory-service/**`, `docs/api/inventory.yaml` |
| Member C | `apps/service-request-service/**`, `docs/api/service-request.yaml` | `apps/service-request-service/**` (Cost Estimate, consumer WO) | `apps/notification-service/**`, `docs/api/notification.yaml` |
| Member D | `apps/identity-service/**`, `apps/api-gateway/**` | `apps/mobile/**` | `infrastructure/**`, Dockerfile, compose staging |
| Member E | `apps/web/**`, `docs/testing/**` | `apps/web/**`, `docs/testing/**` | `apps/web/**`, `docs/testing/**`, `docs/user-guide/**` |

File dùng chung (`packages/**`, `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `docker-compose.yml`, `.env.example`, `.github/**`, `docs/architecture/**`, `docs/api/conventions.md`, `docs/erd/**`, `docs/decisions/**`) do Member D giữ; người khác cần thay đổi thì mở PR nhỏ chỉ chứa thay đổi đó.

Ghi tên GitHub của từng người vào [.github/CODEOWNERS](.github/CODEOWNERS) để GitHub tự gán reviewer.

## 2. Branch và PR

- Nhánh: `feature/<member>-<scope>` hoặc `fix/<scope>`, tách từ `develop`. Không commit thẳng vào `develop` hay `main`.
- Mỗi PR một mục đích, nhỏ, rebase trên `develop` mới nhất trước khi xin review.
- Cần **1 người duyệt** ngoài tác giả. PR đụng auth, tenant isolation, file trung tâm hoặc schema cần Member D duyệt.
- PR mô tả: làm gì, cách chạy thử, test đã thêm (mẫu: [.github/pull_request_template.md](.github/pull_request_template.md)).
- Không merge chỉ vì CI xanh nếu luồng nghiệp vụ chưa đúng.
- `develop` → `main` vào cuối mỗi milestone, sau khi smoke test xanh.

Cài đặt trên GitHub (người có quyền admin repo làm một lần): Settings → Branches → bảo vệ `develop` và `main`: *Require a pull request*, *Require approvals (1)*, *Require status checks* (2 job của CI), *Require review from Code Owners*.

## 3. Contract trước code

- OpenAPI (`docs/api/*.yaml`) và event (`packages/event-contracts/src/catalog.ts` + [docs/architecture/events.md](docs/architecture/events.md)) là PR riêng, cần owner + ít nhất 1 consumer duyệt.
- Đổi contract đã merge = PR mới theo cùng quy tắc. Event không tương thích = version mới, không sửa v1.
- Trong lúc service phụ thuộc chưa xong: dùng client giả (interface + fake) dựa trên contract; không chờ.

## 4. File trung tâm và dependency

- Chỉ Member D sửa `package.json` root, `pnpm-workspace.yaml`, `docker-compose.yml`, `.github/**`, `packages/**`. Người khác cần thì mở PR nhỏ chỉ chứa thay đổi đó, hoặc nhờ D.
- Thêm dependency cho service của mình: PR riêng, chỉ `package.json` của service + `pnpm-lock.yaml`.
- Conflict `pnpm-lock.yaml`: rebase, lấy bản của `develop`, chạy `pnpm install`, commit lại. Không sửa lockfile bằng tay.
- Web: chỉ Member E sửa `apps/web/**`; owner backend gửi yêu cầu qua issue hoặc review PR web.

## 5. Database

- Owner service là người duy nhất tạo migration cho DB của mình.
- **Không bao giờ sửa migration đã merge** (kể cả comment — Prisma kiểm checksum). Mọi thay đổi = migration mới (`pnpm db:migrate:dev --create-only --name <change>`), đọc SQL sinh ra, bỏ mọi `DROP` của object raw-SQL, rồi `pnpm db:check-drift`.
- Thay đổi lệch ERD v3.1 cần ADR mới trong `docs/decisions/` và cập nhật `docs/erd/pbl6-schema-v3.1.sql` (ghi chú) trong cùng PR.
- Không dùng `prisma db push`. E2E chỉ chạy trên DB có tên chứa `test` (`requireTestDatabaseUrl`).
- Seed dev dùng id cố định trong [docs/api/fixtures.md](docs/api/fixtures.md) và phải idempotent.

## 6. CI bắt buộc

`pnpm lint`, `pnpm typecheck`, `pnpm test` (gồm test các package và test RabbitMQ thật), `pnpm build`, migration ×2 + drift check 8 DB, seed Identity ×2, e2e Identity và e2e bootstrap của các service. Smoke test vertical slice được thêm vào cuối M1.

## 7. Definition of Done

Backend:

- [ ] Build, typecheck, lint pass.
- [ ] DTO có validation; field lạ bị từ chối; `tenantId`/`customerId` chỉ lấy từ token (`dataScope`).
- [ ] Mọi endpoint có `@RequirePermissions` (hoặc ghi rõ lý do); `/internal/*` không public.
- [ ] E2E: ID của tenant khác → 404; endpoint mở cho CUSTOMER có test customer khác → 404.
- [ ] Unit test cho logic nghiệp vụ và các lỗi; integration test cho ràng buộc DB quan trọng.
- [ ] OpenAPI khớp code; biến môi trường mới có trong `.env.example` và được validate.
- [ ] Migration mới không xoá dữ liệu, drift check pass; seed chạy 2 lần không lỗi.
- [ ] README service cập nhật (cách chạy, test, API).
- [ ] Chạy được với ít nhất một dependency thật, hoặc có contract test nếu dependency chưa merge.

Web/mobile: build + lint pass, gọi API thật qua gateway, có trạng thái loading/empty/error, không dựa vào việc ẩn nút để bảo mật.

Tài liệu/ADR: 2 người review, được liên kết từ README.
