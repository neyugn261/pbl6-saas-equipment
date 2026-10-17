import { is } from './checks';
import {
  type EventDefinition,
  findEventDefinition,
  type PayloadOf,
  payloadProblems,
} from './catalog';

/** Message body on the broker. `eventId` = outbox_events.id of the producer. */
export interface EventEnvelope<TPayload = unknown> {
  eventId: string;
  eventType: string;
  eventVersion: number;
  producer: string;
  /** NULL only for platform-level events. */
  tenantId: string | null;
  aggregateType: string;
  aggregateId: string;
  /** ISO 8601, time of the business change. */
  occurredAt: string;
  correlationId: string | null;
  payload: TPayload;
}

export type EnvelopeOf<D extends EventDefinition> = EventEnvelope<PayloadOf<D>>;

/** The message is not a valid envelope, or its payload breaks the contract. */
export class InvalidEventError extends Error {
  override readonly name = 'InvalidEventError';

  constructor(readonly problems: string[]) {
    super(`Invalid event: ${problems.join('; ')}`);
  }
}

/** Parses and validates a broker message against the catalog. */
export function parseEnvelope(content: Buffer | string): EventEnvelope {
  let value: unknown;
  try {
    value = JSON.parse(content.toString());
  } catch {
    throw new InvalidEventError(['body is not JSON']);
  }
  if (value === null || typeof value !== 'object') {
    throw new InvalidEventError(['body is not an object']);
  }
  const e = value as Record<string, unknown>;
  const problems: string[] = [];
  if (!is.uuid(e.eventId)) problems.push('eventId must be a UUID');
  if (!is.string(100)(e.eventType)) problems.push('eventType is required');
  if (!Number.isInteger(e.eventVersion) || (e.eventVersion as number) < 1) {
    problems.push('eventVersion must be a positive integer');
  }
  if (!is.string(100)(e.producer)) problems.push('producer is required');
  if (e.tenantId !== null && !is.uuid(e.tenantId)) {
    problems.push('tenantId must be a UUID or null');
  }
  if (!is.string(50)(e.aggregateType)) problems.push('aggregateType is required');
  if (!is.uuid(e.aggregateId)) problems.push('aggregateId must be a UUID');
  if (!is.isoDateTime(e.occurredAt)) problems.push('occurredAt must be ISO 8601');
  if (e.correlationId !== null && !is.string(128)(e.correlationId)) {
    problems.push('correlationId must be a string or null');
  }
  if (problems.length === 0) {
    const definition = findEventDefinition(
      e.eventType as string,
      e.eventVersion as number,
    );
    if (!definition) {
      problems.push(`unknown event ${String(e.eventType)} v${String(e.eventVersion)}`);
    } else {
      problems.push(...payloadProblems(definition, e.payload));
    }
  }
  if (problems.length > 0) {
    throw new InvalidEventError(problems);
  }
  return e as unknown as EventEnvelope;
}

/** Narrows an envelope to one catalog entry: `if (isEvent(e, Events.TenantCreated)) e.payload.code`. */
export function isEvent<D extends EventDefinition>(
  envelope: EventEnvelope,
  definition: D,
): envelope is EnvelopeOf<D> {
  return (
    envelope.eventType === definition.type &&
    envelope.eventVersion === definition.version
  );
}
