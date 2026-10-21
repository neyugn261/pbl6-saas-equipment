import bcrypt from 'bcryptjs';
import type { PrismaClient } from '../../src/generated/prisma/client.js';

/**
 * DEVELOPMENT-ONLY demo data. The demo tenant and the customer links are
 * written straight into the read models (tenant_directory,
 * user_customer_links); once Organization Service publishes its events these
 * rows come from there.
 */
export const DEMO_TENANT = {
  tenantId: '00000000-0000-4000-8000-000000000001',
  code: 'DEMO',
};

/**
 * Demo customer of the DEMO tenant (docs/api/fixtures.md). Organization's dev
 * seed creates the customer and memberships with these ids; until its events
 * arrive, the links are written here so customer accounts get `customer_id`.
 */
export const DEMO_CUSTOMER_ID = '00000000-0000-4000-8000-000000000101';
const DEMO_MEMBERSHIPS: Record<string, string> = {
  'customer.admin@demo.local': '00000000-0000-4000-8000-000000000201',
  'customer.user@demo.local': '00000000-0000-4000-8000-000000000202',
};
// Epoch: any real CustomerMembershipChanged event is newer and wins.
const SEED_CHANGED_AT = new Date(0);

interface DemoUser {
  email: string;
  fullName: string;
  userType: 'PLATFORM_STAFF' | 'TENANT_STAFF' | 'CUSTOMER';
  role: string;
  status: 'ACTIVE' | 'INVITED';
}

const DEMO_USERS: DemoUser[] = [
  {
    email: 'platform.admin@pbl6.local',
    fullName: 'Platform Admin',
    userType: 'PLATFORM_STAFF',
    role: 'PLATFORM_ADMIN',
    status: 'ACTIVE',
  },
  {
    email: 'tenant.admin@demo.local',
    fullName: 'Demo Tenant Admin',
    userType: 'TENANT_STAFF',
    role: 'TENANT_ADMIN',
    status: 'ACTIVE',
  },
  {
    email: 'service.manager@demo.local',
    fullName: 'Demo Service Manager',
    userType: 'TENANT_STAFF',
    role: 'SERVICE_MANAGER',
    status: 'ACTIVE',
  },
  {
    email: 'dispatcher@demo.local',
    fullName: 'Demo Dispatcher',
    userType: 'TENANT_STAFF',
    role: 'DISPATCHER',
    status: 'ACTIVE',
  },
  {
    email: 'inventory@demo.local',
    fullName: 'Demo Inventory Staff',
    userType: 'TENANT_STAFF',
    role: 'INVENTORY_STAFF',
    status: 'ACTIVE',
  },
  {
    email: 'technician@demo.local',
    fullName: 'Demo Technician',
    userType: 'TENANT_STAFF',
    role: 'TECHNICIAN',
    status: 'ACTIVE',
  },
  {
    email: 'customer.admin@demo.local',
    fullName: 'Demo Customer Admin',
    userType: 'CUSTOMER',
    role: 'CUSTOMER_ADMIN',
    status: 'ACTIVE',
  },
  {
    email: 'customer.user@demo.local',
    fullName: 'Demo Customer User',
    userType: 'CUSTOMER',
    role: 'CUSTOMER_USER',
    status: 'ACTIVE',
  },
  // Invited account without a password: must not be able to log in.
  {
    email: 'invited@demo.local',
    fullName: 'Demo Invited User',
    userType: 'TENANT_STAFF',
    role: 'TECHNICIAN',
    status: 'INVITED',
  },
];

export async function seedDevData(
  prisma: PrismaClient,
  password: string,
): Promise<void> {
  const passwordHash = await bcrypt.hash(password, 12);

  await prisma.tenantDirectory.upsert({
    where: { tenantId: DEMO_TENANT.tenantId },
    create: { ...DEMO_TENANT, status: 'ACTIVE' },
    update: { code: DEMO_TENANT.code, status: 'ACTIVE', syncedAt: new Date() },
  });

  const roles = await prisma.role.findMany({
    select: { id: true, code: true },
  });
  const roleIds = new Map(roles.map((role) => [role.code, role.id]));

  for (const demo of DEMO_USERS) {
    const tenantId =
      demo.userType === 'PLATFORM_STAFF' ? null : DEMO_TENANT.tenantId;
    const existing = await prisma.user.findFirst({
      where: { tenantId, email: demo.email },
    });
    const data = {
      fullName: demo.fullName,
      status: demo.status,
      passwordHash: demo.status === 'ACTIVE' ? passwordHash : null,
    };
    const user = existing
      ? await prisma.user.update({ where: { id: existing.id }, data })
      : await prisma.user.create({
          data: {
            ...data,
            tenantId,
            userType: demo.userType,
            email: demo.email,
          },
        });
    await prisma.userRole.upsert({
      where: {
        userId_roleId: { userId: user.id, roleId: roleIds.get(demo.role)! },
      },
      create: { userId: user.id, roleId: roleIds.get(demo.role)! },
      update: {},
    });
    const membershipId = DEMO_MEMBERSHIPS[demo.email];
    if (membershipId) {
      await prisma.userCustomerLink.upsert({
        where: { userId: user.id },
        create: {
          userId: user.id,
          tenantId: DEMO_TENANT.tenantId,
          customerId: DEMO_CUSTOMER_ID,
          membershipId,
          status: 'ACTIVE',
          sourceChangedAt: SEED_CHANGED_AT,
        },
        // Never overwrite a link that came from a real Organization event.
        update: {},
      });
    }
  }
}
