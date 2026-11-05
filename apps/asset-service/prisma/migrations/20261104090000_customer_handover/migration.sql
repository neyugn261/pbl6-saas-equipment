ALTER TABLE equipments ADD COLUMN handover_required boolean NOT NULL DEFAULT false,
  ADD COLUMN current_handover_id uuid;
CREATE TABLE equipment_handovers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL,
  equipment_id uuid NOT NULL, customer_id uuid NOT NULL, handover_no varchar(50) NOT NULL,
  status varchar(40) NOT NULL DEFAULT 'DRAFT', version integer NOT NULL DEFAULT 1,
  created_by uuid NOT NULL, accepted_by uuid, snapshot jsonb NOT NULL,
  expires_at timestamptz(6) NOT NULL, submitted_at timestamptz(6),
  accepted_at timestamptz(6), activated_at timestamptz(6), rejected_reason varchar(2000),
  superseded_by_id uuid, created_at timestamptz(6) NOT NULL DEFAULT now(),
  updated_at timestamptz(6) NOT NULL DEFAULT now(),
  CONSTRAINT equipment_handovers_tenant_id_equipment_id_fkey FOREIGN KEY (tenant_id,equipment_id)
    REFERENCES equipments(tenant_id,id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT handover_status CHECK (status IN ('DRAFT','PENDING_CUSTOMER_CONFIRMATION','REJECTED','EXPIRED','CANCELLED','ACCEPTED','ACTIVATED')),
  CONSTRAINT handover_acceptance CHECK ((accepted_at IS NULL) = (accepted_by IS NULL)),
  CONSTRAINT handover_activation CHECK (status NOT IN ('ACCEPTED','ACTIVATED') OR accepted_at IS NOT NULL),
  CONSTRAINT handover_activated CHECK ((status = 'ACTIVATED') = (activated_at IS NOT NULL)),
  CONSTRAINT handover_rejection CHECK (status <> 'REJECTED' OR length(trim(rejected_reason)) > 0)
);
CREATE UNIQUE INDEX equipment_handovers_tenant_id_handover_no_key ON equipment_handovers(tenant_id,handover_no);
CREATE UNIQUE INDEX handover_one_open ON equipment_handovers(tenant_id,equipment_id)
  WHERE status IN ('DRAFT','PENDING_CUSTOMER_CONFIRMATION');
CREATE INDEX equipment_handovers_tenant_id_customer_id_created_at_idx ON equipment_handovers(tenant_id,customer_id,created_at);
CREATE INDEX equipment_handovers_status_expires_at_idx ON equipment_handovers(status,expires_at);
CREATE TABLE equipment_handover_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), handover_id uuid NOT NULL,
  tenant_id uuid NOT NULL, action varchar(40) NOT NULL, actor_id uuid,
  correlation_id varchar(128), occurred_at timestamptz(6) NOT NULL DEFAULT now(),
  CONSTRAINT equipment_handover_audit_handover_id_fkey FOREIGN KEY(handover_id)
    REFERENCES equipment_handovers(id) ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX equipment_handover_audit_handover_id_occurred_at_idx ON equipment_handover_audit(handover_id,occurred_at);

-- Defense in depth for every write path, including old status APIs and imports.
-- Existing ACTIVE rows are never rewritten/deactivated by this migration.
CREATE FUNCTION enforce_equipment_handover() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.handover_required AND NOT NEW.handover_required THEN
    RAISE EXCEPTION 'handover gate cannot be removed' USING ERRCODE='23514';
  END IF;
  IF NEW.handover_required AND (
    (TG_OP = 'INSERT' AND NEW.status = 'ACTIVE') OR
    (TG_OP = 'UPDATE' AND NEW.status = 'ACTIVE' AND
      (OLD.status <> 'ACTIVE' OR NEW.customer_id <> OLD.customer_id))
  ) AND NOT EXISTS (
    SELECT 1 FROM equipment_handovers h WHERE h.id = NEW.current_handover_id
    AND h.tenant_id = NEW.tenant_id AND h.equipment_id = NEW.id
    AND h.customer_id = NEW.customer_id AND h.accepted_at IS NOT NULL
    AND h.status IN ('ACCEPTED','ACTIVATED') AND h.superseded_by_id IS NULL
  ) THEN
    RAISE EXCEPTION 'current customer acceptance required' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER equipment_handover_gate BEFORE INSERT OR UPDATE ON equipments
FOR EACH ROW EXECUTE FUNCTION enforce_equipment_handover();
