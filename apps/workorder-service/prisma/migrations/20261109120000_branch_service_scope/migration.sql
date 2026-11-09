ALTER TABLE work_orders ADD COLUMN branch_id UUID NULL;
CREATE INDEX work_orders_tenant_id_branch_id_idx ON work_orders(tenant_id, branch_id);
CREATE TABLE site_branch_snapshots (tenant_id UUID NOT NULL, site_id UUID NOT NULL, branch_id UUID NULL, revision INTEGER NOT NULL CHECK (revision >= 0), PRIMARY KEY (tenant_id, site_id));
