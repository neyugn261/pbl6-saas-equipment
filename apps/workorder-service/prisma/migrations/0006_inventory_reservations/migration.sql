-- ADR 0014 / 0016: local durable holds, no Inventory DB references/FKs.
CREATE TABLE "work_order_inventory_reservations" (
  "tenant_id" UUID NOT NULL,
  "request_id" UUID NOT NULL,
  "work_order_id" UUID NOT NULL,
  "fingerprint" CHAR(64) NOT NULL,
  "actor_id" UUID NOT NULL,
  "inventory_request" JSONB NOT NULL,
  "state" VARCHAR(20) NOT NULL,
  "inventory_usage_id" UUID,
  "stock_transaction_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "settled_at" TIMESTAMPTZ(6),
  CONSTRAINT "work_order_inventory_reservations_pkey" PRIMARY KEY ("tenant_id", "request_id"),
  CONSTRAINT "fk_wo_inventory_reservation_order" FOREIGN KEY ("tenant_id", "work_order_id") REFERENCES "work_orders"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "wo_inventory_reservation_identity_check" CHECK (
    fingerprint ~ '^[0-9a-f]{64}$' AND jsonb_typeof(inventory_request) = 'object'
  ),
  CONSTRAINT "wo_inventory_reservation_phase_check" CHECK (
    (state = 'HELD' AND settled_at IS NULL AND inventory_usage_id IS NULL AND stock_transaction_id IS NULL)
    OR (state = 'RELEASED' AND settled_at IS NOT NULL AND inventory_usage_id IS NULL AND stock_transaction_id IS NULL)
    OR (state = 'COMMITTED' AND settled_at IS NOT NULL AND inventory_usage_id IS NOT NULL AND stock_transaction_id IS NOT NULL)
  )
);
CREATE UNIQUE INDEX "uq_wo_inventory_reservation_usage" ON "work_order_inventory_reservations"("tenant_id", "inventory_usage_id");
CREATE UNIQUE INDEX "uq_wo_inventory_reservation_transaction" ON "work_order_inventory_reservations"("tenant_id", "stock_transaction_id");
CREATE INDEX "idx_wo_inventory_reservation_held" ON "work_order_inventory_reservations"("tenant_id", "work_order_id", "state");
