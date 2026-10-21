import { Body, Controller, Get, INestApplication, Post } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { IsString } from 'class-validator';
import request from 'supertest';
import { configureApp } from './app-setup';
import { getCorrelationId } from './correlation';
import { HealthCheck, HealthModule } from './health';

class CreateThingDto {
  @IsString()
  name: string;
}

@Controller('things')
class ThingsController {
  @Post()
  create(@Body() body: CreateThingDto) {
    return { name: body.name, correlationId: getCorrelationId() };
  }

  @Get('boom')
  boom() {
    throw new Error('SELECT * FROM secret_table failed');
  }
}

async function createApp(checks: HealthCheck[]): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [HealthModule.forRootAsync({ useFactory: () => checks })],
    controllers: [ThingsController],
  }).compile();
  const app = moduleRef.createNestApplication({ logger: false });
  configureApp(app, { logger: { log: () => {}, error: () => {}, warn: () => {} } });
  await app.init();
  return app;
}

describe('configureApp (HTTP pipeline)', () => {
  let app: INestApplication;
  const database = { up: true };

  beforeAll(async () => {
    app = await createApp([
      {
        name: 'database',
        check: async () => {
          if (!database.up) throw new Error('down');
        },
      },
    ]);
  });

  afterAll(async () => {
    await app.close();
  });

  it('echoes a valid correlation id and creates one otherwise', async () => {
    const res = await request(app.getHttpServer())
      .post('/things')
      .set('x-correlation-id', 'abc-123')
      .send({ name: 'x' })
      .expect(201);
    expect(res.headers['x-correlation-id']).toBe('abc-123');
    expect(res.body.correlationId).toBe('abc-123');

    const generated = await request(app.getHttpServer())
      .post('/things')
      .set('x-correlation-id', 'bad id with spaces')
      .send({ name: 'x' })
      .expect(201);
    expect(generated.headers['x-correlation-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('rejects unknown fields such as a client-supplied tenantId', async () => {
    const res = await request(app.getHttpServer())
      .post('/things')
      .send({ name: 'x', tenantId: 'other-tenant' })
      .expect(400);
    expect(res.body).toEqual({
      code: 'VALIDATION_FAILED',
      message: 'Request validation failed',
      details: ['property tenantId should not exist'],
    });
  });

  it('never leaks internal error messages', async () => {
    const res = await request(app.getHttpServer()).get('/things/boom').expect(500);
    expect(res.body).toEqual({ code: 'INTERNAL_ERROR', message: 'Internal server error' });
  });

  it('formats unknown routes', async () => {
    const res = await request(app.getHttpServer()).get('/nope').expect(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  it('reports health of every check', async () => {
    database.up = true;
    await request(app.getHttpServer()).get('/health').expect(200, { status: 'ok', database: 'up' });
    database.up = false;
    const res = await request(app.getHttpServer()).get('/health').expect(503);
    expect(res.body).toMatchObject({ code: 'SERVICE_UNAVAILABLE', status: 'error', database: 'down' });
  });

  it('does not send x-powered-by', async () => {
    const res = await request(app.getHttpServer()).get('/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});
