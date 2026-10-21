import { Events, payloadProblems, routingKey } from './catalog';
import { InvalidEventError, isEvent, parseEnvelope } from './envelope';

const TENANT = '11111111-1111-4111-8111-111111111111';

function envelope(overrides: Record<string, unknown> = {}) {
  return {
    eventId: '99999999-9999-4999-8999-999999999999',
    eventType: 'TenantCreated',
    eventVersion: 1,
    producer: 'organization-service',
    tenantId: TENANT,
    aggregateType: 'Tenant',
    aggregateId: TENANT,
    occurredAt: '2026-10-17T03:00:00.000Z',
    correlationId: 'corr-1',
    payload: { tenantId: TENANT, code: 'ACME', name: 'Acme', status: 'ACTIVE' },
    ...overrides,
  };
}

describe('event catalog', () => {
  it('routes by type and version', () => {
    expect(routingKey(Events.TenantCreated)).toBe('TenantCreated.v1');
  });

  it('checks payloads against the contract', () => {
    expect(payloadProblems(Events.TenantCreated, envelope().payload)).toEqual([]);
    expect(payloadProblems(Events.TenantCreated, { tenantId: 'x', code: 'A' })).toEqual([
      'tenantId is missing or invalid',
      'name is missing or invalid',
      'status is missing or invalid',
    ]);
    expect(
      payloadProblems(Events.ServiceRequestStatusChanged, {
        serviceRequestId: TENANT,
        requestNo: 'SR-2026-0001',
        customerId: TENANT,
        equipmentId: TENANT,
        fromStatus: null,
        toStatus: 'NEW',
        changedBy: null,
        reason: null,
      }),
    ).toEqual([]);
  });

  it('accepts the work order and stock contracts and their invariants', () => {
    const id = TENANT;
    expect(
      payloadProblems(Events.WorkOrderCompleted, {
        workOrderId: id,
        workOrderNo: 'WO-2026-0001',
        serviceRequestId: id,
        maintenanceTaskId: null,
        equipmentId: id,
        customerId: id,
        serviceReportId: id,
        result: 'RESOLVED',
        completedAt: '2026-10-17T03:00:00Z',
      }),
    ).toEqual([]);
    expect(
      payloadProblems(Events.MaintenanceTaskDue, {
        maintenanceTaskId: id,
        maintenancePlanId: id,
        equipmentId: id,
        customerId: id,
        customerSiteId: null,
        scheduledDate: '2026-11-01T00:00:00Z',
        title: 'Quarterly service',
      }),
    ).toEqual(['scheduledDate is missing or invalid']);
    expect(
      payloadProblems(Events.LowStockDetected, {
        stockId: id,
        partId: id,
        partSku: 'FLT-01',
        warehouseId: id,
        quantity: 1.5,
        minQuantity: '2',
      }),
    ).toEqual(['quantity is missing or invalid']);
  });

  it('gives every event a unique type/version and a producer', () => {
    const keys = Object.values(Events).map(routingKey);
    expect(new Set(keys).size).toBe(keys.length);
    for (const definition of Object.values(Events)) {
      expect(definition.producer).toMatch(/-service$/);
    }
  });
});

describe('parseEnvelope', () => {
  it('accepts a valid message and narrows it', () => {
    const parsed = parseEnvelope(Buffer.from(JSON.stringify(envelope())));
    expect(isEvent(parsed, Events.TenantCreated)).toBe(true);
    expect(isEvent(parsed, Events.TenantStatusChanged)).toBe(false);
  });

  it.each([
    ['not JSON', 'nope'],
    ['bad event id', JSON.stringify(envelope({ eventId: '1' }))],
    ['unknown version', JSON.stringify(envelope({ eventVersion: 9 }))],
    ['payload breaking the contract', JSON.stringify(envelope({ payload: { tenantId: TENANT } }))],
    ['bad timestamp', JSON.stringify(envelope({ occurredAt: 'yesterday' }))],
  ])('rejects %s', (_name, body) => {
    expect(() => parseEnvelope(body)).toThrow(InvalidEventError);
  });
});
