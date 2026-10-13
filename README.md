# 🛠️ PBL6 - SaaS Equipment Management

Nền tảng SaaS quản lý bảo hành, bảo trì và điều phối kỹ thuật viên hiện trường cho các doanh nghiệp cung cấp thiết bị (multi-tenant). Đồ án chuyên ngành Công nghệ phần mềm (PBL6).

Bối cảnh nghiệp vụ và quy tắc kiến trúc: [AGENTS.md](AGENTS.md). Thiết kế database: [ADR 0001](docs/decisions/0001-database-v3.1.md) và [docs/erd/pbl6-schema-v3.1.sql](docs/erd/pbl6-schema-v3.1.sql).

## Công nghệ

- **Backend:** NestJS 12, TypeScript 6, PostgreSQL, microservices
- **Web:** React 19 + Vite (`apps/web`)
- **Mobile:** Flutter (`apps/mobile`)
- **Hạ tầng:** PostgreSQL 17, RabbitMQ, Redis, MinIO (Docker Compose)

## Cấu trúc và trạng thái

```text
apps/
  api-gateway/            :3000  scaffold
  identity-service/       :3001  scaffold
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
pnpm infra:up             # PostgreSQL, RabbitMQ, Redis, MinIO
pnpm dev:gateway          # hoặc dev:asset, dev:workorder, ...
```

## Kiểm tra

```bash
pnpm lint         # oxlint (services) + eslint (web), warning = lỗi
pnpm typecheck
pnpm test         # unit test, không cần database
pnpm test:e2e
pnpm build
```

CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)) chạy lint, typecheck, test và build cho mọi push/PR.

> Jest chạy với `--experimental-vm-modules` vì NestJS 12 chỉ phát hành dạng ESM; các script `test` đã bao gồm cờ này.

## Web frontend

`apps/web` là prototype dùng mock và `localStorage`, chưa nối API. Xem [docs/FRONTEND_IMPLEMENTATION.md](docs/FRONTEND_IMPLEMENTATION.md).

```bash
pnpm dev:web
```
