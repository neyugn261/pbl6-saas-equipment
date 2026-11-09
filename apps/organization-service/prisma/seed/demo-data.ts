import { enqueueEvent, Events } from '@pbl6/event-contracts';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { enqueueMembershipChanged } from '../../src/memberships/membership-events';
import { enqueueSiteRouting } from '../../src/sites/site-routing';

type DemoUser = {
  email: string;
  branchId: string | null;
  customerId: string | null;
  membershipId: string | null;
};
const catalog = require('../../../../scripts/demo/catalog.cjs');
export const DEMO_TENANT: { id: string; code: string; name: string } =
  catalog.tenant;
export const DEMO_MEMBERSHIPS = (catalog.users as DemoUser[])
  .filter((u) => u.customerId)
  .map((u) => ({
    id: u.membershipId!,
    email: u.email,
    customerId: u.customerId!,
  }));
export const DEMO_BRANCH_STAFF = (catalog.users as DemoUser[])
  .filter((u) => u.branchId)
  .map((u) => ({ email: u.email, branchId: u.branchId! }));
export const DEMO_EMAILS = [...DEMO_MEMBERSHIPS, ...DEMO_BRANCH_STAFF].map(
  (u) => u.email,
);
export interface SeedSummary {
  memberships: number;
  branchStaff: number;
}

/** Own DB only. Preserve operator changes; reset is an explicit root command. */
export async function seedDemoData(
  prisma: PrismaClient,
  userIds: Map<string, string>,
): Promise<SeedSummary> {
  const tenantId = DEMO_TENANT.id;
  await prisma.$transaction(async (tx) => {
    const existing = await tx.tenant.findUnique({ where: { id: tenantId } });
    if (existing) return;
    await tx.tenant.create({ data: DEMO_TENANT });
    await enqueueEvent(tx, Events.TenantCreated, {
      tenantId,
      aggregateId: tenantId,
      payload: {
        tenantId,
        code: DEMO_TENANT.code,
        name: DEMO_TENANT.name,
        status: 'ACTIVE',
      },
    });
  });
  for (const branch of catalog.branches)
    await prisma.branch.upsert({
      where: { id: branch.id },
      create: { ...branch, tenantId },
      update: {},
    });
  for (const customer of catalog.customers)
    await prisma.customer.upsert({
      where: { id: customer.id },
      create: { ...customer, tenantId },
      update: {},
    });
  for (const site of catalog.sites)
    await prisma.$transaction(async (tx) => {
      const existing = await tx.customerSite.findUnique({
        where: { id: site.id },
      });
      if (existing?.routingVersion) return;
      const changed = existing
        ? await tx.customerSite.update({
            where: { id: site.id },
            data: { routingVersion: 1 },
          })
        : await tx.customerSite.create({
            data: { ...site, tenantId, routingVersion: 1 },
          });
      await enqueueSiteRouting(tx, changed);
    });
  for (const location of catalog.locations)
    await prisma.location.upsert({
      where: { id: location.id },
      create: { ...location, tenantId },
      update: {},
    });
  for (const contact of catalog.contacts)
    await prisma.customerContact.upsert({
      where: { id: contact.id },
      create: { ...contact, tenantId },
      update: {},
    });
  let memberships = 0,
    branchStaff = 0;
  for (const fixture of DEMO_MEMBERSHIPS) {
    const userId = userIds.get(fixture.email);
    if (!userId) continue;
    await prisma.$transaction(async (tx) => {
      if (await tx.customerUserMembership.findUnique({ where: { userId } }))
        return;
      const row = await tx.customerUserMembership.create({
        data: {
          id: fixture.id,
          tenantId,
          userId,
          customerId: fixture.customerId,
        },
      });
      await enqueueMembershipChanged(tx, row);
    });
    memberships++;
  }
  for (const fixture of DEMO_BRANCH_STAFF) {
    const userId = userIds.get(fixture.email);
    if (!userId) continue;
    if (
      !(await prisma.branchUserAssignment.findFirst({
        where: { tenantId, userId, isPrimary: true },
      }))
    )
      await prisma.branchUserAssignment.upsert({
        where: { branchId_userId: { branchId: fixture.branchId, userId } },
        create: {
          tenantId,
          branchId: fixture.branchId,
          userId,
          isPrimary: true,
        },
        update: { isPrimary: true },
      });
    branchStaff++;
  }
  return { memberships, branchStaff };
}
