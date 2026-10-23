# 🛠️ PBL6 - SaaS Equipment Management

Nền tảng SaaS quản lý bảo hành, bảo trì và điều phối kỹ thuật viên hiện trường cho các doanh nghiệp cung cấp thiết bị (multi-tenant). Đồ án chuyên ngành Công nghệ phần mềm (PBL6).

- Bối cảnh nghiệp vụ và quy tắc kiến trúc: [AGENTS.md](AGENTS.md)
- Thiết kế database: [ADR 0001](docs/decisions/0001-database-v3.1.md), [docs/erd/pbl6-schema-v3.1.sql](docs/erd/pbl6-schema-v3.1.sql)

## Mục lục

1. [Công nghệ và trạng thái](#1-công-nghệ-và-trạng-thái)
2. [Yêu cầu hệ thống](#2-yêu-cầu-hệ-thống)
3. [Cài công cụ](#3-cài-công-cụ) — [Ubuntu](#31-ubuntu-2204--2404) · [Windows](#32-windows-1011)
4. [Cài đặt dự án](#4-cài-đặt-dự-án)
5. [Chạy Identity Service](#5-chạy-identity-service)
6. [Chạy các thành phần khác](#6-chạy-các-thành-phần-khác)
7. [Kiểm tra (lint, test, build)](#7-kiểm-tra-lint-test-build)
8. [Xử lý sự cố](#8-xử-lý-sự-cố)
9. [Tài liệu liên quan](#9-tài-liệu-liên-quan)

## 1. Công nghệ và trạng thái

| Thành phần | Công nghệ |
|---|---|
| Backend | NestJS 12, TypeScript 6, Prisma 7, microservices |
| Web | React 19 + Vite |
| Mobile | Flutter |
| Hạ tầng | PostgreSQL 17, RabbitMQ, Redis, MinIO (Docker Compose) |

```text
apps/
  api-gateway/              :3000  scaffold
  identity-service/         :3001  ✅ auth (login/refresh/logout/me), claim customer_id, consumer tenant/membership events
  asset-service/            :3002  ✅ nối packages/ (health, auth guard) + schema asset_db; chưa có API nghiệp vụ
  maintenance-service/      :3003  scaffold + schema maintenance_db
  workorder-service/        :3004  scaffold + schema workorder_db
  notification-service/     :3005  scaffold + schema notification_db
  organization-service/     :3006  ✅ nối packages/ + schema organization_db; chưa có API nghiệp vụ
  service-request-service/  :3007  ✅ M1 API Service Request, RBAC tenant/customer, warranty snapshot và transactional outbox
  inventory-service/        :3008  scaffold + schema inventory_db
  web/                      :5173  prototype UI, dữ liệu mock (chưa nối API)
  mobile/                          Flutter template
packages/                   thư viện dùng chung: service-kit, auth, event-contracts, testing (packages/README.md)
infrastructure/postgres/    init.sql (8 database của service), dev-databases.sql (shadow/test DB)
docs/                       SRS, ADR, ERD, API contract, kiến trúc (event, state machine)
```

Cả 8 service backend đều có Prisma migration cho database riêng (`0001_init` chép từ `docs/erd/pbl6-schema-v3.1.sql`; Identity thêm `0002_user_customer_links`). Identity và Service Request có API nghiệp vụ; các service còn lại đang được triển khai theo ownership trong [CONTRIBUTING.md](CONTRIBUTING.md). Mỗi service đọc port riêng (`<SERVICE>_PORT` trong `.env`) và từ chối khởi động nếu biến môi trường sai.

Các service dùng chung `packages/` (build sẵn khi `pnpm install`): xác thực token và phân quyền theo catalog RBAC, phạm vi tenant/customer, định dạng lỗi `{code, message}`, log JSON có correlation id, `/health`, outbox/inbox và RabbitMQ. Quy trình làm việc nhóm: [CONTRIBUTING.md](CONTRIBUTING.md).

## 2. Yêu cầu hệ thống

| Công cụ | Phiên bản | Ghi chú |
|---|---|---|
| Git | bất kỳ | |
| Node.js | **24.9 trở lên** (khuyên dùng 24 LTS) | Jest cần tính năng `require(esm)` của Node 24 |
| pnpm | **11.26.0** | Đã khai báo trong `packageManager` của `package.json` |
| Docker | Docker Engine + Compose plugin (Ubuntu) / Docker Desktop (Windows) | Chạy PostgreSQL, RabbitMQ, Redis, MinIO |
| Flutter | 3.x | Chỉ cần nếu làm mobile |

Các cổng sẽ dùng: `5432` (PostgreSQL), `5672`/`15672` (RabbitMQ), `6379` (Redis), `9000`/`9001` (MinIO), `3000`–`3008` (services), `5173` (web). Nếu máy đã có PostgreSQL cài sẵn đang chiếm `5432`, xem [mục 8](#cổng-5432-đã-bị-chiếm).

## 3. Cài công cụ

### 3.1. Ubuntu (22.04 / 24.04)

```bash
# Git, curl
sudo apt update && sudo apt install -y git curl

# Node.js 24 qua nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
source ~/.bashrc            # hoặc mở terminal mới (zsh: source ~/.zshrc)
nvm install 24
node -v                     # phải >= v24.9

# pnpm (đúng phiên bản dự án dùng)
corepack enable
corepack prepare pnpm@11.26.0 --activate
pnpm -v                     # 11.26.0

# Docker Engine + Compose plugin
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
# BẮT BUỘC: đăng xuất rồi đăng nhập lại (hoặc khởi động lại máy) để quyền docker có hiệu lực
docker compose version
```

### 3.2. Windows 10/11

Dùng **PowerShell**. Các lệnh `winget` có sẵn trên Windows 10 (bản mới) và Windows 11.

```powershell
# Git, Node.js 24 LTS, Docker Desktop
winget install --id Git.Git -e
winget install --id OpenJS.NodeJS.LTS -e
winget install --id Docker.DockerDesktop -e
```

Sau khi cài:

1. **Đóng và mở lại PowerShell** để nhận PATH mới, rồi kiểm tra `node -v` (phải ≥ v24.9).
2. Mở **Docker Desktop**, chọn backend **WSL 2** khi được hỏi, và chờ trạng thái *Engine running*. Docker Desktop phải đang chạy mỗi khi làm việc với dự án.
3. Cài pnpm:

```powershell
npm install -g pnpm@11.26.0
pnpm -v                     # 11.26.0
```

> Nếu PowerShell báo `running scripts is disabled on this system` khi gõ `pnpm`, chạy một lần:
> `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`

## 4. Cài đặt dự án

Các bước dưới đây giống nhau trên hai hệ điều hành; chỗ nào khác lệnh sẽ có hai tab **Ubuntu (bash)** và **Windows (PowerShell)**.

### 4.1. Clone và cài dependency

```bash
git clone https://github.com/neyugn261/pbl6-saas-equipment.git
cd pbl6-saas-equipment
git checkout develop
pnpm install
```

### 4.2. Tạo file `.env`

**Ubuntu (bash)**

```bash
cp .env.example .env
```

**Windows (PowerShell)**

```powershell
Copy-Item .env.example .env
```

Sinh một secret ngẫu nhiên (chạy được trên cả hai hệ điều hành):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Mở `.env` và sửa **hai** giá trị bắt buộc:

| Biến | Giá trị |
|---|---|
| `JWT_ACCESS_SECRET` | Chuỗi vừa sinh ở trên (≥ 32 ký tự). Service không khởi động nếu để `CHANGE_ME`. |
| `SEED_DEMO_PASSWORD` | Mật khẩu cho các tài khoản demo, **ít nhất 8 ký tự**. |

Các giá trị khác (database URL, port…) đã khớp với `docker-compose.yml`, không cần sửa khi chạy local.

### 4.3. Khởi động hạ tầng

```bash
pnpm infra:up
docker compose ps           # 4 container pbl6-* phải ở trạng thái Up
```

Kiểm tra PostgreSQL đã mở cổng ra máy (cột PORTS phải có `0.0.0.0:5432->5432/tcp`):

```bash
docker ps --filter name=pbl6-postgres
```

Nếu cột PORTS trống, xem [mục 8](#cổng-5432-đã-bị-chiếm).

### 4.4. Database

Lần đầu khởi động (volume còn trống), PostgreSQL tự chạy hai script:

- `init.sql` — 8 database của các service (`identity_db`, `organization_db`, …)
- `dev-databases.sql` — shadow database `<service>_shadow_db` (cho `migrate dev` / drift check) và `<service>_test_db` của Identity, Organization, Asset, Service Request (cho e2e test)

Nếu bạn đã chạy `infra:up` **trước** khi có `dev-databases.sql` (volume cũ), tạo bổ sung bằng hai lệnh sau (chạy được trên cả bash và PowerShell, chạy lại nhiều lần không sao):

```bash
docker compose up -d
docker compose exec postgres psql -U pbl6 -d postgres -f /docker-entrypoint-initdb.d/02-dev-databases.sql
```

Áp migration cho **tất cả** service (tạo bảng trong 8 database):

```bash
pnpm db:migrate
pnpm db:check-drift       # tuỳ chọn: xác nhận schema.prisma khớp migration
```

> `.env` tạo trước ngày có các service mới sẽ thiếu biến `*_SHADOW_DATABASE_URL`; copy các dòng đó từ `.env.example` nếu muốn chạy `db:check-drift`.

## 5. Chạy Identity Service

```bash
pnpm identity:migrate       # chỉ identity_db (đã nằm trong `pnpm db:migrate` ở bước 4.4)
pnpm identity:seed:dev      # permission catalog + tenant DEMO + tài khoản demo
pnpm dev:identity           # chạy ở http://localhost:3001 (watch mode)
```

Kiểm tra service (mở terminal khác):

**Ubuntu (bash)**

```bash
curl http://localhost:3001/health

curl -X POST http://localhost:3001/auth/login \
  -H "content-type: application/json" \
  -d '{"tenantCode":"DEMO","email":"dispatcher@demo.local","password":"<SEED_DEMO_PASSWORD>"}'
```

**Windows (PowerShell)**

```powershell
Invoke-RestMethod http://localhost:3001/health

$body = @{ tenantCode = "DEMO"; email = "dispatcher@demo.local"; password = "<SEED_DEMO_PASSWORD>" } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri http://localhost:3001/auth/login -ContentType "application/json" -Body $body
```

> Trong PowerShell, `curl` là alias của `Invoke-WebRequest`; nếu muốn dùng cú pháp curl, gõ `curl.exe`.

Tài khoản demo (mật khẩu = `SEED_DEMO_PASSWORD`):

| Email | Tenant code | Vai trò |
|---|---|---|
| `platform.admin@pbl6.local` | *(bỏ trống)* | Platform Admin |
| `tenant.admin@demo.local` | `DEMO` | Tenant Admin |
| `service.manager@demo.local` | `DEMO` | Service Manager |
| `dispatcher@demo.local` | `DEMO` | Dispatcher |
| `inventory@demo.local` | `DEMO` | Inventory Staff |
| `technician@demo.local` | `DEMO` | Technician |
| `customer.admin@demo.local` | `DEMO` | Customer Admin |
| `customer.user@demo.local` | `DEMO` | Customer User |
| `invited@demo.local` | `DEMO` | Chưa kích hoạt — không đăng nhập được |

API, cơ chế token và lỗi trả về: [apps/identity-service/README.md](apps/identity-service/README.md). Quy trình thay đổi schema: [apps/identity-service/prisma/README.md](apps/identity-service/prisma/README.md).

## 6. Chạy các thành phần khác

```bash
pnpm dev:web                # Web prototype: http://localhost:5173
pnpm dev:gateway            # :3000
pnpm dev:asset              # :3002
pnpm dev:maintenance        # :3003
pnpm dev:workorder          # :3004
pnpm dev:notification       # :3005
pnpm dev:organization       # :3006
pnpm dev:service-request    # :3007
pnpm dev:inventory          # :3008
```

Mobile (cần Flutter SDK):

```bash
cd apps/mobile
flutter pub get
flutter run
```

Dừng hạ tầng: `pnpm infra:down` (dữ liệu vẫn giữ trong Docker volume). Xem log: `pnpm infra:logs`.

## 7. Kiểm tra (lint, test, build)

```bash
pnpm lint                   # oxlint (services, packages) + eslint (web); warning cũng là lỗi
pnpm typecheck
pnpm test                   # unit test, không cần database
pnpm test:e2e               # e2e; Identity dùng IDENTITY_TEST_DATABASE_URL trong .env
pnpm build
pnpm build:packages         # build packages/* (typecheck/test/dev:* ở root tự gọi; cần khi chạy lệnh trong một service sau khi sửa package)
```

Test truyền tải sự kiện với RabbitMQ thật (cần `pnpm infra:up`):

```bash
RABBITMQ_TEST_URL=amqp://pbl6:pbl6_dev_password@localhost:5672 pnpm --filter @pbl6/event-contracts test
```

- E2E của Identity **xoá dữ liệu** trong database test, nên chỉ chạy khi tên database có chữ `test` (mặc định `identity_test_db`).
- Jest chạy với `--experimental-vm-modules` vì NestJS 12 chỉ phát hành dạng ESM; các script `test` đã có sẵn cờ này.
- CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)) chạy các bước trên cho mọi push/PR (kèm RabbitMQ cho test truyền tải và e2e khởi động của Organization/Asset/Service Request), cộng migration + drift check của cả 8 database và seed + e2e của Identity trên PostgreSQL 17.

Lệnh database ở root: `pnpm db:migrate` (mọi service), `pnpm db:check-drift` (mọi service). Mỗi service có cùng bộ lệnh `db:migrate`, `db:check-drift`, `db:migrate:dev`, `prisma:generate` (chạy trong `apps/<service>`); quy tắc migration: [apps/identity-service/prisma/README.md](apps/identity-service/prisma/README.md).

Các lệnh database riêng của Identity (chạy trong `apps/identity-service`):

| Lệnh | Tác dụng |
|---|---|
| `pnpm db:migrate` | Áp migration (`prisma migrate deploy`) |
| `pnpm db:check-drift` | So migration với `schema.prisma` (cần `IDENTITY_SHADOW_DATABASE_URL`) |
| `pnpm db:seed` | Chỉ seed permission catalog |
| `pnpm db:seed:dev` | Seed thêm tenant DEMO và tài khoản demo (không chạy khi `NODE_ENV=production`) |
| `pnpm prisma:generate` | Sinh lại Prisma client |

## 8. Xử lý sự cố

### `permission denied while trying to connect to the docker API` (Ubuntu)

User chưa thuộc nhóm `docker`, hoặc đã thêm nhưng chưa đăng nhập lại.

```bash
sudo usermod -aG docker $USER
# rồi đăng xuất / đăng nhập lại. Kiểm tra:
groups | grep docker
```

### Cổng 5432 đã bị chiếm

Triệu chứng: `pnpm identity:migrate` báo `Can't reach database server` / `Connection refused`, hoặc cột PORTS của `pbl6-postgres` trống. Nguyên nhân thường là PostgreSQL cài sẵn trên máy đang chạy.

**Ubuntu (bash)**

```bash
sudo ss -ltnp | grep 5432                    # xem tiến trình nào giữ cổng
sudo systemctl stop postgresql
sudo systemctl disable postgresql            # không tự bật lại khi khởi động máy
docker compose up -d --force-recreate postgres
```

**Windows (PowerShell, chạy với quyền Administrator)**

```powershell
Get-NetTCPConnection -LocalPort 5432 -State Listen | Select-Object OwningProcess
Get-Service postgresql* | Stop-Service
Get-Service postgresql* | Set-Service -StartupType Manual
docker compose up -d --force-recreate postgres
```

`--force-recreate` chỉ tạo lại container; dữ liệu trong volume `postgres_data` vẫn được giữ.

### Docker Desktop chưa chạy (Windows)

Lỗi dạng `error during connect ... dockerDesktopLinuxEngine`. Mở Docker Desktop và chờ *Engine running* rồi chạy lại lệnh.

### `Cannot find module '.../generated/prisma/client.js'`

Prisma client chưa được sinh (thư mục `src/generated` không nằm trong git). Các script `build`, `test`, `start:dev`, `db:seed` tự sinh; nếu chạy lệnh khác trực tiếp:

```bash
pnpm --filter identity-service prisma:generate
```

### `Cannot find module '@pbl6/...'` hoặc `.../packages/<tên>/dist/...`

`packages/*` chưa được build (ví dụ `pnpm install` bị ngắt giữa chừng). Chạy:

```bash
pnpm build:packages
```

### `Invalid environment configuration`

Service kiểm tra `.env` khi khởi động và liệt kê biến bị sai. Hay gặp nhất: chưa đổi `JWT_ACCESS_SECRET` (phải ≥ 32 ký tự — **mọi service** đều cần, vì đều tự xác thực token), hoặc `SEED_DEMO_PASSWORD` ngắn hơn 8 ký tự khi chạy `identity:seed:dev`.

### Prisma báo migration đã bị sửa (Windows)

Thường do Git đổi xuống dòng sang CRLF. Repo đã có `.gitattributes` giữ LF; nếu clone từ trước khi có file này:

```bash
git rm --cached -r . -q
git reset --hard
```

(Lệnh trên bỏ mọi thay đổi chưa commit, hãy commit hoặc stash trước.)

### Đặt lại database Identity từ đầu

Chỉ dùng cho môi trường dev, **xoá toàn bộ dữ liệu** của `identity_db`:

```bash
docker compose exec postgres psql -U pbl6 -d postgres -c "DROP DATABASE identity_db" -c "CREATE DATABASE identity_db"
pnpm identity:migrate
pnpm identity:seed:dev
```

## 9. Tài liệu liên quan

- [AGENTS.md](AGENTS.md) — phạm vi nghiệp vụ, kiến trúc, quy tắc phát triển
- [CONTRIBUTING.md](CONTRIBUTING.md) — ownership, branch/PR, migration, Definition of Done
- [packages/README.md](packages/README.md) — cách dùng thư viện dùng chung
- [docs/api/conventions.md](docs/api/conventions.md) — quy ước REST API; contract nháp: [organization](docs/api/organization.yaml), [asset](docs/api/asset.yaml), [service-request](docs/api/service-request.yaml); [fixtures](docs/api/fixtures.md)
- [docs/architecture/events.md](docs/architecture/events.md) — event catalog; [docs/architecture/state-machines.md](docs/architecture/state-machines.md) — trạng thái SR, Cost Estimate, Work Order
- [ADR 0003](docs/decisions/0003-customer-scope.md) customer scope · [ADR 0004](docs/decisions/0004-service-auth-and-authorization.md) xác thực, phân quyền, gọi giữa service · [ADR 0005](docs/decisions/0005-event-transport.md) outbox, RabbitMQ, inbox · [ADR 0006](docs/decisions/0006-m0-review-decisions.md) quyết định nhóm sau M0 (state machine, gán role, serial, warranty, attachment) · [ADR 0008](docs/decisions/0008-m1-review-decisions.md) quyết định nhóm sau review M1 (quản lý tài khoản, review SR, huỷ SR/WO, trạng thái technician)
- [docs/decisions/0001-database-v3.1.md](docs/decisions/0001-database-v3.1.md) — quyết định thiết kế database
- [docs/decisions/0002-workorder-maintenance-task-index.md](docs/decisions/0002-workorder-maintenance-task-index.md) — sửa index WO ↔ Maintenance Task (F07)
- [apps/identity-service/README.md](apps/identity-service/README.md) — API và cơ chế xác thực
- [docs/FRONTEND_IMPLEMENTATION.md](docs/FRONTEND_IMPLEMENTATION.md) — route và luồng demo của web
