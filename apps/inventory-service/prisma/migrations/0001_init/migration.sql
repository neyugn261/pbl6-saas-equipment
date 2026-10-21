-- ============================================================================
-- inventory_db 0001_init
-- Source: docs/erd/pbl6-schema-v3.1.sql lines 1025-1146 (section "inventory_db"),
-- copied verbatim. See docs/decisions/0001-database-v3.1.md.
--
-- PostgreSQL-specific objects that schema.prisma cannot represent (CHECK
-- constraints, partial/expression indexes, generated columns, triggers) are
-- kept here and MUST NOT be dropped by later migrations.
-- ============================================================================

CREATE TABLE parts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    sku VARCHAR(100) NOT NULL,
    name VARCHAR(200) NOT NULL,
    unit VARCHAR(30) NOT NULL,
    description TEXT,
    status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, sku),
    UNIQUE (tenant_id, id)
);
CREATE INDEX idx_parts_tenant_status ON parts (tenant_id, status);

CREATE TABLE warehouses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    branch_id UUID NOT NULL, -- Logical reference to organization_db.branches.id
    code VARCHAR(50) NOT NULL,
    name VARCHAR(150) NOT NULL,
    address TEXT,
    status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, code),
    UNIQUE (tenant_id, id)
);
CREATE INDEX idx_warehouses_tenant_branch ON warehouses (tenant_id, branch_id, status);

-- Low stock: quantity < min_quantity. low_stock_alerted_at is set when an alert
-- event is written and cleared when stock is replenished, so one drop below
-- the minimum produces one alert.
CREATE TABLE stocks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    warehouse_id UUID NOT NULL,
    part_id UUID NOT NULL,
    quantity NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    min_quantity NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (min_quantity >= 0),
    low_stock_alerted_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (warehouse_id, part_id),
    FOREIGN KEY (tenant_id, warehouse_id)
        REFERENCES warehouses (tenant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, part_id)
        REFERENCES parts (tenant_id, id) ON DELETE RESTRICT
);
CREATE INDEX idx_stocks_part_warehouse ON stocks (tenant_id, part_id, warehouse_id);
CREATE INDEX idx_stocks_low ON stocks (tenant_id, warehouse_id)
    WHERE quantity < min_quantity;

-- quantity is always positive; the direction comes from `type`:
--   IN : RECEIVE, RETURN, ADJUST_IN
--   OUT: ISSUE, ADJUST_OUT
-- The matching stocks.quantity change happens in the same transaction.
CREATE TABLE stock_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    warehouse_id UUID NOT NULL,
    part_id UUID NOT NULL,
    type VARCHAR(20) NOT NULL
        CHECK (type IN ('RECEIVE', 'ISSUE', 'RETURN', 'ADJUST_IN', 'ADJUST_OUT')),
    quantity NUMERIC(12,2) NOT NULL CHECK (quantity > 0),
    reference_type VARCHAR(30),
    reference_id UUID,
    note TEXT,
    created_by UUID, -- Logical reference to identity_db.users.id
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, id),
    FOREIGN KEY (tenant_id, warehouse_id)
        REFERENCES warehouses (tenant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, part_id)
        REFERENCES parts (tenant_id, id) ON DELETE RESTRICT
);
CREATE INDEX idx_stock_transactions_part_time
    ON stock_transactions (tenant_id, part_id, created_at DESC);
CREATE INDEX idx_stock_transactions_warehouse_time
    ON stock_transactions (tenant_id, warehouse_id, created_at DESC);
CREATE INDEX idx_stock_transactions_reference
    ON stock_transactions (reference_type, reference_id);

-- Parts issued by Inventory Staff for a Work Order. Each row is backed by
-- exactly one ISSUE stock transaction, so stock and usage cannot diverge.
CREATE TABLE work_order_parts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    work_order_id UUID NOT NULL, -- Logical reference to workorder_db.work_orders.id
    part_id UUID NOT NULL,
    warehouse_id UUID NOT NULL,
    stock_transaction_id UUID NOT NULL UNIQUE,
    quantity_used NUMERIC(12,2) NOT NULL CHECK (quantity_used > 0),
    unit_cost NUMERIC(14,2) CHECK (unit_cost IS NULL OR unit_cost >= 0),
    recorded_by UUID NOT NULL, -- Logical reference to identity_db.users.id
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY (tenant_id, part_id)
        REFERENCES parts (tenant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, warehouse_id)
        REFERENCES warehouses (tenant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, stock_transaction_id)
        REFERENCES stock_transactions (tenant_id, id) ON DELETE RESTRICT
);
CREATE INDEX idx_work_order_parts_work_order ON work_order_parts (tenant_id, work_order_id);
CREATE INDEX idx_work_order_parts_part ON work_order_parts (tenant_id, part_id, created_at DESC);

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
