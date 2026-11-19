ALTER TABLE equipments ADD COLUMN purchase_date DATE;
CREATE INDEX idx_equipments_tenant_purchase_date
  ON equipments (tenant_id, purchase_date);
