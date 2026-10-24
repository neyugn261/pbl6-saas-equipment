import { INestApplication, Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { configureApp } from '@pbl6/service-kit';
import { App } from 'supertest/types';
import { FakeAssetClient } from '../../../src/asset/fake-asset.client';
import { ASSET_CLIENT } from '../../../src/asset/asset-client';
import { AppModule } from '../../../src/app.module';
import { PrismaService } from '../../../src/prisma/prisma.service';

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
  await prisma.$executeRawUnsafe(
    'TRUNCATE outbox_events, processed_events, request_comments, request_status_history, request_attachments, cost_estimate_items, cost_estimates, service_requests, document_sequences',
  );
}
