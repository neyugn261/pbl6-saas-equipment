import { randomUUID } from 'node:crypto';
import {
  Events,
  isEvent,
  parseEnvelope,
} from '../../../../packages/event-contracts/dist';
import { NOTIFICATION_BUSINESS_EVENTS } from '../../src/events/notification-events.service';

const id = randomUUID();
const request = {
  serviceRequestId: id,
  requestNo: 'SR-TEST',
  customerId: id,
  equipmentId: id,
};
const order = {
  workOrderId: id,
  workOrderNo: 'WO-TEST',
  serviceRequestId: id,
  maintenanceTaskId: null,
  equipmentId: id,
};
const cases = [
  [Events.EquipmentHandoverChanged, { handoverId: id, equipmentId: id, customerId: id, createdBy: id,
    handoverNo: 'BG-test', assetCode: 'P-test', version: 2, status: 'PENDING_CUSTOMER_CONFIRMATION' }],
  [
    Events.ServiceRequestCreated,
    { ...request, requesterId: id, type: 'REPAIR', priority: 'NORMAL' },
  ],
  [
    Events.ServiceRequestStatusChanged,
    {
      ...request,
      fromStatus: 'NEW',
      toStatus: 'REVIEWING',
      changedBy: id,
      reason: null,
    },
  ],
  [
    Events.WorkOrderCreated,
    { ...order, customerId: id, type: 'REPAIR', priority: 'NORMAL' },
  ],
  [
    Events.WorkOrderAssigned,
    {
      workOrderId: id,
      workOrderNo: 'WO-TEST',
      technicianId: id,
      technicianUserId: id,
      assignedBy: id,
      scheduledStart: null,
    },
  ],
  [
    Events.WorkOrderCompletedV2,
    {
      ...order,
      customerId: id,
      serviceReportId: id,
      result: 'RESOLVED',
      completedAt: new Date().toISOString(),
      customerSummary: 'Test fixture',
    },
  ],
  [
    Events.WorkOrderCancelledV2,
    {
      ...order,
      reason: null,
      cancelledAt: new Date().toISOString(),
      cancelServiceRequest: false,
    },
  ],
  [
    Events.LowStockDetected,
    {
      stockId: id,
      partId: id,
      partSku: 'TEST',
      warehouseId: id,
      quantity: '1.00',
      minQuantity: '2.00',
    },
  ],
] as const;

// Contract readiness only: no broker binding, recipients, rendering or ACKs.
describe('Notification source contract readiness', () => {
  it('binds only the catalog-owned business event versions', () => {
    expect(
      NOTIFICATION_BUSINESS_EVENTS.map(
        ({ type, version }) => `${type}.v${version}`,
      ),
    ).toEqual([
      'EquipmentHandoverChanged.v1',
      'ServiceRequestCreated.v1',
      'ServiceRequestStatusChanged.v1',
      'WorkOrderCreated.v1',
      'WorkOrderAssigned.v1',
      'WorkOrderCompleted.v2',
      'WorkOrderCancelled.v2',
      'LowStockDetected.v1',
    ]);
  });

  it.each(cases)(
    'recognizes the catalog version for %p',
    (definition, payload) => {
      const envelope = {
        eventId: randomUUID(),
        tenantId: id,
        eventType: definition.type,
        eventVersion: definition.version,
        aggregateType: definition.aggregateType,
        aggregateId: id,
        producer: definition.producer,
        occurredAt: new Date().toISOString(),
        correlationId: null,
        payload,
      };
      const parsed = parseEnvelope(JSON.stringify(envelope));
      expect(isEvent(parsed, definition)).toBe(true);
      expect(() =>
        parseEnvelope(JSON.stringify({ ...envelope, eventVersion: 999 })),
      ).toThrow();
      expect(() =>
        parseEnvelope(JSON.stringify({ ...envelope, payload: {} })),
      ).toThrow();
    },
  );
  it('does not mistake catalog compatibility v1 for completion/cancellation v2', () => {
    expect(
      isEvent(
        { eventType: 'WorkOrderCompleted', eventVersion: 1 } as ReturnType<
          typeof parseEnvelope
        >,
        Events.WorkOrderCompletedV2,
      ),
    ).toBe(false);
    expect(
      isEvent(
        { eventType: 'WorkOrderCancelled', eventVersion: 1 } as ReturnType<
          typeof parseEnvelope
        >,
        Events.WorkOrderCancelledV2,
      ),
    ).toBe(false);
  });
  it.each(['not-json', 'null', '{}'])(
    'rejects malformed envelope %s before any persistence',
    (content) => {
      expect(() => parseEnvelope(content)).toThrow();
    },
  );
});
