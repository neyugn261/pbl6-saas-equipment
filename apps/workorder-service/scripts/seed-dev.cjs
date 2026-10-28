const assert = require('node:assert/strict');
const { environment, login } = require('./demo-common.cjs');
async function main() {
  environment();
  assert.ok(
    process.env.IDENTITY_SERVICE_URL,
    'IDENTITY_SERVICE_URL is required',
  );
  const manager = await login(
    process.env.IDENTITY_SERVICE_URL,
    '/auth/login',
    'service.manager@demo.local',
  );
  const technician = await login(
    process.env.IDENTITY_SERVICE_URL,
    '/auth/login',
    'technician@demo.local',
  );
  // An on-demand dev tool must not run relay consumers while seeding.
  process.env.RABBITMQ_URL = '';
  const { NestFactory } = require('@nestjs/core');
  const { AccessTokenVerifier } = require('@pbl6/auth');
  const principal = new AccessTokenVerifier({
    secret: process.env.JWT_ACCESS_SECRET,
    issuer: process.env.JWT_ISSUER ?? 'pbl6-identity',
    audience: process.env.JWT_AUDIENCE ?? 'pbl6',
  }).verify(manager.accessToken);
  const { AppModule } = require('../dist/app.module');
  const { PrismaService } = require('../dist/prisma/prisma.service');
  const { REFERENCES } = require('../dist/references/references.client');
  const { seedDemo } = require('../dist/demo/seed-demo');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    const result = await seedDemo(
      app.get(PrismaService),
      app.get(REFERENCES),
      principal,
      technician.user.id,
      process.env.NODE_ENV ?? 'development',
    );
    console.log(
      JSON.stringify({
        ...result,
        status: 'READY',
        existingValuesPreserved: true,
      }),
    );
  } finally {
    await app.close();
  }
}
main().catch((error) => {
  console.error('Work Order seed failed: ' + error.message);
  process.exitCode = 1;
});
