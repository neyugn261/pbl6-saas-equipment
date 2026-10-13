-- ============================================================================
-- maintenance_db 0001_init
-- Source: docs/erd/pbl6-schema-v3.1.sql lines 949-1013 (section "maintenance_db"),
-- copied verbatim. See docs/decisions/0001-database-v3.1.md.
--
-- PostgreSQL-specific objects that schema.prisma cannot represent (CHECK
-- constraints, partial/expression indexes, generated columns, triggers) are
-- kept here and MUST NOT be dropped by later migrations.
-- ============================================================================

CREATE TABLE maintenance_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    equipment_id UUID NOT NULL, -- Logical reference to asset_db.equipments.id
    name VARCHAR(200) NOT NULL,
    description TEXT,
    frequency_unit VARCHAR(20) NOT NULL CHECK (frequency_unit IN ('DAY', 'WEEK', 'MONTH', 'YEAR')),
    frequency_value INTEGER NOT NULL CHECK (frequency_value > 0),
    last_completed_at TIMESTAMPTZ,
    next_due_date DATE NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'PAUSED', 'INACTIVE')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, id)
);
CREATE INDEX idx_maintenance_plans_due ON maintenance_plans (tenant_id, next_due_date, status);
CREATE INDEX idx_maintenance_plans_equipment ON maintenance_plans (tenant_id, equipment_id);

CREATE TABLE maintenance_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    maintenance_plan_id UUID NOT NULL,
    scheduled_date DATE NOT NULL,
    work_order_id UUID NULL, -- Logical reference to workorder_db.work_orders.id (set from WorkOrder event)
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'WORK_ORDER_CREATED', 'COMPLETED', 'FAILED', 'CANCELLED')),
    attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    UNIQUE (maintenance_plan_id, scheduled_date),
    FOREIGN KEY (tenant_id, maintenance_plan_id)
        REFERENCES maintenance_plans (tenant_id, id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX uq_maintenance_task_work_order
    ON maintenance_tasks (work_order_id) WHERE work_order_id IS NOT NULL;
CREATE INDEX idx_maintenance_tasks_status_date
    ON maintenance_tasks (tenant_id, status, scheduled_date);

CREATE TABLE outbox_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NULL,
    aggregate_type VARCHAR(50) NOT NULL,
    aggregate_id UUID NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    event_version SMALLINT NOT NULL DEFAULT 1 CHECK (event_version > 0),
    payload JSONB NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PUBLISHED', 'FAILED')),
    attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    last_error TEXT,
    available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    published_at TIMESTAMPTZ,
    CHECK ((status = 'PUBLISHED') = (published_at IS NOT NULL))
);
CREATE INDEX idx_outbox_events_pending ON outbox_events (available_at) WHERE status = 'PENDING';

CREATE TABLE processed_events (
    event_id UUID NOT NULL,
    consumer VARCHAR(100) NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (event_id, consumer)
);
