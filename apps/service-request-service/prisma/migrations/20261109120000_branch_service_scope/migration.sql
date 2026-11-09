ALTER TABLE service_requests ADD COLUMN branch_id UUID NULL;
CREATE INDEX service_requests_tenant_id_branch_id_idx ON service_requests(tenant_id, branch_id);
