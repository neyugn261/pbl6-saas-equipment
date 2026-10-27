-- Backfills use Maintenance-owned rows only; no cross-service DB references.
ALTER TABLE maintenance_plans ADD COLUMN anchor_date DATE;
UPDATE maintenance_plans SET anchor_date = next_due_date;
ALTER TABLE maintenance_plans ALTER COLUMN anchor_date SET NOT NULL;
ALTER TABLE maintenance_plans ADD COLUMN snapshot_version INTEGER NOT NULL DEFAULT 0 CHECK (snapshot_version >= 0);
ALTER TABLE maintenance_tasks ADD COLUMN customer_id UUID;
ALTER TABLE maintenance_tasks ADD COLUMN customer_site_id UUID;
UPDATE maintenance_tasks t SET customer_id = p.customer_id, customer_site_id = p.customer_site_id
FROM maintenance_plans p WHERE t.tenant_id = p.tenant_id AND t.maintenance_plan_id = p.id;
ALTER TABLE maintenance_tasks ALTER COLUMN customer_id SET NOT NULL;
ALTER TABLE maintenance_tasks ADD CONSTRAINT maintenance_tasks_tenant_id_id_key UNIQUE (tenant_id, id);

CREATE TABLE equipment_snapshots (
    tenant_id UUID NOT NULL,
    equipment_id UUID NOT NULL,
    customer_id UUID NOT NULL,
    customer_site_id UUID,
    snapshot_version INTEGER NOT NULL CHECK (snapshot_version >= 0),
    changed_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (tenant_id, equipment_id)
);
CREATE TABLE maintenance_work_order_links (
    work_order_id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    task_id UUID NOT NULL,
    state VARCHAR(20) NOT NULL CHECK (state IN ('CREATED', 'COMPLETED', 'CANCELLED')),
    occurred_at TIMESTAMPTZ NOT NULL,
    FOREIGN KEY (tenant_id, task_id) REFERENCES maintenance_tasks (tenant_id, id) ON DELETE RESTRICT
);
CREATE INDEX maintenance_work_order_links_tenant_id_task_id_idx ON maintenance_work_order_links (tenant_id, task_id);
CREATE TABLE maintenance_replacement_requests (
    request_id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    task_id UUID NOT NULL,
    previous_work_order_id UUID NOT NULL,
    replacement_work_order_id UUID NOT NULL UNIQUE,
    requested_by UUID NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'LINKED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY (tenant_id, task_id) REFERENCES maintenance_tasks (tenant_id, id) ON DELETE RESTRICT
);
CREATE INDEX maintenance_replacement_requests_tenant_id_task_id_idx ON maintenance_replacement_requests (tenant_id, task_id);
CREATE UNIQUE INDEX uq_maintenance_pending_replacement ON maintenance_replacement_requests (task_id) WHERE status = 'PENDING';
