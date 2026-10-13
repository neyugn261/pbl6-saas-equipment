-- ============================================================================
-- workorder_db 0001_init
-- Source: docs/erd/pbl6-schema-v3.1.sql lines 718-941 (section "workorder_db"),
-- copied verbatim. See docs/decisions/0001-database-v3.1.md.
--
-- PostgreSQL-specific objects that schema.prisma cannot represent (CHECK
-- constraints, partial/expression indexes, generated columns, triggers) are
-- kept here and MUST NOT be dropped by later migrations.
-- ============================================================================

CREATE TABLE document_sequences (
    tenant_id UUID NOT NULL,
    sequence_key VARCHAR(50) NOT NULL,
    last_value BIGINT NOT NULL CHECK (last_value > 0),
    PRIMARY KEY (tenant_id, sequence_key)
);

-- user_id must be a TENANT_STAFF account holding the TECHNICIAN role (validated via Identity API).
CREATE TABLE technicians (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    user_id UUID NOT NULL, -- Logical reference to identity_db.users.id
    branch_id UUID NOT NULL, -- Logical reference to organization_db.branches.id
    employee_code VARCHAR(50) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'AVAILABLE'
        CHECK (status IN ('AVAILABLE', 'BUSY', 'OFF_DUTY', 'INACTIVE')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, employee_code),
    UNIQUE (tenant_id, user_id),
    UNIQUE (tenant_id, id)
);
CREATE INDEX idx_technicians_tenant_branch_status
    ON technicians (tenant_id, branch_id, status);

CREATE TABLE skills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    UNIQUE (tenant_id, code),
    UNIQUE (tenant_id, id)
);

CREATE TABLE technician_skills (
    tenant_id UUID NOT NULL,
    technician_id UUID NOT NULL,
    skill_id UUID NOT NULL,
    level SMALLINT CHECK (level BETWEEN 1 AND 5),
    PRIMARY KEY (technician_id, skill_id),
    FOREIGN KEY (tenant_id, technician_id)
        REFERENCES technicians (tenant_id, id) ON DELETE CASCADE,
    FOREIGN KEY (tenant_id, skill_id)
        REFERENCES skills (tenant_id, id) ON DELETE CASCADE
);
CREATE INDEX idx_technician_skills_skill ON technician_skills (tenant_id, skill_id);

CREATE TABLE work_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    work_order_no VARCHAR(50) NOT NULL,
    service_request_id UUID NULL, -- Logical reference to service_request_db.service_requests.id
    maintenance_task_id UUID NULL, -- Logical reference to maintenance_db.maintenance_tasks.id
    equipment_id UUID NOT NULL, -- Logical reference to asset_db.equipments.id
    customer_id UUID NOT NULL, -- Logical reference to organization_db.customers.id
    customer_site_id UUID NULL, -- Logical reference to organization_db.customer_sites.id
    location_id UUID NULL, -- Logical reference to organization_db.locations.id
    type VARCHAR(30) NOT NULL CHECK (type IN ('REPAIR', 'WARRANTY', 'MAINTENANCE', 'INSPECTION')),
    title VARCHAR(200) NOT NULL,
    description TEXT,
    priority VARCHAR(20) NOT NULL DEFAULT 'NORMAL'
        CHECK (priority IN ('LOW', 'NORMAL', 'HIGH', 'URGENT')),
    scheduled_start TIMESTAMPTZ,
    scheduled_end TIMESTAMPTZ,
    status VARCHAR(30) NOT NULL DEFAULT 'CREATED'
        CHECK (status IN ('CREATED', 'ASSIGNED', 'ACCEPTED', 'TRAVELLING', 'IN_PROGRESS',
                         'ON_HOLD', 'COMPLETED', 'CANCELLED')),
    created_by UUID NOT NULL, -- Logical reference to identity_db.users.id
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    UNIQUE (tenant_id, work_order_no),
    UNIQUE (tenant_id, id),
    CHECK ((service_request_id IS NOT NULL) <> (maintenance_task_id IS NOT NULL)),
    CHECK (scheduled_end IS NULL OR scheduled_start IS NULL OR scheduled_end > scheduled_start)
);
CREATE INDEX idx_work_orders_service_request
    ON work_orders (service_request_id) WHERE service_request_id IS NOT NULL;
CREATE UNIQUE INDEX uq_work_orders_maintenance_task
    ON work_orders (maintenance_task_id) WHERE maintenance_task_id IS NOT NULL;
-- MVP rule: a Service Request can have only one non-terminal Work Order at a time.
CREATE UNIQUE INDEX uq_active_workorder_per_request
    ON work_orders (service_request_id)
    WHERE service_request_id IS NOT NULL AND status NOT IN ('COMPLETED', 'CANCELLED');
CREATE INDEX idx_work_orders_tenant_status ON work_orders (tenant_id, status);
CREATE INDEX idx_work_orders_tenant_schedule ON work_orders (tenant_id, scheduled_start);
CREATE INDEX idx_work_orders_equipment ON work_orders (tenant_id, equipment_id);

CREATE TABLE work_order_status_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    work_order_id UUID NOT NULL,
    old_status VARCHAR(30),
    new_status VARCHAR(30) NOT NULL,
    changed_by UUID, -- Logical reference to identity_db.users.id; NULL when changed by an event
    reason TEXT,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY (tenant_id, work_order_id)
        REFERENCES work_orders (tenant_id, id) ON DELETE RESTRICT
);
CREATE INDEX idx_work_order_status_history_order_time
    ON work_order_status_history (work_order_id, changed_at);

CREATE TABLE work_order_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    work_order_id UUID NOT NULL,
    technician_id UUID NOT NULL,
    assigned_by UUID NOT NULL, -- Logical reference to identity_db.users.id
    status VARCHAR(30) NOT NULL DEFAULT 'ASSIGNED'
        CHECK (status IN ('ASSIGNED', 'ACCEPTED', 'REJECTED', 'REMOVED', 'COMPLETED')),
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    accepted_at TIMESTAMPTZ,
    rejected_at TIMESTAMPTZ,
    unassigned_at TIMESTAMPTZ,
    rejection_reason TEXT,
    FOREIGN KEY (tenant_id, work_order_id)
        REFERENCES work_orders (tenant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, technician_id)
        REFERENCES technicians (tenant_id, id) ON DELETE RESTRICT
);
CREATE INDEX idx_assignments_work_order ON work_order_assignments (work_order_id, assigned_at DESC);
CREATE INDEX idx_assignments_technician
    ON work_order_assignments (technician_id, status, assigned_at DESC);
-- MVP rule: exactly one primary/active technician assignment per Work Order at a time.
CREATE UNIQUE INDEX uq_active_assignment_per_workorder
    ON work_order_assignments (work_order_id)
    WHERE status IN ('ASSIGNED', 'ACCEPTED');

-- Activity log for any actor (Dispatcher, Service Manager, Technician).
-- technician_id is set only when the actor acts as the assigned technician.
CREATE TABLE work_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    work_order_id UUID NOT NULL,
    actor_user_id UUID NOT NULL, -- Logical reference to identity_db.users.id
    technician_id UUID NULL,
    event_type VARCHAR(30) NOT NULL,
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY (tenant_id, work_order_id)
        REFERENCES work_orders (tenant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, technician_id)
        REFERENCES technicians (tenant_id, id) ON DELETE RESTRICT
);
CREATE INDEX idx_work_logs_order_time ON work_logs (work_order_id, created_at);
CREATE INDEX idx_work_logs_actor_time ON work_logs (tenant_id, actor_user_id, created_at DESC);

CREATE TABLE work_order_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    work_order_id UUID NOT NULL,
    uploaded_by UUID NOT NULL, -- Logical reference to identity_db.users.id
    storage_key VARCHAR(500) NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY (tenant_id, work_order_id)
        REFERENCES work_orders (tenant_id, id) ON DELETE RESTRICT
);
CREATE INDEX idx_work_order_attachments_order ON work_order_attachments (work_order_id);

CREATE TABLE service_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    work_order_id UUID NOT NULL UNIQUE,
    technician_id UUID NOT NULL,
    problem_description TEXT NOT NULL,
    root_cause TEXT,
    solution TEXT NOT NULL,
    result VARCHAR(30) NOT NULL CHECK (result IN ('RESOLVED', 'PARTIALLY_RESOLVED', 'UNRESOLVED')),
    customer_note TEXT,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, id),
    FOREIGN KEY (tenant_id, work_order_id)
        REFERENCES work_orders (tenant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, technician_id)
        REFERENCES technicians (tenant_id, id) ON DELETE RESTRICT
);
CREATE INDEX idx_service_reports_technician_time
    ON service_reports (tenant_id, technician_id, submitted_at DESC);

CREATE TABLE report_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    service_report_id UUID NOT NULL,
    uploaded_by UUID NOT NULL, -- Logical reference to identity_db.users.id
    storage_key VARCHAR(500) NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY (tenant_id, service_report_id)
        REFERENCES service_reports (tenant_id, id) ON DELETE RESTRICT
);
CREATE INDEX idx_report_attachments_report ON report_attachments (service_report_id);

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
