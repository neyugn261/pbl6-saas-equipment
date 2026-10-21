# API conventions

Applies to every PBL6 REST API. Most rules are enforced by `@pbl6/service-kit`
(`configureApp`) and `@pbl6/auth` (global guards); the rest are checked in
review. Service contracts: [organization](organization.yaml),
[asset](asset.yaml), [service-request](service-request.yaml) (OpenAPI 3.1,
drafts owned by each service owner).

## URLs and methods

- Resources are plural nouns in kebab-case: `/customers/{customerId}/sites`,
  `/service-requests/{id}/comments`.
- Public base path through the gateway: `/api/<service-area>/...` (M1). Inside
  a service, paths start at the resource (`/equipment`).
- `GET` reads, `POST` creates (201 + body), `PATCH` partially updates (200 +
  body), `DELETE` soft-deletes where the table has `deleted_at` (204).
- State changes that are not plain field edits are actions:
  `POST /service-requests/{id}/accept`, `POST /work-orders/{id}/assign`
  (see [state-machines.md](../architecture/state-machines.md)).
- `/internal/...` = only for other services (ADR 0004). Same auth rules; the
  gateway does not expose it.
- `/health` is public and returns `200 {status:'ok', database:'up'}` or 503.

## Identity and scope

- Every endpoint except `/health` and `/auth/login|refresh|logout` needs
  `Authorization: Bearer <access token>`.
- `tenant_id` and `customer_id` come **only** from the token (`dataScope()`).
  A request body or query containing `tenantId` is rejected with 400
  (`forbidNonWhitelisted`).
- A row of another tenant, or of another customer for a CUSTOMER account, is
  answered **404**, never 403 — ids cannot be probed.
- Every relation to another entity is checked before writing: same tenant
  (composite FK inside a database; API/event for logical references).

## JSON

- `camelCase` fields. Database `snake_case` never leaks.
- Ids are UUID strings. Business numbers (`requestNo`, `workOrderNo`) are
  separate fields.
- Timestamps: ISO 8601 in UTC with `Z` (`2026-10-17T03:00:00.000Z`).
  Calendar dates (warranty dates, `scheduledDate`): `YYYY-MM-DD`. The web shows
  them in `Asia/Ho_Chi_Minh`.
- Money: decimal strings (`"1250000.00"`) + `currency` (`VND`), never floats.
- Enums: the uppercase codes of the ERD (`IN_WARRANTY`, `NORMAL`, …). Labels
  are the client's job.
- Absent optional values are `null`, not omitted, in responses.

## Lists

`GET /equipment?page=1&pageSize=20&status=ACTIVE&q=pump&sort=-createdAt`

```json
{ "items": [], "page": 1, "pageSize": 20, "total": 0 }
```

- `page` ≥ 1, `pageSize` 1–100 (default 20) — `PaginationQueryDto`.
- Filters are named query parameters; `q` is free-text search where offered.
- `sort`: a field name, `-` prefix for descending; each endpoint lists the
  fields it accepts.

## Errors

Every error body (`HttpErrorFilter`):

```json
{ "code": "EQUIPMENT_NOT_FOUND", "message": "Equipment not found", "details": {} }
```

| Status | Default `code` | When |
|---|---|---|
| 400 | `VALIDATION_FAILED` (`details` = messages) | DTO validation, unknown fields |
| 401 | `INVALID_ACCESS_TOKEN` | Missing, invalid or expired token |
| 403 | `FORBIDDEN` (`details.required`), `TENANT_SCOPE_REQUIRED`, `CUSTOMER_SCOPE_MISSING` | Missing permission or wrong account type |
| 404 | `NOT_FOUND` or a specific `<ENTITY>_NOT_FOUND` | Missing or outside the caller's scope |
| 409 | `UNIQUE_VIOLATION`, `INVALID_STATE_TRANSITION`, specific codes | Duplicates, action not allowed in the current status |
| 422 | specific codes, e.g. `SITE_NOT_OF_CUSTOMER` | Valid shape but breaks a business rule |
| 502 / 503 | `UPSTREAM_ERROR` / `UPSTREAM_UNAVAILABLE` | Another service failed |
| 500 | `INTERNAL_ERROR` | Anything unexpected (details only in logs) |

Throw `new ConflictException({ code: 'INVALID_STATE_TRANSITION', message, details: { from, action } })`
etc.; the filter keeps any body that already has a `code`. Messages never
contain SQL, stack traces or data of other tenants.

## Headers

- `x-correlation-id`: accepted from the caller (`[A-Za-z0-9._:-]{1,128}`) or
  created; returned on every response, forwarded to other services
  (`ServiceHttpClient`) and into events; present in every log line.
- No `x-tenant-id` or similar header is ever trusted.

## Versioning

- Breaking changes to a merged contract need a PR approved by the owner and by
  every consumer. Prefer additive changes (new optional field, new endpoint).
- Events are versioned separately ([events.md](../architecture/events.md)).
