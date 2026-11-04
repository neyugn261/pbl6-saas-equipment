-- AlterTable
ALTER TABLE "work_orders" ADD COLUMN     "checklist" JSONB,
ADD COLUMN     "checklist_results" JSONB,
ADD COLUMN     "checklist_version" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "policy_version_id" UUID;

-- CreateTable
CREATE TABLE "work_order_checklist_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "work_order_id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "assignment_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "results" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_order_checklist_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "work_order_checklist_history_tenant_id_work_order_id_versio_key" ON "work_order_checklist_history"("tenant_id", "work_order_id", "version");

