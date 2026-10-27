import { randomUUID } from 'node:crypto';
import { config as loadEnv } from 'dotenv';
import { requireTestDatabaseUrl } from '@pbl6/testing';
import { createPrismaAdapter } from '@pbl6/service-kit/prisma';
import { PrismaClient } from '../src/generated/prisma/client.js';

loadEnv({ path: '../../.env', quiet: true });
const databaseUrl = requireTestDatabaseUrl('MAINTENANCE_TEST_DATABASE_URL');
const prisma = new PrismaClient({ adapter: createPrismaAdapter(databaseUrl) });

beforeAll(async () => prisma.$connect());
afterAll(async () => prisma.$disconnect());

it('stores the Asset customer snapshot and permits an absent site', async () => {
  const tenantId = randomUUID();
  const customerId = randomUUID();
  const plan = await prisma.maintenancePlan.create({
    data: {
      tenantId,
      equipmentId: randomUUID(),
      customerId,
      customerSiteId: null,
      name: 'Snapshot migration check',
      frequencyUnit: 'MONTH',
      frequencyValue: 1,
      nextDueDate: new Date('2026-11-01T00:00:00.000Z'),
      anchorDate: new Date('2026-11-01T00:00:00.000Z'),
    },
  });
  try {
    expect(
      await prisma.maintenancePlan.findUniqueOrThrow({
        where: { id: plan.id },
      }),
    ).toMatchObject({ tenantId, customerId, customerSiteId: null });
  } finally {
    await prisma.maintenancePlan.delete({ where: { id: plan.id } });
  }
});

it('rejects a plan without the required customer snapshot at the DB boundary', async () => {
  const tenantId = randomUUID();
  const equipmentId = randomUUID();
  await expect(prisma.$executeRaw`
    INSERT INTO maintenance_plans
      (tenant_id, equipment_id, name, frequency_unit, frequency_value, next_due_date)
    VALUES (${tenantId}::uuid, ${equipmentId}::uuid, 'missing customer', 'MONTH', 1, DATE '2026-11-01')
  `).rejects.toThrow();
  expect(await prisma.maintenancePlan.count({ where: { tenantId } })).toBe(0);
});
