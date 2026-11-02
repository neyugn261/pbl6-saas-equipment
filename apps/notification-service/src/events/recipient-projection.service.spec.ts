import { randomUUID } from 'node:crypto';
import type { EventEnvelope } from '@pbl6/event-contracts';
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
