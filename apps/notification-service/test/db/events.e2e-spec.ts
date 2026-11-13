import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  Events,
  type EventDefinition,
  type EventEnvelope,
  type PayloadOf,
} from '@pbl6/event-contracts';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { NotificationEventsService } from '../../src/events/notification-events.service';
import { RecipientProjectionService } from '../../src/events/recipient-projection.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { testDatabaseUrl } from './support/test-env';

describe('Notification event projections and fan-out (notification_test_db)', () => {
  let db: PrismaClient;
  let verified = false;
  let events: NotificationEventsService;
  let projections: RecipientProjectionService;
  const tenantId = randomUUID();
  const customerId = randomUUID();
  const users = {
    manager: randomUUID(),
    customer: randomUUID(),
    technician: randomUUID(),
    alternateTechnician: randomUUID(),
    inventory: randomUUID(),
  };
  const bootstrapRunId = randomUUID();
  const bootstrapRunIds = [bootstrapRunId];
  const serviceRequestId = randomUUID();
  const workOrderId = randomUUID();
  const stockId = randomUUID();
  const eventIds: string[] = [];

  function envelope<D extends EventDefinition>(
    definition: D,
    payload: PayloadOf<D>,
    aggregateId: string,
    occurredAt: string,
  ): EventEnvelope<PayloadOf<D>> {
    const eventId = randomUUID();
    eventIds.push(eventId);
    return {
      eventId,
      eventType: definition.type,
      eventVersion: definition.version,
      producer: definition.producer,
      tenantId,
      aggregateType: definition.aggregateType,
      aggregateId,
      occurredAt,
      correlationId: null,
      payload,
    };
  }

  function recipientSnapshot(
    userId: string,
    userType: 'TENANT_STAFF' | 'CUSTOMER',
    role: string,
    revision: string,
    customerMembership: {
      membershipId: string;
      customerId: string;
      status: 'ACTIVE' | 'INACTIVE';
      sourceChangedAt: string;
    } | null,
    accountStatus: 'ACTIVE' | 'SUSPENDED' = 'ACTIVE',
    snapshotBootstrapRunId: string | null = bootstrapRunId,
  ) {
    const eventId = randomUUID();
    eventIds.push(eventId);
    return projections.applySnapshot({
      eventId,
      eventType: 'NotificationRecipientSnapshot',
      eventVersion: 1,
      producer: 'identity-service',
      tenantId,
      aggregateType: 'User',
      aggregateId: userId,
      occurredAt: '2026-11-02T00:00:00.000Z',
      correlationId: null,
      payload: {
        userId,
        userType,
        accountStatus,
        roles: [role],
        customerMembership,
        revision,
        bootstrapRunId: snapshotBootstrapRunId,
      },
    });
  }

  it('delivers handover submission/results once and suppresses late older versions', async () => {
    await recipientSnapshot(users.manager, 'TENANT_STAFF', 'SERVICE_MANAGER', '1000', null, 'ACTIVE', null);
    await recipientSnapshot(users.customer, 'CUSTOMER', 'CUSTOMER_ADMIN', '1000', {
      membershipId: randomUUID(), customerId, status: 'ACTIVE', sourceChangedAt: new Date().toISOString(),
    }, 'ACTIVE', null);
    const run = randomUUID(); bootstrapRunIds.push(run);
    await projections.applyBootstrapCompleted(envelope(Events.NotificationRecipientBootstrapCompleted, {
      bootstrapRunId: run, expectedUsers: 0, startedAt: new Date().toISOString(), completedAt: new Date().toISOString(),
    }, run, new Date().toISOString()));
    const handoverId = randomUUID();
    const payload = { handoverId, equipmentId: randomUUID(), customerId, createdBy: users.manager,
      handoverNo: 'BG-notification-test', assetCode: 'P-01', version: 2, status: 'PENDING_CUSTOMER_CONFIRMATION' as const };
    const submitted = envelope(Events.EquipmentHandoverChanged, payload, handoverId, new Date().toISOString());
    await events.handle(submitted); await events.handle(submitted);
    const delivered = await db.notification.findMany({ where: { sourceEventId: submitted.eventId } });
    expect(delivered).toHaveLength(1);
    expect(delivered[0]).toMatchObject({ userId: users.customer, customerId, payload: { resourceType: 'EQUIPMENT_HANDOVER', resourceId: handoverId } });
    const activated = envelope(Events.EquipmentHandoverChanged, { ...payload, version: 3, status: 'ACTIVATED' }, handoverId, new Date().toISOString());
    await events.handle(activated); await events.handle(activated);
    expect(await db.notification.count({ where: { sourceEventId: activated.eventId } })).toBe(2);
    const late = envelope(Events.EquipmentHandoverChanged, payload, handoverId, new Date().toISOString());
    await events.handle(late);
    expect(await db.notification.count({ where: { sourceEventId: late.eventId } })).toBe(0);
    // Restore original suite fixtures; the independent test above may run first.
    await db.notification.deleteMany({ where: { sourceEventId: { in: [submitted.eventId, activated.eventId, late.eventId] } } });
    await db.pendingNotificationEvent.deleteMany({ where: { sourceEventId: { in: [submitted.eventId, activated.eventId, late.eventId] } } });
    await db.recipientSnapshot.deleteMany({ where: { userId: { in: [users.manager, users.customer] } } });
    await db.recipientBootstrapRun.delete({ where: { bootstrapRunId: run } });
  });

  beforeAll(async () => {
    db = new PrismaClient({
      adapter: new PrismaPg({ connectionString: testDatabaseUrl() }),
    });
    await db.$connect();
    const [actual] = await db.$queryRawUnsafe<Array<{ name: string }>>(
      'SELECT current_database() AS name',
    );
    if (actual?.name !== 'notification_test_db') {
      throw new Error('Unsafe database');
    }
    verified = true;
    events = new NotificationEventsService(db as PrismaService);
    projections = new RecipientProjectionService(db as PrismaService, events);
  });

  afterAll(async () => {
    if (!db) return;
    try {
      if (verified) {
        await db.notification.deleteMany({ where: { tenantId } });
        await db.pendingNotificationEvent.deleteMany({ where: { tenantId } });
        await db.serviceRequestSnapshot.deleteMany({ where: { tenantId } });
        await db.notificationEventConflict.deleteMany({
          where: {
            OR: [
              { sourceEventId: { in: eventIds } },
              { sourceEventId: bootstrapRunId },
            ],
          },
        });
        await db.recipientBootstrapRun.deleteMany({
          where: { bootstrapRunId: { in: bootstrapRunIds } },
        });
        await db.recipientSnapshot.deleteMany({
          where: { userId: { in: Object.values(users) } },
        });
        await db.processedEvent.deleteMany({
          where: { eventId: { in: eventIds } },
        });
      }
    } finally {
      await db.$disconnect();
    }
  });

  it('handles marker-first bootstrap, monotonic snapshots, and pending event replay', async () => {
    const marker = envelope(
      Events.NotificationRecipientBootstrapCompleted,
      {
        bootstrapRunId,
        expectedUsers: 4,
        startedAt: '2026-11-02T00:00:00.000Z',
        completedAt: '2026-11-02T00:00:05.000Z',
      },
      bootstrapRunId,
      '2026-11-02T00:00:05.000Z',
    );
    await projections.applyBootstrapCompleted(marker);
    expect(
      await db.recipientBootstrapRun.findUnique({
        where: { bootstrapRunId },
      }),
    ).toMatchObject({
      expectedUsers: 4,
      receivedUsers: 0,
      markerReceived: true,
      status: 'RUNNING',
    });

    await Promise.all([
      recipientSnapshot(
        users.manager,
        'TENANT_STAFF',
        'SERVICE_MANAGER',
        '7',
        null,
      ),
      recipientSnapshot(users.customer, 'CUSTOMER', 'CUSTOMER_USER', '5', {
        membershipId: randomUUID(),
        customerId,
        status: 'ACTIVE',
        sourceChangedAt: '2026-11-02T00:00:00.000Z',
      }),
      recipientSnapshot(
        users.technician,
        'TENANT_STAFF',
        'TECHNICIAN',
        '2',
        null,
      ),
      recipientSnapshot(
        users.inventory,
        'TENANT_STAFF',
        'INVENTORY_STAFF',
        '1',
        null,
      ),
    ]);

    await recipientSnapshot(
      users.alternateTechnician,
      'TENANT_STAFF',
      'TECHNICIAN',
      '1',
      null,
      'ACTIVE',
      null,
    );
    await recipientSnapshot(
      users.manager,
      'TENANT_STAFF',
      'SERVICE_MANAGER',
      '6',
      null,
    );
    const manager = await db.recipientSnapshot.findUnique({
      where: { userId: users.manager },
    });
    expect(manager?.revision).toBe(7n);
    expect(
      await db.recipientBootstrapReceipt.count({
        where: { bootstrapRunId },
      }),
    ).toBe(4);
    expect(
      await db.recipientBootstrapRun.findUnique({
        where: { bootstrapRunId },
      }),
    ).toMatchObject({ receivedUsers: 4, status: 'COMPLETED' });

    const createdAt = '2026-11-02T00:00:10.000Z';
    const serviceRequest = envelope(
      Events.ServiceRequestCreated,
      {
        serviceRequestId,
        requestNo: 'SR-NOTIFY-1',
        customerId,
        equipmentId: randomUUID(),
        requesterId: users.customer,
        type: 'REPAIR',
        priority: 'NORMAL',
      },
      serviceRequestId,
      createdAt,
    );
    const workOrderCreated = envelope(
      Events.WorkOrderCreated,
      {
        workOrderId,
        workOrderNo: 'WO-NOTIFY-1',
        serviceRequestId,
        maintenanceTaskId: null,
        equipmentId: randomUUID(),
        customerId,
        type: 'REPAIR',
        priority: 'NORMAL',
      },
      workOrderId,
      '2026-11-02T00:00:12.000Z',
    );
    await events.handle(workOrderCreated);
    expect(
      await db.pendingNotificationEvent.findUnique({
        where: {
          sourceEventId_consumer: {
            sourceEventId: workOrderCreated.eventId,
            consumer: 'notification-service.business-events',
          },
        },
      }),
    ).toMatchObject({
      status: 'RETRYING',
      reason: 'WAITING_FOR_SERVICE_REQUEST_PROJECTION',
    });

    await events.handle(serviceRequest);
    await events.handle(serviceRequest);
    const workOrderNotices = await db.notification.findMany({
      where: { sourceEventId: workOrderCreated.eventId },
    });
    expect(workOrderNotices).toHaveLength(2);
    expect(workOrderNotices.map((row) => row.userId).sort()).toEqual(
      [users.customer, users.manager].sort(),
    );
    expect(
      workOrderNotices.find((row) => row.userId === users.customer)?.customerId,
    ).toBe(customerId);
    expect(
      workOrderNotices.find((row) => row.userId === users.manager)?.customerId,
    ).toBeNull();
    expect(
      workOrderNotices.find((row) => row.userId === users.customer),
    ).toMatchObject({
      payload: {
        resourceType: 'SERVICE_REQUEST',
        resourceId: serviceRequestId,
      },
      content: 'SR-NOTIFY-1 đã có lệnh WO-NOTIFY-1. Mở yêu cầu để theo dõi.',
    });
    expect(
      workOrderNotices.find((row) => row.userId === users.manager),
    ).toMatchObject({
      payload: { resourceType: 'WORK_ORDER', resourceId: workOrderId },
      content: 'WO-NOTIFY-1 đã được tạo. Bộ phận dịch vụ cần điều phối thực hiện.',
    });
    expect(
      await db.pendingNotificationEvent.findUnique({
        where: {
          sourceEventId_consumer: {
            sourceEventId: workOrderCreated.eventId,
            consumer: 'notification-service.business-events',
          },
        },
      }),
    ).toMatchObject({ status: 'RESOLVED' });

    const statusChange = envelope(
      Events.ServiceRequestStatusChanged,
      {
        serviceRequestId,
        requestNo: 'SR-NOTIFY-1',
        customerId,
        equipmentId: randomUUID(),
        fromStatus: 'NEW',
        toStatus: 'REVIEWING',
        changedBy: users.manager,
        reason: 'internal note must not persist',
      },
      serviceRequestId,
      '2026-11-02T00:00:14.000Z',
    );
    await events.handle(statusChange);
    const statusPending = await db.pendingNotificationEvent.findUnique({
      where: {
        sourceEventId_consumer: {
          sourceEventId: statusChange.eventId,
          consumer: 'notification-service.business-events',
        },
      },
    });
    expect(statusPending?.payload).not.toHaveProperty('reason');
    expect(statusPending?.payload).not.toHaveProperty('changedBy');
    expect(
      await db.notification.count({
        where: { sourceEventId: statusChange.eventId },
      }),
    ).toBe(2);
    expect(
      await db.serviceRequestSnapshot.findUnique({
        where: {
          tenantId_serviceRequestId: { tenantId, serviceRequestId },
        },
      }),
    ).toMatchObject({ status: 'REVIEWING' });

    const assignedTechnicians = [
      users.technician,
      users.alternateTechnician,
      users.technician,
    ];
    const assignmentEvents = assignedTechnicians.map(
      (technicianUserId, index) =>
        envelope(
          Events.WorkOrderAssigned,
          {
            workOrderId,
            workOrderNo: 'WO-NOTIFY-1',
            technicianId: randomUUID(),
            technicianUserId,
            assignedBy: users.manager,
            scheduledStart: null,
          },
          workOrderId,
          `2026-11-02T00:00:${20 + index}.000Z`,
        ),
    );
    const assignments = await Promise.all(
      assignmentEvents.map((assignment) => events.handle(assignment)),
    );
    expect(assignments).toHaveLength(3);
    expect(
      await db.notification.count({
        where: {
          tenantId,
          type: 'WorkOrderAssigned.v1',
        },
      }),
    ).toBe(3);
    for (const [index, assignment] of assignmentEvents.entries()) {
      expect(
        await db.notification.findFirst({
          where: {
            sourceEventId: assignment.eventId,
            userId: assignedTechnicians[index],
          },
        }),
      ).toBeTruthy();
    }

    const lowStock = envelope(
      Events.LowStockDetected,
      {
        stockId,
        partId: randomUUID(),
        partSku: 'PART-LOW-01',
        warehouseId: randomUUID(),
        quantity: '1.00',
        minQuantity: '3.00',
      },
      stockId,
      '2026-11-02T00:00:30.000Z',
    );
    await events.handle(lowStock);
    const stockNotifications = await db.notification.findMany({
      where: { sourceEventId: lowStock.eventId },
    });
    expect(stockNotifications.map((row) => row.userId)).toEqual([
      users.inventory,
    ]);

    const completed = envelope(
      Events.WorkOrderCompletedV2,
      {
        workOrderId,
        workOrderNo: 'WO-NOTIFY-1',
        serviceRequestId,
        maintenanceTaskId: null,
        equipmentId: randomUUID(),
        customerId,
        serviceReportId: randomUUID(),
        result: 'RESOLVED',
        completedAt: '2026-11-02T00:00:40.000Z',
        customerSummary: 'Customer-safe completion summary',
      },
      workOrderId,
      '2026-11-02T00:00:40.000Z',
    );
    await events.handle(completed);
    const customerCompletion = await db.notification.findFirst({
      where: { sourceEventId: completed.eventId, userId: users.customer },
    });
    expect(customerCompletion).toMatchObject({
      customerId,
      payload: {
        resourceType: 'SERVICE_REQUEST',
        resourceId: serviceRequestId,
      },
      content: 'SR-NOTIFY-1: Customer-safe completion summary. Mở yêu cầu để xem kết quả hiện tại.',
    });
    expect(
      await db.notification.findFirst({
        where: { sourceEventId: completed.eventId, userId: users.manager },
      }),
    ).toMatchObject({
      payload: { resourceType: 'SERVICE_REQUEST', resourceId: serviceRequestId },
      content: 'SR-NOTIFY-1 · WO-NOTIFY-1: đã giải quyết. Kiểm tra kết quả trong hồ sơ.',
    });

    const cancelled = envelope(
      Events.WorkOrderCancelledV2,
      {
        workOrderId,
        workOrderNo: 'WO-NOTIFY-1',
        serviceRequestId,
        maintenanceTaskId: null,
        equipmentId: randomUUID(),
        reason: 'private internal reason',
        cancelledAt: '2026-11-02T00:00:45.000Z',
        cancelServiceRequest: true,
      },
      workOrderId,
      '2026-11-02T00:00:45.000Z',
    );
    await events.handle(cancelled);
    expect(
      await db.pendingNotificationEvent.findUnique({
        where: {
          sourceEventId_consumer: {
            sourceEventId: cancelled.eventId,
            consumer: 'notification-service.business-events',
          },
        },
      }),
    ).toMatchObject({
      status: 'MANUAL_REVIEW',
      reason: 'WORK_ORDER_TERMINAL_EVENT_CONFLICT',
    });
    expect(
      await db.notification.count({
        where: { sourceEventId: cancelled.eventId },
      }),
    ).toBe(0);
    const cancellationWorkOrderId = randomUUID();
    const cancellationEvent = envelope(
      Events.WorkOrderCancelledV2,
      {
        workOrderId: cancellationWorkOrderId,
        workOrderNo: 'WO-NOTIFY-CANCELLED',
        serviceRequestId,
        maintenanceTaskId: null,
        equipmentId: randomUUID(),
        reason: 'internal reason must not persist',
        cancelledAt: '2026-11-02T00:00:46.000Z',
        cancelServiceRequest: true,
      },
      cancellationWorkOrderId,
      '2026-11-02T00:00:46.000Z',
    );
    await events.handle(cancellationEvent);
    const cancellationNotices = await db.notification.findMany({
      where: { sourceEventId: cancellationEvent.eventId },
    });
    expect(cancellationNotices).toHaveLength(1);
    expect(
      cancellationNotices.find((row) => row.userId === users.manager),
    ).toMatchObject({
      payload: {
        resourceType: 'WORK_ORDER',
        resourceId: cancellationEvent.payload.workOrderId,
      },
      content: 'WO-NOTIFY-CANCELLED đã hủy. Mở hồ sơ để kiểm tra phương án tiếp theo.',
    });
    expect(
      cancellationNotices.some((row) => row.userId === users.customer),
    ).toBe(false);
    const cancellationPending = await db.pendingNotificationEvent.findUnique({
      where: {
        sourceEventId_consumer: {
          sourceEventId: cancellationEvent.eventId,
          consumer: 'notification-service.business-events',
        },
      },
    });
    expect(cancellationPending?.payload).not.toHaveProperty('reason');
    const reopenedWorkOrderId = randomUUID();
    const cancellationReturningRequest = envelope(
      Events.WorkOrderCancelledV2,
      {
        workOrderId: reopenedWorkOrderId,
        workOrderNo: 'WO-NOTIFY-REOPENED',
        serviceRequestId,
        maintenanceTaskId: null,
        equipmentId: randomUUID(),
        reason: 'internal reason must not persist',
        cancelledAt: '2026-11-02T00:00:47.000Z',
        cancelServiceRequest: false,
      },
      reopenedWorkOrderId,
      '2026-11-02T00:00:47.000Z',
    );
    await events.handle(cancellationReturningRequest);
    const reopenedWorkOrderNotices = await db.notification.findMany({
      where: { sourceEventId: cancellationReturningRequest.eventId },
    });
    expect(reopenedWorkOrderNotices).toHaveLength(1);
    expect(reopenedWorkOrderNotices[0]).toMatchObject({
      userId: users.manager,
      payload: {
        resourceType: 'WORK_ORDER',
        resourceId: reopenedWorkOrderId,
      },
      content: 'WO-NOTIFY-REOPENED đã hủy. Mở hồ sơ để kiểm tra phương án tiếp theo.',
    });
    expect(
      reopenedWorkOrderNotices.some((row) => row.userId === users.customer),
    ).toBe(false);

    await recipientSnapshot(
      users.manager,
      'TENANT_STAFF',
      'SERVICE_MANAGER',
      '7',
      null,
      'SUSPENDED',
    );
    expect(
      await db.recipientSnapshot.findUnique({
        where: { userId: users.manager },
      }),
    ).toMatchObject({ accountStatus: 'ACTIVE', revision: 7n });
    expect(
      await db.notificationEventConflict.count({
        where: {
          sourceEventId: { in: eventIds },
          consumer: 'notification-service.recipient-snapshots',
        },
      }),
    ).toBeGreaterThan(0);

    await recipientSnapshot(
      users.manager,
      'TENANT_STAFF',
      'SERVICE_MANAGER',
      '9007199254740993',
      null,
    );
    await recipientSnapshot(
      users.manager,
      'TENANT_STAFF',
      'SERVICE_MANAGER',
      '7',
      null,
      'SUSPENDED',
    );
    expect(
      await db.recipientSnapshot.findUnique({
        where: { userId: users.manager },
      }),
    ).toMatchObject({
      accountStatus: 'ACTIVE',
      revision: 9007199254740993n,
    });

    const waitingRequestId = randomUUID();
    const waitingWorkOrderId = randomUUID();
    const waitingWorkOrder = envelope(
      Events.WorkOrderCreated,
      {
        workOrderId: waitingWorkOrderId,
        workOrderNo: 'WO-WAITING',
        serviceRequestId: waitingRequestId,
        maintenanceTaskId: null,
        equipmentId: randomUUID(),
        customerId,
        type: 'REPAIR',
        priority: 'NORMAL',
      },
      waitingWorkOrderId,
      '2026-11-02T00:01:00.000Z',
    );
    await events.handle(waitingWorkOrder);
    await db.pendingNotificationEvent.update({
      where: {
        sourceEventId_consumer: {
          sourceEventId: waitingWorkOrder.eventId,
          consumer: 'notification-service.business-events',
        },
      },
      data: { nextAttemptAt: new Date(0) },
    });
    await events.reconcileDue();
    expect(
      await db.pendingNotificationEvent.findUnique({
        where: {
          sourceEventId_consumer: {
            sourceEventId: waitingWorkOrder.eventId,
            consumer: 'notification-service.business-events',
          },
        },
      }),
    ).toMatchObject({
      status: 'RETRYING',
      reason: 'WAITING_FOR_SERVICE_REQUEST_PROJECTION',
      attempts: 2,
    });
    await db.pendingNotificationEvent.update({
      where: {
        sourceEventId_consumer: {
          sourceEventId: waitingWorkOrder.eventId,
          consumer: 'notification-service.business-events',
        },
      },
      data: {
        payload: {
          kind: 'WORK_ORDER_CREATED',
          occurredAt: waitingWorkOrder.occurredAt,
          workOrderId: waitingWorkOrderId,
          workOrderNo: 'WO-WAITING',
          serviceRequestId: waitingRequestId,
          maintenanceTaskId: null,
          customerId,
          activationToken: 'not-a-real-activation-token',
        },
        nextAttemptAt: new Date(0),
      },
    });
    await events.reconcileDue();
    expect(
      await db.pendingNotificationEvent.findUnique({
        where: {
          sourceEventId_consumer: {
            sourceEventId: waitingWorkOrder.eventId,
            consumer: 'notification-service.business-events',
          },
        },
      }),
    ).toMatchObject({
      status: 'MANUAL_REVIEW',
      reason: 'INVALID_STORED_PAYLOAD',
    });
    expect(
      await db.notification.count({
        where: { sourceEventId: waitingWorkOrder.eventId },
      }),
    ).toBe(0);

    const zeroUserRunId = randomUUID();
    bootstrapRunIds.push(zeroUserRunId);
    await projections.applyBootstrapCompleted(
      envelope(
        Events.NotificationRecipientBootstrapCompleted,
        {
          bootstrapRunId: zeroUserRunId,
          expectedUsers: 0,
          startedAt: '2026-11-02T00:01:00.000Z',
          completedAt: '2026-11-02T00:02:00.000Z',
        },
        zeroUserRunId,
        '2026-11-02T00:02:00.000Z',
      ),
    );
    expect(
      await db.recipientBootstrapRun.findUnique({
        where: { bootstrapRunId: zeroUserRunId },
      }),
    ).toMatchObject({
      expectedUsers: 0,
      receivedUsers: 0,
      markerReceived: true,
      status: 'COMPLETED',
    });
  });
});
