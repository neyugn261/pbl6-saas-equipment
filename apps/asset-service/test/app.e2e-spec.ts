import { INestApplication, Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { configureApp } from '@pbl6/service-kit';
import { testJwtEnv } from '@pbl6/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Boots the real AppModule with a fake database client, so the HTTP pipeline
 * (health, auth guard, error format) is checked without PostgreSQL.
 * Business e2e suites against asset_test_db come with the first endpoints.
 */
describe('asset-service bootstrap (e2e)', () => {
  let app: INestApplication<App>;
  const database = { up: true };
  const fakePrisma = {
    $connect: async () => undefined,
    $disconnect: async () => undefined,
    $queryRawUnsafe: async () => {
      if (!database.up) throw new Error('connection refused');
      return [{ '?column?': 1 }];
    },
  };

  beforeAll(async () => {
    Object.assign(process.env, testJwtEnv(), {
      NODE_ENV: 'test',
      ASSET_DATABASE_URL: 'postgresql://unused:unused@localhost:5432/unused_test_db',
    });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(fakePrisma)
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app, { logger: new Logger('e2e') });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('reports the database in /health without a token', async () => {
    database.up = true;
    await request(app.getHttpServer()).get('/health').expect(200, { status: 'ok', database: 'up' });
    database.up = false;
    const res = await request(app.getHttpServer()).get('/health').expect(503);
    expect(res.body).toMatchObject({ code: 'SERVICE_UNAVAILABLE', database: 'down' });
  });

  it('returns errors in the shared format with a correlation id', async () => {
    const res = await request(app.getHttpServer()).get('/does-not-exist').expect(404);
    expect(res.body.code).toBe('NOT_FOUND');
    expect(res.headers['x-correlation-id']).toBeDefined();
  });
});
