-- ============================================================================
-- workorder_db 0003_created_by_nullable
-- ADR 0008 (D5): a Work Order created by the system from an event (Maintenance
-- Task) has no creating user. NULL marks it; its source is traced through
-- maintenance_task_id, the status history (changed_by NULL) and the event
-- correlation id. A Work Order created through the API still records the
-- caller. Relaxes a constraint only; existing rows are unchanged.
-- ============================================================================

ALTER TABLE work_orders ALTER COLUMN created_by DROP NOT NULL;
