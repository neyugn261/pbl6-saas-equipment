-- AlterTable
ALTER TABLE "maintenance_plans" ADD COLUMN     "checklist" JSONB,
ADD COLUMN     "policy_version_id" UUID,
ADD COLUMN     "setup_group_id" UUID,
ADD COLUMN     "setup_item_id" UUID;

-- AlterTable
ALTER TABLE "maintenance_tasks" ADD COLUMN     "checklist" JSONB,
ADD COLUMN     "policy_version_id" UUID;

-- CreateTable
CREATE TABLE "model_maintenance_revisions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "model_id" UUID NOT NULL,
    "revision" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "body" JSONB NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "model_maintenance_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_setup_groups" (
    "tenant_id" UUID NOT NULL,
    "registration_id" UUID NOT NULL,
    "equipment_id" UUID NOT NULL,
    "input_hash" CHAR(64) NOT NULL,
    "receipt" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "maintenance_setup_groups_pkey" PRIMARY KEY ("tenant_id","registration_id")
);

-- CreateTable
CREATE TABLE "model_policy_audit" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "model_id" UUID NOT NULL,
    "revision_id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "action" VARCHAR(20) NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "model_policy_audit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "model_maintenance_revisions_tenant_id_model_id_revision_key" ON "model_maintenance_revisions"("tenant_id", "model_id", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "model_maintenance_revisions_tenant_id_id_key" ON "model_maintenance_revisions"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "model_policy_audit_tenant_id_model_id_created_at_idx" ON "model_policy_audit"("tenant_id", "model_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "maintenance_plans_tenant_id_setup_group_id_setup_item_id_key" ON "maintenance_plans"("tenant_id", "setup_group_id", "setup_item_id");


CREATE UNIQUE INDEX uq_model_maintenance_revisions_default ON model_maintenance_revisions(tenant_id,model_id) WHERE is_default;
ALTER TABLE model_maintenance_revisions ADD CHECK (status IN ('DRAFT','PUBLISHED','RETIRED')), ADD CHECK (NOT is_default OR status='PUBLISHED'), ADD CHECK (revision>0 AND version>0);
