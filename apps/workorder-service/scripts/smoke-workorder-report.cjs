const { randomUUID } = require('node:crypto');
const { resolve } = require('node:path');
const { execFileSync } = require('node:child_process');
const assert = require('node:assert/strict');
const { config } = require('dotenv');
const {
  requireTestDatabaseUrl,
  testJwtEnv,
  signTestAccessToken,
} = require('@pbl6/testing');
config({ path: '.env', quiet: true });
config({ path: '../../.env', quiet: true });

async function main() {
  const testURL = requireTestDatabaseUrl('WORKORDER_TEST_DATABASE_URL');
  const tenantId = randomUUID();
  Object.assign(process.env, testJwtEnv(), {
    NODE_ENV: 'test',
    WORKORDER_DATABASE_URL: testURL,
    RABBITMQ_URL: '',
    WORKORDER_ATTACHMENTS_ENABLED: 'false',
    WORKORDER_ATTACHMENT_WORKER_ENABLED: 'false',
  });
  for (const name of [
    'IDENTITY',
    'ORGANIZATION',
    'ASSET',
    'SERVICE_REQUEST',
    'MAINTENANCE',
    'INVENTORY',
    'NOTIFICATION',
  ])
    process.env[`${name}_SERVICE_URL`] =
      `http://${name.toLowerCase().replaceAll('_', '-')}.test`;
  execFileSync(
    process.execPath,
    ['node_modules/prisma/build/index.js', 'migrate', 'deploy'],
    { stdio: 'inherit', env: process.env },
  );
  const { NestFactory } = require('@nestjs/core');
  const { ConfigService } = require('@nestjs/config');
  const { configureApp, createLogger } = require('@pbl6/service-kit');
  const { AppModule } = require('../dist/app.module');
  const { PrismaService } = require('../dist/prisma/prisma.service');
  let wo, gateway, db;
  try {
    wo = await NestFactory.create(AppModule, { logger: false });
    configureApp(wo, { logger: createLogger('report-gateway-smoke') });
    await wo.listen(0, '127.0.0.1');
    db = wo.get(PrismaService);
    process.env.WORKORDER_SERVICE_URL = await wo.getUrl();
    const { AppModule: GatewayModule } = require(
      resolve('../api-gateway/dist/app.module'),
    );
    const { configureGateway } = require(
      resolve('../api-gateway/dist/gateway.setup'),
    );
    gateway = await NestFactory.create(GatewayModule, { logger: false });
    configureGateway(gateway, gateway.get(ConfigService));
    await gateway.listen(0, '127.0.0.1');

    const from = '2026-10-31T17:00:00.000Z';
    const to = '2026-11-30T17:00:00.000Z';
    const fixture = (createdAt, status, completedAt = null, extra = {}) => ({
      tenantId,
      workOrderNo: `WO-Q5-${randomUUID()}`,
      serviceRequestId: randomUUID(),
      equipmentId: randomUUID(),
      customerId: randomUUID(),
      type: 'REPAIR',
      title: 'Report Gateway test fixture',
      status,
      createdAt: new Date(createdAt),
      completedAt: completedAt ? new Date(completedAt) : null,
      ...extra,
    });
    await db.workOrder.createMany({
      data: [
        fixture(from, 'CREATED'),
        fixture('2026-11-01T01:00:00Z', 'IN_PROGRESS'),
        fixture('2026-11-02T01:00:00Z', 'COMPLETED', '2026-11-03T01:00:00Z'),
        fixture('2026-11-04T01:00:00Z', 'CANCELLED', null, {
          serviceRequestId: null,
          maintenanceTaskId: randomUUID(),
          type: 'MAINTENANCE',
        }),
        fixture('2026-10-01T01:00:00Z', 'COMPLETED', from),
        fixture(to, 'CREATED'),
        fixture('2026-10-01T01:00:00Z', 'COMPLETED', to),
      ],
    });
    const query = {
      from: '2026-11-01T00:00:00+07:00',
      to: '2026-12-01T00:00:00+07:00',
    };
    const base = await gateway.getUrl();
    const correlation = `a5-report-${randomUUID()}`;
    async function api(role, params = query, expected = 200, scope = tenantId) {
      const response = await fetch(
        `${base}/api/workorders/reports/work-orders/summary?${new URLSearchParams(params)}`,
        {
          headers: {
            Authorization: `Bearer ${signTestAccessToken({ role, tenantId: scope, customerId: randomUUID() })}`,
            'X-Correlation-Id': correlation,
            'X-Tenant-Id': randomUUID(),
          },
        },
      );
      assert.equal(response.status, expected);
      assert.equal(response.headers.get('x-correlation-id'), correlation);
      if (expected === 200)
        assert.equal(response.headers.get('cache-control'), 'no-store');
      return response.json();
    }
    const expected = {
      from,
      to,
      timezone: 'Asia/Ho_Chi_Minh',
      createdCount: 4,
      createdByStatus: {
        CREATED: 1,
        ASSIGNED: 0,
        ACCEPTED: 0,
        TRAVELLING: 0,
        IN_PROGRESS: 1,
        ON_HOLD: 0,
        COMPLETED: 1,
        CANCELLED: 1,
      },
      completedCount: 2,
    };
    assert.deepEqual(await api('SERVICE_MANAGER'), expected);
    assert.deepEqual(await api('TENANT_ADMIN'), expected);
    const empty = await api('SERVICE_MANAGER', query, 200, randomUUID());
    assert.equal(empty.createdCount, 0);
    assert.equal(empty.completedCount, 0);
    assert.deepEqual(Object.values(empty.createdByStatus), Array(8).fill(0));
    for (const role of ['TECHNICIAN', 'CUSTOMER_USER', 'DISPATCHER'])
      assert.equal((await api(role, query, 403)).code, 'FORBIDDEN');
    assert.equal(
      (await api('SERVICE_MANAGER', { from: to, to: from }, 400)).code,
      'INVALID_REPORT_RANGE',
    );
    assert.equal(
      (await api('SERVICE_MANAGER', { ...query, tenantId }, 400)).code,
      'VALIDATION_FAILED',
    );
    console.log(
      JSON.stringify({
        ok: true,
        flow: 'Gateway -> WO report -> PostgreSQL',
        scenarios: 8,
      }),
    );
  } finally {
    try {
      if (db) await db.workOrder.deleteMany({ where: { tenantId } });
    } finally {
      await gateway?.close();
      await wo?.close();
    }
  }
}
main().catch((error) => {
  console.error('Work Order report Gateway smoke failed:', error.message);
  process.exitCode = 1;
});
