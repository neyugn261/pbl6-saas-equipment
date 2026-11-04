-- AlterTable
ALTER TABLE "service_requests" ADD COLUMN     "assessment_required" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "assessment_version" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "coverage_assessment" JSONB;

-- CreateTable
CREATE TABLE "warranty_assessment_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "assessment" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "warranty_assessment_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "warranty_assessment_history_tenant_id_request_id_version_key" ON "warranty_assessment_history"("tenant_id", "request_id", "version");


ALTER TABLE service_requests ADD COLUMN warranty_policy_snapshot JSONB, ADD COLUMN warranty_policy_version_id UUID;
