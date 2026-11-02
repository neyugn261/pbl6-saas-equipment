# M3 demo stack (Nguyên)

This stack is separate from `docker-compose.yml`, which remains the local
infrastructure setup. Run all commands from the repository root. The demo stack
exposes the web app on `DEMO_WEB_PORT`, the Gateway for Android on
`DEMO_GATEWAY_PORT`, and MinIO's S3 endpoint on `MINIO_PUBLIC_PORT`.
PostgreSQL, RabbitMQ, Redis, the individual service ports and the MinIO console
stay on the private Compose network.
The included Nginx configuration serves HTTP for a local demo. A remote staging
deployment needs TLS for both the web origin and the S3 endpoint before sending
login credentials or signed file URLs over that network.

## Prepare

Requirements: Docker Engine with Compose, free host ports 8080, 3000 and 9000 (or
choose other ports), and access to the image registries used by the Dockerfiles.
Copy `infrastructure/demo.env.example` to `.env.demo`. Replace every `CHANGE_ME`
value. Keep `.env.demo` outside Git; `.gitignore` already excludes `.env.*`.
Use URL-safe characters for `POSTGRES_PASSWORD` and `RABBITMQ_PASSWORD`, because
Compose embeds them in service URLs. Set `DEMO_PUBLIC_URL` to the URL opened in
the browser, without a trailing slash. For Android on another device, use a
hostname/IP reachable from that device; `localhost` refers to the device
itself. `JWT_ACCESS_SECRET` must be at least 32 random characters.
Set `DEMO_STORAGE_PUBLIC_URL` to the S3 origin reachable by the browser and
Android client (host plus `MINIO_PUBLIC_PORT`). The Work Order storage adapter
uses this exact origin when signing URLs. Its container runs in development
mode in this local HTTP demo because production mode requires HTTPS storage;
remote staging must supply HTTPS before enabling attachments.

```bash
docker build -f infrastructure/docker/backend.Dockerfile -t pbl6-backend:local .
docker build -f infrastructure/docker/web.Dockerfile -t pbl6-web:local .
docker compose --env-file .env.demo -f compose.demo.yml config --quiet
docker compose --env-file .env.demo -f compose.demo.yml up -d
docker compose --env-file .env.demo -f compose.demo.yml ps
```

The one-shot `migrate` service applies each service's migrations and seeds only
the fixed Identity permission catalog. `storage-init` creates the MinIO bucket
and applies a private anonymous policy plus CORS for `DEMO_PUBLIC_URL`. Work
Order waits for that step;
application containers wait for migration. No demo accounts are created
automatically. On a fresh
volume, PostgreSQL init creates the eight logical databases. On an existing
volume, init scripts are not replayed; use migration output to diagnose schema
issues rather than deleting the volume.

## Check and operate

```bash
docker compose --env-file .env.demo -f compose.demo.yml logs migrate
docker compose --env-file .env.demo -f compose.demo.yml ps
docker compose --env-file .env.demo -f compose.demo.yml exec rabbitmq rabbitmq-diagnostics -q ping
docker compose --env-file .env.demo -f compose.demo.yml logs --tail=100 api-gateway
```

Open `DEMO_PUBLIC_URL`. Nginx serves the web app and forwards `/gateway/api/*`
to Gateway `/api/*`. Mobile debug builds use a Gateway origin such as
`http://10.0.2.2:3000` for an Android emulator or the host's reachable LAN
address and `DEMO_GATEWAY_PORT` on a physical device. For mobile attachments,
set `DEMO_STORAGE_PUBLIC_URL` to an address reachable from both Android and the
host browser, normally the host LAN address and MinIO port. `localhost` in a
signed URL points back to the Android device. Recreate Work Order after changing
this endpoint and request a fresh ticket. Debug Android permits local HTTP;
release requires HTTPS. The Gateway `/health`
checks the M1 service chain; Compose
also checks individual service processes. Inventory and Notification currently
have only scaffold root handlers, so their Compose probes check `/` and do not
prove M3 business API readiness.

To create disposable demo users, use the Identity owner’s development seed
**only on an isolated demo stack**, with a separately supplied
`SEED_DEMO_PASSWORD`. It refuses to run with `NODE_ENV=production`. Do not
enable `IDENTITY_EXPOSE_ACTIVATION_TOKEN` in production or use known demo
passwords on a public deployment. The base stack deliberately does not run
this development seed.

For a local demo, add a new random `SEED_DEMO_PASSWORD` (at least 8 characters)
to the ignored `.env.demo`, then in PowerShell run:

```powershell
$env:SEED_DEMO_PASSWORD = ((Get-Content .env.demo | Where-Object { $_ -like 'SEED_DEMO_PASSWORD=*' }) -split '=', 2)[1]
docker compose --env-file .env.demo -f compose.demo.yml run --rm -e NODE_ENV=development -e SEED_DEMO_PASSWORD identity-service pnpm db:seed:dev
docker compose --env-file .env.demo -f compose.demo.yml run --rm -e NODE_ENV=development -e SEED_DEMO_PASSWORD organization-service pnpm db:seed:dev
docker compose --env-file .env.demo -f compose.demo.yml run --rm -e NODE_ENV=development asset-service pnpm db:seed:dev
docker compose --env-file .env.demo -f compose.demo.yml run --rm -e NODE_ENV=development -e SEED_DEMO_PASSWORD workorder-service pnpm db:seed:dev
```

The commands use development mode only inside one-off seed containers. Normal
service containers keep `NODE_ENV=production`, except Work Order, which uses
development mode for local HTTP MinIO signing. The demo accounts and tenant
code are listed in the root README. Do not print the password or access tokens
in demo logs or slides.

Stop without removing data:

```bash
docker compose --env-file .env.demo -f compose.demo.yml down
```

`postgres_data` and `minio_data` are named volumes and survive `down` and
container recreation. Do not add `--volumes` when preserving demo data. To
update code, rebuild both images and run `up -d` again; `migrate` is safe to
run again and must complete before new app containers start.

## Current limits

- The Work Order attachment API and MinIO adapter are implemented on the merged
  A2–A4 branch. A signed PUT/finalize/download through this Compose stack was
  verified with `scripts/smoke-m3-attachment.mjs`. The mobile file screen and
  transport pass local tests, but camera, picker and signed URL use on Android
  still need a device integration run. Browser file UI also needs an
  integration run.
- Notification/Inventory business APIs and activation delivery remain separate
  M3 owner work. Their containers starting is not an acceptance result.

## Verification on 01/11/2026

Both images built. All eight service migrations and the Identity catalog seed
completed. Web and Gateway health returned 200, and all application containers
reported healthy. Recreating the PostgreSQL container preserved all three
Identity migration records. MinIO health returned 200; anonymous bucket access
returned 403; CORS preflight returned 200 for the configured web origin and 403
for an unlisted origin. Port 9000 was occupied on that machine, so this run used
`MINIO_PUBLIC_PORT=9002`. The four demo seeds above completed and Dispatcher
login succeeded through `/gateway/api/auth/login`. Direct Gateway on port 3009
and the web proxy both returned 200 for `/health`; a direct request to
`/api/identity/internal/users` returned 404. These checks do not prove
attachment upload or a full browser/Android business flow.

On 02/11/2026, after pulling Work Order A2–A4, the backend image was rebuilt,
the additive migration applied, and a real Work Order file passed prepare,
signed PUT, finalize, list, signed GET and byte comparison through Gateway and
MinIO. Replaying the same prepare key returned the same attachment. To repeat
on an isolated demo WO, set `SEED_DEMO_PASSWORD`, `PBL6_M3_GATEWAY_URL` and
`PBL6_M3_WORK_ORDER_ID`, then run `node scripts/smoke-m3-attachment.mjs`.
The script prints no token or signed URL. It does not exercise Customer SR
composition, browser UI or Android UI.

Mobile M3 attachment transport and screen were checked with `dart analyze`
(no issues), `flutter test` (104 passed, 2 opt-in backend tests skipped),
and `flutter build apk --debug` (APK built). Kotlin incremental compilation is
disabled for this Windows checkout because Pub sources are on C: while the
project is on D:; otherwise three plugin caches fail to relativize paths.
The client retains upload keys within one session for a same-intent retry and
does not send the API bearer token to MinIO. This does not count as Android
device acceptance; `flutter devices` found no connected Android device.
