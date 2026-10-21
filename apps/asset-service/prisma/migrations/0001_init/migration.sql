-- ============================================================================
-- asset_db 0001_init
-- Source: docs/erd/pbl6-schema-v3.1.sql lines 432-533 (section "asset_db"),
-- copied verbatim. See docs/decisions/0001-database-v3.1.md.
--
-- PostgreSQL-specific objects that schema.prisma cannot represent (CHECK
-- constraints, partial/expression indexes, generated columns, triggers) are
-- kept here and MUST NOT be dropped by later migrations.
-- ============================================================================

CREATE TABLE equipment_models (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL, -- Logical reference to organization_db.tenants.id
    manufacturer VARCHAR(150) NOT NULL,
    model_code VARCHAR(100) NOT NULL,
    name VARCHAR(200) NOT NULL,
    category VARCHAR(100),
    description TEXT,
    status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, manufacturer, model_code),
    UNIQUE (tenant_id, id)
);

-- Equipment is retired through `status`, never hard-deleted (referenced by other services).
CREATE TABLE equipments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    model_id UUID NOT NULL,
    customer_id UUID NOT NULL, -- Logical reference to organization_db.customers.id
    customer_site_id UUID NOT NULL, -- Logical reference to organization_db.customer_sites.id
    location_id UUID NULL, -- Logical reference to organization_db.locations.id
    asset_code VARCHAR(100) NOT NULL,
    serial_number VARCHAR(150) NOT NULL,
    installation_date DATE,
    handover_date DATE,
    status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE'
        CHECK (status IN ('ACTIVE', 'IN_SERVICE', 'OUT_OF_SERVICE', 'RETIRED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, asset_code),
    UNIQUE (tenant_id, serial_number),
    UNIQUE (tenant_id, id),
    FOREIGN KEY (tenant_id, model_id)
        REFERENCES equipment_models (tenant_id, id) ON DELETE RESTRICT
);
CREATE INDEX idx_equipments_tenant_customer ON equipments (tenant_id, customer_id);
CREATE INDEX idx_equipments_tenant_site ON equipments (tenant_id, customer_site_id);
CREATE INDEX idx_equipments_tenant_status ON equipments (tenant_id, status);

CREATE TABLE warranties (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    equipment_id UUID NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    warranty_type VARCHAR(50) NOT NULL,
    terms TEXT,
    -- EXPIRED is derived at query time from end_date; do not persist a stale status.
    status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'VOID')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY (tenant_id, equipment_id)
        REFERENCES equipments (tenant_id, id) ON DELETE RESTRICT,
    CHECK (end_date >= start_date)
);
CREATE INDEX idx_warranties_equipment_dates
    ON warranties (tenant_id, equipment_id, start_date, end_date);

CREATE TABLE equipment_qr_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    equipment_id UUID NOT NULL,
    token VARCHAR(255) NOT NULL UNIQUE, -- Identifies equipment only; access is still authorized
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked_at TIMESTAMPTZ,
    FOREIGN KEY (tenant_id, equipment_id)
        REFERENCES equipments (tenant_id, id) ON DELETE RESTRICT
);
-- Exactly one active QR per equipment; re-printing revokes the old one first.
CREATE UNIQUE INDEX uq_equipment_qr_active
    ON equipment_qr_codes (equipment_id) WHERE revoked_at IS NULL;

CREATE TABLE equipment_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    equipment_id UUID NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    reference_type VARCHAR(50),
    reference_id UUID,
    description TEXT,
    metadata JSONB,
    source_event_id UUID, -- Set when written by an event consumer; prevents duplicate history
    created_by UUID, -- Logical reference to identity_db.users.id
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY (tenant_id, equipment_id)
        REFERENCES equipments (tenant_id, id) ON DELETE RESTRICT
);
CREATE INDEX idx_equipment_history_equipment_time
    ON equipment_history (tenant_id, equipment_id, occurred_at DESC);
CREATE UNIQUE INDEX uq_equipment_history_source_event
    ON equipment_history (source_event_id) WHERE source_event_id IS NOT NULL;

CREATE TABLE processed_events (
    event_id UUID NOT NULL,
    consumer VARCHAR(100) NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (event_id, consumer)
);
