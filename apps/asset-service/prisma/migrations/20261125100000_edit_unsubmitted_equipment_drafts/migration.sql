ALTER TABLE equipment_registrations
  ADD COLUMN created_with_equipment boolean NOT NULL DEFAULT false;

-- NEW registrations insert both rows in the same transaction. Both creation
-- timestamps use the database transaction timestamp.
UPDATE equipment_registrations r
SET created_with_equipment = true
FROM equipments e
WHERE r.tenant_id = e.tenant_id AND r.equipment_id = e.id
  AND r.created_at = e.created_at;

CREATE OR REPLACE FUNCTION enforce_equipment_handover() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.handover_required AND NOT NEW.handover_required AND NOT (
    OLD.current_handover_id IS NULL AND NEW.current_handover_id IS NULL
    AND OLD.status = 'OUT_OF_SERVICE' AND NEW.status = 'OUT_OF_SERVICE'
    AND EXISTS (
      SELECT 1 FROM equipment_registrations r
      WHERE r.tenant_id = NEW.tenant_id AND r.equipment_id = NEW.id
        AND r.status = 'DRAFT' AND r.handover_id IS NULL
        AND r.delivery_method = 'STORE' AND r.created_with_equipment
    )
    AND NOT EXISTS (
      SELECT 1 FROM equipment_handovers h
      WHERE h.tenant_id = NEW.tenant_id AND h.equipment_id = NEW.id
    )
  ) THEN
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
