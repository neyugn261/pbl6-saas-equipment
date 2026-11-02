// Actual WO process for the Inventory integration crash/restart scenario.
const { requireTestDatabaseUrl } = require('@pbl6/testing');
async function main() {
  if (
    !process.send ||
    process.env.NODE_ENV !== 'test' ||
    process.env.WORKORDER_DATABASE_URL !==
      requireTestDatabaseUrl('WORKORDER_TEST_DATABASE_URL')
  )
    throw new Error('Test-only WO process requires guarded database and IPC');
  const { NestFactory } = require('@nestjs/core');
  const { configureApp, createLogger } = require('@pbl6/service-kit');
  const { AppModule } = require('../../dist/app.module');
  const app = await NestFactory.create(AppModule, { logger: false });
  configureApp(app, { logger: createLogger('reservation-wo-test') });
  await app.listen(Number(process.env.WORKORDER_SERVICE_PORT), '127.0.0.1');
  process.send({ ready: true });
}
main().catch(() => {
  console.error('RESERVATION_WO_TEST_START_FAILED');
  process.exit(1);
});
