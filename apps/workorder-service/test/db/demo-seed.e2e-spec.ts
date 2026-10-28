import { randomUUID } from 'node:crypto';
import { createPrismaAdapter } from '@pbl6/service-kit/prisma';
import { AccessTokenVerifier } from '@pbl6/auth';
import {
  requireTestDatabaseUrl,
  signTestAccessToken,
  testJwtEnv,
} from '@pbl6/testing';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { seedDemo, DEMO_WO } from '../../src/demo/seed-demo';

const userId = randomUUID();
const jwt = testJwtEnv();
const verifier = new AccessTokenVerifier({
  secret: jwt.JWT_ACCESS_SECRET,
  issuer: jwt.JWT_ISSUER,
  audience: jwt.JWT_AUDIENCE,
});
const manager = verifier.verify(
  signTestAccessToken({ role: 'SERVICE_MANAGER', tenantId: DEMO_WO.tenantId }),
);

describe('K7 demo seed — real owned PostgreSQL, explicit reference doubles', () => {
  const db = new PrismaClient({
    adapter: createPrismaAdapter(
      requireTestDatabaseUrl('WORKORDER_TEST_DATABASE_URL'),
    ),
  });
  const refs = {
    user: jest.fn(),
    branch: jest.fn(),
    request: jest.fn(),
    equipment: jest.fn(),
  };
  beforeAll(async () => {
    await db.$connect();
  });
  afterAll(async () => {
    await db.$disconnect();
  });
  beforeEach(async () => {
    await db.$executeRawUnsafe(
      'TRUNCATE report_attachments, service_reports, work_order_attachments, work_logs, work_order_assignments, work_order_status_history, work_orders, technician_skills, skills, technicians, document_sequences, outbox_events, processed_events',
    );
    jest.resetAllMocks();
    refs.user.mockResolvedValue({
      id: userId,
      tenantId: DEMO_WO.tenantId,
      userType: 'TENANT_STAFF',
      roles: ['TECHNICIAN'],
      status: 'ACTIVE',
    });
    refs.branch.mockResolvedValue({ id: DEMO_WO.branchId, status: 'ACTIVE' });
  });
  const run = () => seedDemo(db, refs, manager, userId, 'test');
  it('seeds twice with fixed IDs, no fake WO/event, and forwards the manager token to references', async () => {
    const first = await run();
    expect(await run()).toEqual(first);
    expect(first.technicianId).toBe(DEMO_WO.technicianId);
    expect(first.skillIds).toEqual(DEMO_WO.skills.map((s) => s.id));
    expect(await db.technician.count()).toBe(1);
    expect(await db.skill.count()).toBe(2);
    expect(await db.technicianSkill.count()).toBe(2);
    expect(await db.workOrder.count()).toBe(0);
    expect(await db.outboxEvent.count()).toBe(0);
    expect(refs.user).toHaveBeenCalledWith(userId, manager.accessToken);
    expect(refs.branch).toHaveBeenCalledWith(
      DEMO_WO.branchId,
      manager.accessToken,
    );
    expect(refs.request).not.toHaveBeenCalled();
    expect(refs.equipment).not.toHaveBeenCalled();
  });
  it('serializes concurrent seed runs without duplicate fixture rows', async () => {
    const results = await Promise.all([run(), run()]);
    expect(results[0]).toEqual(results[1]);
    expect(await db.technician.count()).toBe(1);
    expect(await db.skill.count()).toBe(2);
  });
  it.each(['BUSY', 'OFF_DUTY', 'INACTIVE'])(
    'adopts an existing profile and preserves %s, branch, code, skill levels and additional skills',
    async (status) => {
      const tech = await db.technician.create({
        data: {
          tenantId: DEMO_WO.tenantId,
          userId,
          branchId: randomUUID(),
          employeeCode: 'CUSTOM-CODE',
          status,
        },
      });
      const skill = await db.skill.create({
        data: {
          tenantId: DEMO_WO.tenantId,
          code: DEMO_WO.skills[0].code,
          name: 'Customized name',
        },
      });
      const extra = await db.skill.create({
        data: {
          tenantId: DEMO_WO.tenantId,
          code: 'EXTRA',
          name: 'Extra skill',
        },
      });
      for (const skillId of [skill.id, extra.id])
        await db.technicianSkill.create({
          data: {
            tenantId: DEMO_WO.tenantId,
            technicianId: tech.id,
            skillId,
            level: 5,
          },
        });
      const result = await run();
      expect(result.technicianId).toBe(tech.id);
      expect(result.skillIds[0]).toBe(skill.id);
      expect(
        await db.technician.findUniqueOrThrow({ where: { id: tech.id } }),
      ).toEqual(tech);
      expect(
        (await db.skill.findUniqueOrThrow({ where: { id: skill.id } })).name,
      ).toBe('Customized name');
      expect(await db.technicianSkill.count()).toBe(3);
      expect(
        (
          await db.technicianSkill.findUniqueOrThrow({
            where: {
              technicianId_skillId: {
                technicianId: tech.id,
                skillId: skill.id,
              },
            },
          })
        ).level,
      ).toBe(5);
    },
  );
  it.each(['production', 'staging'])(
    'refuses %s before any API call or write',
    async (env) => {
      await expect(seedDemo(db, refs, manager, userId, env)).rejects.toThrow(
        'forbidden',
      );
      expect(refs.user).not.toHaveBeenCalled();
      expect(await db.technician.count()).toBe(0);
    },
  );
  it.each(['tenant', 'permission', 'accountType'])(
    'rejects invalid manager %s before reading references',
    async (key) => {
      const p = { ...manager };
      if (key === 'tenant') p.tenantId = randomUUID();
      if (key === 'permission') p.permissions = new Set();
      if (key === 'accountType') p.userType = 'CUSTOMER';
      await expect(seedDemo(db, refs, p, userId, 'test')).rejects.toThrow(
        'DEMO staff',
      );
      expect(refs.user).not.toHaveBeenCalled();
      expect(await db.technician.count()).toBe(0);
    },
  );
  it.each([
    'missingUser',
    'wrongTenant',
    'wrongRole',
    'inactiveUser',
    'missingBranch',
    'inactiveBranch',
    'upstreamFailure',
  ])('does not seed when reference validation fails: %s', async (key) => {
    if (key === 'missingUser') refs.user.mockResolvedValue(null);
    if (key === 'wrongTenant')
      refs.user.mockResolvedValue({
        id: userId,
        tenantId: randomUUID(),
        userType: 'TENANT_STAFF',
        roles: ['TECHNICIAN'],
        status: 'ACTIVE',
      });
    if (key === 'wrongRole')
      refs.user.mockResolvedValue({
        id: userId,
        tenantId: DEMO_WO.tenantId,
        userType: 'TENANT_STAFF',
        roles: ['DISPATCHER'],
        status: 'ACTIVE',
      });
    if (key === 'inactiveUser')
      refs.user.mockResolvedValue({
        id: userId,
        tenantId: DEMO_WO.tenantId,
        userType: 'TENANT_STAFF',
        roles: ['TECHNICIAN'],
        status: 'INACTIVE',
      });
    if (key === 'missingBranch') refs.branch.mockResolvedValue(null);
    if (key === 'inactiveBranch')
      refs.branch.mockResolvedValue({
        id: DEMO_WO.branchId,
        status: 'INACTIVE',
      });
    if (key === 'upstreamFailure')
      refs.user.mockRejectedValue(new Error('Identity unavailable'));
    await expect(run()).rejects.toThrow();
    expect(await db.technician.count()).toBe(0);
    expect(await db.skill.count()).toBe(0);
  });
  it('does not take over a reserved Technician ID or employee code', async () => {
    const row = await db.technician.create({
      data: {
        id: DEMO_WO.technicianId,
        tenantId: randomUUID(),
        userId: randomUUID(),
        branchId: randomUUID(),
        employeeCode: 'OTHER',
      },
    });
    await expect(run()).rejects.toThrow('Reserved Technician');
    expect(
      await db.technician.findUniqueOrThrow({ where: { id: row.id } }),
    ).toEqual(row);
    await db.technician.delete({ where: { id: row.id } });
    await db.technician.create({
      data: {
        tenantId: DEMO_WO.tenantId,
        userId: randomUUID(),
        branchId: DEMO_WO.branchId,
        employeeCode: DEMO_WO.employeeCode,
      },
    });
    await expect(run()).rejects.toThrow('employee code');
    expect(await db.technician.count()).toBe(1);
  });
  it('rolls back all newly seeded rows if a later reserved Skill ID conflicts', async () => {
    const row = await db.skill.create({
      data: {
        id: DEMO_WO.skills[1].id,
        tenantId: randomUUID(),
        code: 'FOREIGN',
        name: 'Foreign skill',
      },
    });
    await expect(run()).rejects.toThrow('Reserved Skill');
    expect(await db.technician.count()).toBe(0);
    expect(await db.technicianSkill.count()).toBe(0);
    expect(await db.skill.findMany()).toEqual([row]);
  });
});
