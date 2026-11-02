-- Preserve pre-existing fractional catalog; new parts require explicit opt-in.
ALTER TABLE parts ADD COLUMN allow_fractional BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE parts ALTER COLUMN allow_fractional SET DEFAULT false;
ALTER TABLE stocks ADD COLUMN quantity_quarantined NUMERIC(12,2) NOT NULL DEFAULT 0
  CHECK (quantity_quarantined >= 0);
ALTER TABLE work_order_parts
  ADD COLUMN quantity_confirmed_used NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN part_snapshot JSONB,
  ADD COLUMN warehouse_snapshot JSONB,
  ADD CONSTRAINT usage_reconciliation CHECK (quantity_confirmed_used >= 0
    AND quantity_confirmed_used + quantity_returned <= quantity_used);

ALTER TABLE stock_transactions
  ADD COLUMN reason_code VARCHAR(40),
  ADD COLUMN document_reference VARCHAR(150),
  ADD COLUMN related_transaction_id UUID,
  ADD COLUMN return_condition VARCHAR(30) CHECK (return_condition IN ('GOOD','DAMAGED','PENDING_INSPECTION')),
  ADD COLUMN part_snapshot JSONB,
  ADD COLUMN warehouse_snapshot JSONB,
  ADD COLUMN quarantine_before NUMERIC(12,2),
  ADD COLUMN quarantine_after NUMERIC(12,2);
ALTER TABLE stock_transactions DROP CONSTRAINT stock_transactions_type_check;
ALTER TABLE stock_transactions ADD CONSTRAINT stock_transactions_type_check
  CHECK (type IN ('RECEIVE','ISSUE','RETURN','ADJUST_IN','ADJUST_OUT','RELEASE','SCRAP'));
ALTER TABLE stock_transactions DROP CONSTRAINT stock_transactions_balances;
ALTER TABLE stock_transactions ADD CONSTRAINT stock_transactions_balances CHECK (
  (balance_before IS NULL AND balance_after IS NULL) OR
  (balance_before IS NOT NULL AND balance_after IS NOT NULL AND balance_before >= 0 AND balance_after >= 0
    AND balance_after = balance_before + CASE
      WHEN type IN ('RECEIVE','ADJUST_IN','RELEASE') OR (type = 'RETURN' AND COALESCE(return_condition,'GOOD') = 'GOOD') THEN quantity
      WHEN type IN ('ISSUE','ADJUST_OUT') THEN -quantity ELSE 0 END));
ALTER TABLE stock_transactions ADD CONSTRAINT stock_transactions_quarantine_balances CHECK (
  (quarantine_before IS NULL AND quarantine_after IS NULL) OR
  (quarantine_before IS NOT NULL AND quarantine_after IS NOT NULL AND quarantine_before >= 0 AND quarantine_after >= 0
    AND quarantine_after = quarantine_before + CASE
      WHEN type = 'RETURN' AND return_condition IN ('DAMAGED','PENDING_INSPECTION') THEN quantity
      WHEN type IN ('RELEASE','SCRAP') THEN -quantity ELSE 0 END));

ALTER TABLE inventory_operations DROP CONSTRAINT inventory_operations_operation_check;
ALTER TABLE inventory_operations ADD CONSTRAINT inventory_operations_operation_check
  CHECK (operation IN ('RECEIVE','ADJUST','ISSUE','RETURN','INSPECT','CONFIRM_USE','REVERSE_USE'));

CREATE TABLE usage_confirmations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  work_order_part_id UUID NOT NULL,
  work_order_id UUID NOT NULL,
  equipment_id UUID NOT NULL,
  customer_id UUID NOT NULL,
  service_report_id UUID NOT NULL,
  work_order_no VARCHAR(100) NOT NULL,
  kind VARCHAR(20) NOT NULL CHECK (kind IN ('CONFIRM','REVERSE')),
  quantity NUMERIC(12,2) NOT NULL CHECK (quantity > 0),
  reverses_id UUID UNIQUE,
  customer_reason VARCHAR(2000) NOT NULL,
  removed_part_disposition VARCHAR(40) NOT NULL,
  removed_part_note VARCHAR(2000),
  note TEXT,
  actor_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT usage_confirmations_tenant_id_work_order_part_id_fkey
    FOREIGN KEY(tenant_id,work_order_part_id) REFERENCES work_order_parts(tenant_id,id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  CHECK ((kind = 'REVERSE') = (reverses_id IS NOT NULL)),
  CHECK (removed_part_disposition IN ('NOT_APPLICABLE','RETURNED_TO_CUSTOMER','RETAINED_FOR_REVIEW','DISPOSED_WITH_CONSENT'))
);
CREATE INDEX idx_usage_confirmations_equipment ON usage_confirmations(tenant_id,equipment_id,customer_id,created_at);
CREATE TABLE inventory_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  entity_type VARCHAR(30) NOT NULL,
  entity_id UUID NOT NULL,
  action VARCHAR(30) NOT NULL,
  actor_id UUID NOT NULL,
  before JSONB,
  after JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_inventory_audit_entity ON inventory_audit(tenant_id,entity_type,entity_id,created_at);
