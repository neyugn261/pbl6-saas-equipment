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
import { ServiceRequestsService } from '../../src/service-requests/service-requests.service';
import { Prisma } from '../../src/generated/prisma/client';
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
    request
      .agent(app.getHttpServer())
      .set('authorization', authorization('SERVICE_MANAGER', tenantId));

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
  const customer = (customerId = customerA, role: RoleCode = 'CUSTOMER_USER') =>
    request
      .agent(app.getHttpServer())
      .set('authorization', authorization(role, tenantA, customerId));

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
    workOrderId: string = randomUUID(),
  ): EventEnvelope<WorkOrderCancelledV2> => {
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

  const completion = (
    event: EventEnvelope<WorkOrderCreatedV1>,
    result: WorkOrderCompletedV2['result'] = 'RESOLVED',
  ): EventEnvelope<WorkOrderCompletedV2> => ({
    ...event,
    eventId: randomUUID(),
    eventType: 'WorkOrderCompleted',
    eventVersion: 2,
    payload: {
      ...event.payload,
      serviceReportId: randomUUID(),
      result,
      completedAt: new Date().toISOString(),
      customerSummary: 'Safe customer outcome',
    },
  });

  const estimateInput = {
    items: [
      {
        itemType: 'LABOR',
        description: 'Assessment',
        quantity: '1',
        unitPrice: '0.10',
      },
    ],
  };

  const draftEstimate = async () => {
    assets.warranties.set(equipmentId, {
      equipmentId,
      date: '2026-10-23',
      result: 'NO_WARRANTY',
      warrantyId: null,
      endDate: null,
    });
    const created = await createRequest('M2 hardening estimate').expect(201);
    await staff()
      .post(`/service-requests/${created.body.id}/review`)
      .expect(200);
    const draft = await staff()
      .post(`/service-requests/${created.body.id}/estimates`)
      .send(estimateInput)
      .expect(201);
    return {
      requestId: created.body.id as string,
      estimateId: draft.body.id as string,
    };
  };

  // Run all real SQL, then fail at the transaction boundary to prove rollback.
  const failNextCommit = () => {
    const original = prisma.$transaction.bind(prisma);
    return jest.spyOn(prisma, '$transaction').mockImplementationOnce(((
      work: (tx: Prisma.TransactionClient) => Promise<unknown>,
    ) =>
      original(async (tx) => {
        await work(tx);
        throw new Error('Injected pre-commit failure');
      })) as unknown as typeof prisma.$transaction);
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

  it('creates and updates draft estimates with exact decimal totals and hides drafts from customers', async () => {
    assets.warranties.set(equipmentId, {
      equipmentId,
      date: '2026-10-23',
      result: 'OUT_OF_WARRANTY',
      warrantyId: randomUUID(),
      endDate: '2026-09-23',
    });
    const created = await createRequest('Estimate draft').expect(201);
    await staff()
      .post(`/service-requests/${created.body.id}/review`)
      .expect(200);
    await staff()
      .post(`/service-requests/${created.body.id}/estimates`)
      .send({
        items: [
          {
            itemType: 'PART',
            description: 'Invalid quantity',
            quantity: '-1',
            unitPrice: '12',
          },
        ],
      })
      .expect(400);
    const draft = await staff()
      .post(`/service-requests/${created.body.id}/estimates`)
      .send({
        items: [
          {
            itemType: 'PART',
            description: 'Filter',
            quantity: '2',
            unitPrice: '1250.10',
          },
        ],
      })
      .expect(201);
    expect(draft.body).toMatchObject({
      revisionNo: 1,
      status: 'DRAFT',
      totalAmount: '2500.20',
      items: [{ quantity: '2.00', unitPrice: '1250.10', amount: '2500.20' }],
    });

    await customer()
      .get(`/service-requests/${created.body.id}/estimates`)
      .expect(200, []);
    await customer(customerB)
      .get(`/service-requests/${created.body.id}/estimates`)
      .expect(404);
    const customerDetail = await customer()
      .get(`/service-requests/${created.body.id}`)
      .expect(200);
    expect(customerDetail.body.liveEstimate).toBeNull();
    await customer(customerB)
      .put(`/estimates/${draft.body.id}`)
      .send({
        items: [
          {
            itemType: 'PART',
            description: 'IDOR attempt',
            quantity: '1',
            unitPrice: '1',
          },
        ],
      })
      .expect(403);
    await customer(customerB, 'CUSTOMER_ADMIN')
      .post(`/estimates/${draft.body.id}/approve`)
      .expect(404);
    await request(app.getHttpServer())
      .post(`/service-requests/${created.body.id}/estimates`)
      .set('authorization', authorization('DISPATCHER', tenantA))
      .send({
        items: [
          {
            itemType: 'PART',
            description: 'Missing permission',
            quantity: '1',
            unitPrice: '1',
          },
        ],
      })
      .expect(403);

    const updated = await staff()
      .put(`/estimates/${draft.body.id}`)
      .send({
        notes: 'Updated draft',
        items: [
          {
            itemType: 'LABOR',
            description: 'Inspection',
            quantity: '3',
            unitPrice: '100.50',
          },
        ],
      })
      .expect(200);
    expect(updated.body).toMatchObject({
      totalAmount: '301.50',
      notes: 'Updated draft',
      items: [{ quantity: '3.00', amount: '301.50' }],
    });
    await staff()
      .put(`/estimates/${draft.body.id}`)
      .send({
        items: [
          {
            itemType: 'PART',
            description: 'Precision overflow',
            quantity: '1',
            unitPrice: '1.001',
          },
        ],
      })
      .expect(400);
    const concurrentUpdates = await Promise.all([
      staff()
        .put(`/estimates/${draft.body.id}`)
        .send({
          items: [
            {
              itemType: 'PART',
              description: 'Concurrent update A',
              quantity: '2',
              unitPrice: '10',
            },
          ],
        }),
      staff()
        .put(`/estimates/${draft.body.id}`)
        .send({
          items: [
            {
              itemType: 'PART',
              description: 'Concurrent update B',
              quantity: '3',
              unitPrice: '10',
            },
          ],
        }),
    ]);
    expect(concurrentUpdates.map(({ status }) => status)).toEqual([200, 200]);
    const persistedItems = await prisma.costEstimateItem.findMany({
      where: { estimateId: draft.body.id },
    });
    expect(persistedItems).toHaveLength(1);
    expect(['Concurrent update A', 'Concurrent update B']).toContain(
      persistedItems[0].description,
    );
    await staff().delete(`/estimates/${draft.body.id}`).expect(204);
  });

  it('serializes concurrent estimate revision allocation and enforces one live estimate', async () => {
    assets.warranties.set(equipmentId, {
      equipmentId,
      date: '2026-10-23',
      result: 'OUT_OF_WARRANTY',
      warrantyId: randomUUID(),
      endDate: '2026-09-23',
    });
    const created = await createRequest('Concurrent estimate').expect(201);
    await staff()
      .post(`/service-requests/${created.body.id}/review`)
      .expect(200);
    const input = {
      items: [
        {
          itemType: 'LABOR',
          description: 'Assessment',
          quantity: '1',
          unitPrice: '0',
        },
      ],
    };
    const responses = await Promise.all(
      Array.from({ length: 2 }, () =>
        staff()
          .post(`/service-requests/${created.body.id}/estimates`)
          .send(input),
      ),
    );
    expect(responses.map(({ status }) => status).sort()).toEqual([201, 409]);
    expect(
      await prisma.costEstimate.count({
        where: { requestId: created.body.id, status: 'DRAFT' },
      }),
    ).toBe(1);
  });

  it('sends and approves an out-of-warranty estimate atomically with request history', async () => {
    assets.warranties.set(equipmentId, {
      equipmentId,
      date: '2026-10-23',
      result: 'OUT_OF_WARRANTY',
      warrantyId: randomUUID(),
      endDate: '2026-09-23',
    });
    const created = await createRequest('Estimate approval').expect(201);
    await staff()
      .post(`/service-requests/${created.body.id}/review`)
      .expect(200);
    const draft = await staff()
      .post(`/service-requests/${created.body.id}/estimates`)
      .send({
        items: [
          {
            itemType: 'LABOR',
            description: 'Repair',
            quantity: '1',
            unitPrice: '1200',
          },
        ],
      })
      .expect(201);
    await staff().post(`/estimates/${draft.body.id}/send`).expect(200);
    await staff()
      .put(`/estimates/${draft.body.id}`)
      .send({
        items: [
          {
            itemType: 'LABOR',
            description: 'Sent estimate must not change',
            quantity: '1',
            unitPrice: '1',
          },
        ],
      })
      .expect(409);
    await staff().delete(`/estimates/${draft.body.id}`).expect(409);

    const approved = await customer(customerA, 'CUSTOMER_ADMIN')
      .post(`/estimates/${draft.body.id}/approve`)
      .expect(200);
    expect(approved.body.status).toBe('APPROVED');
    expect(
      await prisma.serviceRequest.findUniqueOrThrow({
        where: { id: created.body.id },
      }),
    ).toMatchObject({ status: 'ACCEPTED' });
    expect(
      await prisma.requestStatusHistory.count({
        where: {
          requestId: created.body.id,
          oldStatus: 'AWAITING_CUSTOMER_APPROVAL',
          newStatus: 'ACCEPTED',
        },
      }),
    ).toBe(1);
  });

  it('records customer rejection and creates revisions through the approved state transitions', async () => {
    assets.warranties.set(equipmentId, {
      equipmentId,
      date: '2026-10-23',
      result: 'OUT_OF_WARRANTY',
      warrantyId: randomUUID(),
      endDate: '2026-09-23',
    });
    const created = await createRequest('Estimate revision').expect(201);
    await staff()
      .post(`/service-requests/${created.body.id}/review`)
      .expect(200);
    const firstDraft = await staff()
      .post(`/service-requests/${created.body.id}/estimates`)
      .send({
        items: [
          {
            itemType: 'LABOR',
            description: 'Repair',
            quantity: '1',
            unitPrice: '100',
          },
        ],
      })
      .expect(201);
    await staff().post(`/estimates/${firstDraft.body.id}/send`).expect(200);
    await customer(customerA, 'CUSTOMER_ADMIN')
      .post(`/estimates/${firstDraft.body.id}/reject`)
      .send({ reason: 'Please review the scope.' })
      .expect(200);

    const nextDraft = await staff()
      .post(`/service-requests/${created.body.id}/estimates`)
      .send({
        items: [
          {
            itemType: 'LABOR',
            description: 'Revised repair',
            quantity: '1',
            unitPrice: '80',
          },
        ],
      })
      .expect(201);
    expect(nextDraft.body.revisionNo).toBe(2);
    await staff().post(`/estimates/${nextDraft.body.id}/send`).expect(200);
    const revised = await staff()
      .post(`/estimates/${nextDraft.body.id}/revise`)
      .expect(201);

    expect(revised.body).toMatchObject({
      revisionNo: 3,
      status: 'DRAFT',
      totalAmount: '80.00',
    });
    expect(
      await prisma.costEstimate.findUniqueOrThrow({
        where: { id: nextDraft.body.id },
      }),
    ).toMatchObject({ status: 'SUPERSEDED' });
    expect(
      await prisma.serviceRequest.findUniqueOrThrow({
        where: { id: created.body.id },
      }),
    ).toMatchObject({ status: 'REVIEWING' });
  });

  it('commits lazy expiration and prevents approval of an expired estimate', async () => {
    assets.warranties.set(equipmentId, {
      equipmentId,
      date: '2026-10-23',
      result: 'OUT_OF_WARRANTY',
      warrantyId: randomUUID(),
      endDate: '2026-09-23',
    });
    const created = await createRequest('Expired estimate').expect(201);
    await staff()
      .post(`/service-requests/${created.body.id}/review`)
      .expect(200);
    const draft = await staff()
      .post(`/service-requests/${created.body.id}/estimates`)
      .send({
        validUntil: new Date(Date.now() + 48 * 60 * 60 * 1000)
          .toISOString()
          .slice(0, 10),
        items: [
          {
            itemType: 'LABOR',
            description: 'Repair',
            quantity: '1',
            unitPrice: '1200',
          },
        ],
      })
      .expect(201);
    await staff().post(`/estimates/${draft.body.id}/send`).expect(200);
    await prisma.costEstimate.update({
      where: { id: draft.body.id },
      data: { validUntil: new Date(Date.now() - 48 * 60 * 60 * 1000) },
    });

    const response = await customer(customerA, 'CUSTOMER_ADMIN')
      .post(`/estimates/${draft.body.id}/approve`)
      .expect(409);
    expect(response.body.code).toBe('ESTIMATE_EXPIRED');
    expect(
      await prisma.costEstimate.findUniqueOrThrow({
        where: { id: draft.body.id },
      }),
    ).toMatchObject({ status: 'EXPIRED' });
    expect(
      await prisma.serviceRequest.findUniqueOrThrow({
        where: { id: created.body.id },
      }),
    ).toMatchObject({ status: 'AWAITING_CUSTOMER_APPROVAL' });
  });

  it('allows only one concurrent customer approval', async () => {
    assets.warranties.set(equipmentId, {
      equipmentId,
      date: '2026-10-23',
      result: 'OUT_OF_WARRANTY',
      warrantyId: randomUUID(),
      endDate: '2026-09-23',
    });
    const created = await createRequest('Concurrent approval').expect(201);
    await staff()
      .post(`/service-requests/${created.body.id}/review`)
      .expect(200);
    const draft = await staff()
      .post(`/service-requests/${created.body.id}/estimates`)
      .send({
        items: [
          {
            itemType: 'LABOR',
            description: 'Repair',
            quantity: '1',
            unitPrice: '1200',
          },
        ],
      })
      .expect(201);
    await staff().post(`/estimates/${draft.body.id}/send`).expect(200);
    const responses = await Promise.all([
      customer(customerA, 'CUSTOMER_ADMIN').post(
        `/estimates/${draft.body.id}/approve`,
      ),
      customer(customerA, 'CUSTOMER_ADMIN').post(
        `/estimates/${draft.body.id}/approve`,
      ),
    ]);
    expect(responses.map(({ status }) => status).sort()).toEqual([200, 409]);
    expect(
      await prisma.requestStatusHistory.count({
        where: {
          requestId: created.body.id,
          oldStatus: 'AWAITING_CUSTOMER_APPROVAL',
          newStatus: 'ACCEPTED',
        },
      }),
    ).toBe(1);
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

    const customer = request
      .agent(app.getHttpServer())
      .set('authorization', authorization('CUSTOMER_USER', tenantA, customerA));
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
    const workOrderEvent = workOrderCreated(created.body.id);
    await app.get(WorkOrderEventsConsumer).handle(workOrderEvent);

    await app
      .get(WorkOrderEventsConsumer)
      .handle(
        workOrderCancelled(
          created.body.id,
          true,
          workOrderEvent.payload.workOrderId,
        ),
      );

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

  it('ignores completion from a replaced Work Order', async () => {
    const created = await createRequest('Replaced Work Order').expect(201);
    await reviewAndAccept(created.body.id);
    const consumer = app.get(WorkOrderEventsConsumer);
    const first = workOrderCreated(created.body.id);
    await consumer.handle(first);
    await consumer.handle({
      ...first,
      eventId: randomUUID(),
      eventType: 'WorkOrderCompleted',
      eventVersion: 2,
      payload: {
        workOrderId: first.payload.workOrderId,
        workOrderNo: 'WO-OLD',
        serviceRequestId: created.body.id,
        maintenanceTaskId: null,
        equipmentId,
        customerId: customerA,
        serviceReportId: randomUUID(),
        result: 'UNRESOLVED',
        completedAt: new Date().toISOString(),
        customerSummary: 'The fault remains.',
      },
    });
    const replacement = workOrderCreated(created.body.id);
    await consumer.handle(replacement);
    await consumer.handle({
      ...first,
      eventId: randomUUID(),
      eventType: 'WorkOrderCompleted',
      eventVersion: 2,
      payload: {
        workOrderId: first.payload.workOrderId,
        workOrderNo: 'WO-OLD',
        serviceRequestId: created.body.id,
        maintenanceTaskId: null,
        equipmentId,
        customerId: customerA,
        serviceReportId: randomUUID(),
        result: 'RESOLVED',
        completedAt: new Date().toISOString(),
        customerSummary: 'Stale completion.',
      },
    });

    const persisted = await prisma.serviceRequest.findUniqueOrThrow({
      where: { id: created.body.id },
    });
    expect(persisted).toMatchObject({
      status: 'PROCESSING',
      activeWorkOrderId: replacement.payload.workOrderId,
    });
    expect(persisted.resolutionSummary).toBeNull();
  });

  it('does not acknowledge a completion that arrives before WorkOrderCreated', async () => {
    const created = await createRequest('Out-of-order event').expect(201);
    await reviewAndAccept(created.body.id);
    const workOrderEvent = workOrderCreated(created.body.id);
    const completion: EventEnvelope<WorkOrderCompletedV2> = {
      ...workOrderEvent,
      eventId: randomUUID(),
      eventType: 'WorkOrderCompleted',
      eventVersion: 2,
      payload: {
        workOrderId: workOrderEvent.payload.workOrderId,
        workOrderNo: 'WO-EARLY',
        serviceRequestId: created.body.id,
        maintenanceTaskId: null,
        equipmentId,
        customerId: customerA,
        serviceReportId: randomUUID(),
        result: 'RESOLVED',
        completedAt: new Date().toISOString(),
        customerSummary: 'Completed before create delivery.',
      },
    };

    await expect(
      app.get(WorkOrderEventsConsumer).handle(completion),
    ).rejects.toThrow(/Cannot apply WorkOrderCompleted/);
    expect(
      await prisma.processedEvent.count({
        where: { eventId: completion.eventId },
      }),
    ).toBe(0);
    expect(
      await prisma.serviceRequest.findUniqueOrThrow({
        where: { id: created.body.id },
      }),
    ).toMatchObject({ status: 'ACCEPTED', activeWorkOrderId: null });
  });

  it('rejects Work Order events with a mismatched tenant reference', async () => {
    const created = await createRequest('Mismatched event tenant').expect(201);
    await reviewAndAccept(created.body.id);
    const event = workOrderCreated(created.body.id);
    await expect(
      app.get(WorkOrderEventsConsumer).handle({
        ...event,
        tenantId: tenantB,
      }),
    ).rejects.toThrow(/was not found for Work Order event/);
    expect(
      await prisma.processedEvent.count({
        where: { eventId: event.eventId },
      }),
    ).toBe(0);
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

  it('M2-CE-01 serializes send and mixed approve/reject/revise races', async () => {
    const { requestId, estimateId } = await draftEstimate();
    const sends = await Promise.all([
      staff().post(`/estimates/${estimateId}/send`),
      staff().post(`/estimates/${estimateId}/send`),
    ]);
    expect(sends.map((r) => r.status).sort()).toEqual([200, 409]);
    const responses = await Promise.all([
      customer(customerA, 'CUSTOMER_ADMIN').post(
        `/estimates/${estimateId}/approve`,
      ),
      customer(customerA, 'CUSTOMER_ADMIN')
        .post(`/estimates/${estimateId}/reject`)
        .send({ reason: 'Decline' }),
      staff().post(`/estimates/${estimateId}/revise`),
    ]);
    expect(responses.filter((r) => r.status < 300)).toHaveLength(1);
    expect(responses.filter((r) => r.status === 409)).toHaveLength(2);
    expect(
      await prisma.costEstimate.count({
        where: { requestId, status: { in: ['DRAFT', 'SENT', 'APPROVED'] } },
      }),
    ).toBeLessThanOrEqual(1);
    expect(
      await prisma.requestStatusHistory.count({
        where: { requestId, oldStatus: 'AWAITING_CUSTOMER_APPROVAL' },
      }),
    ).toBe(1);
    expect(
      await prisma.outboxEvent.count({
        where: {
          aggregateId: requestId,
          eventType: 'ServiceRequestStatusChanged',
        },
      }),
    ).toBe(4);
  });

  it('M2-CE-02 allocates one next revision for concurrent revise', async () => {
    const { requestId, estimateId } = await draftEstimate();
    await staff().post(`/estimates/${estimateId}/send`).expect(200);
    const responses = await Promise.all([
      staff().post(`/estimates/${estimateId}/revise`),
      staff().post(`/estimates/${estimateId}/revise`),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(
      (
        await prisma.costEstimate.findMany({
          where: { requestId },
          orderBy: { revisionNo: 'asc' },
        })
      ).map((e) => [e.revisionNo, e.status]),
    ).toEqual([
      [1, 'SUPERSEDED'],
      [2, 'DRAFT'],
    ]);
    await customer(customerA, 'CUSTOMER_ADMIN')
      .post(`/estimates/${estimateId}/approve`)
      .expect(409);
  });

  it('M2-CE-03 enforces the partial live-revision index and revision uniqueness in PostgreSQL', async () => {
    const { requestId, estimateId } = await draftEstimate();
    const data = {
      tenantId: tenantA,
      requestId,
      createdBy: randomUUID(),
      revisionNo: 2,
    };
    await expect(prisma.costEstimate.create({ data })).rejects.toMatchObject({
      code: 'P2002',
    });
    await expect(
      prisma.costEstimate.create({
        data: { ...data, revisionNo: 1, status: 'REJECTED' },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
    expect(await prisma.costEstimate.count({ where: { requestId } })).toBe(1);
    await staff().delete(`/estimates/${estimateId}`).expect(204);
    expect(await prisma.costEstimateItem.count({ where: { estimateId } })).toBe(
      0,
    );
  });

  it.each(['send', 'approve', 'reject', 'revise'])(
    'M2-TX-01 rolls back %s, history, comments, items and outbox on commit failure',
    async (action) => {
      const { requestId, estimateId } = await draftEstimate();
      if (action !== 'send')
        await staff().post(`/estimates/${estimateId}/send`).expect(200);
      const before = {
        request: await prisma.serviceRequest.findUniqueOrThrow({
          where: { id: requestId },
        }),
        estimates: await prisma.costEstimate.findMany({
          where: { requestId },
          include: { items: true },
        }),
        history: await prisma.requestStatusHistory.count({
          where: { requestId },
        }),
        outbox: await prisma.outboxEvent.count({
          where: { aggregateId: requestId },
        }),
      };
      const failure = failNextCommit();
      try {
        const actor = ['approve', 'reject'].includes(action)
          ? customer(customerA, 'CUSTOMER_ADMIN')
          : staff();
        await actor
          .post(`/estimates/${estimateId}/${action}`)
          .send(action === 'reject' ? { reason: 'Should roll back' } : {})
          .expect(500);
      } finally {
        failure.mockRestore();
      }
      expect(
        await prisma.serviceRequest.findUniqueOrThrow({
          where: { id: requestId },
        }),
      ).toEqual(before.request);
      expect(
        await prisma.costEstimate.findMany({
          where: { requestId },
          include: { items: true },
        }),
      ).toEqual(before.estimates);
      expect(
        await prisma.requestStatusHistory.count({ where: { requestId } }),
      ).toBe(before.history);
      expect(
        await prisma.outboxEvent.count({ where: { aggregateId: requestId } }),
      ).toBe(before.outbox);
      expect(await prisma.requestComment.count({ where: { requestId } })).toBe(
        0,
      );
    },
  );

  it('M2-TX-02 restores deleted items and total when draft replacement rolls back', async () => {
    const { estimateId } = await draftEstimate();
    const before = await prisma.costEstimate.findUniqueOrThrow({
      where: { id: estimateId },
      include: { items: true },
    });
    const failure = failNextCommit();
    try {
      await staff()
        .put(`/estimates/${estimateId}`)
        .send({
          items: [
            { ...estimateInput.items[0], quantity: '3', unitPrice: '12.34' },
          ],
        })
        .expect(500);
    } finally {
      failure.mockRestore();
    }
    expect(
      await prisma.costEstimate.findUniqueOrThrow({
        where: { id: estimateId },
        include: { items: true },
      }),
    ).toEqual(before);
  });

  it.each(['approve', 'reject', 'revise'])(
    'M2-CE-04 checks expiration after acquiring the lock for %s',
    async (action) => {
      const { requestId, estimateId } = await draftEstimate();
      await staff().post(`/estimates/${estimateId}/send`).expect(200);
      await prisma.costEstimate.update({
        where: { id: estimateId },
        data: { validUntil: new Date('2026-10-26T00:00:00Z') },
      });
      const service = app.get(ServiceRequestsService) as unknown as {
        todayInVietnam(): string;
        lockEstimate(
          tx: Prisma.TransactionClient,
          scope: { tenantId: string; customerId: string | null },
          id: string,
        ): Promise<Prisma.CostEstimateGetPayload<{ include: { items: true } }>>;
      };
      // Advance midnight only once the row lock has been acquired. A preflight
      // expiration check sees Oct 26 and cannot protect the later write.
      let today = '2026-10-26';
      const clock = jest
        .spyOn(service, 'todayInVietnam')
        .mockImplementation(() => today);
      const originalLock = service.lockEstimate.bind(service);
      const lock = jest
        .spyOn(service, 'lockEstimate')
        .mockImplementation(async (...args) => {
          const value = await originalLock(...args);
          today = '2026-10-27';
          return value;
        });
      try {
        const actor =
          action === 'revise' ? staff() : customer(customerA, 'CUSTOMER_ADMIN');
        const response = await actor
          .post(`/estimates/${estimateId}/${action}`)
          .send({})
          .expect(409);
        expect(response.body.code).toBe('ESTIMATE_EXPIRED');
      } finally {
        clock.mockRestore();
        lock.mockRestore();
      }
      expect(
        await prisma.costEstimate.findUniqueOrThrow({
          where: { id: estimateId },
        }),
      ).toMatchObject({ status: 'EXPIRED', respondedBy: null });
      expect(
        await prisma.serviceRequest.findUniqueOrThrow({
          where: { id: requestId },
        }),
      ).toMatchObject({ status: 'AWAITING_CUSTOMER_APPROVAL' });
      await staff()
        .post(`/service-requests/${requestId}/estimates`)
        .send(estimateInput)
        .expect(409);
    },
  );

  it('M2-CE-05 rounds half cents like PostgreSQL and rejects precision, amount and total overflow', async () => {
    const { estimateId } = await draftEstimate();
    const updated = await staff()
      .put(`/estimates/${estimateId}`)
      .send({
        items: [
          { ...estimateInput.items[0], quantity: '0.01', unitPrice: '0.50' },
          { ...estimateInput.items[0], quantity: '0.01', unitPrice: '0.50' },
        ],
      })
      .expect(200);
    expect(updated.body.totalAmount).toBe('0.02');
    expect(updated.body.items.map((i: { amount: string }) => i.amount)).toEqual(
      ['0.01', '0.01'],
    );
    for (const invalid of [
      { quantity: '0', unitPrice: '1' },
      { quantity: '1.001', unitPrice: '1' },
      { quantity: '10000000000', unitPrice: '1' },
      { quantity: '1', unitPrice: '-1' },
      { quantity: '1', unitPrice: '1000000000000' },
      { quantity: '2', unitPrice: '999999999999.99' },
    ])
      await staff()
        .put(`/estimates/${estimateId}`)
        .send({ items: [{ ...estimateInput.items[0], ...invalid }] })
        .expect(400);
    const overflow = await staff()
      .put(`/estimates/${estimateId}`)
      .send({
        items: [
          { ...estimateInput.items[0], unitPrice: '999999999999.99' },
          estimateInput.items[0],
        ],
      })
      .expect(400);
    expect(overflow.body.code).toBe('ESTIMATE_TOTAL_OVERFLOW');
    for (const invalid of [
      { ...estimateInput, totalAmount: '1' },
      { items: [{ ...estimateInput.items[0], amount: '1' }] },
      { ...estimateInput, validUntil: '2026-02-30' },
      { ...estimateInput, currency: '123' },
      { items: [] },
    ])
      await staff().put(`/estimates/${estimateId}`).send(invalid).expect(400);
    expect(
      await prisma.costEstimate.findUniqueOrThrow({
        where: { id: estimateId },
      }),
    ).toMatchObject({ totalAmount: new Prisma.Decimal('0.02') });
  });

  it('M2-WO-01 deduplicates concurrent Created and Completed deliveries including new event IDs', async () => {
    const created = await createRequest('Concurrent consumer').expect(201);
    await reviewAndAccept(created.body.id);
    const event = workOrderCreated(created.body.id);
    const consumer = app.get(WorkOrderEventsConsumer);
    await Promise.all([
      consumer.handle(event),
      consumer.handle(event),
      consumer.handle({ ...event, eventId: randomUUID() }),
    ]);
    const completed = completion(event);
    await Promise.all([
      consumer.handle(completed),
      consumer.handle(completed),
      consumer.handle({ ...completed, eventId: randomUUID() }),
    ]);
    expect(
      await prisma.requestStatusHistory.count({
        where: { requestId: created.body.id, newStatus: 'PROCESSING' },
      }),
    ).toBe(1);
    expect(
      await prisma.requestStatusHistory.count({
        where: { requestId: created.body.id, newStatus: 'RESOLVED' },
      }),
    ).toBe(1);
    expect(await prisma.processedEvent.count()).toBe(4);
  });

  it('M2-WO-02 rolls back inbox, status, history and outbox and then retries successfully', async () => {
    const created = await createRequest('Consumer rollback').expect(201);
    await reviewAndAccept(created.body.id);
    const event = workOrderCreated(created.body.id);
    const consumer = app.get(WorkOrderEventsConsumer);
    const failure = failNextCommit();
    try {
      await expect(consumer.handle(event)).rejects.toThrow(
        'Injected pre-commit failure',
      );
    } finally {
      failure.mockRestore();
    }
    expect(
      await prisma.processedEvent.count({ where: { eventId: event.eventId } }),
    ).toBe(0);
    expect(
      await prisma.requestStatusHistory.count({
        where: { requestId: created.body.id, newStatus: 'PROCESSING' },
      }),
    ).toBe(0);
    expect(
      await prisma.outboxEvent.count({
        where: { aggregateId: created.body.id },
      }),
    ).toBe(4);
    expect(
      await prisma.serviceRequest.findUniqueOrThrow({
        where: { id: created.body.id },
      }),
    ).toMatchObject({ status: 'ACCEPTED', activeWorkOrderId: null });
    await consumer.handle(event);
    expect(
      await prisma.processedEvent.count({ where: { eventId: event.eventId } }),
    ).toBe(1);
  });

  it.each([false, true])(
    'M2-WO-03 keeps early cancellation out of inbox until Created (%s)',
    async (intent) => {
      const created = await createRequest('Early cancellation').expect(201);
      await reviewAndAccept(created.body.id);
      const event = workOrderCreated(created.body.id);
      const cancel = workOrderCancelled(
        created.body.id,
        intent,
        event.payload.workOrderId,
      );
      const consumer = app.get(WorkOrderEventsConsumer);
      await expect(consumer.handle(cancel)).rejects.toThrow(
        /Cannot apply WorkOrderCancelled/,
      );
      expect(
        await prisma.processedEvent.count({
          where: { eventId: cancel.eventId },
        }),
      ).toBe(0);
      await consumer.handle(event);
      await consumer.handle(cancel);
      await consumer.handle(cancel);
      expect(
        await prisma.serviceRequest.findUniqueOrThrow({
          where: { id: created.body.id },
        }),
      ).toMatchObject({
        status: intent ? 'CANCELLED' : 'ACCEPTED',
        activeWorkOrderId: null,
      });
    },
  );

  it('M2-WO-04 ignores stale cancellation while a replacement Work Order is active', async () => {
    const created = await createRequest('Stale cancellation').expect(201);
    await reviewAndAccept(created.body.id);
    const old = workOrderCreated(created.body.id);
    const consumer = app.get(WorkOrderEventsConsumer);
    await consumer.handle(old);
    await consumer.handle(
      workOrderCancelled(created.body.id, false, old.payload.workOrderId),
    );
    const replacement = workOrderCreated(created.body.id);
    await consumer.handle(replacement);
    await consumer.handle(
      workOrderCancelled(created.body.id, true, old.payload.workOrderId),
    );
    expect(
      await prisma.serviceRequest.findUniqueOrThrow({
        where: { id: created.body.id },
      }),
    ).toMatchObject({
      status: 'PROCESSING',
      activeWorkOrderId: replacement.payload.workOrderId,
    });
  });

  it('M2-WO-05 refuses unverified legacy PROCESSING rows without committing inbox', async () => {
    const created = await createRequest('Legacy processing').expect(201);
    await reviewAndAccept(created.body.id);
    await prisma.serviceRequest.update({
      where: { id: created.body.id },
      data: { status: 'PROCESSING' },
    });
    const event = workOrderCreated(created.body.id);
    const consumer = app.get(WorkOrderEventsConsumer);
    for (const pending of [
      event,
      completion(event),
      workOrderCancelled(created.body.id, true, event.payload.workOrderId),
    ]) {
      await expect(consumer.handle(pending)).rejects.toThrow(
        /Cannot verify Work Order/,
      );
      expect(
        await prisma.processedEvent.count({
          where: { eventId: pending.eventId },
        }),
      ).toBe(0);
    }
  });

  it('M2-SEC-01 scopes every customer read and result action, including pagination and nested data', async () => {
    const { requestId, estimateId } = await draftEstimate();
    await staff()
      .post(`/service-requests/${requestId}/comments`)
      .send({ content: 'SECRET-INTERNAL', visibility: 'INTERNAL' })
      .expect(201);
    await prisma.requestAttachment.create({
      data: {
        tenantId: tenantA,
        requestId,
        storageKey: 'SECRET-STORAGE',
        fileName: 'internal.txt',
        mimeType: 'text/plain',
        uploadedBy: randomUUID(),
      },
    });
    for (const path of [
      `/service-requests/${requestId}`,
      `/service-requests/${requestId}/history`,
      `/service-requests/${requestId}/comments`,
      `/service-requests/${requestId}/estimates`,
    ]) {
      await customer(customerB).get(path).expect(404);
      await staff(tenantB).get(path).expect(404);
      const own = await customer().get(path).expect(200);
      expect(JSON.stringify(own.body)).not.toMatch(
        /SECRET-|activeWorkOrderId|storageKey|_count/,
      );
    }
    await customer().get(`/internal/service-requests/${requestId}`).expect(403);
    const list = await customer(customerB)
      .get('/service-requests')
      .query({ customerId: customerA })
      .expect(200);
    expect(list.body).toMatchObject({ items: [], total: 0 });
    await staff(tenantB).post(`/estimates/${estimateId}/send`).expect(404);
    await customer().post(`/estimates/${estimateId}/approve`).expect(403);
    for (const action of ['approve', 'reject']) {
      const hidden = await customer(customerA, 'CUSTOMER_ADMIN')
        .post(`/estimates/${estimateId}/${action}`)
        .send({})
        .expect(404);
      expect(JSON.stringify(hidden.body)).not.toContain('DRAFT');
    }
    await staff().post(`/estimates/${estimateId}/approve`).expect(403);
    for (const action of ['confirm', 'reopen']) {
      await customer(customerB)
        .post(`/service-requests/${requestId}/${action}`)
        .send({ reason: 'IDOR' })
        .expect(404);
    }
    await request(app.getHttpServer())
      .post(`/estimates/${estimateId}/send`)
      .expect(401);
  });

  it('M2-SEC-02 allows own-customer reopen then confirm after a real consumer transition', async () => {
    const created = await createRequest('Confirm and reopen').expect(201);
    await reviewAndAccept(created.body.id);
    const consumer = app.get(WorkOrderEventsConsumer);
    const first = workOrderCreated(created.body.id);
    await consumer.handle(first);
    await consumer.handle(completion(first));
    await customer()
      .post(`/service-requests/${created.body.id}/reopen`)
      .send({ reason: 'Still noisy' })
      .expect(200);
    const next = workOrderCreated(created.body.id);
    await consumer.handle(next);
    await consumer.handle(completion(next));
    await customer()
      .post(`/service-requests/${created.body.id}/confirm`)
      .expect(200);
    const closed = await prisma.serviceRequest.findUniqueOrThrow({
      where: { id: created.body.id },
    });
    expect(closed).toMatchObject({ status: 'CLOSED', activeWorkOrderId: null });
    expect(closed.confirmedBy).not.toBeNull();
    for (const terminalEvent of [
      workOrderCreated(created.body.id),
      completion(next),
      workOrderCancelled(created.body.id, true, next.payload.workOrderId),
    ])
      await consumer.handle(terminalEvent);
    expect(
      await prisma.serviceRequest.findUniqueOrThrow({
        where: { id: created.body.id },
      }),
    ).toEqual(closed);
  });

  it('M2-API-01 returns warranty calendar dates according to OpenAPI on review, refresh and detail', async () => {
    const created = await createRequest('Calendar date contract').expect(201);
    for (const action of ['review', 'warranty-check']) {
      const response = await staff()
        .post(`/service-requests/${created.body.id}/${action}`)
        .expect(200);
      expect(response.body.warrantyCheck.warrantyEndDate).toBe('2027-10-23');
    }
    const detail = await customer()
      .get(`/service-requests/${created.body.id}`)
      .expect(200);
    expect(detail.body.warrantyCheck.warrantyEndDate).toBe('2027-10-23');
  });

  it('M2-WO-06 matches UUID references without depending on hex letter case', async () => {
    const created = await createRequest('Case-insensitive UUID').expect(201);
    await reviewAndAccept(created.body.id);
    const event = workOrderCreated(created.body.id);
    const consumer = app.get(WorkOrderEventsConsumer);
    const uppercase = {
      ...event,
      aggregateId: event.aggregateId.toUpperCase(),
      payload: {
        ...event.payload,
        workOrderId: event.payload.workOrderId.toUpperCase(),
        equipmentId: equipmentId.toUpperCase(),
        customerId: customerA.toUpperCase(),
      },
    };
    await consumer.handle(uppercase);
    await consumer.handle(completion(uppercase));
    expect(
      await prisma.serviceRequest.findUniqueOrThrow({
        where: { id: created.body.id },
      }),
    ).toMatchObject({ status: 'RESOLVED' });
  });

  it('M2-SEC-03 rejects foreign equipment, customer and aggregate references without committing inbox', async () => {
    const created = await createRequest('Event reference validation').expect(
      201,
    );
    await reviewAndAccept(created.body.id);
    const event = workOrderCreated(created.body.id);
    const consumer = app.get(WorkOrderEventsConsumer);
    for (const invalid of [
      { ...event, aggregateId: randomUUID() },
      { ...event, payload: { ...event.payload, equipmentId: randomUUID() } },
      { ...event, payload: { ...event.payload, customerId: customerB } },
    ])
      await expect(consumer.handle(invalid)).rejects.toThrow();
    expect(await prisma.processedEvent.count()).toBe(0);
    expect(
      await prisma.serviceRequest.findUniqueOrThrow({
        where: { id: created.body.id },
      }),
    ).toMatchObject({ status: 'ACCEPTED', activeWorkOrderId: null });
  });
});
