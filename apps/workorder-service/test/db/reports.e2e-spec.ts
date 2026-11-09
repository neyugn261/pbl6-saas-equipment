import { BranchAccessClient } from '@pbl6/auth';
import { FIXTURE_BRANCH, fixtureBranchContext } from '@pbl6/testing';
import { randomUUID } from 'node:crypto';
import { INestApplication, Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { configureApp } from '@pbl6/service-kit';
import { signTestAccessToken } from '@pbl6/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { Prisma } from '../../src/generated/prisma/client.js';
import { ReportsRepository } from '../../src/reports/reports.repository';
import { WO_STATUSES } from '../../src/work-orders/dto';

const from = '2026-10-31T17:00:00.000Z',
  to = '2026-11-30T17:00:00.000Z';
const query = {
  from: '2026-11-01T00:00:00+07:00',
  to: '2026-12-01T00:00:00+07:00',
};
const zeroStatuses = () =>
  Object.fromEntries(WO_STATUSES.map((status) => [status, 0]));
const expected = {
  from,
  to,
  timezone: 'Asia/Ho_Chi_Minh',
  createdCount: 4,
  createdByStatus: {
    ...zeroStatuses(),
    CREATED: 1,
    IN_PROGRESS: 1,
    COMPLETED: 1,
    CANCELLED: 1,
  },
  completedCount: 2,
};

describe('M3-A5 report summary — HTTP and PostgreSQL', () => {
  let app: INestApplication<App>, db: PrismaService, repo: ReportsRepository;
  const tenantId = randomUUID(),
    otherTenantId = randomUUID();
  const manager = signTestAccessToken({ role: 'SERVICE_MANAGER', tenantId });
  const admin = signTestAccessToken({ role: 'TENANT_ADMIN', tenantId });
  const foreignManager = signTestAccessToken({
    role: 'SERVICE_MANAGER',
    tenantId: otherTenantId,
  });
  let rowIds: string[];
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).overrideProvider(BranchAccessClient)
      .useValue(fixtureBranchContext(FIXTURE_BRANCH))
      .compile();
    app = module.createNestApplication({ logger: false });
    configureApp(app, { logger: new Logger('reports-db') });
    await app.init();
    db = app.get(PrismaService);
    repo = app.get(ReportsRepository);
  });
  const row = (
    createdAt: string,
    status: string,
    completedAt: string | null = null,
    overrides: Partial<Prisma.WorkOrderCreateManyInput> = {},
  ): Prisma.WorkOrderCreateManyInput => ({
    id: randomUUID(),
    branchId: FIXTURE_BRANCH,
    tenantId,
    workOrderNo: `WO-Q5-${randomUUID()}`,
    serviceRequestId: randomUUID(),
    equipmentId: randomUUID(),
    customerId: randomUUID(),
    type: 'REPAIR',
    title: 'Q5 fixture',
    status,
    createdAt: new Date(createdAt),
    completedAt: completedAt ? new Date(completedAt) : null,
    ...overrides,
  });
  beforeEach(async () => {
    await db.workOrder.deleteMany({
      where: { tenantId: { in: [tenantId, otherTenantId] } },
    });
    const fixtures = [
      row(from, 'CREATED'),
      row('2026-11-01T01:00:00Z', 'IN_PROGRESS'),
      row('2026-11-02T01:00:00Z', 'COMPLETED', '2026-11-03T01:00:00Z'),
      row('2026-11-04T01:00:00Z', 'CANCELLED', null, {
        serviceRequestId: null,
        maintenanceTaskId: randomUUID(),
        type: 'MAINTENANCE',
      }),
      row('2026-10-01T01:00:00Z', 'COMPLETED', from),
      row(to, 'CREATED'),
      row('2026-10-01T01:00:00Z', 'COMPLETED', to),
    ];
    rowIds = fixtures.map((record) => record.id!);
    await db.workOrder.createMany({
      data: [
        ...fixtures,
        ...Array.from({ length: 3 }, () =>
          row(from, 'COMPLETED', from, { tenantId: otherTenantId }),
        ),
      ],
    });
  });
  afterEach(() => jest.restoreAllMocks());
  afterAll(async () => {
    if (db)
      await db.workOrder.deleteMany({
        where: { tenantId: { in: [tenantId, otherTenantId] } },
      });
    await app?.close();
  });
  const get = (token = manager, params: object = query) =>
    request(app.getHttpServer())
      .get('/reports/work-orders/summary')
      .auth(token, { type: 'bearer' })
      .query(params);

  it('implements the reviewed Q5 fixture with all eight statuses and independent time cohorts', async () => {
    for (const token of [manager, admin]) {
      const response = await get(token)
        .set('x-correlation-id', 'a5-report-fixture')
        .expect(200);
      expect(response.body).toEqual(expected);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.headers['x-correlation-id']).toBe('a5-report-fixture');
      expect(Object.keys(response.body.createdByStatus).sort()).toEqual(
        [...WO_STATUSES].sort(),
      );
    }
  });
  it('normalizes UTC and equivalent explicit offsets to the same interval', async () => {
    for (const params of [
      { from, to },
      { from: '2026-10-31T13:00:00-04:00', to: '2026-11-30T13:00:00-04:00' },
      { from: '2026-10-31t17:00:00z', to: '2026-11-30t17:00:00z' },
    ])
      expect((await get(manager, params).expect(200)).body).toEqual(expected);
  });
  it('isolates tenant counts and ignores a forged tenant header', async () => {
    expect(
      (await get().set('x-tenant-id', otherTenantId).expect(200)).body,
    ).toEqual(expected);
    const other = await get(foreignManager)
      .set('x-tenant-id', tenantId)
      .expect(200);
    expect(other.body.createdCount).toBe(3);
    expect(other.body.completedCount).toBe(3);
    expect(other.body.createdByStatus.COMPLETED).toBe(3);
  });
  it('returns actual zeros for a healthy empty interval and an empty tenant', async () => {
    const empty = { from: '2030-01-01T00:00:00Z', to: '2030-02-01T00:00:00Z' };
    for (const [token, params] of [
      [manager, empty],
      [
        signTestAccessToken({ role: 'TENANT_ADMIN', tenantId: randomUUID() }),
        query,
      ],
    ] as const) {
      const result = (await get(token, params).expect(200)).body;
      expect(result.createdCount).toBe(0);
      expect(result.completedCount).toBe(0);
      expect(result.createdByStatus).toEqual(zeroStatuses());
    }
  });
  it('counts every current state for the created cohort, including Maintenance and cancelled WOs', async () => {
    await db.workOrder.deleteMany({ where: { tenantId } });
    await db.workOrder.createMany({
      data: WO_STATUSES.map((status, index) =>
        row(
          from,
          status,
          status === 'COMPLETED' ? from : null,
          index % 2
            ? {
                serviceRequestId: null,
                maintenanceTaskId: randomUUID(),
                type: 'MAINTENANCE',
              }
            : {},
        ),
      ),
    });
    const result = (await get().expect(200)).body;
    expect(result.createdCount).toBe(8);
    expect(Object.values(result.createdByStatus)).toEqual(Array(8).fill(1));
    expect(result.completedCount).toBe(1);
  });
  it('aggregates beyond a page of 100 records', async () => {
    await db.workOrder.createMany({
      data: Array.from({ length: 125 }, () => row(from, 'CREATED')),
    });
    const result = (await get().expect(200)).body;
    expect(result.createdCount).toBe(129);
    expect(result.createdByStatus.CREATED).toBe(126);
    expect(result.completedCount).toBe(2);
  });
  it('does not derive a completion ratio or discard completions created before the period', async () => {
    await db.workOrder.deleteMany({ where: { tenantId } });
    await db.workOrder.createMany({
      data: Array.from({ length: 3 }, () =>
        row('2026-10-01T00:00:00Z', 'COMPLETED', from),
      ),
    });
    const result = (await get().expect(200)).body;
    expect(result.createdCount).toBe(0);
    expect(result.createdByStatus).toEqual(zeroStatuses());
    expect(result.completedCount).toBe(3);
    expect(result).not.toHaveProperty('completionRate');
  });
  it('uses current status rather than historical status at the end of the interval', async () => {
    await db.workOrder.update({
      where: { id: rowIds[0] },
      data: { status: 'COMPLETED', completedAt: '2026-12-02T00:00:00Z' },
    });
    const result = (await get().expect(200)).body;
    expect(result.createdCount).toBe(4);
    expect(result.createdByStatus.CREATED).toBe(0);
    expect(result.createdByStatus.COMPLETED).toBe(2);
    expect(result.completedCount).toBe(2);
  });
  it('requires COMPLETED status even if a legacy row has a completion timestamp', async () => {
    await db.workOrder.update({
      where: { id: rowIds[3] },
      data: { completedAt: from },
    });
    expect((await get().expect(200)).body.completedCount).toBe(2);
  });
  it('applies [from,to) at PostgreSQL microsecond precision without JavaScript rounding', async () => {
    await db.workOrder.deleteMany({ where: { tenantId } });
    const fixtures = Array.from({ length: 4 }, () =>
      row('2026-11-01T00:00:00Z', 'COMPLETED', '2026-11-01T00:00:00Z'),
    );
    await db.workOrder.createMany({ data: fixtures });
    for (let index = 0; index < fixtures.length; index++) {
      const instant = `2026-11-01T00:00:00.00000${index}Z`;
      await db.$executeRaw`UPDATE work_orders SET created_at = ${instant}::timestamptz, completed_at = ${instant}::timestamptz WHERE tenant_id = ${tenantId}::uuid AND id = ${fixtures[index].id}::uuid`;
    }
    const result = (
      await get(manager, {
        from: '2026-11-01T07:00:00.000001+07:00',
        to: '2026-11-01T07:00:00.000003+07:00',
      }).expect(200)
    ).body;
    expect(result.from).toBe('2026-11-01T00:00:00.000001Z');
    expect(result.to).toBe('2026-11-01T00:00:00.000003Z');
    expect(result.createdCount).toBe(2);
    expect(result.completedCount).toBe(2);
  });
  it('rejects missing/invalid/expired bearer tokens before returning statistics', async () => {
    await request(app.getHttpServer())
      .get('/reports/work-orders/summary')
      .query(query)
      .expect(401);
    for (const token of [
      signTestAccessToken({
        role: 'SERVICE_MANAGER',
        tenantId,
        secret: 'wrong-test-secret',
      }),
      signTestAccessToken({ role: 'SERVICE_MANAGER', tenantId, expiresIn: -1 }),
    ])
      await get(token).expect(401);
  });
  it('enforces report:read and staff account type independently of WO read access', async () => {
    for (const role of [
      'DISPATCHER',
      'INVENTORY_STAFF',
      'TECHNICIAN',
      'CUSTOMER_USER',
      'CUSTOMER_ADMIN',
      'PLATFORM_ADMIN',
    ] as const)
      await get(
        signTestAccessToken({ role, tenantId, customerId: randomUUID() }),
      ).expect(403);
    const mixed = signTestAccessToken({
      role: ['TECHNICIAN', 'TENANT_ADMIN'],
      tenantId,
    });
    expect((await get(mixed).expect(200)).body).toEqual(expected);
  });
  it('rejects absent timestamps, timezone-free dates, impossible dates and duplicate values', async () => {
    for (const params of [
      {},
      { from },
      { to },
      { from: '2026-11-01', to },
      { from: '2026-11-01T00:00:00', to },
      { from: '2026-02-30T00:00:00Z', to },
      { from: [from, from], to },
      { from, to: '' },
    ])
      expect((await get(manager, params).expect(400)).body.code).toBe(
        'VALIDATION_FAILED',
      );
  });
  it('rejects unknown scope/filter/timezone/pagination query fields', async () => {
    for (const extra of [
      { tenantId: otherTenantId },
      { customerId: randomUUID() },
      { timezone: 'UTC' },
      { status: 'COMPLETED' },
      { page: 1 },
      { mine: true },
    ])
      expect(
        (await get(manager, { ...query, ...extra }).expect(400)).body.code,
      ).toBe('VALIDATION_FAILED');
  });
  it('rejects equal/reversed instants before any report query', async () => {
    const call = jest.spyOn(repo, 'summary');
    for (const params of [
      { from, to: from },
      { from: to, to: from },
      { from: query.from, to: from },
      {
        from: '2026-11-01T00:00:00.000002Z',
        to: '2026-11-01T00:00:00.000001Z',
      },
    ])
      expect((await get(manager, params).expect(400)).body.code).toBe(
        'INVALID_REPORT_RANGE',
      );
    expect(call).not.toHaveBeenCalled();
  });
  it('returns 503 REPORT_UNAVAILABLE on a real injected PostgreSQL error instead of false zeros', async () => {
    jest.spyOn(repo, 'summary').mockImplementationOnce(async () => {
      await db.$executeRaw`SELECT 1 / 0`;
      throw new Error('unreachable');
    });
    const response = await get().expect(503);
    expect(response.body.code).toBe('REPORT_UNAVAILABLE');
    expect(response.body).not.toHaveProperty('createdCount');
    expect(JSON.stringify(response.body)).not.toMatch(
      /SELECT|division|tenant_id|Prisma/,
    );
  });
});
