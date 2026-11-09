import bcrypt from 'bcryptjs';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { enqueueRecipientSnapshot } from '../../src/events/recipient-snapshots';

interface DemoUser {
  email: string;
  fullName: string;
  role: string;
  userType: 'PLATFORM_STAFF' | 'TENANT_STAFF' | 'CUSTOMER';
  customerId: string | null;
  membershipId: string | null;
}
const catalog = require('../../../../scripts/demo/catalog.cjs') as {
  tenant: { id: string; code: string };
  users: DemoUser[];
};
export const DEMO_TENANT = {
  tenantId: catalog.tenant.id,
  code: catalog.tenant.code,
};
export const DEMO_CUSTOMER_ID = '00000000-0000-4000-8000-000000000101';

/** Identity owns users/roles and its projections; business links arrive from Organization events. */
export async function seedDevData(
  prisma: PrismaClient,
  password: string,
): Promise<void> {
  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.tenantDirectory.upsert({
    where: { tenantId: DEMO_TENANT.tenantId },
    create: { ...DEMO_TENANT, status: 'ACTIVE' },
    update: {},
  });
  const roles = new Map(
    (await prisma.role.findMany()).map((role) => [role.code, role.id]),
  );
  for (const demo of catalog.users) {
    const tenantId =
      demo.userType === 'PLATFORM_STAFF' ? null : DEMO_TENANT.tenantId;
    await prisma.$transaction(async (tx) => {
      const existing = await tx.user.findFirst({
        where: { tenantId, email: demo.email },
      });
      const user =
        existing ??
        (await tx.user.create({
          data: {
            tenantId,
            email: demo.email,
            fullName: demo.fullName,
            userType: demo.userType,
            status: 'ACTIVE',
            passwordHash,
          },
        }));
      const roleId = roles.get(demo.role);
      if (!roleId)
        throw new Error(`Seed the permission catalogue first: ${demo.role}`);
      if (!existing)
        await tx.userRole.create({ data: { userId: user.id, roleId } });
      if (demo.customerId && demo.membershipId)
        await tx.userCustomerLink.upsert({
          where: { userId: user.id },
          create: {
            userId: user.id,
            tenantId: DEMO_TENANT.tenantId,
            customerId: demo.customerId,
            membershipId: demo.membershipId,
            status: 'ACTIVE',
            sourceChangedAt: new Date(0),
          },
          update: {},
        });
      if (!existing) await enqueueRecipientSnapshot(tx, user.id);
    });
  }
}
