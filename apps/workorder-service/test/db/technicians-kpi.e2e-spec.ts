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

const from = '2026-10-31T17:00:00.000Z'; // 2026-11-01T00:00:00+07:00
const to = '2026-11-30T17:00:00.000Z';   // 2026-12-01T00:00:00+07:00
const query = {
  from: '2026-11-01T00:00:00+07:00',
  to: '2026-12-01T00:00:00+07:00',
};

describe('KH-03 Technician KPI — HTTP and PostgreSQL', () => {
  let app: INestApplication<App>, db: PrismaService;
  const tenantId = randomUUID();
  const otherTenantId = randomUUID();
  const otherBranchId = randomUUID();

  const manager = signTestAccessToken({
    role: 'SERVICE_MANAGER',
    tenantId,
  });
  const admin = signTestAccessToken({
    role: 'TENANT_ADMIN',
    tenantId,
  });
  const foreignManager = signTestAccessToken({
    role: 'SERVICE_MANAGER',
    tenantId: otherTenantId,
  });
  const technicianToken = signTestAccessToken({
    role: 'TECHNICIAN',
    tenantId,
  });
  const customerToken = signTestAccessToken({
    role: 'CUSTOMER_USER',
    tenantId,
    customerId: randomUUID(),
  });

  let tech1Id: string;
  let tech2Id: string;
  let tech3Id: string;
  let foreignTechId: string;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(BranchAccessClient)
      .useValue(fixtureBranchContext(FIXTURE_BRANCH))
      .compile();

    app = module.createNestApplication({ logger: false });
    configureApp(app, { logger: new Logger('kpi-db') });
    await app.init();
    db = app.get(PrismaService);
  });

  beforeEach(async () => {
    // Clean up work_orders, service_reports, assignments, technicians
    await db.reportAttachment.deleteMany({
      where: { tenantId: { in: [tenantId, otherTenantId] } },
    });
    await db.serviceReport.deleteMany({
      where: { tenantId: { in: [tenantId, otherTenantId] } },
    });
    await db.workOrderAssignment.deleteMany({
      where: { tenantId: { in: [tenantId, otherTenantId] } },
    });
    await db.workOrder.deleteMany({
      where: { tenantId: { in: [tenantId, otherTenantId] } },
    });
    await db.technicianSkill.deleteMany({
      where: { tenantId: { in: [tenantId, otherTenantId] } },
    });
    await db.technician.deleteMany({
      where: { tenantId: { in: [tenantId, otherTenantId] } },
    });

    // Create 3 technicians for fixture branch
    const t1 = await db.technician.create({
      data: {
        tenantId,
        branchId: FIXTURE_BRANCH,
        userId: randomUUID(),
        employeeCode: 'KT001',
        status: 'AVAILABLE',
      },
    });
    tech1Id = t1.id;

    const t2 = await db.technician.create({
      data: {
        tenantId,
        branchId: FIXTURE_BRANCH,
        userId: randomUUID(),
        employeeCode: 'KT002',
        status: 'AVAILABLE',
      },
    });
    tech2Id = t2.id;

    const t3 = await db.technician.create({
      data: {
        tenantId,
        branchId: FIXTURE_BRANCH,
        userId: randomUUID(),
        employeeCode: 'KT003',
        status: 'AVAILABLE',
      },
    });
    tech3Id = t3.id;

    // Create foreign technician in other tenant
    const foreignTech = await db.technician.create({
      data: {
        tenantId: otherTenantId,
        branchId: FIXTURE_BRANCH,
        userId: randomUUID(),
        employeeCode: 'KT999',
        status: 'AVAILABLE',
      },
    });
    foreignTechId = foreignTech.id;
  });

  afterAll(async () => {
    if (db) {
      await db.serviceReport.deleteMany({
        where: { tenantId: { in: [tenantId, otherTenantId] } },
      });
      await db.workOrderAssignment.deleteMany({
        where: { tenantId: { in: [tenantId, otherTenantId] } },
      });
      await db.workOrder.deleteMany({
        where: { tenantId: { in: [tenantId, otherTenantId] } },
      });
      await db.technician.deleteMany({
        where: { tenantId: { in: [tenantId, otherTenantId] } },
      });
    }
    await app?.close();
  });

  const createCompletedWo = async (opts: {
    tenantId?: string;
    branchId?: string;
    technicianId: string;
    type: 'REPAIR' | 'WARRANTY' | 'MAINTENANCE' | 'INSPECTION';
    completedAt: string;
    scheduledEnd?: string | null;
    result?: 'RESOLVED' | 'PARTIALLY_RESOLVED' | 'UNRESOLVED' | null;
  }) => {
    const tid = opts.tenantId ?? tenantId;
    const bid = opts.branchId ?? FIXTURE_BRANCH;
    const wo = await db.workOrder.create({
      data: {
        id: randomUUID(),
        tenantId: tid,
        branchId: bid,
        workOrderNo: `WO-${randomUUID().slice(0, 8)}`,
        serviceRequestId: opts.type === 'MAINTENANCE' ? null : randomUUID(),
        maintenanceTaskId: opts.type === 'MAINTENANCE' ? randomUUID() : null,
        type: opts.type,
        title: 'KPI test order',
        status: 'COMPLETED',
        createdAt: new Date('2026-10-15T00:00:00Z'),
        completedAt: new Date(opts.completedAt),
        scheduledEnd: opts.scheduledEnd ? new Date(opts.scheduledEnd) : null,
        equipmentId: randomUUID(),
        customerId: randomUUID(),
      },
    });

    await db.workOrderAssignment.create({
      data: {
        tenantId: tid,
        workOrderId: wo.id,
        technicianId: opts.technicianId,
        assignedBy: randomUUID(),
        status: 'COMPLETED',
        assignedAt: new Date('2026-10-15T00:00:00Z'),
      },
    });

    if (opts.result !== null && opts.result !== undefined) {
      await db.serviceReport.create({
        data: {
          tenantId: tid,
          workOrderId: wo.id,
          technicianId: opts.technicianId,
          problemDescription: 'Issue',
          solution: 'Fixed',
          result: opts.result,
          submittedAt: new Date(opts.completedAt),
        },
      });
    }

    return wo;
  };

  const getKpi = (
    path = '/reports/work-orders/technicians',
    token = manager,
    params: object = query,
  ) =>
    request(app.getHttpServer())
      .get(path)
      .auth(token, { type: 'bearer' })
      .query(params);

  it('calculates completedCount, repairSuccessRate, and onTimeRate according to specs', async () => {
    // Tech 1:
    // 1. REPAIR, completed Nov 2, scheduled Nov 3 -> On time, RESOLVED
    await createCompletedWo({
      technicianId: tech1Id,
      type: 'REPAIR',
      completedAt: '2026-11-02T10:00:00Z',
      scheduledEnd: '2026-11-03T10:00:00Z',
      result: 'RESOLVED',
    });
    // 2. WARRANTY, completed Nov 5, scheduled Nov 4 -> Late, PARTIALLY_RESOLVED
    await createCompletedWo({
      technicianId: tech1Id,
      type: 'WARRANTY',
      completedAt: '2026-11-05T10:00:00Z',
      scheduledEnd: '2026-11-04T10:00:00Z',
      result: 'PARTIALLY_RESOLVED',
    });
    // 3. INSPECTION, completed Nov 6, scheduled Nov 7 -> On time, result RESOLVED (excluded from repair rate)
    await createCompletedWo({
      technicianId: tech1Id,
      type: 'INSPECTION',
      completedAt: '2026-11-06T10:00:00Z',
      scheduledEnd: '2026-11-07T10:00:00Z',
      result: 'RESOLVED',
    });
    // 4. MAINTENANCE, completed Nov 8, no scheduledEnd -> Excluded from repair rate and scheduled count
    await createCompletedWo({
      technicianId: tech1Id,
      type: 'MAINTENANCE',
      completedAt: '2026-11-08T10:00:00Z',
      scheduledEnd: null,
      result: null,
    });

    // Tech 2:
    // 5. REPAIR, completed Nov 10, scheduled Nov 11 -> On time, RESOLVED
    await createCompletedWo({
      technicianId: tech2Id,
      type: 'REPAIR',
      completedAt: '2026-11-10T10:00:00Z',
      scheduledEnd: '2026-11-11T10:00:00Z',
      result: 'RESOLVED',
    });
    // 6. REPAIR, completed Nov 12, scheduled Nov 15 -> On time, RESOLVED
    await createCompletedWo({
      technicianId: tech2Id,
      type: 'REPAIR',
      completedAt: '2026-11-12T10:00:00Z',
      scheduledEnd: '2026-11-15T10:00:00Z',
      result: 'RESOLVED',
    });

    // Tech 3: 0 WOs completed in period

    const res = await getKpi().expect(200);
    expect(res.body.from).toBe(from);
    expect(res.body.to).toBe(to);
    expect(res.body.timezone).toBe('Asia/Ho_Chi_Minh');
    expect(res.headers['cache-control']).toBe('no-store');

    const items = res.body.items;
    expect(items).toHaveLength(3);

    // KT001
    const kt1 = items.find((i: { employeeCode: string }) => i.employeeCode === 'KT001');
    expect(kt1).toBeDefined();
    expect(kt1.completedCount).toBe(4);
    expect(kt1.eligibleRepairCount).toBe(2);
    expect(kt1.resolvedRepairCount).toBe(1);
    expect(kt1.repairSuccessRate).toBe(0.5); // 1 / 2
    expect(kt1.scheduledCount).toBe(3);
    expect(kt1.onTimeCount).toBe(2);
    expect(kt1.onTimeRate).toBe(0.6667); // 2 / 3

    // KT002
    const kt2 = items.find((i: { employeeCode: string }) => i.employeeCode === 'KT002');
    expect(kt2).toBeDefined();
    expect(kt2.completedCount).toBe(2);
    expect(kt2.eligibleRepairCount).toBe(2);
    expect(kt2.resolvedRepairCount).toBe(2);
    expect(kt2.repairSuccessRate).toBe(1.0); // 2 / 2
    expect(kt2.scheduledCount).toBe(2);
    expect(kt2.onTimeCount).toBe(2);
    expect(kt2.onTimeRate).toBe(1.0); // 2 / 2

    // KT003
    const kt3 = items.find((i: { employeeCode: string }) => i.employeeCode === 'KT003');
    expect(kt3).toBeDefined();
    expect(kt3.completedCount).toBe(0);
    expect(kt3.eligibleRepairCount).toBe(0);
    expect(kt3.resolvedRepairCount).toBe(0);
    expect(kt3.repairSuccessRate).toBeNull(); // Chưa đủ dữ liệu
    expect(kt3.scheduledCount).toBe(0);
    expect(kt3.onTimeCount).toBe(0);
    expect(kt3.onTimeRate).toBeNull(); // Chưa đủ dữ liệu

    // Summary checks
    expect(res.body.summary).toEqual({
      totalTechnicians: 3,
      totalCompletedCount: 6,
      totalResolvedRepairCount: 3,
      totalEligibleRepairCount: 4,
      overallRepairSuccessRate: 0.75, // 3 / 4
      totalOnTimeCount: 4,
      totalScheduledCount: 5,
      overallOnTimeRate: 0.8, // 4 / 5
    });
  });

  it('handles reassignment properly by attributing completion ONLY to the final technician', async () => {
    // WO initially assigned to Tech 1, but reassigned to Tech 2 who completed it
    const wo = await db.workOrder.create({
      data: {
        id: randomUUID(),
        tenantId,
        branchId: FIXTURE_BRANCH,
        workOrderNo: `WO-REASSIGN-${randomUUID().slice(0, 8)}`,
        serviceRequestId: randomUUID(),
        type: 'REPAIR',
        title: 'Reassignment test',
        status: 'COMPLETED',
        createdAt: new Date('2026-10-15T00:00:00Z'),
        completedAt: new Date('2026-11-10T10:00:00Z'),
        scheduledEnd: new Date('2026-11-12T10:00:00Z'),
        equipmentId: randomUUID(),
        customerId: randomUUID(),
      },
    });

    // Old assignment for Tech 1 (REMOVED)
    await db.workOrderAssignment.create({
      data: {
        tenantId,
        workOrderId: wo.id,
        technicianId: tech1Id,
        assignedBy: randomUUID(),
        status: 'REMOVED',
        assignedAt: new Date('2026-10-15T00:00:00Z'),
        unassignedAt: new Date('2026-10-20T00:00:00Z'),
      },
    });

    // New assignment for Tech 2 (COMPLETED)
    await db.workOrderAssignment.create({
      data: {
        tenantId,
        workOrderId: wo.id,
        technicianId: tech2Id,
        assignedBy: randomUUID(),
        status: 'COMPLETED',
        assignedAt: new Date('2026-10-20T00:00:00Z'),
      },
    });

    // Report submitted by Tech 2
    await db.serviceReport.create({
      data: {
        tenantId,
        workOrderId: wo.id,
        technicianId: tech2Id,
        problemDescription: 'Fixed by tech 2',
        solution: 'Done',
        result: 'RESOLVED',
        submittedAt: new Date('2026-11-10T10:00:00Z'),
      },
    });

    const res = await getKpi().expect(200);
    const kt1 = res.body.items.find((i: { employeeCode: string }) => i.employeeCode === 'KT001');
    const kt2 = res.body.items.find((i: { employeeCode: string }) => i.employeeCode === 'KT002');

    expect(kt1.completedCount).toBe(0);
    expect(kt2.completedCount).toBe(1);
    expect(kt2.resolvedRepairCount).toBe(1);
  });

  it('excludes work orders outside the [from, to) half-open interval', async () => {
    // Exactly at from (included)
    await createCompletedWo({
      technicianId: tech1Id,
      type: 'REPAIR',
      completedAt: from,
      result: 'RESOLVED',
    });
    // Exactly at to (excluded)
    await createCompletedWo({
      technicianId: tech1Id,
      type: 'REPAIR',
      completedAt: to,
      result: 'RESOLVED',
    });
    // Well before from (excluded)
    await createCompletedWo({
      technicianId: tech1Id,
      type: 'REPAIR',
      completedAt: '2026-10-01T00:00:00Z',
      result: 'RESOLVED',
    });

    const res = await getKpi().expect(200);
    const kt1 = res.body.items.find((i: { employeeCode: string }) => i.employeeCode === 'KT001');
    expect(kt1.completedCount).toBe(1);
  });

  it('isolates tenants completely and ignores forged tenant headers', async () => {
    await createCompletedWo({
      tenantId: otherTenantId,
      branchId: FIXTURE_BRANCH,
      technicianId: foreignTechId,
      type: 'REPAIR',
      completedAt: '2026-11-10T00:00:00Z',
      result: 'RESOLVED',
    });

    const res = await getKpi().set('x-tenant-id', otherTenantId).expect(200);
    // Should still only see tenantId technicians, foreign tech is not present
    expect(res.body.items.every((i: { branchId: string }) => i.branchId === FIXTURE_BRANCH)).toBe(true);
    expect(res.body.items.find((i: { employeeCode: string }) => i.employeeCode === 'KT999')).toBeUndefined();

    // Foreign manager only sees otherTenantId's technician
    const foreignRes = await getKpi('/reports/work-orders/technicians', foreignManager).expect(200);
    expect(foreignRes.body.items).toHaveLength(1);
    expect(foreignRes.body.items[0].technicianId).toBe(foreignTechId);
  });

  it('enforces branch isolation and supports Tenant Admin querying all branches or by branchId', async () => {
    // Service Manager querying foreign branch gets 404 (ADR 0022 resource hiding)
    await getKpi('/reports/work-orders/technicians', manager, {
      ...query,
      branchId: otherBranchId,
    }).expect(404);

    // Tenant Admin querying all branches succeeds
    const adminRes = await getKpi('/reports/work-orders/technicians', admin, query).expect(200);
    expect(adminRes.body.items).toHaveLength(3);

    // Tenant Admin querying specific branchId succeeds
    const branchRes = await getKpi('/reports/work-orders/technicians', admin, {
      ...query,
      branchId: FIXTURE_BRANCH,
    }).expect(200);
    expect(branchRes.body.items).toHaveLength(3);
  });

  it('supports all three routes (/reports/work-orders/technicians, /reports/work-orders/kpi, /reports/technicians)', async () => {
    const r1 = await getKpi('/reports/work-orders/technicians').expect(200);
    const r2 = await getKpi('/reports/work-orders/kpi').expect(200);
    const r3 = await getKpi('/reports/technicians').expect(200);

    expect(r1.body).toEqual(r2.body);
    expect(r1.body).toEqual(r3.body);
  });

  it('filters by specific technicianId if provided', async () => {
    const res = await getKpi('/reports/work-orders/technicians', manager, {
      ...query,
      technicianId: tech1Id,
    }).expect(200);

    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].technicianId).toBe(tech1Id);
    expect(res.body.summary.totalTechnicians).toBe(1);

    const res3 = await getKpi('/reports/work-orders/technicians', manager, {
      ...query,
      technicianId: tech3Id,
    }).expect(200);

    expect(res3.body.items).toHaveLength(1);
    expect(res3.body.items[0].technicianId).toBe(tech3Id);
    expect(res3.body.items[0].completedCount).toBe(0);
  });

  it('enforces authentication and authorization', async () => {
    // Missing token
    await request(app.getHttpServer())
      .get('/reports/work-orders/technicians')
      .query(query)
      .expect(401);

    // Customer User -> 403
    await getKpi('/reports/work-orders/technicians', customerToken).expect(403);

    // Technician (lacks report:read) -> 403
    await getKpi('/reports/work-orders/technicians', technicianToken).expect(403);
  });

  it('validates query parameters strictly', async () => {
    // Reversed range (from > to)
    await getKpi('/reports/work-orders/technicians', manager, {
      from: '2026-12-01T00:00:00+07:00',
      to: '2026-11-01T00:00:00+07:00',
    }).expect(400);

    // Missing from
    await getKpi('/reports/work-orders/technicians', manager, {
      to: '2026-12-01T00:00:00+07:00',
    }).expect(400);

    // Unknown query param
    await getKpi('/reports/work-orders/technicians', manager, {
      ...query,
      unknownField: 'malicious',
    }).expect(400);
  });
});
