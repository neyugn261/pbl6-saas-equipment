import { randomUUID } from 'node:crypto';
import { Events, type EventEnvelope } from '@pbl6/event-contracts';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationEventsService } from './notification-events.service';
import { RecipientProjectionService } from './recipient-projection.service';

describe('RecipientProjectionService contract boundary', () => {
  const tenantId = randomUUID();
  const userId = randomUUID();
  const envelope = (
    payload: Record<string, unknown>,
    aggregateId = userId,
  ): EventEnvelope => ({
    eventId: randomUUID(),
    eventType: 'NotificationRecipientSnapshot',
    eventVersion: 1,
    producer: 'identity-service',
    tenantId,
    aggregateType: 'User',
    aggregateId,
    occurredAt: '2026-11-02T00:00:00.000Z',
    correlationId: null,
    payload,
  });

  function service() {
    const prisma = { $transaction: jest.fn() } as unknown as PrismaService;
    const events = {
      reconcileTenant: jest.fn(),
    } as unknown as NotificationEventsService;
    return {
      prisma,
      projection: new RecipientProjectionService(prisma, events),
    };
  }

  const validSnapshot = () => ({
    userId,
    userType: 'TENANT_STAFF',
    accountStatus: 'ACTIVE',
    roles: ['SERVICE_MANAGER'],
    customerMembership: null,
    revision: '9007199254740993',
    bootstrapRunId: null,
  });

  const bootstrapRunId = randomUUID();
  const marker = (
    overrides: Partial<EventEnvelope> = {},
    payloadOverrides: Record<string, unknown> = {},
  ): EventEnvelope => {
    const definition = Events.NotificationRecipientBootstrapCompleted;
    return {
      eventId: randomUUID(),
      eventType: definition.type,
      eventVersion: definition.version,
      producer: definition.producer,
      tenantId,
      aggregateType: definition.aggregateType,
      aggregateId: bootstrapRunId,
      occurredAt: '2026-11-02T00:00:05.000Z',
      correlationId: null,
      payload: {
        bootstrapRunId,
        expectedUsers: 8,
        startedAt: '2026-11-02T00:00:00.000Z',
        completedAt: '2026-11-02T00:00:05.000Z',
        ...payloadOverrides,
      },
      ...overrides,
    };
  };

  it.each([0, 8])(
    'accepts the Identity catalog marker for %i recipients',
    async (expectedUsers) => {
      const { prisma, projection } = service();
      await projection.applyBootstrapCompleted(marker({}, { expectedUsers }));
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    [
      'legacy Tenant aggregate',
      { aggregateType: 'Tenant', aggregateId: tenantId },
    ],
    ['tenant ID in place of run ID', { aggregateId: tenantId }],
    ['another bootstrap run ID', { aggregateId: randomUUID() }],
    ['another producer', { producer: 'organization-service' }],
    ['another version', { eventVersion: 2 }],
    ['missing tenant scope', { tenantId: null }],
    ['invalid event ID', { eventId: 'not-a-uuid' }],
  ] as [string, Partial<EventEnvelope>][])(
    'rejects marker with %s before persistence',
    async (_name, overrides) => {
      const { prisma, projection } = service();
      await expect(
        projection.applyBootstrapCompleted(marker(overrides)),
      ).rejects.toThrow('Invalid Notification recipient bootstrap marker');
      expect(prisma.$transaction).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['negative recipient count', { expectedUsers: -1 }],
    [
      'recipient count outside PostgreSQL INTEGER',
      { expectedUsers: 2_147_483_648 },
    ],
    ['invalid run ID', { bootstrapRunId: 'not-a-uuid' }],
    ['completion before start', { completedAt: '2026-11-01T00:00:00.000Z' }],
    ['unapproved payload field', { email: 'private@example.test' }],
  ])(
    'rejects marker payload with %s before persistence',
    async (_name, overrides) => {
      const { prisma, projection } = service();
      await expect(
        projection.applyBootstrapCompleted(marker({}, overrides)),
      ).rejects.toThrow('Invalid Notification recipient bootstrap marker');
      expect(prisma.$transaction).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['unapproved personal fields', { email: 'private@example.test' }],
    ['unsorted roles', { roles: ['TECHNICIAN', 'DISPATCHER'] }],
    ['revision beyond PostgreSQL BIGINT', { revision: '9223372036854775808' }],
    ['user ID not matching aggregate', {}],
    [
      'customer membership on tenant staff',
      {
        customerMembership: {
          membershipId: randomUUID(),
          customerId: randomUUID(),
          status: 'ACTIVE',
          sourceChangedAt: '2026-11-02T00:00:00.000Z',
        },
      },
    ],
  ])('rejects %s before persistence', async (_name, override) => {
    const { prisma, projection } = service();
    const data = { ...validSnapshot(), ...override };
    const event =
      _name === 'user ID not matching aggregate'
        ? envelope(data, randomUUID())
        : envelope(data);

    await expect(projection.applySnapshot(event)).rejects.toThrow(
      'Invalid Notification recipient snapshot',
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
