import { Events, payloadProblems, routingKey } from './catalog';

const userId = '10000000-0000-4000-8000-000000000001';
const customerId = '10000000-0000-4000-8000-000000000002';
const membershipId = '10000000-0000-4000-8000-000000000003';
const bootstrapRunId = '10000000-0000-4000-8000-000000000004';

describe('Notification recipient contracts', () => {
  const snapshot = {
    userId,
    userType: 'CUSTOMER',
    accountStatus: 'ACTIVE',
    roles: ['CUSTOMER_USER'],
    customerMembership: {
      membershipId,
      customerId,
      status: 'ACTIVE',
      sourceChangedAt: '2026-11-02T00:00:00.000Z',
    },
    revision: '1',
    bootstrapRunId,
  };

  it('accepts a complete snapshot and bootstrap marker', () => {
    expect(routingKey(Events.NotificationRecipientSnapshot)).toBe(
      'NotificationRecipientSnapshot.v1',
    );
    expect(
      payloadProblems(Events.NotificationRecipientSnapshot, snapshot),
    ).toEqual([]);
    expect(
      payloadProblems(Events.NotificationRecipientBootstrapCompleted, {
        bootstrapRunId,
        expectedUsers: 0,
        startedAt: '2026-11-02T00:00:00.000Z',
        completedAt: '2026-11-02T00:00:01.000Z',
      }),
    ).toEqual([]);
  });

  it('rejects stale and malformed directory metadata', () => {
    expect(
      payloadProblems(Events.NotificationRecipientSnapshot, {
        ...snapshot,
        revision: '0',
      }),
    ).toEqual(['revision is missing or invalid']);
    expect(
      payloadProblems(Events.NotificationRecipientSnapshot, {
        ...snapshot,
        roles: ['TENANT_ADMIN', 'SERVICE_MANAGER'],
      }),
    ).toEqual(['roles is missing or invalid']);
    expect(
      payloadProblems(Events.NotificationRecipientSnapshot, {
        ...snapshot,
        customerMembership: {
          ...snapshot.customerMembership,
          customerId: 'wrong',
        },
      }),
    ).toEqual(['customerMembership is missing or invalid']);
    expect(
      payloadProblems(Events.NotificationRecipientBootstrapCompleted, {
        bootstrapRunId,
        expectedUsers: -1,
        startedAt: '2026-11-02T00:00:00.000Z',
        completedAt: '2026-11-02T00:00:01.000Z',
      }),
    ).toEqual(['expectedUsers is missing or invalid']);
  });
});
