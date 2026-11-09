ALTER TABLE notifications ADD COLUMN branch_id UUID NULL;
CREATE INDEX notifications_tenant_id_branch_id_idx ON notifications(tenant_id, branch_id);
