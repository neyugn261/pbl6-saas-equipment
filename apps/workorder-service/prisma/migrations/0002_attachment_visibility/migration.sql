-- ============================================================================
-- workorder_db 0002_attachment_visibility
-- ADR 0006 (DEC-09): work order and service report attachments are INTERNAL
-- unless marked CUSTOMER, the same values as
-- service_request_db.request_comments.visibility. Existing rows become
-- INTERNAL (safe default). Additive only.
-- ============================================================================

ALTER TABLE work_order_attachments
    ADD COLUMN visibility VARCHAR(20) NOT NULL DEFAULT 'INTERNAL'
    CHECK (visibility IN ('INTERNAL', 'CUSTOMER'));

ALTER TABLE report_attachments
    ADD COLUMN visibility VARCHAR(20) NOT NULL DEFAULT 'INTERNAL'
    CHECK (visibility IN ('INTERNAL', 'CUSTOMER'));
