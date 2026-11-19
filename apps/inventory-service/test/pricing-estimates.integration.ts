import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { type INestApplication } from '@nestjs/common';
import { BranchAccessClient, type Principal } from '@pbl6/auth';
import { fixtureBranchContext, signTestAccessToken } from '@pbl6/testing';
import { configureApp } from '@pbl6/service-kit';
import {
  Events,
  type EventEnvelope,
  type PayloadOf,
} from '@pbl6/event-contracts';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { EventsService } from '../src/events/events.service';
import { ReferencesClient } from '../src/inventory/references.client';
import { EstimatePartsService } from '../src/part-requests/estimate-parts.service';

describe('Part pricing and approved estimates — real HTTP/DB, WO reference fixture', () => {
  const tenantId = randomUUID(),
    branchId = randomUUID(),
    workOrderId = randomUUID(),
    serviceRequestId = randomUUID();
  const staff = signTestAccessToken({ role: 'INVENTORY_STAFF', tenantId });
  const manager = signTestAccessToken({ role: 'SERVICE_MANAGER', tenantId });
  const foreign = signTestAccessToken({
    role: 'INVENTORY_STAFF',
    tenantId: randomUUID(),
  });
  const headers = (token = staff) => ({ authorization: `Bearer ${token}` });
  let app: INestApplication, db: PrismaService, partId: string;
  type Payload = PayloadOf<typeof Events.CostEstimatePartsSnapshot>;
  const payload = (extra: Partial<Payload> = {}): Payload => ({
    serviceRequestId,
    estimateId: randomUUID(),
    estimateRevision: 1,
    sourceVersion: 1,
    status: 'APPROVED',
    currency: 'VND',
    lines: [
      {
        lineId: randomUUID(),
        partId,
        description: 'Approved part description',
        quantity: '2',
        unitPrice: '150000',
      },
    ],
    ...extra,
  });
  const envelope = (
    p: Payload,
    extra: Partial<EventEnvelope> = {},
  ): EventEnvelope => ({
    eventId: randomUUID(),
    eventType: 'CostEstimatePartsSnapshot',
    eventVersion: 1,
    producer: 'service-request-service',
    tenantId,
    aggregateType: 'ServiceRequest',
    aggregateId: serviceRequestId,
    occurredAt: new Date().toISOString(),
    correlationId: null,
    payload: p,
    ...extra,
  });
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EventsService)
      .useValue({})
      .overrideProvider(BranchAccessClient)
      .useValue(fixtureBranchContext(branchId))
      .overrideProvider(ReferencesClient)
      .useValue({
        workOrderDetail: async (id: string, p: Principal) =>
          id === workOrderId && p.tenantId === tenantId
            ? { id, branchId, serviceRequestId, status: 'IN_PROGRESS' }
            : null,
      })
      .compile();
    app = module.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
    db = app.get(PrismaService);
  });
  afterAll(async () => {
    await app?.close();
  });
  it('creates decimal prices, keeps null distinct from zero, rejects invalid numbers and unauthorized changes', async () => {
    const created = await request(app.getHttpServer())
      .post('/parts')
      .set(headers())
      .send({
        sku: randomUUID(),
        name: 'Priced part',
        unit: 'cái',
        costPrice: '100000',
        standardPrice: '150000',
      })
      .expect(201);
    partId = created.body.id;
    expect(created.body.currency).toBe('VND');
    expect(Number(created.body.costPrice)).toBe(100000);
    for (const value of ['-1', '1e2', '1.234', 100, '1000000000000']) {
      await request(app.getHttpServer())
        .put(`/parts/${partId}/pricing`)
        .set(headers())
        .send({ expectedVersion: 1, standardPrice: value })
        .expect(400);
    }
    await request(app.getHttpServer())
      .put(`/parts/${partId}/pricing`)
      .set(headers(manager))
      .send({ expectedVersion: 1, standardPrice: '9' })
      .expect(403);
    await request(app.getHttpServer())
      .put(`/parts/${partId}/pricing`)
      .set(headers(foreign))
      .send({ expectedVersion: 1, standardPrice: '9' })
      .expect(404);
    await request(app.getHttpServer())
      .put(`/parts/${partId}/pricing`)
      .set(headers())
      .send({ expectedVersion: 1, standardPrice: '0', costPrice: null })
      .expect(200);
    const read = await request(app.getHttpServer())
      .get(`/parts/${partId}`)
      .set(headers())
      .expect(200);
    expect(read.body.costPrice).toBeNull();
    expect(Number(read.body.standardPrice)).toBe(0);
  });
  it('serializes concurrent pricing edits and preserves an audit trail', async () => {
    const responses = await Promise.all(
      ['10', '20'].map((price) =>
        request(app.getHttpServer())
          .put(`/parts/${partId}/pricing`)
          .set(headers())
          .send({ expectedVersion: 2, standardPrice: price, costPrice: '7' }),
      ),
    );
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    const audit = await request(app.getHttpServer())
      .get(`/inventory-audit?entityId=${partId}`)
      .set(headers())
      .expect(200);
    expect(
      audit.body.items.some(
        (item: { action: string }) => item.action === 'PRICING_UPDATED',
      ),
    ).toBe(true);
  });
  it('does not expose cost in lists, detail, stock includes or nested audit snapshots to Service Manager', async () => {
    for (const path of [
      '/parts',
      `/parts/${partId}`,
      `/inventory-audit?entityId=${partId}`,
    ]) {
      const result = await request(app.getHttpServer())
        .get(path)
        .set(headers(manager))
        .expect(200);
      expect(JSON.stringify(result.body)).not.toContain('costPrice');
    }
    const warehouse = await db.warehouse.create({
      data: { tenantId, branchId, code: randomUUID(), name: 'Test warehouse' },
    });
    await db.stock.create({
      data: { tenantId, warehouseId: warehouse.id, partId, quantity: '10' },
    });
    const result = await request(app.getHttpServer())
      .get('/stocks')
      .set(headers(manager))
      .expect(200);
    expect(JSON.stringify(result.body)).not.toContain('costPrice');
  });
  it('returns an honest NO_SNAPSHOT and rejects a foreign WO', async () => {
    const result = await request(app.getHttpServer())
      .get(`/work-orders/${workOrderId}/recommended-parts`)
      .set(headers(manager))
      .expect(200);
    expect(result.body.state).toBe('NO_SNAPSHOT');
    expect(result.body.reservesStock).toBe(false);
    await request(app.getHttpServer())
      .get(`/work-orders/${workOrderId}/recommended-parts`)
      .set(headers(foreign))
      .expect(404);
  });
  it('projects approved parts idempotently, preserves approved prices and does not change stock', async () => {
    const p = payload(),
      e = envelope(p),
      consumer = app.get(EstimatePartsService);
    await consumer.handle(e);
    await consumer.handle(e);
    await consumer.handle(envelope(p));
    await request(app.getHttpServer())
      .put(`/parts/${partId}/pricing`)
      .set(headers())
      .send({ expectedVersion: 3, standardPrice: '99999' })
      .expect(200);
    const result = await request(app.getHttpServer())
      .get(`/work-orders/${workOrderId}/recommended-parts`)
      .set(headers(manager))
      .expect(200);
    expect(result.body.state).toBe('APPROVED');
    expect(result.body.lines[0].unitPrice).toBe('150000.00');
    expect(result.body.partTotals[0]).toMatchObject({
      quantityApproved: '2.00',
      quantityIssued: '0.00',
      quantityOpenToFulfill: '0.00',
      quantityUnreconciled: '0.00',
    });
    expect(
      (
        await db.stock.findFirstOrThrow({ where: { tenantId, partId } })
      ).quantity.toString(),
    ).toBe('10');
  });
  it('includes outstanding demand outside the approved catalogue lines in reconciliation', async () => {
    const extra = await db.part.create({ data: { tenantId, sku: randomUUID(), name: 'Additional component', unit: 'cái' } });
    const proposal = await db.partRequest.create({ data: { tenantId, branchId, workOrderId, workOrderNo: 'TEST-WO',
      equipmentId: randomUUID(), customerId: randomUUID(), requestNo: randomUUID(), requestedBy: randomUUID(), reason: 'Additional diagnosis' } });
    await db.partRequestLine.create({ data: { tenantId, partRequestId: proposal.id, partId: extra.id, quantityRequested: '1', partSnapshot: { sku: extra.sku } } });
    const result = await request(app.getHttpServer()).get(`/work-orders/${workOrderId}/recommended-parts`).set(headers(manager)).expect(200);
    expect(result.body.partTotals.find((p: { partId: string }) => p.partId === extra.id)).toMatchObject({
      hasApprovedCatalogueLine: false, quantityApproved: '0.00', quantityOpenToFulfill: '1.00',
    });
  });
  it('ignores stale snapshots, applies withdrawal and rejects conflicting versions and foreign parts', async () => {
    const consumer = app.get(EstimatePartsService);
    await consumer.handle(
      envelope(payload({ sourceVersion: 2, status: 'WITHDRAWN', lines: [] })),
    );
    await consumer.handle(envelope(payload({ sourceVersion: 1 })));
    const result = await request(app.getHttpServer())
      .get(`/work-orders/${workOrderId}/recommended-parts`)
      .set(headers(manager))
      .expect(200);
    expect(result.body.state).toBe('WITHDRAWN');
    expect(result.body.lines).toEqual([]);
    await expect(
      consumer.handle(envelope(payload({ sourceVersion: 2 }))),
    ).rejects.toThrow('Conflicting snapshot');
    await expect(
      consumer.handle(
        envelope(
          payload({
            sourceVersion: 3,
            lines: [
              {
                lineId: randomUUID(),
                partId: randomUUID(),
                description: 'Foreign',
                quantity: '1',
                unitPrice: '10',
              },
            ],
          }),
        ),
      ),
    ).rejects.toThrow('Part does not belong');
    await expect(
      consumer.handle(
        envelope(payload({ sourceVersion: 3 }), {
          producer: 'inventory-service',
        }),
      ),
    ).rejects.toThrow();
  });
});
