# M3 Identity schema delta

This supplements `pbl6-schema-v3.1.sql`; the migration is the executable SQL.
All tables below belong only to `identity_db`. IDs in Notification's future
projection are logical references without cross-database foreign keys.

| Table/column | Purpose | Main constraints/indexes |
| --- | --- | --- |
| `users.recipient_revision` | Per-user monotonic snapshot revision | `BIGINT NOT NULL DEFAULT 0`, nonnegative CHECK |
| `outbox_events` | Transactional event relay, ADR 0005 | UUID PK, status/attempt CHECK, pending partial index |
| `recipient_bootstrap_runs` | Durable per-tenant run state/count | UUID PK, RUNNING/COMPLETED/FAILED CHECK, one RUNNING run per tenant |
| `recipient_bootstrap_users` | Fixed user set and resumable progress | `(run_id,user_id)` PK, FK to run, nullable `enqueued_at` |
| `activation_deliveries` | Private encrypted SMTP jobs | UUID PK, unique `token_id` FK, status/attempt CHECK, pending partial index |

`activation_deliveries.ciphertext` is present only while PENDING; `sent_at`
is present only when SENT. The foreign key points to an Identity-owned account
token. No delivery secret is copied into the outbox. The migration does not
change existing `0001`–`0003` tables, CHECKs, triggers or permission seeds.
