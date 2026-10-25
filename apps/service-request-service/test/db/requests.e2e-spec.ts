import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import type { RoleCode } from '@pbl6/auth';
import type {
  EventEnvelope,
  WorkOrderCancelledV2,
  WorkOrderCompletedV2,
  WorkOrderCreatedV1,
} from '@pbl6/event-contracts';
import { signTestAccessToken } from '@pbl6/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { FakeAssetClient } from '../../src/asset/fake-asset.client';
import { WorkOrderEventsConsumer } from '../../src/events/work-order-events.consumer';
import { PrismaService } from '../../src/prisma/prisma.service';
import { createTestApp, resetDatabase } from './support/test-app';

describe('Service Requests (e2e, service_request_test_db)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let assets: FakeAssetClient;
  let tenantA: string;
  let tenantB: string;
  let customerA: string;
  let customerB: string;
  let equipmentId: string;

  beforeAll(async () => {
    ({ app, prisma, assets } = await createTestApp());
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    tenantA = randomUUID();
    tenantB = randomUUID();
    customerA = randomUUID();
    customerB = randomUUID();
    equipmentId = randomUUID();
    assets.equipment.clear();
    assets.warranties.clear();
    assets.equipment.set(equipmentId, {
      id: equipmentId,
      customerId: customerA,
      customerSiteId: randomUUID(),
      locationId: null,
      assetCode: 'TEST-EQUIPMENT',
      status: 'ACTIVE',
    });
    assets.warranties.set(equipmentId, {
      equipmentId,
      date: '2026-10-23',
      result: 'IN_WARRANTY',
      warrantyId: randomUUID(),
      endDate: '2027-10-23',
    });
  });

  const authorization = (
    role: RoleCode,
    tenantId: string,
    customerId?: string,
  ) =>
    `Bearer ${signTestAccessToken({
      role,
      tenantId,
      ...(customerId ? { customerId } : {}),
    })}`;

  const staff = (tenantId = tenantA) =>
    request.agent(app.getHttpServer()).set(
      'authorization',
      authorization('SERVICE_MANAGER', tenantId),
    );

  const createRequest = (title: string) =>
    staff().post('/service-requests').send({
      equipmentId,
      type: 'REPAIR',
      title,
      description: 'Created by the database-backed e2e test.',
    });

  const reviewAndAccept = async (requestId: string) => {
    await staff().post(`/service-requests/${requestId}/review`).expect(200);
    await staff().post(`/service-requests/${requestId}/accept`).expect(200);
  };

  const workOrderCreated = (
    requestId: string,
  ): EventEnvelope<WorkOrderCreatedV1> => {
    const workOrderId = randomUUID();
    return {
      eventId: randomUUID(),
      eventType: 'WorkOrderCreated',
      eventVersion: 1,
      producer: 'workorder-service',
      tenantId: tenantA,
      aggregateType: 'WorkOrder',
      aggregateId: workOrderId,
      occurredAt: new Date().toISOString(),
      correlationId: null,
      payload: {
        workOrderId,
        workOrderNo: `WO-${workOrderId.slice(0, 8)}`,
        serviceRequestId: requestId,
        maintenanceTaskId: null,
        equipmentId,
        customerId: customerA,
        type: 'REPAIR',
        priority: 'NORMAL',
      },
    };
  };

  const workOrderCancelled = (
    requestId: string,
    cancelServiceRequest: boolean,
  ): EventEnvelope<WorkOrderCancelledV2> => {
    const workOrderId = randomUUID();
    return {
      eventId: randomUUID(),
      eventType: 'WorkOrderCancelled',
      eventVersion: 2,
      producer: 'workorder-service',
      tenantId: tenantA,
      aggregateType: 'WorkOrder',
      aggregateId: workOrderId,
      occurredAt: new Date().toISOString(),
      correlationId: null,
      payload: {
        workOrderId,
        workOrderNo: `WO-${workOrderId.slice(0, 8)}`,
        serviceRequestId: requestId,
        maintenanceTaskId: null,
        equipmentId,
        reason: 'Cancelled by the test',
        cancelledAt: new Date().toISOString(),
        cancelServiceRequest,
      },
    };
  };

  it('hides another tenant and another customer request as not found', async () => {
    const created = await createRequest('Scoped request').expect(201);

    const otherTenant = await staff(tenantB)
      .get(`/service-requests/${created.body.id}`)
      .expect(404);
    expect(otherTenant.body.code).toBe('NOT_FOUND');
    await staff(tenantB)
      .get(`/internal/service-requests/${created.body.id}`)
      .expect(404);

    const otherCustomer = await request(app.getHttpServer())
      .get(`/service-requests/${created.body.id}`)
      .set('authorization', authorization('CUSTOMER_USER', tenantA, customerB))
      .expect(404);
    expect(otherCustomer.body.code).toBe('NOT_FOUND');
  });

  it('derives the staff customer from equipment and keeps the new request warranty unchecked', async () => {
    const created = await createRequest('New request').expect(201);

    expect(created.body).toMatchObject({
      customerId: customerA,
      equipmentId,
      status: 'NEW',
      warrantyCheck: null,
    });
    expect(
      await prisma.serviceRequest.findUniqueOrThrow({
        where: { id: created.body.id },
      }),
    ).toMatchObject({
      warrantyCheckResult: null,
      warrantyId: null,
      warrantyCheckedBy: null,
      warrantyCheckedAt: null,
    });
  });

  it('treats percent and underscore as literal search characters', async () => {
    const percentMatch = await createRequest('Pump 100% marker').expect(201);
    await createRequest('Pump 100x marker').expect(201);
    const underscoreMatch =
      await createRequest('Pump Code_A marker').expect(201);
    await createRequest('Pump CodeXA marker').expect(201);

    const percentSearch = await staff()
      .get('/service-requests')
      .query({ q: '100%' })
      .expect(200);
    expect(
      percentSearch.body.items.map((item: { id: string }) => item.id),
    ).toEqual([percentMatch.body.id]);

    const underscoreSearch = await staff()
      .get('/service-requests')
      .query({ q: 'Code_A' })
      .expect(200);
    expect(
      underscoreSearch.body.items.map((item: { id: string }) => item.id),
    ).toEqual([underscoreMatch.body.id]);
  });

  it('assigns unique request numbers when requests are created concurrently', async () => {
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        createRequest(`Concurrent request ${index}`).expect(201),
      ),
    );
    const requestNumbers = results.map((result) => result.body.requestNo);

    expect(new Set(requestNumbers).size).toBe(results.length);
  });

  it('never returns INTERNAL comments to a customer in comments or history', async () => {
    const created = await createRequest('Comment visibility').expect(201);
    await staff()
      .post(`/service-requests/${created.body.id}/comments`)
      .send({ visibility: 'INTERNAL', content: 'Internal-only test note' })
      .expect(201);
    await staff()
      .post(`/service-requests/${created.body.id}/comments`)
      .send({ visibility: 'CUSTOMER', content: 'Customer-visible test note' })
      .expect(201);

    const customer = request.agent(app.getHttpServer()).set(
      'authorization',
      authorization('CUSTOMER_USER', tenantA, customerA),
    );
    const comments = await customer
      .get(`/service-requests/${created.body.id}/comments`)
      .expect(200);
    const history = await customer
      .get(`/service-requests/${created.body.id}/history`)
      .expect(200);

    expect(JSON.stringify(comments.body)).not.toContain(
      'Internal-only test note',
    );
    expect(JSON.stringify(history.body)).not.toContain(
      'Internal-only test note',
    );
    expect(JSON.stringify(comments.body)).toContain(
      'Customer-visible test note',
    );
    expect(JSON.stringify(history.body)).toContain(
      'Customer-visible test note',
    );
  });

  it('ignores WorkOrderCreated received after the request was cancelled', async () => {
    const created = await createRequest('Cancel before work order').expect(201);
    await reviewAndAccept(created.body.id);
    await staff()
      .post(`/service-requests/${created.body.id}/cancel`)
      .send({})
      .expect(200);

    await app
      .get(WorkOrderEventsConsumer)
      .handle(workOrderCreated(created.body.id));

    const persisted = await prisma.serviceRequest.findUniqueOrThrow({
      where: { id: created.body.id },
    });
    expect(persisted.status).toBe('CANCELLED');
    expect(
      await prisma.requestStatusHistory.count({
        where: { requestId: created.body.id, newStatus: 'PROCESSING' },
      }),
    ).toBe(0);
  });

  it('rejects request cancellation while processing and directs staff to cancel the work order', async () => {
    const created = await createRequest('Cancel active work order').expect(201);
    await reviewAndAccept(created.body.id);
    await app
      .get(WorkOrderEventsConsumer)
      .handle(workOrderCreated(created.body.id));

    const response = await staff()
      .post(`/service-requests/${created.body.id}/cancel`)
      .send({})
      .expect(409);
    expect(response.body.code).toBe('WORK_ORDER_CANCELLATION_REQUIRED');
    expect(response.body.message).toContain('active work order');
  });

  it('applies WorkOrderCancelled.v2 cancellation intent to a processing request', async () => {
    const created = await createRequest('Work Order cancellation event').expect(
      201,
    );
    await reviewAndAccept(created.body.id);
    await app
      .get(WorkOrderEventsConsumer)
      .handle(workOrderCreated(created.body.id));

    await app
      .get(WorkOrderEventsConsumer)
      .handle(workOrderCancelled(created.body.id, true));

    const persisted = await prisma.serviceRequest.findUniqueOrThrow({
      where: { id: created.body.id },
    });
    expect(persisted.status).toBe('CANCELLED');
    expect(
      await prisma.requestStatusHistory.count({
        where: { requestId: created.body.id, newStatus: 'CANCELLED' },
      }),
    ).toBe(1);
  });

  it('stores the customer-safe summary from WorkOrderCompleted.v2', async () => {
    const created = await createRequest('Work Order completion summary').expect(
      201,
    );
    await reviewAndAccept(created.body.id);
    const workOrderEvent = workOrderCreated(created.body.id);
    const consumer = app.get(WorkOrderEventsConsumer);
    await consumer.handle(workOrderEvent);
    await consumer.handle(workOrderEvent);
    const completedAt = new Date().toISOString();
    const completedEvent: EventEnvelope<WorkOrderCompletedV2> = {
      ...workOrderEvent,
      eventId: randomUUID(),
      eventType: 'WorkOrderCompleted',
      eventVersion: 2,
      payload: {
        workOrderId: workOrderEvent.payload.workOrderId,
        workOrderNo: 'WO-SUMMARY-001',
        serviceRequestId: created.body.id,
        maintenanceTaskId: null,
        equipmentId,
        customerId: customerA,
        serviceReportId: randomUUID(),
        result: 'PARTIALLY_RESOLVED',
        completedAt,
        customerSummary: 'The main fault is fixed; monitoring is recommended.',
      },
    };
    await consumer.handle(completedEvent);
    await consumer.handle(completedEvent);

    const customerResponse = await request(app.getHttpServer())
      .get(`/service-requests/${created.body.id}`)
      .set('authorization', authorization('CUSTOMER_USER', tenantA, customerA))
      .expect(200);
    expect(customerResponse.body).toMatchObject({
      status: 'RESOLVED',
      resolutionResult: 'PARTIALLY_RESOLVED',
      resolutionSummary: 'The main fault is fixed; monitoring is recommended.',
      resolvedWorkOrderNo: 'WO-SUMMARY-001',
      resolutionCompletedAt: completedAt,
    });
    expect(customerResponse.body).not.toHaveProperty('serviceReportId');
    expect(
      await prisma.requestStatusHistory.count({
        where: { requestId: created.body.id, newStatus: 'RESOLVED' },
      }),
    ).toBe(1);
  });

  it('serves the internal request reference at the Work Order contract path', async () => {
    const created = await createRequest('Internal reference').expect(201);

    await staff()
      .get(`/internal/service-requests/${created.body.id}`)
      .expect(200, {
        id: created.body.id,
        requestNo: created.body.requestNo,
        status: 'NEW',
        title: 'Internal reference',
        customerId: customerA,
        equipmentId,
        type: 'REPAIR',
        priority: 'NORMAL',
      });
  });
});
