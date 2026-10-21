import { randomUUID } from 'node:crypto';
import { INestApplication, Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { signTestAccessToken } from '@pbl6/testing';
import { configureApp } from '@pbl6/service-kit';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { EquipmentModelRepository } from '../src/equipment-models/equipment-model.repository';
import { PrismaService } from '../src/prisma/prisma.service';

const tenantA = '00000000-0000-4000-8000-000000000001';
const tenantB = '00000000-0000-4000-8000-000000000002';
const modelId = '00000000-0000-4000-8000-000000001001';
const staff = signTestAccessToken({ role: 'SERVICE_MANAGER', tenantId: tenantA });
const otherStaff = signTestAccessToken({ role: 'SERVICE_MANAGER', tenantId: tenantB });
const dispatcher = signTestAccessToken({ role: 'DISPATCHER', tenantId: tenantA });
const customer = signTestAccessToken({
  role: 'CUSTOMER_USER',
  tenantId: tenantA,
  customerId: '00000000-0000-4000-8000-000000000101',
});

function row(tenantId = tenantA) {
  return {
    id: modelId,
    tenantId,
    manufacturer: 'Acme',
    modelCode: 'P-1',
    name: 'Pump',
    category: null,
    description: null,
    status: 'ACTIVE',
    createdAt: new Date('2026-10-20T00:00:00.000Z'),
    updatedAt: new Date('2026-10-20T00:00:00.000Z'),
  };
}

describe('equipment models HTTP contract (e2e)', () => {
  let app: INestApplication<App>;
  const repo = {
    list: jest.fn(async (tenantId: string) => ({
      rows: tenantId === tenantA ? [row()] : [],
      total: tenantId === tenantA ? 1 : 0,
    })),
    findScoped: jest.fn(async (tenantId: string, id: string) =>
      tenantId === tenantA && id === modelId ? row() : null,
    ),
    create: jest.fn(async (tenantId: string, input: { modelCode: string }) => {
      if (input.modelCode === 'DUP') {
        throw Object.assign(new Error('duplicate'), {
          name: 'PrismaClientKnownRequestError',
          code: 'P2002',
        });
      }
      return {
        ...row(tenantId), id: randomUUID(), ...input,
        category: (input as { category?: string }).category ?? null,
        description: (input as { description?: string }).description ?? null,
      };
    }),
    update: jest.fn(async (tenantId: string, id: string, input: object) => ({
      ...row(tenantId), id, ...input,
    })),
  };
  const fakePrisma = {
    $connect: async () => undefined,
    $disconnect: async () => undefined,
    $queryRawUnsafe: async () => [{ '?column?': 1 }],
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(fakePrisma)
      .overrideProvider(EquipmentModelRepository)
      .useValue(repo)
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app, { logger: new Logger('e2e') });
    await app.init();
  });

  afterAll(async () => app.close());
  beforeEach(() => jest.clearAllMocks());

  it('scopes list to the token tenant and validates pagination/filter input', async () => {
    const res = await request(app.getHttpServer())
      .get('/equipment-models?page=2&pageSize=5&q=pump&status=ACTIVE&sort=-createdAt')
      .set('authorization', `Bearer ${staff}`)
      .expect(200);
    expect(res.body).toMatchObject({ page: 2, pageSize: 5, total: 1 });
    expect(res.body.items[0]).toMatchObject({ category: null, description: null });
    expect(repo.list).toHaveBeenCalledWith(tenantA, expect.objectContaining({
      page: 2, pageSize: 5, q: 'pump', status: 'ACTIVE', sort: '-createdAt',
    }));
    await request(app.getHttpServer()).get('/equipment-models')
      .set('authorization', `Bearer ${otherStaff}`).expect(200, {
        items: [], page: 1, pageSize: 20, total: 0,
      });
    await request(app.getHttpServer()).get('/equipment-models?pageSize=101')
      .set('authorization', `Bearer ${staff}`).expect(400);
    await request(app.getHttpServer()).get('/equipment-models?tenantId=bad')
      .set('authorization', `Bearer ${staff}`).expect(400);
  });

  it('creates with token tenant and maps duplicate key to 409', async () => {
    const payload = { manufacturer: 'Acme', modelCode: 'P-1', name: 'Pump' };
    const created = await request(app.getHttpServer()).post('/equipment-models')
      .set('authorization', `Bearer ${staff}`).send(payload).expect(201);
    expect(created.body).toMatchObject({ ...payload, category: null, description: null });
    expect(repo.create).toHaveBeenCalledWith(tenantA, expect.objectContaining(payload));
    const duplicate = await request(app.getHttpServer()).post('/equipment-models')
      .set('authorization', `Bearer ${staff}`)
      .send({ ...payload, modelCode: 'DUP' }).expect(409);
    expect(duplicate.body.code).toBe('UNIQUE_VIOLATION');
  });

  it('rejects invalid fields, wrong permission, and CUSTOMER list while review is pending', async () => {
    const payload = { manufacturer: 'Acme', modelCode: 'P-1', name: 'Pump' };
    for (const invalid of [
      { ...payload, tenantId: tenantB },
      { ...payload, manufacturer: 'x'.repeat(151) },
      { ...payload, category: null },
    ]) {
      const res = await request(app.getHttpServer()).post('/equipment-models')
        .set('authorization', `Bearer ${staff}`).send(invalid).expect(400);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    }
    await request(app.getHttpServer()).post('/equipment-models')
      .set('authorization', `Bearer ${dispatcher}`).send(payload).expect(403);
    await request(app.getHttpServer()).get('/equipment-models')
      .set('authorization', `Bearer ${customer}`).expect(403);
    await request(app.getHttpServer()).get('/equipment-models').expect(401);
  });

  it('updates only a model of the token tenant and validates PATCH', async () => {
    const updated = await request(app.getHttpServer()).patch(`/equipment-models/${modelId}`)
      .set('authorization', `Bearer ${staff}`)
      .send({ status: 'INACTIVE', category: null }).expect(200);
    expect(updated.body).toMatchObject({ status: 'INACTIVE', category: null });
    expect(repo.update).toHaveBeenCalledWith(tenantA, modelId, expect.objectContaining({
      status: 'INACTIVE', category: null,
    }));
    const outOfScope = await request(app.getHttpServer())
      .patch(`/equipment-models/${modelId}`)
      .set('authorization', `Bearer ${otherStaff}`)
      .send({ name: 'Other' }).expect(404);
    expect(outOfScope.body.code).toBe('MODEL_NOT_FOUND');
    expect(repo.update).toHaveBeenCalledTimes(1);
    await request(app.getHttpServer()).patch(`/equipment-models/${modelId}`)
      .set('authorization', `Bearer ${staff}`).send({}).expect(400);
    await request(app.getHttpServer()).patch(`/equipment-models/${modelId}`)
      .set('authorization', `Bearer ${staff}`).send({ name: null }).expect(400);
    await request(app.getHttpServer()).patch('/equipment-models/not-a-uuid')
      .set('authorization', `Bearer ${staff}`).send({ name: 'Other' }).expect(400);
  });
});
