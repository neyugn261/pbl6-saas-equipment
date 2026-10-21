-- ============================================================================
-- asset_db 0002_serial_unique_per_model
-- ADR 0006 (DEC-13): a serial number is unique per (tenant, model), not per
-- tenant. Two models of one tenant may share a serial number; one model never
-- has it twice. The new key is stricter than nothing and looser than the old
-- one, so existing rows always satisfy it.
-- ============================================================================

ALTER TABLE equipments
    DROP CONSTRAINT equipments_tenant_id_serial_number_key;

ALTER TABLE equipments
    ADD CONSTRAINT equipments_tenant_id_model_id_serial_number_key
    UNIQUE (tenant_id, model_id, serial_number);
