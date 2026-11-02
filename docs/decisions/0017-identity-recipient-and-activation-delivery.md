# ADR 0017 — Identity recipient snapshot and activation delivery (M3-D1)

Status: proposed for producer/Notification consumer review, 02/11/2026.

## Context and decision

ADR 0004 forbids a background Notification consumer from impersonating a user
to query Identity/Organization. ADR 0005 requires local outbox/inbox. Identity
therefore publishes `NotificationRecipientSnapshot.v1` for tenant users after
invite, activation, status/role changes, and accepted
`CustomerMembershipChanged.v1` events. Organization remains the membership
source. A USER lock and `users.recipient_revision` serialize each full snapshot;
revision is a positive decimal string in the payload. Identity's business
transaction and outbox insert commit together. Platform staff are excluded.

Historical users enter through `recipient:bootstrap <tenantId>`. A durable run
captures the tenant's user IDs, enqueues each snapshot with the same revision
path, then enqueues `NotificationRecipientBootstrapCompleted.v1`. The command
resumes a failed/running run; `--new` starts another after the previous one
finishes. A marker means **queued**, not delivered to Notification. The
consumer counts distinct bootstrap user IDs even when a newer live revision
has already been applied, and marks complete only after receiving both marker
and expected snapshots. The bootstrap user set is fixed at run creation; live
updates cover later users.

Identity also owns activation token delivery. The raw one-time token is never
placed in an event or Notification row. The invitation transaction creates an
`activation_deliveries` job keyed by `account_token.id`. Its URL is encrypted
with AES-256-GCM under `IDENTITY_ACTIVATION_ENCRYPTION_KEY`; the database stores
only ciphertext, not the raw link. A worker claims jobs with a short lease,
sends through SMTP and retries with exponential backoff until token expiry.
It clears ciphertext on sent or expired. SMTP is
at-least-once: a crash after send but before commit can send the **same** link
again. Renewing the invitation invalidates old tokens and pending jobs.

For the local demo, Mailpit receives mail on its private SMTP port and exposes
its UI on `DEMO_MAILPIT_PORT`. The encryption key is a 32-byte random value in
the ignored demo env file. Rotate it only after pending deliveries are drained
or expired; no automatic re-encryption is provided in M3. Remote deployments
must use a trusted SMTP endpoint and HTTPS portal URL. The sender and URL are
config, not hardcoded into the service. Production startup rejects missing mail
config and token exposure.

## Consequences and limits

- Notification must implement its own local projection, durable pending event
  policy, customer scope and fan-out idempotency as described in
  `docs/planning/m3-nguyen-huy-q3-q4-q6-handoff.md`.
- Existing accounts require a bootstrap run per tenant after deploying the
  migration; enabling a consumer alone does not backfill them.
- A successful SMTP response is the worker's sent boundary. Mailbox receipt
  and user activation are distinct outcomes.
- This ADR does not change `CustomerMembershipChanged.v1`, the RBAC catalog,
  or API activation token semantics for local development/tests.

## Schema and verification

The Identity-only delta is in
`apps/identity-service/prisma/migrations/20261102090000_notification_recipient_outbox`.
See `docs/erd/m3-identity-recipient-and-mail.md` for tables and constraints.
Identity E2E tests verify ordered membership snapshots and existing auth
regression. On 02/11/2026 the optional `mailpit.e2e-spec.ts` passed against
`identity_test_db` and the local Mailpit SMTP port; it used the real invitation
API and Mailpit's API confirmed the test recipient. Full Gateway invite and Notification consumer
integration remain separate acceptance steps.
The bootstrap CLI was also exercised on an isolated two-user tenant: run
COMPLETED with 2/2 snapshots and one completion marker; rerunning without
`--new` reused that run without queueing duplicates.

On 03/11/2026 the rebuilt demo stack applied this migration. Bootstrap of the
demo tenant enqueued eight snapshots and one marker; the Identity outbox relay
marked all nine `PUBLISHED` after connecting to RabbitMQ. A separate invitation
through Gateway reached Mailpit SMTP, and the encrypted job reached `SENT`
with ciphertext cleared. Notification consumer processing remains unverified
until its projection and inbox are implemented.
