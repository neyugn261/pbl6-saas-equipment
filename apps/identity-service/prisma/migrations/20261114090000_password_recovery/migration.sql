-- HU-04: additive, pending Identity owner review. Existing tokens remain valid.
ALTER TABLE account_tokens ADD COLUMN failed_attempts INTEGER NOT NULL DEFAULT 0
  CHECK (failed_attempts >= 0);
CREATE TABLE password_rate_limits (
  key VARCHAR(64) PRIMARY KEY,
  window_at TIMESTAMPTZ(6) NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0)
);
