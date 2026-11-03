import { ConfigService } from '@nestjs/config';
import {
  Events,
  RabbitMqEventBus,
  type EventEnvelope,
  type SubscriptionOptions,
} from '@pbl6/event-contracts';
import type { AppEnv } from '../config/env.validation';
import { NotificationEventsConsumer } from './notification-events.consumer';
import {
  NotificationEventsService,
  NOTIFICATION_BUSINESS_EVENTS,
} from './notification-events.service';
import { RecipientProjectionService } from './recipient-projection.service';

describe('NotificationEventsConsumer broker dispatch', () => {
  let consumer: NotificationEventsConsumer;
  let subscriptions: SubscriptionOptions[];
  const events = { handle: jest.fn(), reconcileDue: jest.fn() };
  const recipients = {
    applySnapshot: jest.fn(),
    applyBootstrapCompleted: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    subscriptions = [];
    jest
      .spyOn(RabbitMqEventBus.prototype, 'subscribe')
      .mockImplementation((subscription) => {
        subscriptions.push(subscription);
      });
    jest
      .spyOn(RabbitMqEventBus.prototype, 'start')
      .mockImplementation(async () => {
        expect(subscriptions).toHaveLength(3);
      });
    jest.spyOn(RabbitMqEventBus.prototype, 'close').mockResolvedValue();
    consumer = new NotificationEventsConsumer(
      new ConfigService({
        NODE_ENV: 'development',
        RABBITMQ_URL: 'amqp://localhost',
      }) as ConfigService<AppEnv, true>,
      events as unknown as NotificationEventsService,
      recipients as unknown as RecipientProjectionService,
    );
  });

  afterEach(async () => {
    await consumer.onApplicationShutdown();
    jest.restoreAllMocks();
  });

  it('binds both catalogued recipient events before starting the bus and retains business bindings', async () => {
    expect(Events.NotificationRecipientSnapshot.type).toBe(
      'NotificationRecipientSnapshot',
    );
    expect(Events.NotificationRecipientBootstrapCompleted.type).toBe(
      'NotificationRecipientBootstrapCompleted',
    );
    await consumer.onApplicationBootstrap();
    expect(
      subscriptions.map(({ queue, events }) => ({ queue, events })),
    ).toEqual([
      {
        queue: 'notification-service.recipient-snapshots',
        events: [Events.NotificationRecipientSnapshot],
      },
      {
        queue: 'notification-service.recipient-bootstrap',
        events: [Events.NotificationRecipientBootstrapCompleted],
      },
      {
        queue: 'notification-service.business-events',
        events: NOTIFICATION_BUSINESS_EVENTS,
      },
    ]);
    expect(RabbitMqEventBus.prototype.start).toHaveBeenCalledTimes(1);
  });

  it.each([0, 1, 2])(
    'dispatches subscription %i exclusively to its handler and propagates errors for broker retry',
    async (index) => {
      await consumer.onApplicationBootstrap();
      const envelope = {
        eventId: 'event-id',
        correlationId: 'correlation-id',
      } as EventEnvelope;
      const handlers = [
        recipients.applySnapshot,
        recipients.applyBootstrapCompleted,
        events.handle,
      ];
      await subscriptions[index].handler(envelope);
      handlers.forEach((handler, handlerIndex) => {
        expect(handler).toHaveBeenCalledTimes(handlerIndex === index ? 1 : 0);
      });
      expect(handlers[index]).toHaveBeenCalledWith(envelope);
      handlers[index].mockRejectedValueOnce(
        new Error('projection unavailable'),
      );
      await expect(subscriptions[index].handler(envelope)).rejects.toThrow(
        'projection unavailable',
      );
    },
  );
});
