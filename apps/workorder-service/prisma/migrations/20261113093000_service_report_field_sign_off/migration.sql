-- AlterTable
ALTER TABLE "service_reports"
  ADD COLUMN "sign_off_status" VARCHAR(30) NOT NULL DEFAULT 'NOT_APPLICABLE',
  ADD COLUMN "signer_name" VARCHAR(100),
  ADD COLUMN "signer_title" VARCHAR(100),
  ADD COLUMN "signer_phone" VARCHAR(30),
  ADD COLUMN "signed_at" TIMESTAMPTZ(6),
  ADD COLUMN "signature_attachment_id" UUID,
  ADD COLUMN "sign_off_notes" TEXT;

ALTER TABLE "service_reports"
  ADD CONSTRAINT "service_reports_sign_off_status_check"
    CHECK ("sign_off_status" IN ('SIGNED', 'CUSTOMER_ABSENT', 'CUSTOMER_REFUSED', 'NOT_APPLICABLE'));
