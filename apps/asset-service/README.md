# Asset Service

Equipment models, equipment, warranties and warranty check, QR codes, equipment history.

- Owner: Member B ([CONTRIBUTING.md](../../CONTRIBUTING.md))
- Port: `ASSET_SERVICE_PORT` (default 3002)
- Database: `asset_db` via `ASSET_DATABASE_URL` — see [prisma/README.md](prisma/README.md)
- API contract (draft): [asset.yaml](../../docs/api/asset.yaml); conventions: [docs/api/conventions.md](../../docs/api/conventions.md)

## Status

Wired to the shared packages (M0); business endpoints come in M1.

- `GET /health` — public, `200 {status:'ok', database:'up'}` or 503.
- Every other route requires an access token (global guards of `@pbl6/auth`);
  use `@RequirePermissions(...)`, `@CurrentUser()` and `dataScope()` in new
  controllers — examples in [packages/README.md](../../packages/README.md).
- Errors follow `{code, message, details?}`; logs are JSON lines with the
  correlation id.

## Commands

```bash
pnpm start:dev        # watch mode (generates the Prisma client first)
pnpm test             # unit tests
pnpm test:e2e         # boots the app with a fake database client
pnpm lint && pnpm typecheck
pnpm db:migrate       # prisma migrate deploy
pnpm db:check-drift   # migrations vs schema.prisma (needs ASSET_SHADOW_DATABASE_URL)
```
