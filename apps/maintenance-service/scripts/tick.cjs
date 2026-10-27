// Explicit operator tick. No fake tokens or upstream calls. Default is today's
// Vietnam date; an optional YYYY-MM-DD argument is allowed only in development/test.
const assert = require('node:assert/strict');
require('dotenv').config({ path: '../../.env', quiet: true });
const { NestFactory } = require('@nestjs/core');
const { SchedulerService } = require('../dist/scheduler/scheduler.service');
const date = process.argv[2];
if (date)
  assert.ok(
    ['development', 'test'].includes(process.env.NODE_ENV ?? 'development'),
    'An overridden tick date is dev/test only',
  );
process.env.MAINTENANCE_SCHEDULER_ENABLED = 'false';
// A manual tick enqueues durable events. The normal running service publishes them.
process.env.RABBITMQ_URL = '';
const { AppModule } = require('../dist/app.module');
async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    console.log(
      JSON.stringify({ created: await app.get(SchedulerService).tick(date) }),
    );
  } finally {
    await app.close();
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
