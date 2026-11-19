CREATE TABLE bulk_handovers (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  request_hash char(64) NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz(6) NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, actor_id, id)
);
CREATE INDEX bulk_handovers_tenant_created ON bulk_handovers (tenant_id, created_at);

ALTER TABLE equipment_qr_codes
  ADD COLUMN public_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN public_branch_id uuid,
  ADD COLUMN public_equipment_version integer;

CREATE TABLE public_qr_inquiries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  equipment_id uuid NOT NULL,
  branch_id uuid,
  token_hash char(64) NOT NULL UNIQUE,
  request_hash char(64) NOT NULL,
  contact_name varchar(100) NOT NULL,
  contact_phone varchar(30) NOT NULL,
  description varchar(4000) NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW', 'ACKNOWLEDGED', 'REJECTED')),
  resolution_note varchar(2000),
  resolved_by uuid,
  resolved_at timestamptz(6),
  created_at timestamptz(6) NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, equipment_id) REFERENCES equipments(tenant_id, id)
);
CREATE INDEX public_qr_inquiries_scope ON public_qr_inquiries (tenant_id, branch_id, status, created_at);
