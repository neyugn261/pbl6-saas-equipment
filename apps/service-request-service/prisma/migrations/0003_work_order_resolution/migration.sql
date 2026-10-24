-- Store the customer-safe outcome snapshot received from WorkOrderCompleted.v2.
ALTER TABLE service_requests
    ADD COLUMN resolution_result VARCHAR(30)
        CHECK (resolution_result IN ('RESOLVED', 'PARTIALLY_RESOLVED', 'UNRESOLVED')),
    ADD COLUMN resolution_summary TEXT,
    ADD COLUMN resolved_work_order_no VARCHAR(50),
    ADD COLUMN resolution_completed_at TIMESTAMPTZ;
