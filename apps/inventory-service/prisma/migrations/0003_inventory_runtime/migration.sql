-- Additive runtime records. Keep 0001/0002, their checks and partial indexes.
CREATE TABLE inventory_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  key UUID NOT NULL,
  operation VARCHAR(20) NOT NULL CHECK (operation IN ('RECEIVE','ADJUST','ISSUE','RETURN')),
  fingerprint VARCHAR(64) NOT NULL CHECK (fingerprint ~ '^[0-9a-f]{64}$'),
  request JSONB NOT NULL,
  actor_id UUID NOT NULL,
  work_order_id UUID,
  state VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (state IN ('PENDING','COMMITTED','ABORTED')),
  response JSONB,
  http_status INTEGER,
  reservation_settled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, key),
  CHECK ((operation = 'ISSUE') = (work_order_id IS NOT NULL)),
  CHECK ((state = 'PENDING' AND response IS NULL AND http_status IS NULL AND reservation_settled_at IS NULL)
      OR (state = 'COMMITTED' AND response IS NOT NULL AND http_status BETWEEN 200 AND 299)
      OR (state = 'ABORTED' AND operation = 'ISSUE' AND response IS NOT NULL AND http_status BETWEEN 400 AND 499)),
  CHECK (reservation_settled_at IS NULL OR (operation = 'ISSUE' AND state <> 'PENDING'))
);
CREATE INDEX idx_inventory_operations_recovery ON inventory_operations(tenant_id,state,created_at);

ALTER TABLE work_order_parts ADD CONSTRAINT work_order_parts_tenant_id_id_key UNIQUE(tenant_id,id);
ALTER TABLE stock_transactions
  ADD COLUMN balance_before NUMERIC(12,2),
  ADD COLUMN balance_after NUMERIC(12,2),
  ADD COLUMN work_order_part_id UUID,
  ADD CONSTRAINT stock_transactions_return_usage_fk FOREIGN KEY(tenant_id,work_order_part_id)
    REFERENCES work_order_parts(tenant_id,id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  ADD CONSTRAINT stock_transactions_balances CHECK (
    (balance_before IS NULL AND balance_after IS NULL) OR
    (balance_before IS NOT NULL AND balance_after IS NOT NULL AND balance_before >= 0 AND balance_after >= 0
      AND balance_after = balance_before + CASE WHEN type IN ('RECEIVE','RETURN','ADJUST_IN') THEN quantity ELSE -quantity END)),
  ADD CONSTRAINT stock_transactions_usage_type CHECK (work_order_part_id IS NULL OR type = 'RETURN');
CREATE INDEX idx_stock_transactions_usage ON stock_transactions(tenant_id,work_order_part_id);
