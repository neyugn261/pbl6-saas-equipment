-- ============================================================================
-- inventory_db 0002_work_order_part_returns
-- ADR 0006 (DEC-09): parts issued to a Work Order can be returned.
-- quantity_used stays the issued quantity; consumed = quantity_used -
-- quantity_returned. A return writes a RETURN stock transaction and increases
-- stocks.quantity and quantity_returned in the same transaction.
-- Additive only.
-- ============================================================================

ALTER TABLE work_order_parts
    ADD COLUMN quantity_returned NUMERIC(12,2) NOT NULL DEFAULT 0;

ALTER TABLE work_order_parts
    ADD CONSTRAINT chk_work_order_parts_returned
    CHECK (quantity_returned >= 0 AND quantity_returned <= quantity_used);
