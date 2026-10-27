-- ADR 0010: additive dossier fields. Legacy condition/context remains unknown.
ALTER TABLE equipments
  ADD COLUMN display_name VARCHAR(200), ADD COLUMN description TEXT, ADD COLUMN commissioned_date DATE,
  ADD COLUMN technical_specifications JSONB,
  ADD COLUMN operational_status VARCHAR(30) NOT NULL DEFAULT 'UNKNOWN'
    CHECK (operational_status IN ('UNKNOWN','OPERATIONAL','DEGRADED','NOT_OPERATIONAL')),
  ADD COLUMN operational_status_updated_at TIMESTAMPTZ, ADD COLUMN operational_status_updated_by UUID;
ALTER TABLE equipment_history
  ADD COLUMN actor_type VARCHAR(20) NOT NULL DEFAULT 'UNKNOWN' CHECK (actor_type IN ('UNKNOWN','USER','SYSTEM')),
  ADD COLUMN actor_roles TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[], ADD COLUMN changes JSONB, ADD COLUMN context JSONB,
  ADD COLUMN reason_internal TEXT, ADD COLUMN customer_note TEXT;
CREATE INDEX idx_equipment_history_tenant_time ON equipment_history (tenant_id, occurred_at DESC, id);
CREATE TABLE equipment_model_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL, model_id UUID NOT NULL,
  event_type VARCHAR(50) NOT NULL, actor_id UUID, actor_roles TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  changes JSONB NOT NULL, occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, model_id) REFERENCES equipment_models (tenant_id, id) ON DELETE RESTRICT
);
CREATE INDEX equipment_model_history_tenant_id_model_id_occurred_at_idx ON equipment_model_history (tenant_id, model_id, occurred_at);
