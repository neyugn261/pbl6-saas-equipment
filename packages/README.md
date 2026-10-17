# Shared packages

Owner: Member D (CONTRIBUTING.md). Services consume the compiled `dist/`
(CommonJS + types). `pnpm build:packages` builds all four; the root
`typecheck`, `test`, `test:e2e`, `build` and `dev:*` scripts run it first, and
a fresh `pnpm install` runs it too (`postinstall`). After editing a package,
run `pnpm build:packages` before running commands inside one service
(`pnpm --filter asset-service test`).

| Package | What it gives a service | Decisions |
|---|---|---|
| [`@pbl6/service-kit`](service-kit) | `configureApp()` (validation, error format, correlation id, no `x-powered-by`), `EnvReader`, `JsonLogger`/`createLogger`, `HealthModule`, `PaginationQueryDto`/`toPage`, `ServiceHttpClient`; subpath `@pbl6/service-kit/prisma`: `createPrismaAdapter` (UTC), `prismaHealthCheck` | [conventions](../docs/api/conventions.md) |
| [`@pbl6/auth`](auth) | `AuthModule` (global `JwtAuthGuard` + `PermissionsGuard`), `@Public`, `@RequirePermissions`, `@AllowUserTypes`, `@CurrentUser`, `Principal`, `dataScope`/`scopeWhere`/`assertInScope`, RBAC catalog, `readJwtEnv` | [ADR 0003](../docs/decisions/0003-customer-scope.md), [ADR 0004](../docs/decisions/0004-service-auth-and-authorization.md) |
| [`@pbl6/event-contracts`](event-contracts) | Event catalog `Events` + envelope, `enqueueEvent` (outbox), `OutboxRelay`, `processOnce` (inbox), `RabbitMqEventBus` (retry queue + DLQ) | [ADR 0005](../docs/decisions/0005-event-transport.md), [events.md](../docs/architecture/events.md) |
| [`@pbl6/testing`](testing) | `signTestAccessToken`, `testJwtEnv`, `requireTestDatabaseUrl` | |

## Using them in a service

```jsonc
// apps/<service>/package.json
"dependencies": {
  "@pbl6/auth": "workspace:*",
  "@pbl6/event-contracts": "workspace:*",
  "@pbl6/service-kit": "workspace:*"
},
"devDependencies": { "@pbl6/testing": "workspace:*" }
```

`apps/organization-service`, `asset-service` and `service-request-service`
are wired already and show the minimal setup:

- `src/main.ts` — `createLogger('<service>')`, `configureApp(app, { logger })`;
- `src/app.module.ts` — `ConfigModule` + `validateEnv`, `PrismaModule`,
  `AuthModule.forRootAsync(...)`, `HealthModule.forRootAsync(...)`;
- `src/config/env.validation.ts` — `EnvReader` + `readJwtEnv`;
- `test/app.e2e-spec.ts` — boots the app with a fake Prisma client.

### A protected, scoped endpoint

```ts
@Controller('equipment')
export class EquipmentController {
  constructor(private readonly equipment: EquipmentService) {}

  @Get(':id')
  @RequirePermissions('equipment:read')
  async get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: Principal) {
    const scope = dataScope(user); // { tenantId, customerId | null }
    const row = await this.equipment.findById(scope.tenantId, id);
    return assertInScope(scope, row); // 404 for another tenant or customer
  }
}
```

### Calling another service for the user

```ts
const assets = new ServiceHttpClient({ name: 'asset-service', baseUrl: env.ASSET_SERVICE_URL });
const equipment = await assets.getOrNull<EquipmentRef>(`/internal/equipment/${id}`, {
  accessToken: user.accessToken, // the callee re-checks the user's scope
});
```

### Publishing and consuming an event

```ts
// producer, inside the business transaction
await this.prisma.$transaction(async (tx) => {
  const tenant = await tx.tenant.create({ data });
  await enqueueEvent(tx, Events.TenantCreated, {
    tenantId: tenant.id,
    aggregateId: tenant.id,
    payload: { tenantId: tenant.id, code: tenant.code, name: tenant.name, status: 'ACTIVE' },
    correlationId: getCorrelationId(),
  });
});

// producer process: publish the outbox
const bus = new RabbitMqEventBus({ url: env.RABBITMQ_URL, logger });
await bus.start();
new OutboxRelay({ db: prisma, publisher: bus, producer: 'organization-service', logger }).start();

// consumer: identity-service/src/events/ is the reference implementation
bus.subscribe({ queue: 'asset-service.history', events: [Events.ServiceRequestStatusChanged], handler });
```

### Testing with a token

```ts
const token = signTestAccessToken({ role: 'CUSTOMER_USER', tenantId, customerId });
await request(app.getHttpServer()).get('/equipment').set('authorization', `Bearer ${token}`);
```

Set `testJwtEnv()` into `process.env` before the AppModule is loaded.

## Commands

```bash
pnpm build:packages                    # build all four
pnpm --filter "./packages/**" test     # unit tests
RABBITMQ_TEST_URL=amqp://pbl6:pbl6_dev_password@localhost:5672 \
  pnpm --filter @pbl6/event-contracts test   # + real-broker test
```

All workspace projects must resolve **one** copy of `@nestjs/common` /
`@nestjs/core` (guards, `Reflector` and exceptions are shared). Keep the
NestJS, class-validator and class-transformer ranges identical in every
`package.json`.
