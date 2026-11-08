-- A nullable delivery method must still satisfy the original phase invariant.
-- CHECK expressions treat NULL as passing, so guard the legacy branch explicitly.
ALTER TABLE equipment_registrations ADD CONSTRAINT equipment_registrations_legacy_phase_check
 CHECK (delivery_method IS NOT NULL OR (
 (policy_preview IS NULL AND ((CASE status
   WHEN 'DRAFT' THEN submitted_by IS NULL AND submitted_at IS NULL AND completed_by IS NULL AND completed_at IS NULL AND warranty_id IS NULL AND maintenance_plan_id IS NULL AND maintenance_input_hash IS NULL
   WHEN 'PENDING_MAINTENANCE' THEN submitted_by IS NOT NULL AND submitted_at IS NOT NULL AND completed_by IS NULL AND completed_at IS NULL AND maintenance_plan_id IS NULL AND maintenance_decision IN ('CREATE','KEEP') AND maintenance_input_hash IS NOT NULL AND maintenance_input_hash ~ '^[0-9a-f]{64}$' AND ((warranty_decision IN ('CREATE','KEEP') AND warranty_id IS NOT NULL) OR (warranty_decision = 'NONE' AND warranty_id IS NULL))
   WHEN 'COMPLETED' THEN submitted_by IS NOT NULL AND submitted_at IS NOT NULL AND completed_by IS NOT NULL AND completed_at IS NOT NULL AND ((warranty_decision IN ('CREATE','KEEP') AND warranty_id IS NOT NULL) OR (warranty_decision = 'NONE' AND warranty_id IS NULL)) AND ((maintenance_decision IN ('CREATE','KEEP') AND maintenance_plan_id IS NOT NULL AND maintenance_input_hash IS NOT NULL AND maintenance_input_hash ~ '^[0-9a-f]{64}$') OR (maintenance_decision = 'NONE' AND maintenance_plan_id IS NULL AND maintenance_input_hash IS NULL))
   ELSE false END) IS TRUE)) OR (policy_preview IS NOT NULL AND (jsonb_typeof(policy_preview)='object' AND policy_preview->>'schema'='model-setup.v1' AND (CASE status
 WHEN 'DRAFT' THEN submitted_by IS NULL AND submitted_at IS NULL AND completed_by IS NULL AND completed_at IS NULL AND warranty_id IS NULL AND maintenance_plan_id IS NULL AND maintenance_input_hash IS NULL AND cardinality(maintenance_plan_ids)=0
 WHEN 'PENDING_MAINTENANCE' THEN submitted_by IS NOT NULL AND submitted_at IS NOT NULL AND maintenance_input_hash ~ '^[0-9a-f]{64}$' AND ((policy_preview #>> '{warranty,body,mode}' = 'APPLY' AND warranty_id IS NOT NULL) OR (policy_preview #>> '{warranty,body,mode}' = 'NONE' AND warranty_id IS NULL)) AND completed_by IS NULL AND completed_at IS NULL AND maintenance_plan_id IS NULL AND cardinality(maintenance_plan_ids)=0 AND policy_preview #>> '{maintenance,body,mode}'='APPLY'
 WHEN 'COMPLETED' THEN submitted_by IS NOT NULL AND submitted_at IS NOT NULL AND maintenance_input_hash ~ '^[0-9a-f]{64}$' AND ((policy_preview #>> '{warranty,body,mode}' = 'APPLY' AND warranty_id IS NOT NULL) OR (policy_preview #>> '{warranty,body,mode}' = 'NONE' AND warranty_id IS NULL)) AND completed_by IS NOT NULL AND completed_at IS NOT NULL AND
 ((policy_preview #>> '{maintenance,body,mode}'='NONE' AND maintenance_plan_id IS NULL AND cardinality(maintenance_plan_ids)=0)
 OR (policy_preview #>> '{maintenance,body,mode}'='APPLY' AND cardinality(maintenance_plan_ids)>0 AND cardinality(maintenance_plan_ids)=jsonb_array_length(policy_preview #> '{maintenance,body,rules}') AND
 ((cardinality(maintenance_plan_ids)=1 AND maintenance_plan_id=maintenance_plan_ids[1]) OR (cardinality(maintenance_plan_ids)>1 AND maintenance_plan_id IS NULL))))
 ELSE false END) IS TRUE))
));
