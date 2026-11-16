# HU-04 Identity schema delta — PENDING_OWNER_APPROVAL

Owner review: Nguyên. Base schema: ERD v3.1 + ADR 0017. This is a proposed,
additive Identity-only changeset; no cross-service keys or new business events.

- `account_tokens.failed_attempts INTEGER NOT NULL DEFAULT 0 CHECK >= 0`:
  counts wrong OTP attempts. Reuses existing `PASSWORD_RESET` purpose, UUID ID,
  expiry and used_at. Hash is HMAC-SHA256(account ID, challenge ID, OTP) with
  a dedicated environment key; raw OTP is never persisted in this column.
- `password_rate_limits(key VARCHAR(64) PRIMARY KEY, window_at TIMESTAMPTZ,
  attempts INTEGER DEFAULT 0 CHECK >= 0)`: HMAC of purpose/account scope/IP;
  no plaintext account/IP. Atomic upsert enforces fixed 15-minute budgets across replicas.
- Existing `activation_deliveries` stores the encrypted OTP for PASSWORD_RESET
  jobs. Same AES-256-GCM and SMTP worker as activation; no second mail pipeline.

Apply new migration `20261114090000_password_recovery` before deploying Identity.
No historical migration is edited. No backfill is needed. Roll forward is preferred;
rolling application code back can leave the added column/table in place. Never drop
them to roll back an application release. Drain jobs before rotating encryption key;
rotating OTP HMAC key invalidates pending challenges and resets rate-key namespaces.
Operations may delete rate-limit rows older than one day on Identity DB only;
deploy a scheduled cleanup before exposing recovery publicly at scale.

Concurrency: user-row lock serializes reset, resend, change, login session creation
and refresh rotation. Wrong attempts commit before the generic HTTP error. Password,
challenge consumption and session revocation commit atomically. Login checks the
password hash again under the lock, preventing a pre-reset password check from
creating a post-reset session. No claim of immediate JWT revocation across services:
ADR 0004 retains signature-only verification until JWT expiry.
