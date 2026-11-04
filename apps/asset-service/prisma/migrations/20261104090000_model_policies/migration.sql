-- AlterTable
ALTER TABLE "equipment_registrations" ADD COLUMN     "maintenance_plan_ids" UUID[] DEFAULT ARRAY[]::UUID[],
ADD COLUMN     "policy_preview" JSONB;

-- AlterTable
ALTER TABLE "warranties" ADD COLUMN     "policy_snapshot" JSONB,
ADD COLUMN     "policy_version_id" UUID;

-- CreateTable
CREATE TABLE "model_warranty_revisions" (
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

    CONSTRAINT "model_warranty_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "model_warranty_revisions_tenant_id_model_id_revision_key" ON "model_warranty_revisions"("tenant_id", "model_id", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "model_warranty_revisions_tenant_id_id_key" ON "model_warranty_revisions"("tenant_id", "id");


CREATE UNIQUE INDEX uq_model_warranty_revisions_default ON model_warranty_revisions(tenant_id,model_id) WHERE is_default;
ALTER TABLE model_warranty_revisions ADD CHECK (status IN ('DRAFT','PUBLISHED','RETIRED')), ADD CHECK (NOT is_default OR status='PUBLISHED'), ADD CHECK (revision>0 AND version>0);
