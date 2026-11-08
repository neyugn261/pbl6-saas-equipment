-- Delivery method belongs to a registration, never to the Equipment Model.
ALTER TABLE equipment_registrations
 ADD COLUMN delivery_method varchar(20),
 ADD COLUMN handover_details jsonb,
 ADD COLUMN handover_id uuid,
 ADD COLUMN maintenance_provisioning varchar(20),
 ALTER COLUMN status TYPE varchar(40),
 DROP CONSTRAINT equipment_registrations_status_check,
 DROP CONSTRAINT equipment_registrations_phase_check;
CREATE UNIQUE INDEX equipment_handovers_tenant_id_id_key ON equipment_handovers(tenant_id,id);
ALTER TABLE equipment_registrations
 ADD CONSTRAINT equipment_registrations_tenant_id_handover_id_fkey FOREIGN KEY(tenant_id,handover_id) REFERENCES equipment_handovers(tenant_id,id) ON DELETE RESTRICT ON UPDATE NO ACTION,
 ADD CONSTRAINT equipment_registrations_delivery_method_check CHECK (delivery_method IN ('STORE','CUSTOMER_SITE')),
 ADD CONSTRAINT equipment_registrations_provisioning_check CHECK (maintenance_provisioning IS NULL OR (maintenance_provisioning IN ('PENDING','READY') AND delivery_method='CUSTOMER_SITE') IS TRUE),
 ADD CONSTRAINT equipment_registrations_status_check CHECK (status IN ('DRAFT','PENDING_MAINTENANCE','PENDING_CUSTOMER_CONFIRMATION','COMPLETED')),
 ADD CONSTRAINT equipment_registrations_phase_check CHECK (
 (delivery_method IS DISTINCT FROM 'CUSTOMER_SITE' AND (
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
)) OR
 (delivery_method='CUSTOMER_SITE' AND (CASE status
 WHEN 'DRAFT' THEN submitted_by IS NULL AND submitted_at IS NULL AND completed_by IS NULL AND completed_at IS NULL AND warranty_id IS NULL AND maintenance_plan_id IS NULL AND maintenance_input_hash IS NULL AND cardinality(maintenance_plan_ids)=0 AND maintenance_provisioning IS NULL
 WHEN 'PENDING_CUSTOMER_CONFIRMATION' THEN policy_preview->>'schema'='model-setup.v1' AND handover_id IS NOT NULL AND submitted_by IS NOT NULL AND submitted_at IS NOT NULL AND completed_by IS NULL AND completed_at IS NULL AND warranty_id IS NULL AND maintenance_plan_id IS NULL AND cardinality(maintenance_plan_ids)=0 AND maintenance_input_hash=policy_preview->>'hash' AND maintenance_provisioning IS NULL
 WHEN 'COMPLETED' THEN policy_preview->>'schema'='model-setup.v1' AND handover_id IS NOT NULL AND submitted_by IS NOT NULL AND submitted_at IS NOT NULL AND completed_by IS NOT NULL AND completed_at IS NOT NULL AND maintenance_input_hash=policy_preview->>'hash' AND
 ((policy_preview #>> '{warranty,body,mode}'='APPLY' AND warranty_id IS NOT NULL) OR (policy_preview #>> '{warranty,body,mode}'='NONE' AND warranty_id IS NULL)) AND
 ((policy_preview #>> '{maintenance,body,mode}'='NONE' AND maintenance_provisioning IS NULL AND maintenance_plan_id IS NULL AND cardinality(maintenance_plan_ids)=0) OR
 (policy_preview #>> '{maintenance,body,mode}'='APPLY' AND
 ((maintenance_provisioning='PENDING' AND maintenance_plan_id IS NULL AND cardinality(maintenance_plan_ids)=0) OR
 (maintenance_provisioning='READY' AND cardinality(maintenance_plan_ids)=jsonb_array_length(policy_preview #> '{maintenance,body,rules}') AND cardinality(maintenance_plan_ids)>0 AND
 ((cardinality(maintenance_plan_ids)=1 AND maintenance_plan_id=maintenance_plan_ids[1]) OR (cardinality(maintenance_plan_ids)>1 AND maintenance_plan_id IS NULL))))))
 ELSE false END) IS TRUE)
 );
