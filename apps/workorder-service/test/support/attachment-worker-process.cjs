// Test-only child process. The parent owns the isolated DB/bucket and fixtures.
const { requireTestDatabaseUrl } = require('@pbl6/testing');
const { NestFactory } = require('@nestjs/core');
const { configureApp, createLogger } = require('@pbl6/service-kit');
const { AppModule } = require('../../dist/app.module');
const {
  AttachmentCleanupRepository,
} = require('../../dist/attachments/attachment-cleanup.repository');

async function main() {
  if (!process.send || process.env.NODE_ENV !== 'test')
    throw new Error('This helper requires the test runner IPC channel');
  const testURL = requireTestDatabaseUrl('WORKORDER_TEST_DATABASE_URL');
  if (process.env.WORKORDER_DATABASE_URL !== testURL)
    throw new Error('Worker must use the guarded test database');
  const app = await NestFactory.create(AppModule, { logger: false });
  configureApp(app, { logger: createLogger('a6-cleanup-worker') });
  await app.listen(0, '127.0.0.1');
  process.on('message', async (message) => {
    if (message !== 'claim') return;
    try {
      const job = await app.get(AttachmentCleanupRepository).claim();
      process.send({ claimed: job?.id ?? null });
    } catch {
      process.send({ failed: true });
    }
  });
  process.send({ ready: true, url: await app.getUrl() });
}
main().catch(() => {
  console.error('A6_WORKER_START_FAILED');
  process.exit(1);
});
