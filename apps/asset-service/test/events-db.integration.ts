import { randomUUID } from 'node:crypto';
import { config as loadEnv } from 'dotenv';
import { requireTestDatabaseUrl } from '@pbl6/testing';
import { createPrismaAdapter } from '@pbl6/service-kit/prisma';
import {
  Events,
  InvalidEventError,
  type EventDefinition,
  type EventEnvelope,
} from '@pbl6/event-contracts';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { EquipmentRepository } from '../src/equipment/equipment.repository';
import { HistoryConsumer } from '../src/events/history.consumer';
import type { PrismaService } from '../src/prisma/prisma.service';
loadEnv({ path: '../../.env', quiet: true });
const db = new PrismaClient({
  adapter: createPrismaAdapter(
    requireTestDatabaseUrl('ASSET_TEST_DATABASE_URL'),
  ),
});
const repo = new EquipmentRepository(db as unknown as PrismaService);
const consumer = new HistoryConsumer(db as unknown as PrismaService);
const tenantId = randomUUID(),
  customerId = randomUUID(),
  equipmentId = randomUUID(),
  siteId = randomUUID(),
  actor = randomUUID();
let modelId: string;
const ids: string[] = [];
function event(
  definition: EventDefinition,
  payload: unknown,
  overrides: Partial<EventEnvelope> = {},
): EventEnvelope {
  const eventId = randomUUID();
  ids.push(eventId);
  const p = payload as { workOrderId: string; serviceRequestId: string };
  return {
    eventId,
    eventType: definition.type,
    eventVersion: definition.version,
    tenantId,
    producer: definition.producer,
    aggregateType: definition.aggregateType,
    aggregateId: p.workOrderId ?? p.serviceRequestId,
    occurredAt: '2026-01-01T00:00:00Z',
    correlationId: 'asset-events-db',
    payload,
    ...overrides,
  };
}
beforeAll(async () => {
  await db.$connect();
  const model = await db.equipmentModel.create({
    data: {
      tenantId,
      manufacturer: 'Event tests',
      modelCode: randomUUID(),
      name: 'Pump',
    },
  });
  modelId = model.id;
  await db.equipment.create({
    data: {
      id: equipmentId,
      tenantId,
      modelId,
      customerId,
      customerSiteId: siteId,
      assetCode: 'EVENT',
      serialNumber: randomUUID(),
    },
  });
});
afterAll(async () => {
  await db.processedEvent.deleteMany({ where: { eventId: { in: ids } } });
  await db.outboxEvent.deleteMany({ where: { tenantId } });
  await db.equipmentHistory.deleteMany({ where: { tenantId } });
  await db.equipment.deleteMany({ where: { tenantId } });
  await db.equipmentModel.deleteMany({ where: { tenantId } });
  await db.$disconnect();
});
it('increments move versions under concurrent row locks and writes history/outbox atomically', async () => {
  const scope = { tenantId, customerId: null };
  await Promise.all([
    repo.patchWithHistory(scope, equipmentId, actor, {
      customerSiteId: randomUUID(),
    }),
    repo.patchWithHistory(scope, equipmentId, actor, {
      customerSiteId: randomUUID(),
    }),
  ]);
  const rows = await db.outboxEvent.findMany({
    where: { tenantId, eventType: 'EquipmentMoved' },
  });
  expect(rows).toHaveLength(2);
  const versions = rows
    .map(
      (r) =>
        (r.payload as { data: { snapshotVersion: number } }).data
          .snapshotVersion,
    )
    .sort();
  expect(versions).toEqual([1, 2]);
  expect(
    (await db.equipment.findUniqueOrThrow({ where: { id: equipmentId } }))
      .snapshotVersion,
  ).toBe(2);
  expect(
    await db.equipmentHistory.count({
      where: { equipmentId, eventType: 'MOVED' },
    }),
  ).toBe(2);
});
it('keeps customer-visible history safe, ordered by original occurrence, and idempotent', async () => {
  const sr = event(Events.ServiceRequestStatusChanged, {
    serviceRequestId: randomUUID(),
    requestNo: 'SR-TEST',
    equipmentId,
    customerId,
    fromStatus: 'NEW',
    toStatus: 'REVIEWING',
    changedBy: actor,
    reason: 'SECRET INTERNAL REASON',
  });
  await Promise.all([consumer.handle(sr), consumer.handle(sr)]);
  const record = await db.equipmentHistory.findFirstOrThrow({
    where: { sourceEventId: sr.eventId },
  });
  expect(JSON.stringify(record)).not.toContain('SECRET');
  expect(record.createdBy).toBeNull();
  expect(record.occurredAt.toISOString()).toBe(
    sr.occurredAt.replace('00Z', '00.000Z'),
  );
  expect(
    await db.equipmentHistory.count({ where: { sourceEventId: sr.eventId } }),
  ).toBe(1);
  const done = event(Events.WorkOrderCompletedV2, {
    workOrderId: randomUUID(),
    workOrderNo: 'WO-TEST',
    serviceRequestId: null,
    maintenanceTaskId: randomUUID(),
    equipmentId,
    customerId,
    serviceReportId: randomUUID(),
    result: 'PARTIALLY_RESOLVED',
    customerSummary: 'Approved customer summary',
    completedAt: '2026-01-02T00:00:00Z',
  });
  await consumer.handle(done);
  await consumer.handle(done);
  expect(
    (
      await db.equipmentHistory.findFirstOrThrow({
        where: { sourceEventId: done.eventId },
      })
    ).metadata,
  ).toMatchObject({ result: 'PARTIALLY_RESOLVED' });
});
it('rolls back inbox on missing Equipment, tenant/customer mismatch or a failed history write', async () => {
  const payload = {
    serviceRequestId: randomUUID(),
    requestNo: 'SR-TEST',
    equipmentId,
    customerId,
    fromStatus: 'NEW',
    toStatus: 'REVIEWING',
    changedBy: null,
    reason: null,
  };
  const missing = event(Events.ServiceRequestStatusChanged, {
    ...payload,
    equipmentId: randomUUID(),
  });
  await expect(consumer.handle(missing)).rejects.toThrow('not available');
  for (const wrong of [
    event(Events.ServiceRequestStatusChanged, payload, {
      tenantId: randomUUID(),
    }),
    event(Events.ServiceRequestStatusChanged, {
      ...payload,
      customerId: randomUUID(),
    }),
  ]) {
    await expect(consumer.handle(wrong)).rejects.toBeInstanceOf(
      InvalidEventError,
    );
    expect(
      await db.processedEvent.count({ where: { eventId: wrong.eventId } }),
    ).toBe(0);
  }
  expect(
    await db.processedEvent.count({ where: { eventId: missing.eventId } }),
  ).toBe(0);
  const failed = event(Events.ServiceRequestStatusChanged, payload);
  const broken = {
    $transaction: (fn: (tx: unknown) => Promise<void>) =>
      db.$transaction(async (tx) =>
        fn(
          new Proxy(tx, {
            get(target, key) {
              return key === 'equipmentHistory'
                ? {
                    create: async () => {
                      throw new Error('injected history failure');
                    },
                  }
                : Reflect.get(target, key);
            },
          }),
        ),
      ),
  } as unknown as PrismaService;
  await expect(new HistoryConsumer(broken).handle(failed)).rejects.toThrow(
    'injected history failure',
  );
  expect(
    await db.processedEvent.count({ where: { eventId: failed.eventId } }),
  ).toBe(0);
});
