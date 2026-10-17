# ADR 0005 — Event transport: outbox, RabbitMQ topology, inbox

- Status: Accepted (M0; change through a PR to this ADR)
- Date: 2026-10-17
- Builds on: [ADR 0001](0001-database-v3.1.md) (`outbox_events`, `processed_events`)
- Audit finding: ISS-05
- Catalog: [docs/architecture/events.md](../architecture/events.md)
- Code: `packages/event-contracts`

## Decisions

### Envelope

Every message is one JSON object:

```json
{
  "eventId": "uuid (= outbox_events.id)",
  "eventType": "TenantCreated",
  "eventVersion": 1,
  "producer": "organization-service",
  "tenantId": "uuid | null",
  "aggregateType": "Tenant",
  "aggregateId": "uuid",
  "occurredAt": "2026-10-17T03:00:00.000Z",
  "correlationId": "string | null",
  "payload": { }
}
```

- Each `(eventType, eventVersion)` has a payload contract in the catalog
  (`Events` in `packages/event-contracts/src/catalog.ts`). `enqueueEvent`
  refuses a payload that breaks it; consumers dead-letter one.
- An incompatible change is a **new version** published next to the old one
  until all consumers moved; v1 is never edited. Adding an optional field is
  compatible.
- Only the owner service (`producer` in the catalog) publishes an event.

### Producer: transactional outbox

- `enqueueEvent(tx, Events.X, {...})` inserts into `outbox_events` in the same
  transaction as the business change.
- `outbox_events.payload` stores `{ "data": <payload>, "meta": { "correlationId" } }`
  — the correlation id has no column of its own and no migration is needed.
- `OutboxRelay` (in-process, one per service) polls `PENDING` rows with
  `FOR UPDATE SKIP LOCKED`, publishes on a confirm channel, marks them
  `PUBLISHED`. A failed publish increments `attempt_count`, stores
  `last_error` and moves `available_at` forward (1 s, 2 s, 4 s … max 5 min).
  After 10 failures the row becomes `FAILED` (operator action, see events.md).
  The relay does not run while the broker is disconnected, so an outage does
  not use up attempts.
- Delivery is **at-least-once**: a crash between broker confirm and commit
  republishes the row.

### Broker topology (RabbitMQ)

- One durable topic exchange `pbl6.events`; routing key
  `<EventType>.v<version>`, e.g. `TenantCreated.v1`.
- Per consumer (named `<service>.<purpose>`, e.g. `identity-service.directory`):
  - `<queue>`: durable, manual ack, bound to the exact versions it handles;
  - `<queue>.retry`: a failed message waits there with a per-message TTL
    (2 s, 4 s, 8 s …) and then dead-letters back to `<queue>`;
    header `x-attempt` counts deliveries;
  - `<queue>.dlq`: invalid messages and messages that failed 5 times.
- Messages are persistent; publishes wait for broker confirms (5 s timeout).
- Connections recover automatically (amqplib recovery) and re-create the
  topology and consumers; a service starts even when RabbitMQ is down.

### Consumer: inbox

- `processOnce(prisma, { eventId, eventType, consumer }, handler)` inserts into
  `processed_events` and runs the handler in **one** transaction: duplicates
  are skipped, a failed handler leaves no inbox row and is retried.
- Handlers must not depend on order across aggregates. Where order matters for
  one aggregate, the payload carries the source timestamp (`changedAt`) and the
  consumer ignores older changes (see `user_customer_links`,
  `tenant_directory`).
- The handler runs inside `runWithCorrelationId(envelope.correlationId)` so
  its logs carry the id of the request that caused the event.

## Consequences and limits

- Events of one aggregate can be published out of order after a retry;
  consumers handle this with timestamps as above.
- RabbitMQ only expires per-message TTL at the head of a queue, so a long
  retry delay can hold back shorter ones behind it in `<queue>.retry`.
  Acceptable for the low volumes of the project.
- `outbox_events` rows are kept (no cleanup job in the MVP).
- The integration test of the transport runs against a real broker when
  `RABBITMQ_TEST_URL` is set (CI sets it).
