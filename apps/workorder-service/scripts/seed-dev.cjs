const assert = require('node:assert/strict');
const { environment, login } = require('./demo-common.cjs');
const catalog = require('../../../scripts/demo/catalog.cjs');
async function main() {
  environment();
  assert.ok(
    process.env.IDENTITY_SERVICE_URL,
    'IDENTITY_SERVICE_URL is required',
  );
  const sessions = new Map();
  for (const email of [
    'service.manager@demo.local',
    'service.manager.dn@demo.local',
    ...catalog.technicians.map((t) => t.email),
  ])
    sessions.set(
      email,
      await login(process.env.IDENTITY_SERVICE_URL, '/auth/login', email),
    );
  process.env.RABBITMQ_URL = '';
  const { NestFactory } = require('@nestjs/core');
  const { AccessTokenVerifier } = require('@pbl6/auth');
  const verifier = new AccessTokenVerifier({
    secret: process.env.JWT_ACCESS_SECRET,
    issuer: process.env.JWT_ISSUER ?? 'pbl6-identity',
    audience: process.env.JWT_AUDIENCE ?? 'pbl6',
  });
  const { AppModule } = require('../dist/app.module');
  const { PrismaService } = require('../dist/prisma/prisma.service');
  const { REFERENCES } = require('../dist/references/references.client');
  const { seedDemo } = require('../dist/demo/seed-demo');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    for (const tech of catalog.technicians) {
      const manager = sessions.get(
        tech.branchId === catalog.branches[0].id
          ? 'service.manager@demo.local'
          : 'service.manager.dn@demo.local',
      );
      const result = await seedDemo(
        app.get(PrismaService),
        app.get(REFERENCES),
        verifier.verify(manager.accessToken),
        sessions.get(tech.email).user.id,
        process.env.NODE_ENV ?? 'development',
        {
          tenantId: catalog.tenant.id,
          branchId: tech.branchId,
          technicianId: tech.id,
          employeeCode: tech.employeeCode,
          skills: catalog.skills,
        },
      );
      console.log(
        JSON.stringify({
          ...result,
          status: 'READY',
          existingValuesPreserved: true,
        }),
      );
    }
  } finally {
    await app.close();
  }
}
main().catch((error) => {
  console.error('Work Order seed failed: ' + error.message);
  process.exitCode = 1;
});
