-- CreateTable
CREATE TABLE "equipment_registrations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "equipment_id" UUID NOT NULL,
    "status" VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "create_actor_id" UUID NOT NULL,
    "create_key" UUID NOT NULL,
    "create_request_hash" CHAR(64) NOT NULL,
    "warranty_decision" VARCHAR(20) NOT NULL DEFAULT 'UNCONFIRMED',
    "warranty_payload" JSONB,
    "warranty_reason" TEXT,
    "warranty_id" UUID,
    "maintenance_decision" VARCHAR(20) NOT NULL DEFAULT 'UNCONFIRMED',
    "maintenance_payload" JSONB,
    "maintenance_reason" TEXT,
    "maintenance_input_hash" CHAR(64),
    "maintenance_plan_id" UUID,
    "submitted_by" UUID,
    "submitted_at" TIMESTAMPTZ(6),
    "completed_by" UUID,
    "completed_at" TIMESTAMPTZ(6),
    "updated_by" UUID NOT NULL,
    "last_attempt_at" TIMESTAMPTZ(6),
    "last_error_code" VARCHAR(80),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "equipment_registrations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "equipment_registrations_tenant_id_status_updated_at_idx" ON "equipment_registrations"("tenant_id", "status", "updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "equipment_registrations_tenant_id_equipment_id_key" ON "equipment_registrations"("tenant_id", "equipment_id");

-- CreateIndex
CREATE UNIQUE INDEX "equipment_registrations_tenant_id_create_actor_id_create_ke_key" ON "equipment_registrations"("tenant_id", "create_actor_id", "create_key");

-- CreateIndex
CREATE UNIQUE INDEX "warranties_tenant_id_equipment_id_id_key" ON "warranties"("tenant_id", "equipment_id", "id");

-- AddForeignKey
ALTER TABLE "equipment_registrations" ADD CONSTRAINT "equipment_registrations_tenant_id_equipment_id_fkey" FOREIGN KEY ("tenant_id", "equipment_id") REFERENCES "equipments"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "equipment_registrations" ADD CONSTRAINT "equipment_registrations_tenant_id_equipment_id_warranty_id_fkey" FOREIGN KEY ("tenant_id", "equipment_id", "warranty_id") REFERENCES "warranties"("tenant_id", "equipment_id", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;


-- Explicit policy decisions and phase invariants (ADR 0012).
ALTER TABLE equipment_registrations
 ADD CONSTRAINT equipment_registrations_status_check CHECK (status IN ('DRAFT','PENDING_MAINTENANCE','COMPLETED')),
 ADD CONSTRAINT equipment_registrations_version_check CHECK (version > 0),
 ADD CONSTRAINT equipment_registrations_hash_check CHECK (create_request_hash ~ '^[0-9a-f]{64}$'),
 ADD CONSTRAINT equipment_registrations_warranty_choice_check CHECK ((CASE warranty_decision
   WHEN 'UNCONFIRMED' THEN warranty_payload IS NULL AND warranty_reason IS NULL
   WHEN 'NONE' THEN warranty_payload IS NULL AND warranty_reason IS NOT NULL AND length(btrim(warranty_reason)) BETWEEN 1 AND 2000
   WHEN 'CREATE' THEN jsonb_typeof(warranty_payload) = 'object' AND warranty_payload->>'mode' = 'CREATE' AND warranty_reason IS NULL
   WHEN 'KEEP' THEN jsonb_typeof(warranty_payload) = 'object' AND warranty_payload->>'mode' = 'KEEP' AND warranty_reason IS NULL
   ELSE false END) IS TRUE),
 ADD CONSTRAINT equipment_registrations_maintenance_choice_check CHECK ((CASE maintenance_decision
   WHEN 'UNCONFIRMED' THEN maintenance_payload IS NULL AND maintenance_reason IS NULL
   WHEN 'NONE' THEN maintenance_payload IS NULL AND maintenance_reason IS NOT NULL AND length(btrim(maintenance_reason)) BETWEEN 1 AND 2000
   WHEN 'CREATE' THEN jsonb_typeof(maintenance_payload) = 'object' AND maintenance_payload->>'mode' = 'CREATE' AND maintenance_reason IS NULL
   WHEN 'KEEP' THEN jsonb_typeof(maintenance_payload) = 'object' AND maintenance_payload->>'mode' = 'KEEP' AND maintenance_reason IS NULL
   ELSE false END) IS TRUE),
 ADD CONSTRAINT equipment_registrations_phase_check CHECK ((CASE status
   WHEN 'DRAFT' THEN submitted_by IS NULL AND submitted_at IS NULL AND completed_by IS NULL AND completed_at IS NULL AND warranty_id IS NULL AND maintenance_plan_id IS NULL AND maintenance_input_hash IS NULL
   WHEN 'PENDING_MAINTENANCE' THEN submitted_by IS NOT NULL AND submitted_at IS NOT NULL AND completed_by IS NULL AND completed_at IS NULL AND maintenance_plan_id IS NULL AND maintenance_decision IN ('CREATE','KEEP') AND maintenance_input_hash IS NOT NULL AND maintenance_input_hash ~ '^[0-9a-f]{64}$' AND ((warranty_decision IN ('CREATE','KEEP') AND warranty_id IS NOT NULL) OR (warranty_decision = 'NONE' AND warranty_id IS NULL))
   WHEN 'COMPLETED' THEN submitted_by IS NOT NULL AND submitted_at IS NOT NULL AND completed_by IS NOT NULL AND completed_at IS NOT NULL AND ((warranty_decision IN ('CREATE','KEEP') AND warranty_id IS NOT NULL) OR (warranty_decision = 'NONE' AND warranty_id IS NULL)) AND ((maintenance_decision IN ('CREATE','KEEP') AND maintenance_plan_id IS NOT NULL AND maintenance_input_hash IS NOT NULL AND maintenance_input_hash ~ '^[0-9a-f]{64}$') OR (maintenance_decision = 'NONE' AND maintenance_plan_id IS NULL AND maintenance_input_hash IS NULL))
   ELSE false END) IS TRUE);
