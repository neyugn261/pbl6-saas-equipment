-- AlterTable
ALTER TABLE "work_order_parts" ADD COLUMN     "custodian_user_id" UUID,
ADD COLUMN     "handover_reference" VARCHAR(150);

-- AlterTable
ALTER TABLE "inventory_operations" ADD COLUMN     "part_request_line_id" UUID,
ADD COLUMN     "return_request_id" UUID,
ADD COLUMN     "business_context" JSONB;

-- CreateTable
CREATE TABLE "part_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "work_order_id" UUID NOT NULL,
    "work_order_no" VARCHAR(100) NOT NULL,
    "equipment_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "request_no" VARCHAR(40) NOT NULL,
    "requested_by" UUID NOT NULL,
    "reason" VARCHAR(2000) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'OPEN',
    "version" INTEGER NOT NULL DEFAULT 1,
    "closed_at" TIMESTAMPTZ(6),
    "closed_by" UUID,
    "closing_reason" VARCHAR(2000),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "part_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "part_request_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "part_request_id" UUID NOT NULL,
    "part_id" UUID NOT NULL,
    "quantity_requested" DECIMAL(12,2) NOT NULL,
    "part_snapshot" JSONB NOT NULL,

    CONSTRAINT "part_request_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "part_return_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "work_order_id" UUID NOT NULL,
    "work_order_part_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "custodian_user_id" UUID NOT NULL,
    "requested_by" UUID NOT NULL,
    "request_no" VARCHAR(40) NOT NULL,
    "quantity_requested" DECIMAL(12,2) NOT NULL,
    "reason" VARCHAR(2000) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'OPEN',
    "version" INTEGER NOT NULL DEFAULT 1,
    "closed_at" TIMESTAMPTZ(6),
    "closed_by" UUID,
    "closing_reason" VARCHAR(2000),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "part_return_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_request_commands" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "key" UUID NOT NULL,
    "fingerprint" VARCHAR(64) NOT NULL,
    "actor_id" UUID NOT NULL,
    "response" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_request_commands_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_part_requests_queue" ON "part_requests"("tenant_id", "branch_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "idx_part_requests_wo" ON "part_requests"("tenant_id", "work_order_id");

-- CreateIndex
CREATE UNIQUE INDEX "part_requests_tenant_id_id_key" ON "part_requests"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "part_requests_tenant_id_request_no_key" ON "part_requests"("tenant_id", "request_no");

-- CreateIndex
CREATE UNIQUE INDEX "part_request_lines_tenant_id_id_key" ON "part_request_lines"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "part_request_lines_part_request_id_part_id_key" ON "part_request_lines"("part_request_id", "part_id");

-- CreateIndex
CREATE INDEX "idx_part_return_requests_queue" ON "part_return_requests"("tenant_id", "branch_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "idx_part_return_requests_usage" ON "part_return_requests"("tenant_id", "work_order_part_id");

-- CreateIndex
CREATE UNIQUE INDEX "part_return_requests_tenant_id_id_key" ON "part_return_requests"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "part_return_requests_tenant_id_request_no_key" ON "part_return_requests"("tenant_id", "request_no");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_request_commands_tenant_id_key_key" ON "inventory_request_commands"("tenant_id", "key");

-- CreateIndex
CREATE INDEX "idx_inventory_operations_part_request" ON "inventory_operations"("tenant_id", "part_request_line_id");

-- CreateIndex
CREATE INDEX "idx_inventory_operations_return_request" ON "inventory_operations"("tenant_id", "return_request_id");

-- AddForeignKey
ALTER TABLE "inventory_operations" ADD CONSTRAINT "inventory_operations_tenant_id_part_request_line_id_fkey" FOREIGN KEY ("tenant_id", "part_request_line_id") REFERENCES "part_request_lines"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "inventory_operations" ADD CONSTRAINT "inventory_operations_tenant_id_return_request_id_fkey" FOREIGN KEY ("tenant_id", "return_request_id") REFERENCES "part_return_requests"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "part_request_lines" ADD CONSTRAINT "part_request_lines_tenant_id_part_request_id_fkey" FOREIGN KEY ("tenant_id", "part_request_id") REFERENCES "part_requests"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "part_request_lines" ADD CONSTRAINT "part_request_lines_tenant_id_part_id_fkey" FOREIGN KEY ("tenant_id", "part_id") REFERENCES "parts"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "part_return_requests" ADD CONSTRAINT "part_return_requests_tenant_id_work_order_part_id_fkey" FOREIGN KEY ("tenant_id", "work_order_part_id") REFERENCES "work_order_parts"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- ADR 0023: additional invariants intentionally maintained as raw SQL.
ALTER TABLE work_order_parts ADD CONSTRAINT work_order_parts_custody_pair CHECK (
  (custodian_user_id IS NULL AND handover_reference IS NULL) OR
  (custodian_user_id IS NOT NULL AND handover_reference IS NOT NULL AND length(btrim(handover_reference)) > 0)
);
ALTER TABLE part_requests
  ADD CONSTRAINT part_requests_status_check CHECK (status IN ('OPEN','CLOSED','CANCELLED','REJECTED')),
  ADD CONSTRAINT part_requests_version_check CHECK (version > 0),
  ADD CONSTRAINT part_requests_reason_check CHECK (length(btrim(reason)) > 0),
  ADD CONSTRAINT part_requests_closure_check CHECK (
    (status = 'OPEN' AND closed_at IS NULL AND closed_by IS NULL AND closing_reason IS NULL) OR
    (status <> 'OPEN' AND closed_at IS NOT NULL AND closed_by IS NOT NULL AND closing_reason IS NOT NULL AND length(btrim(closing_reason)) > 0)
  );
ALTER TABLE part_request_lines
  ADD CONSTRAINT part_request_lines_quantity_check CHECK (quantity_requested > 0),
  ADD CONSTRAINT part_request_lines_snapshot_check CHECK (jsonb_typeof(part_snapshot) = 'object');
ALTER TABLE part_return_requests
  ADD CONSTRAINT part_return_requests_status_check CHECK (status IN ('OPEN','CLOSED','CANCELLED')),
  ADD CONSTRAINT part_return_requests_quantity_check CHECK (quantity_requested > 0),
  ADD CONSTRAINT part_return_requests_version_check CHECK (version > 0),
  ADD CONSTRAINT part_return_requests_reason_check CHECK (length(btrim(reason)) > 0),
  ADD CONSTRAINT part_return_requests_closure_check CHECK (
    (status = 'OPEN' AND closed_at IS NULL AND closed_by IS NULL AND closing_reason IS NULL) OR
    (status <> 'OPEN' AND closed_at IS NOT NULL AND closed_by IS NOT NULL AND closing_reason IS NOT NULL AND length(btrim(closing_reason)) > 0)
  );
ALTER TABLE inventory_operations ADD CONSTRAINT inventory_operations_business_link_check CHECK (
  (part_request_line_id IS NULL OR operation = 'ISSUE') AND
  (return_request_id IS NULL OR operation = 'RETURN') AND
  (part_request_line_id IS NULL OR return_request_id IS NULL)
);
ALTER TABLE inventory_request_commands ADD CONSTRAINT inventory_request_commands_fingerprint_check
  CHECK (fingerprint ~ '^[0-9a-f]{64}$');
