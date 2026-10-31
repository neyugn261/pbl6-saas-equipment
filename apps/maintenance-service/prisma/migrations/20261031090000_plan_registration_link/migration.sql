-- AlterTable
ALTER TABLE "maintenance_plans" ADD COLUMN     "setup_input_hash" CHAR(64),
ADD COLUMN     "setup_linked_at" TIMESTAMPTZ(6),
ADD COLUMN     "setup_registration_id" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "maintenance_plans_tenant_id_setup_registration_id_key" ON "maintenance_plans"("tenant_id", "setup_registration_id");


ALTER TABLE maintenance_plans ADD CONSTRAINT maintenance_plans_setup_check CHECK (
 (setup_registration_id IS NULL AND setup_input_hash IS NULL AND setup_linked_at IS NULL)
 OR (setup_registration_id IS NOT NULL AND setup_input_hash IS NOT NULL AND setup_input_hash ~ '^[0-9a-f]{64}$' AND setup_linked_at IS NOT NULL)
);
