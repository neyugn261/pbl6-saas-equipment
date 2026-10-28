-- Retain business idempotency and the replacement chain after a WO is cancelled.
-- Existing rows remain NULL; do not infer historical requests or predecessor IDs.
ALTER TABLE work_orders
    ADD COLUMN maintenance_replacement_request_id UUID,
    ADD COLUMN replaces_work_order_id UUID,
    ADD CONSTRAINT chk_work_orders_maintenance_replacement CHECK (
        (maintenance_replacement_request_id IS NULL AND replaces_work_order_id IS NULL)
        OR (
            maintenance_replacement_request_id IS NOT NULL
            AND replaces_work_order_id IS NOT NULL
            AND maintenance_task_id IS NOT NULL
            AND service_request_id IS NULL
            AND type = 'MAINTENANCE'
            AND replaces_work_order_id <> id
        )
    );

CREATE UNIQUE INDEX uq_work_orders_maintenance_replacement_request
    ON work_orders (maintenance_replacement_request_id);
CREATE UNIQUE INDEX uq_work_orders_replaces_work_order
    ON work_orders (replaces_work_order_id);
