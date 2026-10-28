import { INestApplication, Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { configureApp } from '@pbl6/service-kit';
import { App } from 'supertest/types';
import { FakeAssetClient } from '../../../src/asset/fake-asset.client';
import { ASSET_CLIENT } from '../../../src/asset/asset-client';
import { AppModule } from '../../../src/app.module';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { testDatabaseUrl } from './test-env';

export async function createTestApp(): Promise<{
  app: INestApplication<App>;
  prisma: PrismaService;
  assets: FakeAssetClient;
}> {
  const assets = new FakeAssetClient();
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(ASSET_CLIENT)
    .useValue(assets)
    .compile();
  const app = moduleRef.createNestApplication({ logger: false });
  configureApp(app, { logger: new Logger('e2e') });
  await app.init();
  return { app, prisma: app.get(PrismaService), assets };
}

export async function resetDatabase(prisma: PrismaService): Promise<void> {
  const expected = decodeURIComponent(
    new URL(testDatabaseUrl()).pathname.slice(1),
  );
  const [actual] = await prisma.$queryRawUnsafe<Array<{ name: string }>>(
    'SELECT current_database() AS name',
  );
  if (actual?.name !== expected) {
    throw new Error(
      'Refusing to truncate a database other than the validated test database',
    );
  }
  await prisma.$executeRawUnsafe(
    'TRUNCATE outbox_events, processed_events, work_order_lifecycle_conflicts, work_order_lifecycles, request_comments, request_status_history, request_attachments, cost_estimate_items, cost_estimates, service_requests, document_sequences',
  );
}
