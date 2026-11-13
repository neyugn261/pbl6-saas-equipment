import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { Events, type EventDefinition, type EventEnvelope } from '@pbl6/event-contracts';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { PrismaService } from '../../src/prisma/prisma.service';
import { NotificationEventsService } from '../../src/events/notification-events.service';
import { RecipientProjectionService } from '../../src/events/recipient-projection.service';
import { testDatabaseUrl } from './support/test-env';

describe('follow-up notification regression (PostgreSQL)', () => {
  const tenantId = randomUUID(), customerId = randomUUID(), managerId = randomUUID(), customerUser = randomUUID();
  const requestId = randomUUID(), equipmentId = randomUUID(), run = randomUUID();
  const ids: string[] = [];
  let db: PrismaClient, service: NotificationEventsService;
  const envelope = (def: EventDefinition, aggregateId: string, payload: unknown, seconds = 0): EventEnvelope => {
    const eventId = randomUUID(); ids.push(eventId);
    return { eventId, eventType: def.type, eventVersion: def.version, producer: def.producer,
      aggregateType: def.aggregateType, aggregateId, tenantId, correlationId: null,
      occurredAt: new Date(Date.UTC(2026, 10, 12, 0, 0, seconds)).toISOString(), payload };
  };
  beforeAll(async () => {
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: testDatabaseUrl() }) });
    await db.$connect();
    service = new NotificationEventsService(db as PrismaService);
    const projection = new RecipientProjectionService(db as PrismaService, service);
    for (const [userId, userType, role] of [[managerId, 'TENANT_STAFF', 'SERVICE_MANAGER'], [customerUser, 'CUSTOMER', 'CUSTOMER_USER']]) {
      await projection.applySnapshot(envelope(Events.NotificationRecipientSnapshot, userId, {
        userId, userType, roles: [role], accountStatus: 'ACTIVE', revision: '1', bootstrapRunId: run,
        customerMembership: userType === 'CUSTOMER' ? { membershipId: randomUUID(), customerId, status: 'ACTIVE', sourceChangedAt: '2026-11-12T00:00:00Z' } : null,
      }));
    }
    await projection.applyBootstrapCompleted(envelope(Events.NotificationRecipientBootstrapCompleted, run, {
      bootstrapRunId: run, expectedUsers: 2, startedAt: '2026-11-12T00:00:00Z', completedAt: '2026-11-12T00:00:00Z',
    }));
    await service.handle(envelope(Events.ServiceRequestCreated, requestId, {
      serviceRequestId: requestId, requestNo: 'SR-FOLLOW-UP', customerId, equipmentId,
      requesterId: customerUser, type: 'REPAIR', priority: 'NORMAL',
    }));
  });
  afterAll(async () => {
    if (!db) return;
    await db.notification.deleteMany({ where: { tenantId } });
    await db.pendingNotificationEvent.deleteMany({ where: { tenantId } });
    await db.serviceRequestSnapshot.deleteMany({ where: { tenantId } });
    await db.recipientBootstrapRun.deleteMany({ where: { tenantId } });
    await db.recipientSnapshot.deleteMany({ where: { tenantId } });
    await db.notificationEventConflict.deleteMany({ where: { sourceEventId: { in: ids } } });
    await db.processedEvent.deleteMany({ where: { eventId: { in: ids } } });
    await db.$disconnect();
  });
  it('renders actionable Vietnamese without leaking reason; duplicate occurrences and replacements do not notify again', async () => {
    const wo = randomUUID();
    const payload = { workOrderId: wo, workOrderNo: 'WO-FOLLOW-UP', serviceRequestId: requestId,
      maintenanceTaskId: null, equipmentId, customerId, serviceReportId: randomUUID(),
      result: 'UNRESOLVED', customerSummary: 'Cần xử lý tiếp', unresolvedReason: 'PRIVATE TECHNICAL REASON', completedAt: '2026-11-12T00:00:10Z' };
    const end = envelope(Events.WorkOrderCompletedV2, wo, payload, 10);
    await service.handle(end); await service.handle(end);
    const notices = await db.notification.findMany({ where: { sourceEventId: end.eventId } });
    expect(notices.map((n) => n.userId).sort()).toEqual([managerId, customerUser].sort());
    expect(notices.every((n) => n.title === 'Chưa xử lý được')).toBe(true);
    expect(JSON.stringify(notices)).not.toContain('PRIVATE TECHNICAL REASON');
    expect(notices.find((n) => n.userId === managerId)?.content).toContain('phương án xử lý tiếp theo');
    expect(notices.every((n) => (n.payload as { resourceType: string }).resourceType === 'SERVICE_REQUEST')).toBe(true);
    const duplicate = envelope(Events.WorkOrderCompletedV2, wo, payload, 11);
    await service.handle(duplicate);
    expect(await db.notification.count({ where: { sourceEventId: duplicate.eventId } })).toBe(0);
    const concurrent = [envelope(Events.WorkOrderCompletedV2, wo, payload, 12), envelope(Events.WorkOrderCompletedV2, wo, payload, 13)];
    await Promise.all(concurrent.map((e) => service.handle(e)));
    expect(await db.notification.count({ where: { sourceEventId: { in: concurrent.map((e) => e.eventId) } } })).toBe(0);
    const b = randomUUID();
    await service.handle(envelope(Events.WorkOrderCreated, b, { workOrderId: b, workOrderNo: 'WO-B', serviceRequestId: requestId,
      maintenanceTaskId: null, equipmentId, customerId, type: 'REPAIR', priority: 'NORMAL' }, 20));
    const stale = envelope(Events.WorkOrderCompletedV2, wo, { ...payload, customerSummary: 'Outdated' }, 15);
    await service.handle(stale);
    expect(await db.notification.count({ where: { sourceEventId: stale.eventId } })).toBe(0);
    await db.notification.updateMany({ where: { sourceEventId: end.eventId }, data: { readAt: new Date() } });
    expect(await db.notification.count({ where: { sourceEventId: end.eventId } })).toBe(2);
  });
});
