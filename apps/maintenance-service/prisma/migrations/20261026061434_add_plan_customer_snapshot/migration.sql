-- ADR 0007 D12a: snapshot comes from a scoped Asset response when a plan is
-- created. Existing rows must be backfilled through a separately reviewed
-- authenticated integration. Never invent customer IDs or query asset_db.
BEGIN;
LOCK TABLE maintenance_plans IN ACCESS EXCLUSIVE MODE;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM maintenance_plans) THEN
    RAISE EXCEPTION 'maintenance_plans contains rows: backfill customer snapshot before applying this migration';
  END IF;
END $$;

ALTER TABLE "maintenance_plans" ADD COLUMN     "customer_id" UUID NOT NULL,
ADD COLUMN     "customer_site_id" UUID;

CREATE INDEX "idx_maintenance_plans_customer" ON "maintenance_plans"("tenant_id", "customer_id");
COMMIT;
