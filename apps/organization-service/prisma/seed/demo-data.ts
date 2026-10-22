import { enqueueEvent, Events } from '@pbl6/event-contracts';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { enqueueMembershipChanged } from '../../src/memberships/membership-events';

/**
 * DEVELOPMENT-ONLY demo data with the fixed ids of docs/api/fixtures.md, so
 * the seeds of other services (Identity, Asset, Service Request) fit
 * together. Idempotent: rows are upserted by id, and an event is written only
 * when its row is created, as the API would do.
 */
const id = (suffix: string) => `00000000-0000-4000-8000-${suffix.padStart(12, '0')}`;

export const DEMO_TENANT = { id: id('1'), code: 'DEMO', name: 'Demo Equipment Co.' };

const BRANCHES = [
  { id: id('301'), code: 'HCM', name: 'Chi nhánh Hồ Chí Minh', address: '12 Nguyễn Huệ, Quận 1, TP.HCM', phone: '028 3822 0001' },
  { id: id('302'), code: 'DN', name: 'Chi nhánh Đà Nẵng', address: '45 Bạch Đằng, Hải Châu, Đà Nẵng', phone: '0236 382 0002' },
];

const CUSTOMERS = [
  { id: id('101'), code: 'DEMO-CUST-01', name: 'Bệnh viện Đa khoa Demo', taxCode: '0301234567', email: 'contact@hospital.demo.local', address: '201 Nguyễn Chí Thanh, Quận 5, TP.HCM' },
  { id: id('102'), code: 'DEMO-CUST-02', name: 'Nhà máy Cơ khí Demo', taxCode: '0401234567', email: 'contact@factory.demo.local', address: 'KCN Hòa Khánh, Đà Nẵng' },
];

const SITES = [
  { id: id('401'), customerId: id('101'), code: 'DEMO-SITE-01', name: 'Cơ sở chính', address: '201 Nguyễn Chí Thanh, Quận 5, TP.HCM', latitude: 10.756, longitude: 106.6629, defaultServicingBranchId: id('301') },
  { id: id('402'), customerId: id('101'), code: 'DEMO-SITE-02', name: 'Cơ sở 2', address: '15 Lý Thường Kiệt, Quận 10, TP.HCM', latitude: null, longitude: null, defaultServicingBranchId: id('301') },
  { id: id('403'), customerId: id('102'), code: 'DEMO-SITE-03', name: 'Xưởng 1', address: 'Lô A5, KCN Hòa Khánh, Đà Nẵng', latitude: null, longitude: null, defaultServicingBranchId: id('302') },
];

/** Parents are listed before their children. */
const LOCATIONS = [
  { id: id('501'), customerSiteId: id('401'), parentId: null, code: 'A', name: 'Tòa A', type: 'BUILDING' },
  { id: id('502'), customerSiteId: id('401'), parentId: id('501'), code: 'A-3', name: 'Tầng 3', type: 'FLOOR' },
  { id: id('503'), customerSiteId: id('401'), parentId: id('502'), code: 'A-301', name: 'Phòng chẩn đoán hình ảnh', type: 'ROOM' },
  { id: id('504'), customerSiteId: id('403'), parentId: null, code: 'X1', name: 'Khu gia công', type: 'AREA' },
];

const CONTACTS = [
  { id: id('601'), customerId: id('101'), customerSiteId: id('401'), name: 'Nguyễn Văn An', email: 'an.nguyen@hospital.demo.local', phone: '0901 000 001', position: 'Trưởng phòng Vật tư', isPrimary: true },
  { id: id('602'), customerId: id('102'), customerSiteId: null, name: 'Trần Thị Bình', email: 'binh.tran@factory.demo.local', phone: '0901 000 002', position: 'Quản đốc', isPrimary: true },
];

/** Customer accounts of Identity's dev seed and their fixed membership ids. */
export const DEMO_MEMBERSHIPS = [
  { id: id('201'), email: 'customer.admin@demo.local', customerId: id('101') },
  { id: id('202'), email: 'customer.user@demo.local', customerId: id('101') },
];

/** Staff accounts of Identity's dev seed and their branch. */
export const DEMO_BRANCH_STAFF = [
  { email: 'service.manager@demo.local', branchId: id('301') },
  { email: 'dispatcher@demo.local', branchId: id('301') },
  { email: 'technician@demo.local', branchId: id('301') },
  { email: 'inventory@demo.local', branchId: id('301') },
];

export const DEMO_EMAILS = [
  ...DEMO_MEMBERSHIPS.map((m) => m.email),
  ...DEMO_BRANCH_STAFF.map((s) => s.email),
];

export interface SeedSummary {
  memberships: number;
  branchStaff: number;
}

export async function seedDemoData(
  prisma: PrismaClient,
  userIds: Map<string, string>,
): Promise<SeedSummary> {
  const tenantId = DEMO_TENANT.id;

  await prisma.$transaction(async (tx) => {
    const tenantExists = await tx.tenant.count({ where: { id: tenantId } });
    await tx.tenant.upsert({
      where: { id: tenantId },
      create: DEMO_TENANT,
      update: { name: DEMO_TENANT.name, status: 'ACTIVE', deletedAt: null },
    });
    if (!tenantExists) {
      await enqueueEvent(tx, Events.TenantCreated, {
        tenantId,
        aggregateId: tenantId,
        payload: { tenantId, code: DEMO_TENANT.code, name: DEMO_TENANT.name, status: 'ACTIVE' },
      });
    }
  });

  for (const branch of BRANCHES) {
    await prisma.branch.upsert({
      where: { id: branch.id },
      create: { ...branch, tenantId },
      update: { ...branch, deletedAt: null },
    });
  }
  for (const customer of CUSTOMERS) {
    await prisma.customer.upsert({
      where: { id: customer.id },
      create: { ...customer, tenantId },
      update: { ...customer, deletedAt: null },
    });
  }
  for (const site of SITES) {
    await prisma.customerSite.upsert({
      where: { id: site.id },
      create: { ...site, tenantId },
      update: { ...site, deletedAt: null },
    });
  }
  for (const location of LOCATIONS) {
    await prisma.location.upsert({
      where: { id: location.id },
      create: { ...location, tenantId },
      update: { ...location, deletedAt: null },
    });
  }
  for (const contact of CONTACTS) {
    await prisma.customerContact.upsert({
      where: { id: contact.id },
      create: { ...contact, tenantId },
      update: { ...contact, deletedAt: null },
    });
  }

  let memberships = 0;
  for (const membership of DEMO_MEMBERSHIPS) {
    const userId = userIds.get(membership.email);
    if (!userId) continue;
    await prisma.$transaction(async (tx) => {
      const existing = await tx.customerUserMembership.findUnique({ where: { userId } });
      if (existing) return;
      const created = await tx.customerUserMembership.create({
        data: { id: membership.id, tenantId, customerId: membership.customerId, userId },
      });
      await enqueueMembershipChanged(tx, created);
    });
    memberships += 1;
  }

  let branchStaff = 0;
  for (const staff of DEMO_BRANCH_STAFF) {
    const userId = userIds.get(staff.email);
    if (!userId) continue;
    await prisma.branchUserAssignment.upsert({
      where: { branchId_userId: { branchId: staff.branchId, userId } },
      create: { tenantId, branchId: staff.branchId, userId, isPrimary: true },
      update: {},
    });
    branchStaff += 1;
  }
  return { memberships, branchStaff };
}
