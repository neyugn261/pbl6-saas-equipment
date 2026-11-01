-- M3-A1 / ADR 0013: additive persistence only; runtime follows in A2-A4.
-- Review legacy rows and shared/schema approval before business DB deployment.

-- AlterTable
ALTER TABLE "report_attachments" ADD COLUMN     "checksum_sha256" CHAR(64),
ADD COLUMN     "deleted_at" TIMESTAMPTZ(6),
ADD COLUMN     "deleted_by" UUID,
ADD COLUMN     "size_bytes" INTEGER,
ADD COLUMN     "verified_at" TIMESTAMPTZ(6),
ADD COLUMN     "visibility_changed_at" TIMESTAMPTZ(6),
ADD COLUMN     "visibility_changed_by" UUID;

-- AlterTable
ALTER TABLE "work_order_attachments" ADD COLUMN     "checksum_sha256" CHAR(64),
ADD COLUMN     "deleted_at" TIMESTAMPTZ(6),
ADD COLUMN     "deleted_by" UUID,
ADD COLUMN     "size_bytes" INTEGER,
ADD COLUMN     "verified_at" TIMESTAMPTZ(6),
ADD COLUMN     "visibility_changed_at" TIMESTAMPTZ(6),
ADD COLUMN     "visibility_changed_by" UUID;

-- CreateTable
CREATE TABLE "attachment_upload_intents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "uploaded_by" UUID NOT NULL,
    "target_type" VARCHAR(20) NOT NULL,
    "work_order_id" UUID NOT NULL,
    "service_report_id" UUID,
    "file_name" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "checksum_sha256" CHAR(64) NOT NULL,
    "visibility" VARCHAR(20) NOT NULL DEFAULT 'INTERNAL',
    "staging_key" VARCHAR(500) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'INITIATED',
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "attempt_id" UUID,
    "attempt_final_key" VARCHAR(500),
    "lease_expires_at" TIMESTAMPTZ(6),
    "work_order_attachment_id" UUID,
    "report_attachment_id" UUID,
    "attached_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attachment_upload_intents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachment_idempotency" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "operation" VARCHAR(20) NOT NULL,
    "key" UUID NOT NULL,
    "fingerprint" CHAR(64) NOT NULL,
    "upload_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attachment_idempotency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachment_cleanup_jobs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "upload_id" UUID NOT NULL,
    "kind" VARCHAR(20) NOT NULL,
    "object_key" VARCHAR(500) NOT NULL,
    "attempt_id" UUID,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "not_before" TIMESTAMPTZ(6) NOT NULL,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "claim_id" UUID,
    "lease_expires_at" TIMESTAMPTZ(6),
    "last_error_code" VARCHAR(80),
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attachment_cleanup_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uq_attachment_upload_staging_key" ON "attachment_upload_intents"("staging_key");

-- CreateIndex
CREATE UNIQUE INDEX "uq_attachment_upload_wo_result" ON "attachment_upload_intents"("work_order_attachment_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_attachment_upload_report_result" ON "attachment_upload_intents"("report_attachment_id");

-- CreateIndex
CREATE INDEX "idx_attachment_upload_quota" ON "attachment_upload_intents"("tenant_id", "work_order_id", "target_type", "status", "expires_at");

-- CreateIndex
CREATE INDEX "idx_attachment_upload_expiry" ON "attachment_upload_intents"("status", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "uq_attachment_upload_tenant_id" ON "attachment_upload_intents"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_attachment_upload_actor_id" ON "attachment_upload_intents"("tenant_id", "uploaded_by", "id");

-- CreateIndex
CREATE INDEX "idx_attachment_idempotency_upload" ON "attachment_idempotency"("tenant_id", "upload_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_attachment_idempotency_scope" ON "attachment_idempotency"("tenant_id", "user_id", "operation", "key");

-- CreateIndex
CREATE UNIQUE INDEX "uq_attachment_cleanup_object" ON "attachment_cleanup_jobs"("object_key");

-- CreateIndex
CREATE INDEX "idx_attachment_cleanup_ready" ON "attachment_cleanup_jobs"("status", "not_before", "lease_expires_at");

-- CreateIndex
CREATE INDEX "idx_attachment_cleanup_upload" ON "attachment_cleanup_jobs"("tenant_id", "upload_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_report_attachment_parent_id" ON "report_attachments"("tenant_id", "service_report_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_service_report_order_id" ON "service_reports"("tenant_id", "work_order_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_wo_attachment_parent_id" ON "work_order_attachments"("tenant_id", "work_order_id", "id");

-- AddForeignKey
ALTER TABLE "attachment_upload_intents" ADD CONSTRAINT "attachment_upload_intents_tenant_id_work_order_id_fkey" FOREIGN KEY ("tenant_id", "work_order_id") REFERENCES "work_orders"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "attachment_upload_intents" ADD CONSTRAINT "attachment_upload_intents_tenant_id_work_order_id_service__fkey" FOREIGN KEY ("tenant_id", "work_order_id", "service_report_id") REFERENCES "service_reports"("tenant_id", "work_order_id", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "attachment_upload_intents" ADD CONSTRAINT "attachment_upload_intents_tenant_id_work_order_id_work_ord_fkey" FOREIGN KEY ("tenant_id", "work_order_id", "work_order_attachment_id") REFERENCES "work_order_attachments"("tenant_id", "work_order_id", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "attachment_upload_intents" ADD CONSTRAINT "attachment_upload_intents_tenant_id_service_report_id_repo_fkey" FOREIGN KEY ("tenant_id", "service_report_id", "report_attachment_id") REFERENCES "report_attachments"("tenant_id", "service_report_id", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "attachment_idempotency" ADD CONSTRAINT "attachment_idempotency_tenant_id_user_id_upload_id_fkey" FOREIGN KEY ("tenant_id", "user_id", "upload_id") REFERENCES "attachment_upload_intents"("tenant_id", "uploaded_by", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "attachment_cleanup_jobs" ADD CONSTRAINT "attachment_cleanup_jobs_tenant_id_upload_id_fkey" FOREIGN KEY ("tenant_id", "upload_id") REFERENCES "attachment_upload_intents"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- ADR 0013: CHECK constraints intentionally remain raw SQL.
-- Legacy attachment metadata stays NULL as a complete tuple; no fabricated hashes.
ALTER TABLE work_order_attachments
 ADD CONSTRAINT wo_attachment_verified_check CHECK (
   (size_bytes IS NULL AND checksum_sha256 IS NULL AND verified_at IS NULL)
   OR (size_bytes IS NOT NULL AND size_bytes BETWEEN 1 AND 10485760
       AND checksum_sha256 IS NOT NULL AND checksum_sha256 ~ '^[0-9a-f]{64}$'
       AND verified_at IS NOT NULL)),
 ADD CONSTRAINT wo_attachment_deleted_check CHECK ((deleted_at IS NULL) = (deleted_by IS NULL)),
 ADD CONSTRAINT wo_attachment_visibility_audit_check CHECK ((visibility_changed_at IS NULL) = (visibility_changed_by IS NULL));

ALTER TABLE report_attachments
 ADD CONSTRAINT report_attachment_verified_check CHECK (
   (size_bytes IS NULL AND checksum_sha256 IS NULL AND verified_at IS NULL)
   OR (size_bytes IS NOT NULL AND size_bytes BETWEEN 1 AND 10485760
       AND checksum_sha256 IS NOT NULL AND checksum_sha256 ~ '^[0-9a-f]{64}$'
       AND verified_at IS NOT NULL)),
 ADD CONSTRAINT report_attachment_deleted_check CHECK ((deleted_at IS NULL) = (deleted_by IS NULL)),
 ADD CONSTRAINT report_attachment_visibility_audit_check CHECK ((visibility_changed_at IS NULL) = (visibility_changed_by IS NULL));

ALTER TABLE attachment_upload_intents
 ADD CONSTRAINT attachment_upload_target_check CHECK (
   (target_type = 'WORK_ORDER' AND service_report_id IS NULL)
   OR (target_type = 'REPORT' AND service_report_id IS NOT NULL)),
 ADD CONSTRAINT attachment_upload_file_check CHECK (
   size_bytes BETWEEN 1 AND 10485760
   AND mime_type IN ('image/jpeg','image/png','application/pdf')
   AND checksum_sha256 ~ '^[0-9a-f]{64}$'
   AND length(btrim(file_name)) > 0
   AND length(btrim(staging_key)) > 0
   AND visibility IN ('INTERNAL','CUSTOMER')
   AND expires_at > created_at),
 ADD CONSTRAINT attachment_upload_phase_check CHECK (
   (status = 'ATTACHED' AND attached_at IS NOT NULL AND (
       (target_type = 'WORK_ORDER' AND work_order_attachment_id IS NOT NULL AND report_attachment_id IS NULL)
       OR (target_type = 'REPORT' AND report_attachment_id IS NOT NULL AND work_order_attachment_id IS NULL)))
   OR (status IN ('INITIATED','EXPIRED','ABORTED') AND attached_at IS NULL
       AND work_order_attachment_id IS NULL AND report_attachment_id IS NULL)),
 ADD CONSTRAINT attachment_upload_attempt_check CHECK (
   (attempt_id IS NULL AND attempt_final_key IS NULL AND lease_expires_at IS NULL)
   OR (status = 'INITIATED' AND attempt_id IS NOT NULL AND attempt_final_key IS NOT NULL
       AND length(btrim(attempt_final_key)) > 0 AND attempt_final_key <> staging_key
       AND lease_expires_at IS NOT NULL));

ALTER TABLE attachment_idempotency
 ADD CONSTRAINT attachment_idempotency_operation_check CHECK (operation IN ('PREPARE','FINALIZE')),
 ADD CONSTRAINT attachment_idempotency_fingerprint_check CHECK (fingerprint ~ '^[0-9a-f]{64}$');

ALTER TABLE attachment_cleanup_jobs
 ADD CONSTRAINT attachment_cleanup_kind_check CHECK (
   (kind = 'STAGING' AND attempt_id IS NULL)
   OR (kind = 'FINAL' AND attempt_id IS NOT NULL)),
 ADD CONSTRAINT attachment_cleanup_object_check CHECK (length(btrim(object_key)) > 0 AND attempt_count >= 0),
 ADD CONSTRAINT attachment_cleanup_phase_check CHECK (
   (status = 'PENDING' AND claim_id IS NULL AND lease_expires_at IS NULL AND completed_at IS NULL)
   OR (status = 'CLAIMED' AND claim_id IS NOT NULL AND lease_expires_at IS NOT NULL AND completed_at IS NULL)
   OR (status = 'DONE' AND claim_id IS NULL AND lease_expires_at IS NULL AND completed_at IS NOT NULL));
