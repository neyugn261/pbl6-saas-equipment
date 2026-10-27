// Idempotent development fixture. It validates Asset via the real authenticated
// API and writes only Maintenance's database through its repository.
const assert = require('node:assert/strict');
require('dotenv').config({ path: '../../.env', quiet: true });
const { NestFactory } = require('@nestjs/core');
const { AccessTokenVerifier } = require('@pbl6/auth');
assert.ok(
  ['development', 'test'].includes(process.env.NODE_ENV ?? 'development'),
  'Development seed is forbidden in production',
);
process.env.RABBITMQ_URL = '';
process.env.MAINTENANCE_SCHEDULER_ENABLED = 'false';
const { AppModule } = require('../dist/app.module');
const { PlansRepository } = require('../dist/plans/plans.repository');
const { PrismaService } = require('../dist/prisma/prisma.service');
const { ASSET_CLIENT } = require('../dist/asset/asset.client');
const { vietnamToday } = require('../dist/common/calendar');
const planId = '00000000-0000-4000-8000-000000003001';
async function main() {
  let token = process.env.MAINTENANCE_SEED_ACCESS_TOKEN;
  if (!token) {
    assert.ok(
      process.env.IDENTITY_SERVICE_URL && process.env.SEED_DEMO_PASSWORD,
      'Identity URL and demo password are required',
    );
    const response = await fetch(
      process.env.IDENTITY_SERVICE_URL.replace(/\/$/, '') + '/auth/login',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          tenantCode: 'DEMO',
          email: 'service.manager@demo.local',
          password: process.env.SEED_DEMO_PASSWORD,
        }),
      },
    );
    assert.equal(response.status, 200, 'Demo manager login failed');
    token = (await response.json()).accessToken;
  }
  const principal = new AccessTokenVerifier({
    secret: process.env.JWT_ACCESS_SECRET,
    issuer: process.env.JWT_ISSUER ?? 'pbl6-identity',
    audience: process.env.JWT_AUDIENCE ?? 'pbl6',
  }).verify(token);
  assert.ok(
    principal.tenantId &&
      principal.userType === 'TENANT_STAFF' &&
      principal.permissions.has('maintenance:manage'),
    'Seed requires a Maintenance manager',
  );
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    const db = app.get(PrismaService),
      existing = await db.maintenancePlan.findUnique({ where: { id: planId } });
    if (existing) {
      assert.equal(
        existing.tenantId,
        principal.tenantId,
        'Fixed fixture ID already belongs to another tenant',
      );
      console.log(
        'Maintenance demo Plan already exists; schedule and Tasks preserved',
      );
      return;
    }
    const equipmentId =
      process.env.MAINTENANCE_SEED_EQUIPMENT_ID ??
      '00000000-0000-4000-8000-000000001101';
    const equipment = await app
      .get(ASSET_CLIENT)
      .equipment(equipmentId, principal);
    assert.ok(
      equipment &&
        equipment.id.toLowerCase() === equipmentId.toLowerCase() &&
        equipment.status !== 'RETIRED',
      'Seed Equipment is missing or retired',
    );
    assert.ok(
      equipment.customerId &&
        Number.isSafeInteger(equipment.snapshotVersion) &&
        equipment.snapshotVersion >= 0,
      'Asset snapshot is invalid',
    );
    await app
      .get(PlansRepository)
      .create(
        principal.tenantId,
        {
          equipmentId,
          name: 'DEMO-MAINTENANCE-01: monthly inspection',
          frequencyUnit: 'MONTH',
          frequencyValue: 1,
          nextDueDate: vietnamToday(),
        },
        equipment,
        planId,
      );
    console.log(
      'Seeded Maintenance Plan ' +
        planId +
        '; first due date is today in Vietnam',
    );
  } finally {
    await app.close();
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
