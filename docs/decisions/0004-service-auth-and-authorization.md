# ADR 0004 — Token verification, permissions and service-to-service calls

- Status: Accepted (M0; change through a PR to this ADR)
- Date: 2026-10-17
- Audit findings: ISS-03, ISS-14 (decisions DEC-03, DEC-04, DEC-12)

## Context

Only Identity Service could verify access tokens. Every other service would
have written its own guard, and the permission catalog (ADR 0001 open point #1)
was not enforced anywhere. Synchronous calls between services (Service Request
→ Asset to validate equipment, Asset → Organization to validate a site) had no
agreed authentication.

## Decisions

### 1. One shared verifier: `@pbl6/auth`

- `AuthModule.forRootAsync(...)` registers two **global** guards in every
  service:
  - `JwtAuthGuard`: every route needs `Authorization: Bearer <token>` unless it
    is marked `@Public()`. HS256 only, `iss` = `JWT_ISSUER`, `aud` =
    `JWT_AUDIENCE`, expiry checked, then the claim shape and consistency
    (known roles, `tenant_id` null exactly for PLATFORM_STAFF, `customer_id`
    only for CUSTOMER).
  - `PermissionsGuard`: `@RequirePermissions(...)` (all listed permissions
    needed) and `@AllowUserTypes(...)`.
- Handlers read the caller with `@CurrentUser() principal: Principal` and the
  data scope with `dataScope(principal)` (ADR 0003).
- Errors: 401 `INVALID_ACCESS_TOKEN`, 403 `FORBIDDEN` (with
  `details.required`), 403 `TENANT_SCOPE_REQUIRED` / `CUSTOMER_SCOPE_MISSING`.

### 2. Permissions, not role names, are checked

- The RBAC catalog (`packages/auth/src/catalog.ts`) is the single source of
  roles, permissions and role → permission links. Identity's seed writes it to
  `identity_db`; services evaluate the same map in memory.
- Permissions are **not** put into the token: the catalog is fixed and tenants
  cannot change it (ADR 0001), so the token stays small and cannot disagree
  with the code.
- The permission list itself is still PROVISIONAL (ADR 0001 open point #1):
  the team reviews it in a PR to `catalog.ts`. A change is one file, reviewed
  once, and takes effect in seed and enforcement together.
  ADR 0008 D9 resolved this for M2 with the unchanged catalog and Identity
  migration `0003_permission_catalog`; future changes require a new migration.

### 3. Service-to-service calls forward the caller's token

- A synchronous call made on behalf of a user forwards that user's bearer
  token (`ServiceHttpClient` of `@pbl6/service-kit`, `accessToken:
  principal.accessToken`) and the `x-correlation-id`. The callee authenticates
  and authorizes the user again — no service trusts another service's
  decision or a header such as `x-tenant-id`.
- Endpoints meant only for other services live under `/internal/...`. They
  still require a token and check permissions; the API Gateway does **not**
  route `/internal/*` to the outside.
- Work that is not done for a user (event consumers, schedulers) does not call
  other services synchronously; it relies on events and local data.
- Service base URLs come from the environment (`<SERVICE>_SERVICE_URL`), never
  from code.

### 4. HS256 with one shared secret (trade-off kept for the MVP)

Every service that verifies tokens holds `JWT_ACCESS_SECRET` and could
therefore also sign one. Accepted for the project because all services are
deployed together by the same team. Mitigations: the secret is ≥ 32 random
characters (services refuse to start otherwise), short token TTL (15 min).
Moving to RS256 (Identity signs with a private key, services verify with the
public key) is an optional improvement and only changes `@pbl6/auth` and
Identity's `TokenService`.

### 5. Revocation

Services verify the signature only, not the session. A logout or a disabled
account takes effect at the next refresh (≤ 15 min); `/auth/me` already
checks the session.

## Consequences

- Secure by default: a new endpoint without decorators requires a valid token.
- Tests sign tokens with `signTestAccessToken()` of `@pbl6/testing` instead of
  running Identity.
- The API Gateway does routing, CORS, rate limiting and correlation ids (M1);
  it is not a trust boundary for tenant or permission checks.
