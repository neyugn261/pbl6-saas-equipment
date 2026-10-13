-- ============================================================================
-- service_request_db 0001_init
-- Source: docs/erd/pbl6-schema-v3.1.sql lines 540-710 (section "service_request_db"),
-- copied verbatim. See docs/decisions/0001-database-v3.1.md.
--
-- PostgreSQL-specific objects that schema.prisma cannot represent (CHECK
-- constraints, partial/expression indexes, generated columns, triggers) are
-- kept here and MUST NOT be dropped by later migrations.
-- ============================================================================

-- Concurrency-safe per-tenant display numbers, e.g. sequence_key 'SR-2026':
--   INSERT INTO document_sequences (tenant_id, sequence_key, last_value)
--   VALUES ($1, $2, 1)
--   ON CONFLICT (tenant_id, sequence_key)
--   DO UPDATE SET last_value = document_sequences.last_value + 1
--   RETURNING last_value;
CREATE TABLE document_sequences (
    tenant_id UUID NOT NULL,
    sequence_key VARCHAR(50) NOT NULL,
    last_value BIGINT NOT NULL CHECK (last_value > 0),
    PRIMARY KEY (tenant_id, sequence_key)
);

CREATE TABLE service_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    request_no VARCHAR(50) NOT NULL,
    customer_id UUID NOT NULL, -- Logical reference to organization_db.customers.id
    equipment_id UUID NOT NULL, -- Logical reference to asset_db.equipments.id
    requester_id UUID NOT NULL, -- Logical reference to identity_db.users.id
    type VARCHAR(30) NOT NULL CHECK (type IN ('WARRANTY', 'REPAIR', 'MAINTENANCE', 'INSPECTION')),
    priority VARCHAR(20) NOT NULL DEFAULT 'NORMAL'
        CHECK (priority IN ('LOW', 'NORMAL', 'HIGH', 'URGENT')),
    title VARCHAR(200) NOT NULL,
    description TEXT NOT NULL,
    status VARCHAR(40) NOT NULL DEFAULT 'NEW'
        CHECK (status IN ('NEW', 'REVIEWING', 'AWAITING_INFO', 'AWAITING_CUSTOMER_APPROVAL',
                         'ACCEPTED', 'PROCESSING', 'RESOLVED', 'CLOSED', 'REJECTED',
                         'CANCELLED', 'COST_REJECTED')),
    -- Warranty decision snapshot frozen at review time. Warranty expiry is
    -- derived from dates, so the result used for the decision is stored here.
    warranty_check_result VARCHAR(30)
        CHECK (warranty_check_result IN ('IN_WARRANTY', 'OUT_OF_WARRANTY', 'NO_WARRANTY')),
    warranty_id UUID, -- Logical reference to asset_db.warranties.id
    warranty_end_date DATE,
    warranty_checked_by UUID, -- Logical reference to identity_db.users.id
    warranty_checked_at TIMESTAMPTZ,
    review_started_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,
    confirmed_by UUID, -- Logical reference to identity_db.users.id
    confirmed_at TIMESTAMPTZ,
    closed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, request_no),
    UNIQUE (tenant_id, id),
    CHECK ((warranty_check_result IS NULL) = (warranty_checked_at IS NULL)),
    CHECK ((warranty_checked_at IS NULL) = (warranty_checked_by IS NULL)),
    CHECK (warranty_check_result IS DISTINCT FROM 'IN_WARRANTY' OR warranty_id IS NOT NULL)
);
CREATE INDEX idx_service_requests_tenant_status ON service_requests (tenant_id, status);
CREATE INDEX idx_service_requests_tenant_customer ON service_requests (tenant_id, customer_id);
CREATE INDEX idx_service_requests_tenant_equipment ON service_requests (tenant_id, equipment_id);
CREATE INDEX idx_service_requests_created ON service_requests (tenant_id, created_at DESC);

CREATE TABLE request_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    request_id UUID NOT NULL,
    storage_key VARCHAR(500) NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    size_bytes BIGINT,
    uploaded_by UUID NOT NULL, -- Logical reference to identity_db.users.id
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY (tenant_id, request_id)
        REFERENCES service_requests (tenant_id, id) ON DELETE RESTRICT,
    CHECK (size_bytes IS NULL OR size_bytes >= 0)
);
CREATE INDEX idx_request_attachments_request ON request_attachments (request_id);

-- INTERNAL notes are never returned to customer accounts. Default is the
-- safe value; customer-authored comments are stored as CUSTOMER.
CREATE TABLE request_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    request_id UUID NOT NULL,
    author_user_id UUID NOT NULL, -- Logical reference to identity_db.users.id
    visibility VARCHAR(20) NOT NULL DEFAULT 'INTERNAL' CHECK (visibility IN ('INTERNAL', 'CUSTOMER')),
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY (tenant_id, request_id)
        REFERENCES service_requests (tenant_id, id) ON DELETE RESTRICT
);
CREATE INDEX idx_request_comments_request_time
    ON request_comments (request_id, visibility, created_at);

CREATE TABLE request_status_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    request_id UUID NOT NULL,
    old_status VARCHAR(40),
    new_status VARCHAR(40) NOT NULL,
    changed_by UUID, -- Logical reference to identity_db.users.id; NULL when changed by an event
    reason TEXT,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY (tenant_id, request_id)
        REFERENCES service_requests (tenant_id, id) ON DELETE RESTRICT
);
CREATE INDEX idx_request_status_history_request_time
    ON request_status_history (request_id, changed_at);

-- Each revision is kept as history. Editing a SENT estimate or answering a
-- rejection creates a new revision; the previous one becomes SUPERSEDED
-- (if SENT) or stays REJECTED/EXPIRED. Only one live revision per request.
CREATE TABLE cost_estimates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    request_id UUID NOT NULL,
    revision_no INTEGER NOT NULL CHECK (revision_no > 0),
    currency CHAR(3) NOT NULL DEFAULT 'VND',
    total_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
    status VARCHAR(30) NOT NULL DEFAULT 'DRAFT'
        CHECK (status IN ('DRAFT', 'SENT', 'APPROVED', 'REJECTED', 'EXPIRED', 'SUPERSEDED')),
    valid_until DATE,
    notes TEXT,
    created_by UUID NOT NULL, -- Logical reference to identity_db.users.id
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    responded_by UUID, -- Logical reference to identity_db.users.id
    responded_at TIMESTAMPTZ,
    UNIQUE (request_id, revision_no),
    UNIQUE (tenant_id, id),
    FOREIGN KEY (tenant_id, request_id)
        REFERENCES service_requests (tenant_id, id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX uq_cost_estimates_live_per_request
    ON cost_estimates (request_id) WHERE status IN ('DRAFT', 'SENT', 'APPROVED');
CREATE INDEX idx_cost_estimates_tenant_status ON cost_estimates (tenant_id, status, created_at DESC);
COMMENT ON COLUMN cost_estimates.total_amount IS
    'Must be recalculated by Service Request Service in the same transaction as estimate item changes.';

CREATE TABLE cost_estimate_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    estimate_id UUID NOT NULL,
    item_type VARCHAR(30) NOT NULL CHECK (item_type IN ('LABOR', 'PART', 'TRAVEL', 'OTHER')),
    description VARCHAR(255) NOT NULL,
    quantity NUMERIC(12,2) NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC(14,2) NOT NULL CHECK (unit_price >= 0),
    amount NUMERIC(14,2) GENERATED ALWAYS AS (round(quantity * unit_price, 2)) STORED,
    FOREIGN KEY (tenant_id, estimate_id)
        REFERENCES cost_estimates (tenant_id, id) ON DELETE CASCADE
);
CREATE INDEX idx_cost_estimate_items_estimate ON cost_estimate_items (estimate_id);

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
