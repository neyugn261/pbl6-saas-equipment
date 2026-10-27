-- Keep the active Work Order logical reference locally so delayed events from
-- a replaced Work Order cannot overwrite the current Service Request result.
ALTER TABLE service_requests
    ADD COLUMN active_work_order_id UUID;
