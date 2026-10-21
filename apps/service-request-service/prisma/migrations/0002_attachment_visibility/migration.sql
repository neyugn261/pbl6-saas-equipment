-- ============================================================================
-- service_request_db 0002_attachment_visibility
-- ADR 0006 (DEC-09): attachments are INTERNAL unless marked CUSTOMER, the same
-- values as request_comments.visibility. Existing rows become INTERNAL (safe
-- default). Additive only.
-- ============================================================================

ALTER TABLE request_attachments
    ADD COLUMN visibility VARCHAR(20) NOT NULL DEFAULT 'INTERNAL'
    CHECK (visibility IN ('INTERNAL', 'CUSTOMER'));
