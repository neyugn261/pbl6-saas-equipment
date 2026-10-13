# Identity Service

Owns authentication, accounts, the fixed RBAC catalog and sessions
(`identity_db`). Reference implementation for the other NestJS services:
validated configuration, Prisma migrations with drift check, unit + e2e tests
against a real PostgreSQL.

- Port: `IDENTITY_SERVICE_PORT` (default 3001)
- Database: `IDENTITY_DATABASE_URL` — see [prisma/README.md](prisma/README.md)
- All settings: root [`.env.example`](../../.env.example), validated at startup by
  [`src/config/env.validation.ts`](src/config/env.validation.ts)

## API

| Method | Path | Auth | Body | Result |
|---|---|---|---|---|
| `GET` | `/health` | — | — | `200 {status, database}` / `503` |
| `POST` | `/auth/login` | — | `{email, password, tenantCode?}` | `200` tokens + profile |
| `POST` | `/auth/refresh` | — | `{refreshToken}` | `200` new token pair |
| `POST` | `/auth/logout` | — | `{refreshToken}` | `204` (always) |
| `GET` | `/auth/me` | Bearer | — | `200` profile |

Errors carry a stable `code`: `INVALID_CREDENTIALS` (401), `ACCOUNT_NOT_ACTIVE`
(403), `TENANT_NOT_ACTIVE` (403), `INVALID_REFRESH_TOKEN`, `REFRESH_TOKEN_EXPIRED`,
`REFRESH_TOKEN_REUSED`, `INVALID_ACCESS_TOKEN` (401). Unknown body fields are
rejected with 400.

## Behaviour

**Login scope (ADR 0001).** Tenant users send `tenantCode`; Platform Admin
omits it. The code is resolved through the local `tenant_directory` read model
and only selects where to look up the email (case-insensitive). `tenant_id` in
the token always comes from the stored account — never from the request.
Wrong password, unknown email and unknown tenant code return the same 401;
account/tenant status is revealed (403) only after the password is proven.

**Who can log in.** Only `ACTIVE` accounts of an `ACTIVE` tenant. `INVITED`
accounts (no password yet, or invitation not completed), `SUSPENDED` and
`DISABLED` accounts are refused.

**Access token** — HS256 JWT, `JWT_ACCESS_TTL_SECONDS` (default 15 min):

```json
{ "sub": "<user id>", "sid": "<session id>", "tenant_id": "<uuid|null>",
  "user_type": "PLATFORM_STAFF|TENANT_STAFF|CUSTOMER", "roles": ["DISPATCHER"],
  "iss": "pbl6-identity", "aud": "pbl6", "iat": 0, "exp": 0 }
```

Permissions are not in the token yet (catalog not approved).

**Refresh token** — opaque random 256-bit string; only its SHA-256 hash is
stored in `auth_sessions.refresh_token_hash`.
- Every refresh rotates: the old session row is revoked and a new one is
  created with the **same absolute expiry** (`REFRESH_TOKEN_TTL_DAYS` from login).
- Presenting a revoked token (reuse) revokes **all** active sessions of the
  account. Clients must therefore not send two refreshes in parallel with the
  same token; only one succeeds.
- Refresh re-checks account and tenant status.
- Logout revokes the session; `/auth/me` then fails even with an unexpired
  access token. Other services that only verify the JWT will accept it until
  it expires (short TTL by design).

**Passwords** — bcrypt (`bcryptjs`, `BCRYPT_COST`, default 12). Logins for
unknown accounts still run a bcrypt comparison to keep timing similar.

**Time zone** — Prisma connections pin the session time zone to UTC
([`create-adapter.ts`](src/prisma/create-adapter.ts)); without it the pg
adapter shifts every `TIMESTAMPTZ` on servers not running in UTC.

## Commands

```bash
pnpm db:migrate        # prisma migrate deploy
pnpm db:check-drift    # migrations vs schema.prisma (needs IDENTITY_SHADOW_DATABASE_URL)
pnpm db:seed           # provisional permission catalog
pnpm db:seed:dev       # + demo tenant DEMO and demo accounts
pnpm start:dev
pnpm test              # unit tests (no database)
pnpm test:e2e          # API tests on IDENTITY_TEST_DATABASE_URL (name must contain "test")
pnpm lint && pnpm typecheck
```

Demo accounts after `db:seed:dev` (password = `SEED_DEMO_PASSWORD`):
`platform.admin@pbl6.local` (no tenant code) and, with tenant code `DEMO`,
`tenant.admin@`, `service.manager@`, `dispatcher@`, `inventory@`,
`technician@`, `customer.admin@`, `customer.user@demo.local`;
`invited@demo.local` is INVITED and cannot log in.

## Not implemented yet

User invitation / activation and password reset (`account_tokens` exists),
role assignment API with the assigner matrix (ADR open point #2), consuming
Organization tenant events into `tenant_directory`, login rate limiting,
permission claims.
