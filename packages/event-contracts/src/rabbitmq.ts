import {
  type ChannelModel,
  type ConfirmChannel,
  connect,
  type ConsumeMessage,
  type RecoveringChannelModel,
} from 'amqplib';
import { EVENTS_EXCHANGE, type EventDefinition, routingKey } from './catalog';
import { type EventEnvelope, InvalidEventError, parseEnvelope } from './envelope';
import type { EventPublisher, LoggerLike } from './relay';
import { decideOnFailure, type RetryPolicy } from './retry';

export interface RabbitMqEventBusOptions {
  /** `RABBITMQ_URL` from the environment. */
  url: string;
  /** Defaults to `pbl6.events`; tests use a throw-away exchange. */
  exchange?: string;
  /** Broker confirm timeout for one publish (default 5000 ms). */
  publishTimeoutMs?: number;
  logger?: LoggerLike;
}

export interface SubscriptionOptions {
  /**
   * Durable queue of this consumer, named `<service>.<purpose>`, e.g.
   * `identity-service.directory`. `<queue>.retry` and `<queue>.dlq` are
   * created next to it.
   */
  queue: string;
  /** Exact event versions this consumer understands. */
  events: readonly EventDefinition[];
  handler: (envelope: EventEnvelope) => Promise<void>;
  prefetch?: number;
  /** Deliveries before the message goes to `<queue>.dlq` (default 5). */
  maxAttempts?: number;
  /** First retry delay (default 2000 ms), doubled each time, max 5 min. */
  retryDelayMs?: number;
}

const ATTEMPT_HEADER = 'x-attempt';
const silent: LoggerLike = { log: () => {}, warn: () => {}, error: () => {} };

/** Queue names derived from a subscription queue. */
export function subscriptionQueues(queue: string): {
  main: string;
  retry: string;
  deadLetter: string;
} {
  return { main: queue, retry: `${queue}.retry`, deadLetter: `${queue}.dlq` };
}

function confirmSend(
  channel: ConfirmChannel,
  send: (callback: (error: unknown) => void) => void,
  timeoutMs: number,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Broker did not confirm within ${timeoutMs} ms`)),
      timeoutMs,
    );
    send((error) => {
      clearTimeout(timer);
      if (error) reject(error instanceof Error ? error : new Error(String(error)));
      else resolve();
    });
  });
}

/**
 * RabbitMQ transport (ADR 0005):
 * - one durable topic exchange; routing key `<EventType>.v<version>`;
 * - persistent messages published on a confirm channel;
 * - per consumer: `<queue>` (manual ack), `<queue>.retry` (messages wait
 *   there with a per-message TTL, then dead-letter back to `<queue>`) and
 *   `<queue>.dlq` (invalid messages and those that failed `maxAttempts` times);
 * - reconnects with backoff and re-creates topology and consumers
 *   (amqplib recovery); `start()` does not wait for the broker, so a service
 *   starts even when RabbitMQ is down.
 */
export class RabbitMqEventBus implements EventPublisher {
  private readonly exchange: string;
  private readonly publishTimeoutMs: number;
  private readonly logger: LoggerLike;
  private readonly subscriptions: SubscriptionOptions[] = [];
  private connection: RecoveringChannelModel | undefined;
  private model: ChannelModel | undefined;
  private publishChannel: ConfirmChannel | undefined;

  constructor(private readonly options: RabbitMqEventBusOptions) {
    this.exchange = options.exchange ?? EVENTS_EXCHANGE;
    this.publishTimeoutMs = options.publishTimeoutMs ?? 5000;
    this.logger = options.logger ?? silent;
  }

  /** Registers a consumer; call before `start()` (or it starts on the next connect). */
  subscribe(subscription: SubscriptionOptions): void {
    this.subscriptions.push(subscription);
    if (this.model) {
      this.setupSubscription(this.model, subscription).catch((error: unknown) =>
        this.logger.error({ msg: 'Subscription setup failed', queue: subscription.queue }, String(error), RabbitMqEventBus.name),
      );
    }
  }

  async start(): Promise<void> {
    if (this.connection) return;
    this.connection = await connect(this.options.url, {
      recovery: {
        initialDelay: 500,
        maxDelay: 30_000,
        waitForConnect: false,
        setup: async (model: ChannelModel) => {
          this.model = model;
          const channel = await model.createConfirmChannel();
          await channel.assertExchange(this.exchange, 'topic', { durable: true });
          for (const subscription of this.subscriptions) {
            await this.setupSubscription(model, subscription);
          }
          // Ready only once every queue is bound: an event published earlier
          // would match no binding and be dropped by the broker.
          this.publishChannel = channel;
          channel.on('close', () => {
            if (this.publishChannel === channel) this.publishChannel = undefined;
          });
        },
      },
    });
    this.connection.on('connect', () =>
      this.logger.log({ msg: 'Connected to RabbitMQ' }, RabbitMqEventBus.name),
    );
    this.connection.on('disconnect', (error: Error) => {
      this.publishChannel = undefined;
      this.model = undefined;
      this.logger.warn({ msg: 'Disconnected from RabbitMQ', reason: error?.message }, RabbitMqEventBus.name);
    });
    this.connection.on('error', (error: Error) =>
      this.logger.warn({ msg: 'RabbitMQ error', reason: error.message }, RabbitMqEventBus.name),
    );
  }

  /** Resolves once connected and every subscription is bound (tests, scripts). */
  async waitUntilConnected(timeoutMs = 10_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (!this.isReady()) {
      if (Date.now() > deadline) throw new Error('RabbitMQ is not reachable');
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  isReady(): boolean {
    return this.publishChannel !== undefined;
  }

  async publish(envelope: EventEnvelope): Promise<void> {
    const channel = this.publishChannel;
    if (!channel) {
      throw new Error('RabbitMQ is not connected');
    }
    const content = Buffer.from(JSON.stringify(envelope));
    await confirmSend(
      channel,
      (callback) =>
        channel.publish(
          this.exchange,
          routingKey({ type: envelope.eventType, version: envelope.eventVersion }),
          content,
          {
            persistent: true,
            contentType: 'application/json',
            messageId: envelope.eventId,
            type: envelope.eventType,
            timestamp: Math.floor(Date.parse(envelope.occurredAt) / 1000),
            headers: { 'x-event-version': envelope.eventVersion },
          },
          callback,
        ),
      this.publishTimeoutMs,
    );
  }

  async close(): Promise<void> {
    const connection = this.connection;
    this.connection = undefined;
    this.publishChannel = undefined;
    this.model = undefined;
    await connection?.close().catch(() => undefined);
  }

  private async setupSubscription(
    model: ChannelModel,
    subscription: SubscriptionOptions,
  ): Promise<void> {
    const queues = subscriptionQueues(subscription.queue);
    const policy: RetryPolicy = {
      maxAttempts: subscription.maxAttempts ?? 5,
      baseDelayMs: subscription.retryDelayMs ?? 2000,
      maxDelayMs: 5 * 60 * 1000,
    };
    const channel = await model.createConfirmChannel();
    await channel.assertExchange(this.exchange, 'topic', { durable: true });
    await channel.assertQueue(queues.deadLetter, { durable: true });
    await channel.assertQueue(queues.retry, {
      durable: true,
      deadLetterExchange: '',
      deadLetterRoutingKey: queues.main,
    });
    await channel.assertQueue(queues.main, {
      durable: true,
      deadLetterExchange: '',
      deadLetterRoutingKey: queues.deadLetter,
    });
    for (const definition of subscription.events) {
      await channel.bindQueue(queues.main, this.exchange, routingKey(definition));
    }
    await channel.prefetch(subscription.prefetch ?? 10);
    await channel.consume(
      queues.main,
      (message) => {
        if (message) {
          void this.handleMessage(channel, subscription, queues.retry, policy, message);
        }
      },
      { noAck: false },
    );
  }

  private async handleMessage(
    channel: ConfirmChannel,
    subscription: SubscriptionOptions,
    retryQueue: string,
    policy: RetryPolicy,
    message: ConsumeMessage,
  ): Promise<void> {
    const attempt = Number(message.properties.headers?.[ATTEMPT_HEADER] ?? 1);
    let envelope: EventEnvelope;
    try {
      envelope = parseEnvelope(message.content);
      if (
        !subscription.events.some(
          (d) => d.type === envelope.eventType && d.version === envelope.eventVersion,
        )
      ) {
        throw new InvalidEventError([`not subscribed to ${envelope.eventType} v${envelope.eventVersion}`]);
      }
    } catch (error) {
      this.logger.error(
        { msg: 'Invalid event sent to dead-letter queue', queue: subscription.queue, messageId: message.properties.messageId },
        error instanceof Error ? error.message : String(error),
        RabbitMqEventBus.name,
      );
      channel.nack(message, false, false);
      return;
    }

    try {
      await subscription.handler(envelope);
      channel.ack(message);
    } catch (error) {
      const decision = decideOnFailure(attempt, policy);
      const reason = error instanceof Error ? error.message : String(error);
      if (decision.action === 'give-up') {
        this.logger.error(
          { msg: 'Event handler failed, sent to dead-letter queue', queue: subscription.queue, eventId: envelope.eventId, eventType: envelope.eventType, attempt },
          error instanceof Error ? error.stack : reason,
          RabbitMqEventBus.name,
        );
        channel.nack(message, false, false);
        return;
      }
      this.logger.warn(
        { msg: 'Event handler failed, retrying', queue: subscription.queue, eventId: envelope.eventId, eventType: envelope.eventType, attempt, delayMs: decision.delayMs, reason },
        RabbitMqEventBus.name,
      );
      try {
        await confirmSend(
          channel,
          (callback) =>
            channel.sendToQueue(
              retryQueue,
              message.content,
              {
                ...message.properties,
                persistent: true,
                expiration: String(decision.delayMs),
                headers: {
                  ...message.properties.headers,
                  [ATTEMPT_HEADER]: decision.nextAttempt,
                  'x-last-error': reason.slice(0, 500),
                },
              },
              callback,
            ),
          this.publishTimeoutMs,
        );
        channel.ack(message);
      } catch {
        // Could not park it for retry: requeue so the message is not lost.
        channel.nack(message, false, true);
      }
    }
  }
}
