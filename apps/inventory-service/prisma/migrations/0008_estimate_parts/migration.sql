CREATE TABLE estimate_parts_snapshots (
  tenant_id uuid NOT NULL,
  service_request_id uuid NOT NULL,
  source_version integer NOT NULL CHECK (source_version > 0),
  request_hash char(64) NOT NULL,
  payload jsonb NOT NULL,
  updated_at timestamptz(6) NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, service_request_id)
);
