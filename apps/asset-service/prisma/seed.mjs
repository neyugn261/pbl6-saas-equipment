import { config as loadEnv } from 'dotenv';
import { PrismaClient } from '../dist/generated/prisma/client.js';
import { createPrismaAdapter } from '@pbl6/service-kit/prisma';
import catalog from '../../../scripts/demo/catalog.cjs';

loadEnv({ path: '.env', quiet: true });
loadEnv({ path: '../../.env', quiet: true });
if (process.env.NODE_ENV === 'production')
  throw new Error('Asset demo seed is disabled in production');
if (!process.env.ASSET_DATABASE_URL)
  throw new Error('ASSET_DATABASE_URL is required');
const { id, tenant, dateOffset } = catalog;
const today =
  process.env.DEMO_SEED_DATE ||
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(
    new Date(),
  );
const day = (offset) => new Date(dateOffset(today, offset) + 'T00:00:00Z');
const prisma = new PrismaClient({
  adapter: createPrismaAdapter(process.env.ASSET_DATABASE_URL),
});
try {
  await prisma.$transaction(async (tx) => {
    for (const row of catalog.models)
      await tx.equipmentModel.upsert({
        where: { id: row.id },
        create: { ...row, tenantId: tenant.id },
        update: {},
      });
    for (const [i, { warranty, ...row }] of catalog.equipment.entries()) {
      await tx.equipment.upsert({
        where: { id: row.id },
        create: {
          ...row,
          tenantId: tenant.id,
          handoverDate: day(warranty === 'EXPIRED' ? -400 : -30),
          installationDate: day(-30),
        },
        update: {},
      });
      await tx.equipmentHistory.upsert({
        where: { id: id(1301 + i) },
        create: {
          id: id(1301 + i),
          tenantId: tenant.id,
          equipmentId: row.id,
          eventType: 'REGISTERED',
          description: 'Thiết bị bàn giao trong bộ demo hai chi nhánh',
        },
        update: {},
      });
      if (warranty !== 'NONE')
        await tx.warranty.upsert({
          where: { id: id(1201 + i) },
          create: {
            id: id(1201 + i),
            tenantId: tenant.id,
            equipmentId: row.id,
            startDate: day(warranty === 'EXPIRED' ? -400 : -30),
            endDate: day(warranty === 'EXPIRED' ? -30 : 335),
            warrantyType: 'STANDARD',
            terms:
              'Bảo hành lỗi kỹ thuật do nhà sản xuất; không bao gồm hư hỏng do sử dụng sai.',
          },
          update: {},
        });
    }
  });
  console.log(
    'Asset demo seed: 2 models, 6 equipment, 5 warranties; existing dates and progress preserved.',
  );
} finally {
  await prisma.$disconnect();
}
