import { config as loadEnv } from 'dotenv';
import { PrismaClient } from '../dist/generated/prisma/client.js';
import { createPrismaAdapter } from '@pbl6/service-kit/prisma';

loadEnv({ path: '.env', quiet: true });
loadEnv({ path: '../../.env', quiet: true });

if (process.env.NODE_ENV === 'production') {
  throw new Error('Asset demo seed is disabled in production');
}
if (!process.env.ASSET_DATABASE_URL) {
  throw new Error('ASSET_DATABASE_URL is required');
}

const id = (suffix) => `00000000-0000-4000-8000-${suffix.padStart(12, '0')}`;
const tenantId = id('1');
const customerA = id('101');
const customerB = id('102');
const siteA = id('401');
const siteB = id('403');
const prisma = new PrismaClient({ adapter: createPrismaAdapter(process.env.ASSET_DATABASE_URL) });
const date = (value) => new Date(`${value}T00:00:00.000Z`);

const models = [
  { id: id('1001'), manufacturer: 'Demo Medical', modelCode: 'US-100', name: 'Máy siêu âm Demo' },
  { id: id('1002'), manufacturer: 'Demo Industrial', modelCode: 'PUMP-200', name: 'Máy bơm Demo' },
];
const equipment = [
  { id: id('1101'), modelId: id('1001'), customerId: customerA, customerSiteId: siteA,
    locationId: id('503'), assetCode: 'DEMO-ASSET-01', serialNumber: 'US-100-001' },
  { id: id('1102'), modelId: id('1001'), customerId: customerA, customerSiteId: siteA,
    locationId: null, assetCode: 'DEMO-ASSET-02', serialNumber: 'US-100-002' },
  { id: id('1103'), modelId: id('1002'), customerId: customerB, customerSiteId: siteB,
    locationId: id('504'), assetCode: 'DEMO-ASSET-03', serialNumber: 'PUMP-200-001' },
];
const warranties = [
  { id: id('1201'), equipmentId: id('1101'), startDate: date('2020-01-01'),
    endDate: date('2099-12-31'), warrantyType: 'STANDARD' },
  { id: id('1202'), equipmentId: id('1102'), startDate: date('2020-01-01'),
    endDate: date('2021-12-31'), warrantyType: 'STANDARD' },
];

try {
  await prisma.$transaction(async (tx) => {
    for (const model of models) {
      await tx.equipmentModel.upsert({ where: { id: model.id }, create: { ...model, tenantId }, update: {} });
    }
    for (const row of equipment) {
      await tx.equipment.upsert({ where: { id: row.id }, create: { ...row, tenantId }, update: {} });
      await tx.equipmentHistory.upsert({ where: { id: id(`130${row.id.slice(-1)}`) },
        create: { id: id(`130${row.id.slice(-1)}`), tenantId, equipmentId: row.id, eventType: 'REGISTERED' },
        update: {} });
    }
    for (const warranty of warranties) {
      await tx.warranty.upsert({ where: { id: warranty.id },
        create: { ...warranty, tenantId }, update: {} });
    }
  });
  process.stdout.write('Asset demo seed: 2 models, 3 equipment, 2 warranties.\n');
} finally {
  await prisma.$disconnect();
}
