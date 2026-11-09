import { Logger, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { BranchAccessClient } from '@pbl6/auth';
import { configureApp } from '@pbl6/service-kit';
import { fixtureBranchContext, signTestAccessToken } from '@pbl6/testing';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { EventsService } from '../src/events/events.service';

describe('Inventory real HTTP pipeline', () => {
  let app: INestApplication;
  let up = true;
  const tenantId = randomUUID();
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(BranchAccessClient)
      .useValue(fixtureBranchContext())
      .overrideProvider(PrismaService)
      .useValue({
        $queryRawUnsafe: async () => {
          if (!up) throw new Error('test unavailable');
          return [1];
        },
      })
      .overrideProvider(EventsService)
      .useValue({})
      .compile();
    app = module.createNestApplication({ logger: false });
    configureApp(app, { logger: new Logger('inventory-http-test') });
    await app.init();
  });
  afterAll(async () => {
    await app?.close();
  });
  it('reports dependency failure and recovery on public health', async () => {
    await request(app.getHttpServer()).get('/health').expect(200);
    up = false;
    await request(app.getHttpServer()).get('/health').expect(503);
    up = true;
  });
  it('requires a valid token for inventory', async () => {
    await request(app.getHttpServer()).get('/parts').expect(401);
    await request(app.getHttpServer())
      .get('/parts')
      .set('Authorization', 'Bearer invalid')
      .expect(401);
  });
  it.each([
    'CUSTOMER_ADMIN',
    'CUSTOMER_USER',
    'PLATFORM_ADMIN',
    'DISPATCHER',
  ] as const)('denies inventory reads for %s', async (role) => {
    const token = signTestAccessToken({
      role,
      tenantId,
      customerId: randomUUID(),
    });
    await request(app.getHttpServer())
      .get('/parts')
      .auth(token, { type: 'bearer' })
      .expect(403);
  });
  it('denies Technician mutations and Service Manager stock issue', async () => {
    for (const role of ['TECHNICIAN', 'SERVICE_MANAGER'] as const) {
      const token = signTestAccessToken({ role, tenantId });
      await request(app.getHttpServer())
        .post(`/work-orders/${randomUUID()}/parts`)
        .auth(token, { type: 'bearer' })
        .send({})
        .expect(403);
    }
  });
  it('rejects tenant injection and whitespace-only catalogue fields before writes', async () => {
    const token = signTestAccessToken({ role: 'INVENTORY_STAFF', tenantId });
    for (const body of [
      { sku: 'A', name: 'A', unit: 'pc', tenantId },
      { sku: '  ', name: 'A', unit: 'pc' },
    ]) {
      const result = await request(app.getHttpServer())
        .post('/parts')
        .auth(token, { type: 'bearer' })
        .send(body)
        .expect(400);
      expect(result.body.code).toBe('VALIDATION_FAILED');
      expect(result.headers['x-correlation-id']).toBeDefined();
    }
  });
});
