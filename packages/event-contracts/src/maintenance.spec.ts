import { Events, payloadProblems } from './catalog';
const id = '00000000-0000-4000-8000-000000000001';
describe('M2 Equipment and explicit replacement contracts', () => {
  const snapshot = {
    equipmentId: id,
    customerId: id,
    customerSiteId: null,
    locationId: null,
    snapshotVersion: 1,
    changedAt: '2026-10-27T00:00:00Z',
  };
  it('accepts a complete versioned move snapshot and rejects unorderable versions', () => {
    expect(payloadProblems(Events.EquipmentMoved, snapshot)).toEqual([]);
    for (const version of [
      0,
      -1,
      1.5,
      '1',
      undefined,
      Number.MAX_SAFE_INTEGER + 1,
    ])
      expect(
        payloadProblems(Events.EquipmentMoved, {
          ...snapshot,
          snapshotVersion: version,
        }),
      ).not.toEqual([]);
  });
  it('requires a durable request identity and both old/new WO IDs instead of overloading Due', () => {
    const payload = {
      maintenanceTaskId: id,
      maintenancePlanId: id,
      equipmentId: id,
      customerId: id,
      customerSiteId: null,
      scheduledDate: '2026-10-27',
      title: 'Inspection',
      requestId: id,
      previousWorkOrderId: id,
      replacementWorkOrderId: id,
      requestedBy: id,
    };
    expect(
      payloadProblems(Events.MaintenanceWorkOrderReplacementRequested, payload),
    ).toEqual([]);
    expect(
      payloadProblems(Events.MaintenanceWorkOrderReplacementRequested, {
        ...payload,
        requestId: undefined,
      }),
    ).not.toEqual([]);
    const {
      requestId: _requestId,
      previousWorkOrderId: _previous,
      replacementWorkOrderId: _replacement,
      requestedBy: _actor,
      ...due
    } = payload;
    expect(payloadProblems(Events.MaintenanceTaskDue, due)).toEqual([]);
    expect(
      payloadProblems(Events.MaintenanceWorkOrderReplacementRequested, due),
    ).not.toEqual([]);
  });
});
