-- ============================================================================
-- organization_db 0001_init
-- Source: docs/erd/pbl6-schema-v3.1.sql lines 248-425 (section "organization_db"),
-- copied verbatim. See docs/decisions/0001-database-v3.1.md.
--
-- PostgreSQL-specific objects that schema.prisma cannot represent (CHECK
-- constraints, partial/expression indexes, generated columns, triggers) are
-- kept here and MUST NOT be dropped by later migrations.
-- ============================================================================

CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(200) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE'
        CHECK (status IN ('ACTIVE', 'SUSPENDED', 'DISABLED')),
    plan VARCHAR(50) NOT NULL DEFAULT 'BASIC', -- Informational only; subscription management is out of MVP scope
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);

CREATE TABLE branches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(150) NOT NULL,
    address TEXT NOT NULL,
    phone VARCHAR(30),
    email VARCHAR(255),
    status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ,
    UNIQUE (tenant_id, code),
    UNIQUE (tenant_id, id)
);
CREATE INDEX idx_branches_tenant_status ON branches (tenant_id, status);

CREATE TABLE customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(200) NOT NULL,
    tax_code VARCHAR(50),
    phone VARCHAR(30),
    email VARCHAR(255),
    address TEXT,
    status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ,
    UNIQUE (tenant_id, code),
    UNIQUE (tenant_id, id)
);
CREATE INDEX idx_customers_tenant_status ON customers (tenant_id, status);

CREATE TABLE customer_sites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    customer_id UUID NOT NULL,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(150) NOT NULL,
    address TEXT NOT NULL,
    latitude NUMERIC(9,6),
    longitude NUMERIC(9,6),
    default_servicing_branch_id UUID NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ,
    UNIQUE (tenant_id, code),
    UNIQUE (tenant_id, id),
    UNIQUE (customer_id, id),
    FOREIGN KEY (tenant_id, customer_id)
        REFERENCES customers (tenant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, default_servicing_branch_id)
        REFERENCES branches (tenant_id, id) ON DELETE RESTRICT,
    CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
    CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180)
);
CREATE INDEX idx_customer_sites_customer ON customer_sites (customer_id, status);
CREATE INDEX idx_customer_sites_default_branch
    ON customer_sites (tenant_id, default_servicing_branch_id)
    WHERE default_servicing_branch_id IS NOT NULL;

CREATE TABLE locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    customer_site_id UUID NOT NULL,
    parent_id UUID NULL,
    code VARCHAR(50),
    name VARCHAR(150) NOT NULL,
    type VARCHAR(30) NOT NULL CHECK (type IN ('BUILDING', 'FLOOR', 'ROOM', 'AREA')),
    description TEXT,
    status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ,
    FOREIGN KEY (tenant_id, customer_site_id)
        REFERENCES customer_sites (tenant_id, id) ON DELETE RESTRICT,
    UNIQUE (customer_site_id, id),
    -- Parent must be in the same site. Deeper cycles (A->B->A) are rejected by the service layer.
    FOREIGN KEY (customer_site_id, parent_id)
        REFERENCES locations (customer_site_id, id) ON DELETE RESTRICT,
    CHECK (parent_id IS NULL OR parent_id <> id)
);
CREATE INDEX idx_locations_site_parent ON locations (customer_site_id, parent_id);
CREATE INDEX idx_locations_tenant ON locations (tenant_id, customer_site_id);
CREATE UNIQUE INDEX uq_locations_site_code
    ON locations (customer_site_id, code) WHERE code IS NOT NULL;

CREATE TABLE customer_contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    customer_id UUID NOT NULL,
    customer_site_id UUID NULL,
    name VARCHAR(150) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(30),
    position VARCHAR(100),
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ,
    FOREIGN KEY (tenant_id, customer_id)
        REFERENCES customers (tenant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (customer_id, customer_site_id)
        REFERENCES customer_sites (customer_id, id) ON DELETE RESTRICT
);
CREATE INDEX idx_customer_contacts_customer ON customer_contacts (tenant_id, customer_id);
CREATE INDEX idx_customer_contacts_site ON customer_contacts (customer_site_id)
    WHERE customer_site_id IS NOT NULL;
-- At most one live primary contact per customer.
CREATE UNIQUE INDEX uq_customer_contacts_primary
    ON customer_contacts (customer_id) WHERE is_primary AND deleted_at IS NULL;

-- user_id must be a TENANT_STAFF account of the same tenant (validated via Identity API).
CREATE TABLE branch_user_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    branch_id UUID NOT NULL,
    user_id UUID NOT NULL, -- Logical reference to identity_db.users.id
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (branch_id, user_id),
    FOREIGN KEY (tenant_id, branch_id)
        REFERENCES branches (tenant_id, id) ON DELETE RESTRICT
);
CREATE INDEX idx_branch_user_assignments_user ON branch_user_assignments (user_id);
-- At most one primary branch per user.
CREATE UNIQUE INDEX uq_branch_user_assignments_primary
    ON branch_user_assignments (user_id) WHERE is_primary;

-- Only says which Customer a CUSTOMER account belongs to. It is NOT a source
-- of authorization: Customer Admin / Customer User roles live in Identity.
-- user_id must be a CUSTOMER account of the same tenant (validated via Identity API).
CREATE TABLE customer_user_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    customer_id UUID NOT NULL,
    user_id UUID NOT NULL UNIQUE, -- Logical reference to identity_db.users.id; one Customer per account
    status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY (tenant_id, customer_id)
        REFERENCES customers (tenant_id, id) ON DELETE RESTRICT
);
CREATE INDEX idx_customer_user_memberships_customer
    ON customer_user_memberships (tenant_id, customer_id, status);

CREATE TABLE outbox_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), -- Event id sent to consumers
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
