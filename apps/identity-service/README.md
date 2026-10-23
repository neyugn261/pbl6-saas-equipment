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
| `GET` | `/users` | Bearer + `user:read` | Query filters | Tenant or customer-scoped page |
| `POST` | `/users` | Bearer + `user:manage` | Invite input | `201` INVITED user + activation token |
| `POST` | `/users/activate` | Activation token | `{token, password}` | `200` tokens + ACTIVE profile |
| `GET` | `/users/:id` | Bearer + `user:read` | — | `200` profile / `404` outside scope |
| `PATCH` | `/users/:id/roles` | Bearer + `role:assign` | `{roles}` | `200` updated profile |
| `POST` | `/users/:id/status` | Bearer + `user:manage` | `{status}` | `200` updated profile |
| `POST` | `/platform/tenants/:tenantId/admins` | Platform Admin | `{email, fullName, phone?}` | `201` INVITED Tenant Admin + token |
| `POST` | `/platform/tenants/:tenantId/admins/:id/status` | Platform Admin | `{status}` | `200` updated Tenant Admin / `409` last active admin |
| `PATCH` | `/platform/tenants/:tenantId/admins/:id/roles` | Platform Admin | `{roles: []}` or `{roles: ["TENANT_ADMIN"]}` | `200` updated roles / `409` last active admin |

Invitation tokens expire after 24 hours. `IDENTITY_EXPOSE_ACTIVATION_TOKEN`
defaults to `false`; set it to `true` only for local development or tests that
need to copy the token. The service rejects this setting in production.
| `GET` | `/internal/users/:id` | Tenant staff or scoped Customer Admin token | — | Tenant-scoped identity snapshot |
| `GET` | `/internal/users` | Tenant staff token | `role`, `status`, pagination | Tenant-scoped minimal user page |

`/health`, the three `/auth` POST routes, and `/users/activate` are `@Public()`;
every other route needs a token (global guards of `@pbl6/auth`). The profile returned by
login and `/auth/me` includes `customerId` (ADR 0003).

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
  "customer_id": "<uuid|null>",
  "iss": "pbl6-identity", "aud": "pbl6", "iat": 0, "exp": 0 }
```

`customer_id` is the customer of a CUSTOMER account's ACTIVE link in
`user_customer_links`, else `null` (ADR 0003). Permissions are not in the
token: every service derives them from `roles` with the shared catalog in
`@pbl6/auth` (ADR 0004). Other services verify tokens with
`AccessTokenVerifier` of `@pbl6/auth`; `src/auth/token.service.spec.ts` checks
that tokens issued here pass that verifier.

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
(`createPrismaAdapter` of `@pbl6/service-kit/prisma`); without it the pg
adapter shifts every `TIMESTAMPTZ` on servers not running in UTC.

**Events consumed** (queue `identity-service.directory`, only when
`RABBITMQ_URL` is set — [events.md](../../docs/architecture/events.md)):

| Event | Read model |
|---|---|
| `TenantCreated` v1, `TenantStatusChanged` v1 | `tenant_directory` (login scope, tenant status) |
| `CustomerMembershipChanged` v1 | `user_customer_links` (`customer_id` claim) |

The handler ([`src/events/directory-event.handler.ts`](src/events/directory-event.handler.ts))
is idempotent (inbox `processed_events`) and ignores changes older than the
stored row. Failures are retried, then dead-lettered to
`identity-service.directory.dlq`. Logs are JSON lines with the request's or
event's correlation id.

## Commands

```bash
pnpm db:migrate        # prisma migrate deploy
pnpm db:check-drift    # migrations vs schema.prisma (needs IDENTITY_SHADOW_DATABASE_URL)
pnpm db:seed           # provisional permission catalog
pnpm db:seed:dev       # + demo tenant DEMO and demo accounts
pnpm start:dev
pnpm test              # unit tests (no database)
pnpm test:e2e          # API + event-handler tests on IDENTITY_TEST_DATABASE_URL (name must contain "test"; read from .env)
pnpm lint && pnpm typecheck
```

Demo accounts after `db:seed:dev` (password = `SEED_DEMO_PASSWORD`):
`platform.admin@pbl6.local` (no tenant code) and, with tenant code `DEMO`,
`tenant.admin@`, `service.manager@`, `dispatcher@`, `inventory@`,
`technician@`, `customer.admin@`, `customer.user@demo.local`;
`invited@demo.local` is INVITED and cannot log in. The two customer accounts
are linked to customer `DEMO-CUST-01` (`docs/api/fixtures.md`), so their
tokens carry `customer_id`.

## User management (M1)

Tenant Admin may invite and assign the fixed staff and customer roles listed in
ADR 0006, including Technician and Customer User, but cannot grant Tenant Admin.
Customer Admin can invite Customer User and manage Customer User accounts
with active links to its own customer, or unlinked accounts it
invited. The internal user lookup applies the same narrow rule so Organization
can verify the membership request. A link to another customer returns 404 even
when this admin originally invited the user. New Customer Users must be linked
through Organization's membership API before customer-scoped access works.
Platform Admin can invite a Tenant Admin only for an active tenant in the local
tenant directory. Users cannot change their own role or status; only Platform
Admin can suspend or reactivate Tenant Admin, and the last active Tenant Admin
cannot be suspended. The service uses the shared
`ASSIGNABLE_ROLES` and `dataScope` rules from `@pbl6/auth`.

The raw activation token is returned by the invite endpoint only when
`IDENTITY_EXPOSE_ACTIVATION_TOKEN=true` outside production.
Activation consumes it once and sets the password. Locking an account revokes
its Identity sessions. The OpenAPI contract is
[`docs/api/identity.yaml`](../../docs/api/identity.yaml).

The gateway enforces the login rate limit and returns 404 for external
`/internal/*` requests. Password reset and Identity event outbox are not part
of this M1 implementation.
