import { INestApplication, Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { configureApp } from '@pbl6/service-kit';
import { signTestAccessToken } from '@pbl6/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Work Order bootstrap', () => {
  let app: INestApplication<App>;
  let up = true;
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({
        $queryRawUnsafe: async () => {
          if (!up) throw new Error('database down');
          return [{ ok: 1 }];
        },
      })
      .compile();
    app = module.createNestApplication({ logger: false });
    configureApp(app, { logger: new Logger('test') });
    await app.init();
  });
  afterAll(async () => {
    await app.close();
  });
  it('has public DB health and reports outages with a correlation id', async () => {
    await request(app.getHttpServer())
      .get('/health')
      .expect(200, { status: 'ok', database: 'up' });
    up = false;
    const response = await request(app.getHttpServer())
      .get('/health')
      .expect(503);
    expect(response.body).toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
      database: 'down',
    });
    expect(response.headers['x-correlation-id']).toBeDefined();
    up = true;
  });
  it('requires a verified token and rejects CUSTOMER and Dispatcher writes', async () => {
    await request(app.getHttpServer()).get('/work-orders').expect(401);
    const tenantId = '10000000-0000-4000-8000-000000000001';
    for (const role of ['CUSTOMER_ADMIN', 'DISPATCHER'] as const) {
      const token = signTestAccessToken({
        role,
        tenantId,
        customerId:
          role === 'CUSTOMER_ADMIN'
            ? '10000000-0000-4000-8000-000000000002'
            : null,
      });
      await request(app.getHttpServer())
        .post('/work-orders')
        .auth(token, { type: 'bearer' })
        .send({})
        .expect(403);
    }
  });
});
