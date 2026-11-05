import { randomUUID } from 'node:crypto';
import { INestApplication, Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { signTestAccessToken } from '@pbl6/testing';
import { configureApp } from '@pbl6/service-kit';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { HandoverService } from '../src/handovers/handover.service';
import { PrismaService } from '../src/prisma/prisma.service';
describe('Handover HTTP authentication and validation', () => {
  let app: INestApplication<App>;
  const tenantId = randomUUID(), customerId = randomUUID(), id = randomUUID();
  const token = (role: 'SERVICE_MANAGER' | 'CUSTOMER_ADMIN' | 'CUSTOMER_USER' | 'DISPATCHER') => signTestAccessToken({ role, tenantId, ...(role.startsWith('CUSTOMER') ? { customerId } : {}) });
  const handovers = { list: jest.fn(async () => ({ items: [], total: 0 })), detail: jest.fn(), create: jest.fn(), act: jest.fn(async () => ({ status: 'ACTIVATED' })) };
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService).useValue({ $connect: async () => undefined, $disconnect: async () => undefined })
      .overrideProvider(HandoverService).useValue(handovers).compile();
    app = module.createNestApplication({ logger: false });
    configureApp(app, { logger: new Logger('handover-test') }); await app.init();
  });
  afterAll(async () => app?.close());
  it('requires JWT and denies staff/customer-user decision attempts', async () => {
    await request(app.getHttpServer()).post(`/my/equipment-handovers/${id}/accept`).send({}).expect(401);
    for (const role of ['SERVICE_MANAGER', 'CUSTOMER_USER'] as const)
      await request(app.getHttpServer()).post(`/my/equipment-handovers/${id}/accept`).set('authorization', `Bearer ${token(role)}`).send({}).expect(403);
    await request(app.getHttpServer()).get('/equipment-handovers').set('authorization', `Bearer ${token('DISPATCHER')}`).expect(403);
  });
  it('rejects forged actor/customer and unknown fields before invocation', async () => {
    const auth = `Bearer ${token('CUSTOMER_ADMIN')}`;
    await request(app.getHttpServer()).post(`/my/equipment-handovers/${id}/accept`).set('authorization', auth).send({ customerUserId: randomUUID() }).expect(400);
    await request(app.getHttpServer()).post(`/my/equipment-handovers/${id}/reject`).set('authorization', auth).send({ reason: '   ' }).expect(400);
    await request(app.getHttpServer()).post(`/my/equipment-handovers/${id}/reject`).set('authorization', auth).send({ reason: 'x'.repeat(2001) }).expect(400);
    await request(app.getHttpServer()).post('/my/equipment-handovers/not-uuid/accept').set('authorization', auth).send({}).expect(400);
  });
  it('allows an explicit customer-admin POST and never mutates on GET', async () => {
    const before = handovers.act.mock.calls.length;
    await request(app.getHttpServer()).get('/my/equipment-handovers').set('authorization', `Bearer ${token('CUSTOMER_ADMIN')}`).expect(200);
    expect(handovers.act.mock.calls.length).toBe(before);
    await request(app.getHttpServer()).post(`/my/equipment-handovers/${id}/accept`).set('authorization', `Bearer ${token('CUSTOMER_ADMIN')}`).send({}).expect(200);
    expect(handovers.act.mock.calls.length).toBe(before + 1);
  });
});
