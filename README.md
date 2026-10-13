# 🛠️ PBL6 - SaaS Equipment Management

Nền tảng SaaS quản lý bảo hành, bảo trì và điều phối kỹ thuật viên hiện trường cho các doanh nghiệp cung cấp thiết bị (multi-tenant). Đồ án chuyên ngành Công nghệ phần mềm (PBL6).

Bối cảnh nghiệp vụ và quy tắc kiến trúc: [AGENTS.md](AGENTS.md). Thiết kế database: [ADR 0001](docs/decisions/0001-database-v3.1.md) và [docs/erd/pbl6-schema-v3.1.sql](docs/erd/pbl6-schema-v3.1.sql).

## Công nghệ

- **Backend:** NestJS 12, TypeScript 6, Prisma 7 (PostgreSQL), microservices
- **Web:** React 19 + Vite (`apps/web`)
- **Mobile:** Flutter (`apps/mobile`)
- **Hạ tầng:** PostgreSQL 17, RabbitMQ, Redis, MinIO (Docker Compose)

## Cấu trúc và trạng thái

```text
apps/
  api-gateway/            :3000  scaffold
  identity-service/       :3001  ✅ auth (login/refresh/logout/me), Prisma, tests
  asset-service/          :3002  scaffold
  maintenance-service/    :3003  scaffold
  workorder-service/      :3004  scaffold
  notification-service/   :3005  scaffold
  web/                           prototype UI, dữ liệu mock
  mobile/                        Flutter template
infrastructure/postgres/  init.sql — chỉ tạo 8 database rỗng
docs/                     SRS, ADR, ERD
```

Organization, Service Request và Inventory service chưa được tạo. Mỗi service đọc port riêng (`<SERVICE>_PORT` trong `.env`) và kiểm tra biến môi trường khi khởi động.

## Cài đặt

Yêu cầu: Node.js ≥ 24.9, pnpm 11 (`corepack enable`), Docker.

```bash
pnpm install
cp .env.example .env
# Sửa .env: đặt JWT_ACCESS_SECRET (vd. `openssl rand -hex 32`) và SEED_DEMO_PASSWORD
pnpm infra:up             # PostgreSQL, RabbitMQ, Redis, MinIO
```

Lần đầu, tạo thêm shadow database (cho drift check) và database cho e2e test:

```bash
docker compose exec postgres psql -U pbl6 -d postgres \
  -c 'CREATE DATABASE identity_shadow_db' -c 'CREATE DATABASE identity_test_db'
```

## Chạy Identity Service

```bash
pnpm identity:migrate     # áp migration (prisma migrate deploy)
pnpm identity:seed:dev    # permission catalog tạm + tenant DEMO + tài khoản demo
pnpm dev:identity         # http://localhost:3001

curl -X POST localhost:3001/auth/login -H 'content-type: application/json' \
  -d '{"tenantCode":"DEMO","email":"dispatcher@demo.local","password":"<SEED_DEMO_PASSWORD>"}'
```

API, cơ chế token và danh sách tài khoản demo: [apps/identity-service/README.md](apps/identity-service/README.md). Quy trình migration: [apps/identity-service/prisma/README.md](apps/identity-service/prisma/README.md).

## Kiểm tra

```bash
pnpm lint         # oxlint (services) + eslint (web), warning = lỗi
pnpm typecheck
pnpm test         # unit test, không cần database
pnpm test:e2e     # identity e2e cần IDENTITY_TEST_DATABASE_URL (tên DB phải chứa "test")
pnpm build
```

CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)) chạy các bước trên, và chạy migration + drift check + seed + e2e của Identity trên PostgreSQL 17.

> Jest chạy với `--experimental-vm-modules` vì NestJS 12 chỉ phát hành dạng ESM; các script `test` đã bao gồm cờ này.

## Web frontend

`apps/web` là prototype dùng mock và `localStorage`, chưa nối API. Xem [docs/FRONTEND_IMPLEMENTATION.md](docs/FRONTEND_IMPLEMENTATION.md).

```bash
pnpm dev:web
```
