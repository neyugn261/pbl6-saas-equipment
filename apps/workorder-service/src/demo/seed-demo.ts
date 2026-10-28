import assert from 'node:assert/strict';
import type { Principal } from '@pbl6/auth';
import type { PrismaClient } from '../generated/prisma/client.js';
import type { ReferencesClient } from '../references/references.client';
import { sameUuid } from '../common/uuid';

export const DEMO_WO = {
  tenantId: '00000000-0000-4000-8000-000000000001',
  branchId: '00000000-0000-4000-8000-000000000301',
  technicianId: '00000000-0000-4000-8000-000000004001',
  employeeCode: 'DEMO-TECH-01',
  skills: [
    {
      id: '00000000-0000-4000-8000-000000004101',
      code: 'DEMO-DIAGNOSTICS',
      name: 'Chẩn đoán thiết bị',
    },
    {
      id: '00000000-0000-4000-8000-000000004102',
      code: 'DEMO-MAINTENANCE',
      name: 'Bảo trì thiết bị',
    },
  ],
} as const;

/** Development-only fixtures: references use authenticated APIs; writes stay in WO DB. */
export async function seedDemo(
  db: PrismaClient,
  refs: ReferencesClient,
  manager: Principal,
  technicianUserId: string,
  nodeEnv: string,
) {
  assert.ok(
    ['development', 'test'].includes(nodeEnv),
    'Demo seed is forbidden outside development/test',
  );
  assert.ok(
    sameUuid(manager.tenantId, DEMO_WO.tenantId) &&
      manager.userType === 'TENANT_STAFF' &&
      manager.permissions.has('technician:manage'),
    'Seed requires a DEMO staff account with technician:manage',
  );
  const [user, branch] = await Promise.all([
    refs.user(technicianUserId, manager.accessToken),
    refs.branch(DEMO_WO.branchId, manager.accessToken),
  ]);
  assert.ok(
    user &&
      sameUuid(user.id, technicianUserId) &&
      sameUuid(user.tenantId, DEMO_WO.tenantId) &&
      user.userType === 'TENANT_STAFF' &&
      user.roles.includes('TECHNICIAN') &&
      user.status === 'ACTIVE',
    'Seed requires the active DEMO Technician from Identity',
  );
  assert.ok(
    branch &&
      sameUuid(branch.id, DEMO_WO.branchId) &&
      branch.status === 'ACTIVE',
    'Seed requires the active DEMO HCM branch from Organization',
  );

  return db.$transaction(async (tx) => {
    const key = 'workorder-demo-seed:' + DEMO_WO.tenantId;
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`;
    const fixed = await tx.technician.findUnique({
      where: { id: DEMO_WO.technicianId },
    });
    if (fixed)
      assert.ok(
        sameUuid(fixed.tenantId, DEMO_WO.tenantId) &&
          sameUuid(fixed.userId, technicianUserId),
        'Reserved Technician ID is already in use',
      );
    const byUser = await tx.technician.findUnique({
      where: {
        tenantId_userId: {
          tenantId: DEMO_WO.tenantId,
          userId: technicianUserId,
        },
      },
    });
    const byCode = await tx.technician.findUnique({
      where: {
        tenantId_employeeCode: {
          tenantId: DEMO_WO.tenantId,
          employeeCode: DEMO_WO.employeeCode,
        },
      },
    });
    if (byCode)
      assert.ok(
        sameUuid(byCode.userId, technicianUserId),
        'Demo employee code belongs to another user',
      );
    // Adopt a profile already created by UI/smoke; never rebind it or reset status/branch/code.
    const technician =
      byUser ??
      (await tx.technician.create({
        data: {
          id: DEMO_WO.technicianId,
          tenantId: DEMO_WO.tenantId,
          userId: technicianUserId,
          branchId: DEMO_WO.branchId,
          employeeCode: DEMO_WO.employeeCode,
        },
      }));
    await tx.$queryRaw`SELECT id FROM technicians WHERE id = ${technician.id}::uuid FOR UPDATE`;
    const skillIds: string[] = [];
    for (const fixture of DEMO_WO.skills) {
      const reserved = await tx.skill.findUnique({ where: { id: fixture.id } });
      if (reserved)
        assert.ok(
          sameUuid(reserved.tenantId, DEMO_WO.tenantId) &&
            reserved.code === fixture.code,
          'Reserved Skill ID is already in use',
        );
      const skill =
        (await tx.skill.findUnique({
          where: {
            tenantId_code: { tenantId: DEMO_WO.tenantId, code: fixture.code },
          },
        })) ??
        (await tx.skill.create({
          data: { ...fixture, tenantId: DEMO_WO.tenantId },
        }));
      await tx.technicianSkill.upsert({
        where: {
          technicianId_skillId: {
            technicianId: technician.id,
            skillId: skill.id,
          },
        },
        create: {
          tenantId: DEMO_WO.tenantId,
          technicianId: technician.id,
          skillId: skill.id,
          level: 3,
        },
        update: {},
      });
      skillIds.push(skill.id);
    }
    return {
      technicianId: technician.id,
      employeeCode: technician.employeeCode,
      skillIds,
    };
  });
}
