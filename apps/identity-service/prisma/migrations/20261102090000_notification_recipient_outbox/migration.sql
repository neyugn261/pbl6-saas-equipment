ALTER TABLE users ADD COLUMN recipient_revision BIGINT NOT NULL DEFAULT 0
  CHECK (recipient_revision >= 0);

CREATE TABLE outbox_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NULL,
  aggregate_type VARCHAR(50) NOT NULL,
  aggregate_id UUID NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  event_version SMALLINT NOT NULL DEFAULT 1 CHECK (event_version > 0),
  payload JSONB NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'PUBLISHED', 'FAILED')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_error TEXT,
  available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ,
  CHECK ((status = 'PUBLISHED') = (published_at IS NOT NULL))
);
CREATE INDEX idx_outbox_events_pending ON outbox_events (available_at)
  WHERE status = 'PENDING';

CREATE TABLE recipient_bootstrap_runs (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'RUNNING'
    CHECK (status IN ('RUNNING', 'COMPLETED', 'FAILED')),
  expected_users INTEGER NOT NULL CHECK (expected_users >= 0),
  enqueued_users INTEGER NOT NULL DEFAULT 0 CHECK (enqueued_users >= 0),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  CHECK (enqueued_users <= expected_users),
  CHECK ((status = 'COMPLETED') = (completed_at IS NOT NULL))
);
CREATE INDEX idx_recipient_bootstrap_tenant
  ON recipient_bootstrap_runs (tenant_id, started_at);
CREATE UNIQUE INDEX uq_recipient_bootstrap_running
  ON recipient_bootstrap_runs (tenant_id) WHERE status = 'RUNNING';

CREATE TABLE recipient_bootstrap_users (
  run_id UUID NOT NULL REFERENCES recipient_bootstrap_runs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  enqueued_at TIMESTAMPTZ,
  PRIMARY KEY (run_id, user_id)
);

CREATE TABLE activation_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id UUID NOT NULL UNIQUE REFERENCES account_tokens(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  ciphertext TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'SENT', 'EXPIRED', 'FAILED')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ,
  last_error VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((status = 'PENDING') = (ciphertext IS NOT NULL)),
  CHECK ((status = 'SENT') = (sent_at IS NOT NULL))
);
CREATE INDEX idx_activation_deliveries_pending
  ON activation_deliveries (available_at) WHERE status = 'PENDING';
