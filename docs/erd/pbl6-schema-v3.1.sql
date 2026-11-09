-- ============================================================================
-- PBL6 Database Design v3.1 - Reference schema for all microservices
-- Architecture: database-per-microservice; no cross-database foreign keys.
--
-- PURPOSE:
--   * This file is the approved DESIGN REFERENCE. It is NOT run by Docker.
--     `infrastructure/postgres/init.sql` only creates the eight databases.
--   * Each microservice owns its schema through its own Prisma migrations.
--     The section for a service is the source for that service's first
--     migration (0001_init). PostgreSQL-specific objects (CHECK, partial
--     unique/expression indexes, triggers, generated columns) MUST be kept
--     as raw SQL in that migration and must not be dropped by later ones.
--   * Can be run with psql against a fresh cluster to validate the design:
--       psql -U pbl6 -d postgres -f docs/erd/pbl6-schema-v3.1.sql
--
-- CONVENTIONS (v3.1):
--   * Every tenant-owned business table has `tenant_id UUID NOT NULL`.
--     Child tables reference their parent with a composite FK
--     (tenant_id, parent_id) -> parent (tenant_id, id), so a row can never be
--     linked to a parent from another tenant inside the same database.
--   * UUIDs pointing to another microservice are logical references; the
--     owning service validates existence and tenant ownership via API/event.
--   * Business records are not hard-deleted: FKs default to ON DELETE RESTRICT.
--     Tenant/Customer-side master data uses soft delete (`deleted_at`).
--     CASCADE is only used for dependent rows with no meaning of their own
--     (role links, sessions, tokens, skill links, draft estimate items).
--   * `updated_at` is maintained by the application (Prisma @updatedAt).
--   * gen_random_uuid() is built into PostgreSQL 13+; no extension needed.
--   * Event reliability: producers write `outbox_events` in the same
--     transaction as the business change; consumers record handled events in
--     `processed_events` (inbox) to stay idempotent. outbox_events.id is the
--     event id carried in the message.
-- ============================================================================
\set ON_ERROR_STOP on

SELECT 'CREATE DATABASE identity_db' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'identity_db')\gexec
SELECT 'CREATE DATABASE organization_db' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'organization_db')\gexec
SELECT 'CREATE DATABASE asset_db' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'asset_db')\gexec
SELECT 'CREATE DATABASE service_request_db' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'service_request_db')\gexec
SELECT 'CREATE DATABASE workorder_db' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'workorder_db')\gexec
SELECT 'CREATE DATABASE maintenance_db' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'maintenance_db')\gexec
SELECT 'CREATE DATABASE inventory_db' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'inventory_db')\gexec
SELECT 'CREATE DATABASE notification_db' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'notification_db')\gexec

-- ============================================================================
-- 1. identity_db  (Identity Service)
--    Owns authentication, users, roles, permissions, user-role assignments.
-- ============================================================================
\connect identity_db

-- Fixed role catalog (RBAC). Seeded by migration; tenants cannot create,
-- rename or delete roles. `user_type` defines which kind of account may hold
-- the role, which also separates platform scope from tenant scope.
CREATE TABLE roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    user_type VARCHAR(20) NOT NULL
        CHECK (user_type IN ('PLATFORM_STAFF', 'TENANT_STAFF', 'CUSTOMER')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Fixed permission catalog. Seeded by migration together with role_permissions.
CREATE TABLE permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(100) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    description TEXT
);

CREATE TABLE role_permissions (
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);
CREATE INDEX idx_role_permissions_permission ON role_permissions (permission_id);

-- user_type separates internal staff from customer accounts, so a CUSTOMER
-- account can never receive TENANT_STAFF roles (Technician, Dispatcher, ...).
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NULL, -- Logical reference to organization_db.tenants.id
    user_type VARCHAR(20) NOT NULL
        CHECK (user_type IN ('PLATFORM_STAFF', 'TENANT_STAFF', 'CUSTOMER')),
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NULL,
    full_name VARCHAR(150) NOT NULL,
    phone VARCHAR(30),
    status VARCHAR(30) NOT NULL DEFAULT 'INVITED'
        CHECK (status IN ('INVITED', 'ACTIVE', 'SUSPENDED', 'DISABLED')),
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK ((user_type = 'PLATFORM_STAFF' AND tenant_id IS NULL)
        OR (user_type IN ('TENANT_STAFF', 'CUSTOMER') AND tenant_id IS NOT NULL)),
    -- An invited account may not have a password yet; DISABLED also covers a
    -- cancelled invitation. ACTIVE/SUSPENDED accounts must have a password.
    CHECK (password_hash IS NOT NULL OR status IN ('INVITED', 'DISABLED'))
);
-- Tenant users log in with tenant code + email + password.
CREATE UNIQUE INDEX uq_users_tenant_email
    ON users (tenant_id, lower(email)) WHERE tenant_id IS NOT NULL;
-- Platform users log in through the platform scope (no tenant code).
CREATE UNIQUE INDEX uq_users_platform_email
    ON users (lower(email)) WHERE tenant_id IS NULL;
CREATE INDEX idx_users_tenant_status ON users (tenant_id, status);

CREATE TABLE user_roles (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
    assigned_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, role_id)
);
CREATE INDEX idx_user_roles_role ON user_roles (role_id);

-- A role can only be assigned to an account of the matching user_type.
-- Whether the *assigner* may grant that role is checked by the service layer.
CREATE OR REPLACE FUNCTION enforce_user_role_type()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_user_type VARCHAR(20);
    v_role_user_type VARCHAR(20);
BEGIN
    SELECT user_type INTO v_user_type FROM users WHERE id = NEW.user_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'User % does not exist', NEW.user_id;
    END IF;

    SELECT user_type INTO v_role_user_type FROM roles WHERE id = NEW.role_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Role % does not exist', NEW.role_id;
    END IF;

    IF v_user_type <> v_role_user_type THEN
        RAISE EXCEPTION 'Role for % accounts cannot be assigned to a % account',
            v_role_user_type, v_user_type;
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER trg_user_roles_type_guard
BEFORE INSERT OR UPDATE OF user_id, role_id ON user_roles
FOR EACH ROW EXECUTE FUNCTION enforce_user_role_type();

-- Account type and tenant are immutable while role assignments exist.
CREATE OR REPLACE FUNCTION prevent_assigned_user_type_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF (NEW.user_type IS DISTINCT FROM OLD.user_type
        OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id)
       AND EXISTS (SELECT 1 FROM user_roles WHERE user_id = OLD.id) THEN
        RAISE EXCEPTION 'Remove user role assignments before changing user type or tenant';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER trg_users_type_immutable_when_assigned
BEFORE UPDATE OF user_type, tenant_id ON users
FOR EACH ROW EXECUTE FUNCTION prevent_assigned_user_type_change();

CREATE OR REPLACE FUNCTION prevent_assigned_role_type_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.user_type IS DISTINCT FROM OLD.user_type
       AND EXISTS (SELECT 1 FROM user_roles WHERE role_id = OLD.id) THEN
        RAISE EXCEPTION 'Cannot change user_type of a role that is assigned';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER trg_roles_type_immutable_when_assigned
BEFORE UPDATE OF user_type ON roles
FOR EACH ROW EXECUTE FUNCTION prevent_assigned_role_type_change();

CREATE TABLE auth_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    refresh_token_hash VARCHAR(255) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    ip_address VARCHAR(64),
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (expires_at > created_at)
);
CREATE INDEX idx_auth_sessions_user_active
    ON auth_sessions (user_id, expires_at) WHERE revoked_at IS NULL;

CREATE TABLE account_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    purpose VARCHAR(30) NOT NULL
        CHECK (purpose IN ('ACCOUNT_ACTIVATION', 'PASSWORD_RESET', 'EMAIL_VERIFICATION')),
    token_hash VARCHAR(255) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (expires_at > created_at)
);
CREATE INDEX idx_account_tokens_user_purpose
    ON account_tokens (user_id, purpose, expires_at);

-- Local read model of tenants, maintained from Organization Service events.
-- Used to resolve the tenant code at login and to refuse logins of
-- suspended/disabled tenants without a synchronous call to Organization.
CREATE TABLE tenant_directory (
    tenant_id UUID PRIMARY KEY, -- Logical reference to organization_db.tenants.id
    code VARCHAR(50) NOT NULL UNIQUE,
    status VARCHAR(30) NOT NULL CHECK (status IN ('ACTIVE', 'SUSPENDED', 'DISABLED')),
    synced_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE processed_events (
    event_id UUID NOT NULL,
    consumer VARCHAR(100) NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (event_id, consumer)
);

INSERT INTO roles (code, name, user_type) VALUES
    ('PLATFORM_ADMIN', 'Platform Admin', 'PLATFORM_STAFF'),
    ('TENANT_ADMIN', 'Tenant Admin', 'TENANT_STAFF'),
    ('SERVICE_MANAGER', 'Service Manager', 'TENANT_STAFF'),
    ('DISPATCHER', 'Dispatcher', 'TENANT_STAFF'),
    ('INVENTORY_STAFF', 'Inventory Staff', 'TENANT_STAFF'),
    ('TECHNICIAN', 'Technician', 'TENANT_STAFF'),
    ('CUSTOMER_ADMIN', 'Customer Admin', 'CUSTOMER'),
    ('CUSTOMER_USER', 'Customer User', 'CUSTOMER');
-- The permission catalog and role_permissions are seeded in the Identity
-- Service migration once the permission list is agreed.

-- ============================================================================
-- 2. organization_db  (Organization Service)
--    Owns tenants, branches, customers, sites, locations, contacts,
--    branch-user assignments and customer-user memberships.
-- ============================================================================
\connect organization_db

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

-- ============================================================================
-- 3. asset_db  (Asset Service)
-- ============================================================================
\connect asset_db

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
    -- ADR 0009; additive EquipmentMoved/outbox migration (20261027090000).
    snapshot_version INTEGER NOT NULL DEFAULT 0 CHECK (snapshot_version >= 0),
    installation_date DATE,
    handover_date DATE,
    -- ADR 0010, migration 20261027140000_equipment_dossier_history.
    display_name VARCHAR(200),
    description TEXT,
    commissioned_date DATE,
    technical_specifications JSONB,
    operational_status VARCHAR(30) NOT NULL DEFAULT 'UNKNOWN'
        CHECK (operational_status IN ('UNKNOWN', 'OPERATIONAL', 'DEGRADED', 'NOT_OPERATIONAL')),
    operational_status_updated_at TIMESTAMPTZ,
    operational_status_updated_by UUID, -- Logical Identity reference
    status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE'
        CHECK (status IN ('ACTIVE', 'IN_SERVICE', 'OUT_OF_SERVICE', 'RETIRED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, asset_code),
    -- ADR 0006 (DEC-13, asset_db 0002): was UNIQUE (tenant_id, serial_number).
    UNIQUE (tenant_id, model_id, serial_number),
    UNIQUE (tenant_id, id),
    FOREIGN KEY (tenant_id, model_id)
        REFERENCES equipment_models (tenant_id, id) ON DELETE RESTRICT
);
CREATE INDEX idx_equipments_tenant_customer ON equipments (tenant_id, customer_id);
CREATE INDEX idx_equipments_tenant_site ON equipments (tenant_id, customer_site_id);
CREATE INDEX idx_equipments_tenant_status ON equipments (tenant_id, status);

CREATE TABLE equipment_model_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    model_id UUID NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    actor_id UUID,
    actor_roles TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    changes JSONB NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY (tenant_id, model_id) REFERENCES equipment_models(tenant_id, id) ON DELETE RESTRICT
);
CREATE INDEX equipment_model_history_tenant_id_model_id_occurred_at_idx
    ON equipment_model_history(tenant_id, model_id, occurred_at);

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
    actor_type VARCHAR(20) NOT NULL DEFAULT 'UNKNOWN' CHECK (actor_type IN ('UNKNOWN', 'USER', 'SYSTEM')),
    actor_roles TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    changes JSONB,
    context JSONB,
    reason_internal TEXT,
    customer_note TEXT,
    FOREIGN KEY (tenant_id, equipment_id)
        REFERENCES equipments (tenant_id, id) ON DELETE RESTRICT
);
CREATE INDEX idx_equipment_history_equipment_time
    ON equipment_history (tenant_id, equipment_id, occurred_at DESC);
CREATE INDEX idx_equipment_history_tenant_time ON equipment_history(tenant_id, occurred_at DESC, id);
CREATE UNIQUE INDEX uq_equipment_history_source_event
    ON equipment_history (source_event_id) WHERE source_event_id IS NOT NULL;

CREATE TABLE processed_events (
    event_id UUID NOT NULL,
    consumer VARCHAR(100) NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (event_id, consumer)
);

-- ADR 0009: Asset owns its move outbox in addition to its event inbox.
CREATE TABLE outbox_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NULL,
    aggregate_type VARCHAR(50) NOT NULL, aggregate_id UUID NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    event_version SMALLINT NOT NULL DEFAULT 1 CHECK (event_version > 0),
    payload JSONB NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PUBLISHED', 'FAILED')),
    attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0), last_error TEXT,
    available_at TIMESTAMPTZ NOT NULL DEFAULT now(), occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(), published_at TIMESTAMPTZ,
    CHECK ((status = 'PUBLISHED') = (published_at IS NOT NULL))
);
CREATE INDEX idx_outbox_events_pending ON outbox_events (available_at) WHERE status = 'PENDING';

-- ============================================================================
-- 4. service_request_db  (Service Request Service)
-- ============================================================================
\connect service_request_db

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

-- visibility (ADR 0006, DEC-09): customer accounts only receive CUSTOMER
-- attachments; same values as request_comments. Added by migration 0002 of
-- service_request_db / workorder_db (also on the two workorder_db tables).
CREATE TABLE request_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    request_id UUID NOT NULL,
    storage_key VARCHAR(500) NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    size_bytes BIGINT,
    uploaded_by UUID NOT NULL, -- Logical reference to identity_db.users.id
    visibility VARCHAR(20) NOT NULL DEFAULT 'INTERNAL' CHECK (visibility IN ('INTERNAL', 'CUSTOMER')),
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

-- ============================================================================
-- 5. workorder_db  (Work Order Service)
--    Also owns technician profiles (dispatch domain).
-- ============================================================================
\connect workorder_db

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
    -- ADR 0011 / workorder_db 0004: durable replacement request and predecessor.
    maintenance_replacement_request_id UUID NULL,
    replaces_work_order_id UUID NULL, -- Local WO ID; tenant/source validated by Work Order Service.
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
    -- ADR 0008 (D5, workorder_db 0003): NULL = created by the system from an
    -- event (Maintenance Task); a Work Order created through the API records the caller.
    created_by UUID NULL, -- Logical reference to identity_db.users.id
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    UNIQUE (tenant_id, work_order_no),
    UNIQUE (tenant_id, id),
    CHECK ((service_request_id IS NOT NULL) <> (maintenance_task_id IS NOT NULL)),
    CONSTRAINT chk_work_orders_maintenance_replacement CHECK (
        (maintenance_replacement_request_id IS NULL AND replaces_work_order_id IS NULL)
        OR (
            maintenance_replacement_request_id IS NOT NULL
            AND replaces_work_order_id IS NOT NULL
            AND maintenance_task_id IS NOT NULL
            AND service_request_id IS NULL
            AND type = 'MAINTENANCE'
            AND replaces_work_order_id <> id
        )
    ),
    CHECK (scheduled_end IS NULL OR scheduled_start IS NULL OR scheduled_end > scheduled_start)
);
CREATE INDEX idx_work_orders_service_request
    ON work_orders (service_request_id) WHERE service_request_id IS NOT NULL;
CREATE UNIQUE INDEX uq_work_orders_maintenance_replacement_request
    ON work_orders (maintenance_replacement_request_id);
CREATE UNIQUE INDEX uq_work_orders_replaces_work_order
    ON work_orders (replaces_work_order_id);
-- One live Work Order per Maintenance Task; a CANCELLED one releases the task
-- so a replacement can be created (ADR 0002, fixes audit finding F07).
CREATE UNIQUE INDEX uq_work_orders_maintenance_task
    ON work_orders (maintenance_task_id)
    WHERE maintenance_task_id IS NOT NULL AND status <> 'CANCELLED';
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
    visibility VARCHAR(20) NOT NULL DEFAULT 'INTERNAL' CHECK (visibility IN ('INTERNAL', 'CUSTOMER')),
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
    visibility VARCHAR(20) NOT NULL DEFAULT 'INTERNAL' CHECK (visibility IN ('INTERNAL', 'CUSTOMER')),
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

-- ============================================================================
-- 6. maintenance_db  (Maintenance Service)
--    MVP: Maintenance Plan and Maintenance Task only (no checklist).
-- ============================================================================
\connect maintenance_db

CREATE TABLE maintenance_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    equipment_id UUID NOT NULL, -- Logical reference to asset_db.equipments.id
    -- ADR 0007 D12a; added to deployed databases by the second Maintenance migration.
    customer_id UUID NOT NULL, -- Asset customer snapshot, logical reference
    customer_site_id UUID NULL, -- Asset site snapshot, logical reference
    snapshot_version INTEGER NOT NULL DEFAULT 0 CHECK (snapshot_version >= 0),
    anchor_date DATE NOT NULL, -- ADR 0009: fixed calendar anchor, not completion time
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
CREATE INDEX idx_maintenance_plans_customer ON maintenance_plans (tenant_id, customer_id);

-- ADR 0010: append-only Plan/Task ledger; scope is checked against its local Plan.
CREATE TABLE maintenance_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    plan_id UUID NOT NULL,
    task_id UUID, -- Logical local Task reference; no cross-service FK
    event_type VARCHAR(60) NOT NULL,
    actor_id UUID,
    actor_roles TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    source_event_id UUID,
    changes JSONB NOT NULL,
    context JSONB NOT NULL,
    occurred_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    recorded_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT maintenance_history_plan_fkey FOREIGN KEY (tenant_id, plan_id)
        REFERENCES maintenance_plans(tenant_id, id) ON DELETE RESTRICT ON UPDATE NO ACTION
);
CREATE INDEX maintenance_history_tenant_id_plan_id_occurred_at_idx ON maintenance_history(tenant_id, plan_id, occurred_at DESC);
CREATE INDEX maintenance_history_tenant_id_task_id_occurred_at_idx ON maintenance_history(tenant_id, task_id, occurred_at DESC);

CREATE TABLE maintenance_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    maintenance_plan_id UUID NOT NULL,
    scheduled_date DATE NOT NULL,
    customer_id UUID NOT NULL, -- creation-time snapshot from the local Plan
    customer_site_id UUID,
    work_order_id UUID NULL, -- Logical reference to workorder_db.work_orders.id (set from WorkOrder event)
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'WORK_ORDER_CREATED', 'COMPLETED', 'FAILED', 'CANCELLED')),
    attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    UNIQUE (maintenance_plan_id, scheduled_date),
    UNIQUE (tenant_id, id),
    FOREIGN KEY (tenant_id, maintenance_plan_id)
        REFERENCES maintenance_plans (tenant_id, id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX uq_maintenance_task_work_order
    ON maintenance_tasks (work_order_id) WHERE work_order_id IS NOT NULL;
CREATE INDEX idx_maintenance_tasks_status_date
    ON maintenance_tasks (tenant_id, status, scheduled_date);

-- ADR 0009; created by Maintenance runtime migration (20261027091000).
CREATE TABLE equipment_snapshots (
    tenant_id UUID NOT NULL, equipment_id UUID NOT NULL, customer_id UUID NOT NULL,
    customer_site_id UUID, snapshot_version INTEGER NOT NULL CHECK (snapshot_version >= 0),
    changed_at TIMESTAMPTZ NOT NULL, PRIMARY KEY (tenant_id, equipment_id)
);
CREATE TABLE maintenance_work_order_links (
    work_order_id UUID PRIMARY KEY, tenant_id UUID NOT NULL, task_id UUID NOT NULL,
    state VARCHAR(20) NOT NULL CHECK (state IN ('CREATED', 'COMPLETED', 'CANCELLED')),
    occurred_at TIMESTAMPTZ NOT NULL,
    FOREIGN KEY (tenant_id, task_id) REFERENCES maintenance_tasks (tenant_id, id) ON DELETE RESTRICT
);
CREATE INDEX maintenance_work_order_links_tenant_id_task_id_idx ON maintenance_work_order_links (tenant_id, task_id);
CREATE TABLE maintenance_replacement_requests (
    request_id UUID PRIMARY KEY, tenant_id UUID NOT NULL, task_id UUID NOT NULL,
    previous_work_order_id UUID NOT NULL, replacement_work_order_id UUID NOT NULL UNIQUE,
    requested_by UUID NOT NULL, status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'LINKED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY (tenant_id, task_id) REFERENCES maintenance_tasks (tenant_id, id) ON DELETE RESTRICT
);
CREATE INDEX maintenance_replacement_requests_tenant_id_task_id_idx ON maintenance_replacement_requests (tenant_id, task_id);
CREATE UNIQUE INDEX uq_maintenance_pending_replacement ON maintenance_replacement_requests (task_id) WHERE status = 'PENDING';

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

-- ============================================================================
-- 7. inventory_db  (Inventory Service)
--    MVP: parts, warehouses, stock levels, stock transactions, basic minimum
--    stock alert. No separate part-request workflow.
-- ============================================================================
\connect inventory_db

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
-- Returns (ADR 0006, DEC-09, inventory_db 0002): quantity_used is the issued
-- quantity; consumed = quantity_used - quantity_returned. A return writes a
-- RETURN stock transaction and updates stocks.quantity and quantity_returned
-- in the same transaction.
CREATE TABLE work_order_parts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    work_order_id UUID NOT NULL, -- Logical reference to workorder_db.work_orders.id
    part_id UUID NOT NULL,
    warehouse_id UUID NOT NULL,
    stock_transaction_id UUID NOT NULL UNIQUE,
    quantity_used NUMERIC(12,2) NOT NULL CHECK (quantity_used > 0),
    quantity_returned NUMERIC(12,2) NOT NULL DEFAULT 0,
    unit_cost NUMERIC(14,2) CHECK (unit_cost IS NULL OR unit_cost >= 0),
    recorded_by UUID NOT NULL, -- Logical reference to identity_db.users.id
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY (tenant_id, part_id)
        REFERENCES parts (tenant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, warehouse_id)
        REFERENCES warehouses (tenant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, stock_transaction_id)
        REFERENCES stock_transactions (tenant_id, id) ON DELETE RESTRICT,
    CONSTRAINT chk_work_order_parts_returned
        CHECK (quantity_returned >= 0 AND quantity_returned <= quantity_used)
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

-- ============================================================================
-- Inventory M3 additive runtime (ADR 0014 / inventory_db migration 0003).
-- Additive runtime records. Keep 0001/0002, their checks and partial indexes.
CREATE TABLE inventory_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  key UUID NOT NULL,
  operation VARCHAR(20) NOT NULL CHECK (operation IN ('RECEIVE','ADJUST','ISSUE','RETURN')),
  fingerprint VARCHAR(64) NOT NULL CHECK (fingerprint ~ '^[0-9a-f]{64}$'),
  request JSONB NOT NULL,
  actor_id UUID NOT NULL,
  work_order_id UUID,
  state VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (state IN ('PENDING','COMMITTED','ABORTED')),
  response JSONB,
  http_status INTEGER,
  reservation_settled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, key),
  CHECK ((operation = 'ISSUE') = (work_order_id IS NOT NULL)),
  CHECK ((state = 'PENDING' AND response IS NULL AND http_status IS NULL AND reservation_settled_at IS NULL)
      OR (state = 'COMMITTED' AND response IS NOT NULL AND http_status BETWEEN 200 AND 299)
      OR (state = 'ABORTED' AND operation = 'ISSUE' AND response IS NOT NULL AND http_status BETWEEN 400 AND 499)),
  CHECK (reservation_settled_at IS NULL OR (operation = 'ISSUE' AND state <> 'PENDING'))
);
CREATE INDEX idx_inventory_operations_recovery ON inventory_operations(tenant_id,state,created_at);

ALTER TABLE work_order_parts ADD CONSTRAINT work_order_parts_tenant_id_id_key UNIQUE(tenant_id,id);
ALTER TABLE stock_transactions
  ADD COLUMN balance_before NUMERIC(12,2),
  ADD COLUMN balance_after NUMERIC(12,2),
  ADD COLUMN work_order_part_id UUID,
  ADD CONSTRAINT stock_transactions_return_usage_fk FOREIGN KEY(tenant_id,work_order_part_id)
    REFERENCES work_order_parts(tenant_id,id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  ADD CONSTRAINT stock_transactions_balances CHECK (
    (balance_before IS NULL AND balance_after IS NULL) OR
    (balance_before IS NOT NULL AND balance_after IS NOT NULL AND balance_before >= 0 AND balance_after >= 0
      AND balance_after = balance_before + CASE WHEN type IN ('RECEIVE','RETURN','ADJUST_IN') THEN quantity ELSE -quantity END)),
  ADD CONSTRAINT stock_transactions_usage_type CHECK (work_order_part_id IS NULL OR type = 'RETURN');
CREATE INDEX idx_stock_transactions_usage ON stock_transactions(tenant_id,work_order_part_id);

-- ============================================================================
-- 8. notification_db  (Notification Service)
-- ============================================================================
\connect notification_db

CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NULL, -- NULL may represent a platform-level notification
    user_id UUID NOT NULL, -- Logical reference to identity_db.users.id
    source_event_id UUID,
    type VARCHAR(50) NOT NULL,
    title VARCHAR(200) NOT NULL,
    content TEXT NOT NULL,
    payload JSONB,
    channel VARCHAR(20) NOT NULL CHECK (channel IN ('IN_APP', 'EMAIL', 'PUSH')),
    -- Delivery state is independent from whether an in-app notification was read.
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SENT', 'FAILED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    sent_at TIMESTAMPTZ,
    read_at TIMESTAMPTZ,
    CHECK (read_at IS NULL OR channel = 'IN_APP')
);
CREATE INDEX idx_notifications_user_unread
    ON notifications (user_id, created_at DESC)
    WHERE channel = 'IN_APP' AND read_at IS NULL;
CREATE INDEX idx_notifications_tenant_type
    ON notifications (tenant_id, type, created_at DESC);
CREATE INDEX idx_notifications_delivery_queue
    ON notifications (status, created_at)
    WHERE status IN ('PENDING', 'FAILED');
CREATE UNIQUE INDEX uq_notifications_event_user_channel
    ON notifications (source_event_id, user_id, channel)
    WHERE source_event_id IS NOT NULL;

CREATE TABLE processed_events (
    event_id UUID NOT NULL,
    consumer VARCHAR(100) NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (event_id, consumer)
);

-- ============================================================================
-- End of PBL6 v3.1 reference schema
-- ============================================================================

-- ADR 0012: additive initial equipment registration and idempotent Plan link.
\connect asset_db
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

\connect maintenance_db
-- AlterTable
ALTER TABLE "maintenance_plans" ADD COLUMN     "setup_input_hash" CHAR(64),
ADD COLUMN     "setup_linked_at" TIMESTAMPTZ(6),
ADD COLUMN     "setup_registration_id" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "maintenance_plans_tenant_id_setup_registration_id_key" ON "maintenance_plans"("tenant_id", "setup_registration_id");


ALTER TABLE maintenance_plans ADD CONSTRAINT maintenance_plans_setup_check CHECK (
 (setup_registration_id IS NULL AND setup_input_hash IS NULL AND setup_linked_at IS NULL)
 OR (setup_registration_id IS NOT NULL AND setup_input_hash IS NOT NULL AND setup_input_hash ~ '^[0-9a-f]{64}$' AND setup_linked_at IS NOT NULL)
);

-- ADR 0013 / M3-A1: attachment lifecycle; review completion confirmed by Khương.
\connect workorder_db
-- M3-A1 / ADR 0013: additive persistence only; runtime follows in A2-A4.
-- Review legacy rows and shared/schema approval before business DB deployment.

-- AlterTable
ALTER TABLE "report_attachments" ADD COLUMN     "checksum_sha256" CHAR(64),
ADD COLUMN     "deleted_at" TIMESTAMPTZ(6),
ADD COLUMN     "deleted_by" UUID,
ADD COLUMN     "size_bytes" INTEGER,
ADD COLUMN     "verified_at" TIMESTAMPTZ(6),
ADD COLUMN     "visibility_changed_at" TIMESTAMPTZ(6),
ADD COLUMN     "visibility_changed_by" UUID;

-- AlterTable
ALTER TABLE "work_order_attachments" ADD COLUMN     "checksum_sha256" CHAR(64),
ADD COLUMN     "deleted_at" TIMESTAMPTZ(6),
ADD COLUMN     "deleted_by" UUID,
ADD COLUMN     "size_bytes" INTEGER,
ADD COLUMN     "verified_at" TIMESTAMPTZ(6),
ADD COLUMN     "visibility_changed_at" TIMESTAMPTZ(6),
ADD COLUMN     "visibility_changed_by" UUID;

-- CreateTable
CREATE TABLE "attachment_upload_intents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "uploaded_by" UUID NOT NULL,
    "target_type" VARCHAR(20) NOT NULL,
    "work_order_id" UUID NOT NULL,
    "service_report_id" UUID,
    "file_name" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "checksum_sha256" CHAR(64) NOT NULL,
    "visibility" VARCHAR(20) NOT NULL DEFAULT 'INTERNAL',
    "staging_key" VARCHAR(500) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'INITIATED',
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "attempt_id" UUID,
    "attempt_final_key" VARCHAR(500),
    "lease_expires_at" TIMESTAMPTZ(6),
    "work_order_attachment_id" UUID,
    "report_attachment_id" UUID,
    "attached_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attachment_upload_intents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachment_idempotency" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "operation" VARCHAR(20) NOT NULL,
    "key" UUID NOT NULL,
    "fingerprint" CHAR(64) NOT NULL,
    "upload_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attachment_idempotency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachment_cleanup_jobs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "upload_id" UUID NOT NULL,
    "kind" VARCHAR(20) NOT NULL,
    "object_key" VARCHAR(500) NOT NULL,
    "attempt_id" UUID,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "not_before" TIMESTAMPTZ(6) NOT NULL,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "claim_id" UUID,
    "lease_expires_at" TIMESTAMPTZ(6),
    "last_error_code" VARCHAR(80),
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attachment_cleanup_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uq_attachment_upload_staging_key" ON "attachment_upload_intents"("staging_key");

-- CreateIndex
CREATE UNIQUE INDEX "uq_attachment_upload_wo_result" ON "attachment_upload_intents"("work_order_attachment_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_attachment_upload_report_result" ON "attachment_upload_intents"("report_attachment_id");

-- CreateIndex
CREATE INDEX "idx_attachment_upload_quota" ON "attachment_upload_intents"("tenant_id", "work_order_id", "target_type", "status", "expires_at");

-- CreateIndex
CREATE INDEX "idx_attachment_upload_expiry" ON "attachment_upload_intents"("status", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "uq_attachment_upload_tenant_id" ON "attachment_upload_intents"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_attachment_upload_actor_id" ON "attachment_upload_intents"("tenant_id", "uploaded_by", "id");

-- CreateIndex
CREATE INDEX "idx_attachment_idempotency_upload" ON "attachment_idempotency"("tenant_id", "upload_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_attachment_idempotency_scope" ON "attachment_idempotency"("tenant_id", "user_id", "operation", "key");

-- CreateIndex
CREATE UNIQUE INDEX "uq_attachment_cleanup_object" ON "attachment_cleanup_jobs"("object_key");

-- CreateIndex
CREATE INDEX "idx_attachment_cleanup_ready" ON "attachment_cleanup_jobs"("status", "not_before", "lease_expires_at");

-- CreateIndex
CREATE INDEX "idx_attachment_cleanup_upload" ON "attachment_cleanup_jobs"("tenant_id", "upload_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_report_attachment_parent_id" ON "report_attachments"("tenant_id", "service_report_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_service_report_order_id" ON "service_reports"("tenant_id", "work_order_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_wo_attachment_parent_id" ON "work_order_attachments"("tenant_id", "work_order_id", "id");

-- AddForeignKey
ALTER TABLE "attachment_upload_intents" ADD CONSTRAINT "attachment_upload_intents_tenant_id_work_order_id_fkey" FOREIGN KEY ("tenant_id", "work_order_id") REFERENCES "work_orders"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "attachment_upload_intents" ADD CONSTRAINT "attachment_upload_intents_tenant_id_work_order_id_service__fkey" FOREIGN KEY ("tenant_id", "work_order_id", "service_report_id") REFERENCES "service_reports"("tenant_id", "work_order_id", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "attachment_upload_intents" ADD CONSTRAINT "attachment_upload_intents_tenant_id_work_order_id_work_ord_fkey" FOREIGN KEY ("tenant_id", "work_order_id", "work_order_attachment_id") REFERENCES "work_order_attachments"("tenant_id", "work_order_id", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "attachment_upload_intents" ADD CONSTRAINT "attachment_upload_intents_tenant_id_service_report_id_repo_fkey" FOREIGN KEY ("tenant_id", "service_report_id", "report_attachment_id") REFERENCES "report_attachments"("tenant_id", "service_report_id", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "attachment_idempotency" ADD CONSTRAINT "attachment_idempotency_tenant_id_user_id_upload_id_fkey" FOREIGN KEY ("tenant_id", "user_id", "upload_id") REFERENCES "attachment_upload_intents"("tenant_id", "uploaded_by", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "attachment_cleanup_jobs" ADD CONSTRAINT "attachment_cleanup_jobs_tenant_id_upload_id_fkey" FOREIGN KEY ("tenant_id", "upload_id") REFERENCES "attachment_upload_intents"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- ADR 0013: CHECK constraints intentionally remain raw SQL.
-- Legacy attachment metadata stays NULL as a complete tuple; no fabricated hashes.
ALTER TABLE work_order_attachments
 ADD CONSTRAINT wo_attachment_verified_check CHECK (
   (size_bytes IS NULL AND checksum_sha256 IS NULL AND verified_at IS NULL)
   OR (size_bytes IS NOT NULL AND size_bytes BETWEEN 1 AND 10485760
       AND checksum_sha256 IS NOT NULL AND checksum_sha256 ~ '^[0-9a-f]{64}$'
       AND verified_at IS NOT NULL)),
 ADD CONSTRAINT wo_attachment_deleted_check CHECK ((deleted_at IS NULL) = (deleted_by IS NULL)),
 ADD CONSTRAINT wo_attachment_visibility_audit_check CHECK ((visibility_changed_at IS NULL) = (visibility_changed_by IS NULL));

ALTER TABLE report_attachments
 ADD CONSTRAINT report_attachment_verified_check CHECK (
   (size_bytes IS NULL AND checksum_sha256 IS NULL AND verified_at IS NULL)
   OR (size_bytes IS NOT NULL AND size_bytes BETWEEN 1 AND 10485760
       AND checksum_sha256 IS NOT NULL AND checksum_sha256 ~ '^[0-9a-f]{64}$'
       AND verified_at IS NOT NULL)),
 ADD CONSTRAINT report_attachment_deleted_check CHECK ((deleted_at IS NULL) = (deleted_by IS NULL)),
 ADD CONSTRAINT report_attachment_visibility_audit_check CHECK ((visibility_changed_at IS NULL) = (visibility_changed_by IS NULL));

ALTER TABLE attachment_upload_intents
 ADD CONSTRAINT attachment_upload_target_check CHECK (
   (target_type = 'WORK_ORDER' AND service_report_id IS NULL)
   OR (target_type = 'REPORT' AND service_report_id IS NOT NULL)),
 ADD CONSTRAINT attachment_upload_file_check CHECK (
   size_bytes BETWEEN 1 AND 10485760
   AND mime_type IN ('image/jpeg','image/png','application/pdf')
   AND checksum_sha256 ~ '^[0-9a-f]{64}$'
   AND length(btrim(file_name)) > 0
   AND length(btrim(staging_key)) > 0
   AND visibility IN ('INTERNAL','CUSTOMER')
   AND expires_at > created_at),
 ADD CONSTRAINT attachment_upload_phase_check CHECK (
   (status = 'ATTACHED' AND attached_at IS NOT NULL AND (
       (target_type = 'WORK_ORDER' AND work_order_attachment_id IS NOT NULL AND report_attachment_id IS NULL)
       OR (target_type = 'REPORT' AND report_attachment_id IS NOT NULL AND work_order_attachment_id IS NULL)))
   OR (status IN ('INITIATED','EXPIRED','ABORTED') AND attached_at IS NULL
       AND work_order_attachment_id IS NULL AND report_attachment_id IS NULL)),
 ADD CONSTRAINT attachment_upload_attempt_check CHECK (
   (attempt_id IS NULL AND attempt_final_key IS NULL AND lease_expires_at IS NULL)
   OR (status = 'INITIATED' AND attempt_id IS NOT NULL AND attempt_final_key IS NOT NULL
       AND length(btrim(attempt_final_key)) > 0 AND attempt_final_key <> staging_key
       AND lease_expires_at IS NOT NULL));

ALTER TABLE attachment_idempotency
 ADD CONSTRAINT attachment_idempotency_operation_check CHECK (operation IN ('PREPARE','FINALIZE')),
 ADD CONSTRAINT attachment_idempotency_fingerprint_check CHECK (fingerprint ~ '^[0-9a-f]{64}$');

ALTER TABLE attachment_cleanup_jobs
 ADD CONSTRAINT attachment_cleanup_kind_check CHECK (
   (kind = 'STAGING' AND attempt_id IS NULL)
   OR (kind = 'FINAL' AND attempt_id IS NOT NULL)),
 ADD CONSTRAINT attachment_cleanup_object_check CHECK (length(btrim(object_key)) > 0 AND attempt_count >= 0),
 ADD CONSTRAINT attachment_cleanup_phase_check CHECK (
   (status = 'PENDING' AND claim_id IS NULL AND lease_expires_at IS NULL AND completed_at IS NULL)
   OR (status = 'CLAIMED' AND claim_id IS NOT NULL AND lease_expires_at IS NOT NULL AND completed_at IS NULL)
   OR (status = 'DONE' AND claim_id IS NULL AND lease_expires_at IS NULL AND completed_at IS NOT NULL));


-- Inventory M3 accountability additive migration: 0004_inventory_accountability
\connect inventory_db

-- Preserve pre-existing fractional catalog; new parts require explicit opt-in.
ALTER TABLE parts ADD COLUMN allow_fractional BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE parts ALTER COLUMN allow_fractional SET DEFAULT false;
ALTER TABLE stocks ADD COLUMN quantity_quarantined NUMERIC(12,2) NOT NULL DEFAULT 0
  CHECK (quantity_quarantined >= 0);
ALTER TABLE work_order_parts
  ADD COLUMN quantity_confirmed_used NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN part_snapshot JSONB,
  ADD COLUMN warehouse_snapshot JSONB,
  ADD CONSTRAINT usage_reconciliation CHECK (quantity_confirmed_used >= 0
    AND quantity_confirmed_used + quantity_returned <= quantity_used);

ALTER TABLE stock_transactions
  ADD COLUMN reason_code VARCHAR(40),
  ADD COLUMN document_reference VARCHAR(150),
  ADD COLUMN related_transaction_id UUID,
  ADD COLUMN return_condition VARCHAR(30) CHECK (return_condition IN ('GOOD','DAMAGED','PENDING_INSPECTION')),
  ADD COLUMN part_snapshot JSONB,
  ADD COLUMN warehouse_snapshot JSONB,
  ADD COLUMN quarantine_before NUMERIC(12,2),
  ADD COLUMN quarantine_after NUMERIC(12,2);
ALTER TABLE stock_transactions DROP CONSTRAINT stock_transactions_type_check;
ALTER TABLE stock_transactions ADD CONSTRAINT stock_transactions_type_check
  CHECK (type IN ('RECEIVE','ISSUE','RETURN','ADJUST_IN','ADJUST_OUT','RELEASE','SCRAP'));
ALTER TABLE stock_transactions DROP CONSTRAINT stock_transactions_balances;
ALTER TABLE stock_transactions ADD CONSTRAINT stock_transactions_balances CHECK (
  (balance_before IS NULL AND balance_after IS NULL) OR
  (balance_before IS NOT NULL AND balance_after IS NOT NULL AND balance_before >= 0 AND balance_after >= 0
    AND balance_after = balance_before + CASE
      WHEN type IN ('RECEIVE','ADJUST_IN','RELEASE') OR (type = 'RETURN' AND COALESCE(return_condition,'GOOD') = 'GOOD') THEN quantity
      WHEN type IN ('ISSUE','ADJUST_OUT') THEN -quantity ELSE 0 END));
ALTER TABLE stock_transactions ADD CONSTRAINT stock_transactions_quarantine_balances CHECK (
  (quarantine_before IS NULL AND quarantine_after IS NULL) OR
  (quarantine_before IS NOT NULL AND quarantine_after IS NOT NULL AND quarantine_before >= 0 AND quarantine_after >= 0
    AND quarantine_after = quarantine_before + CASE
      WHEN type = 'RETURN' AND return_condition IN ('DAMAGED','PENDING_INSPECTION') THEN quantity
      WHEN type IN ('RELEASE','SCRAP') THEN -quantity ELSE 0 END));

ALTER TABLE inventory_operations DROP CONSTRAINT inventory_operations_operation_check;
ALTER TABLE inventory_operations ADD CONSTRAINT inventory_operations_operation_check
  CHECK (operation IN ('RECEIVE','ADJUST','ISSUE','RETURN','INSPECT','CONFIRM_USE','REVERSE_USE'));

CREATE TABLE usage_confirmations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  work_order_part_id UUID NOT NULL,
  work_order_id UUID NOT NULL,
  equipment_id UUID NOT NULL,
  customer_id UUID NOT NULL,
  service_report_id UUID NOT NULL,
  work_order_no VARCHAR(100) NOT NULL,
  kind VARCHAR(20) NOT NULL CHECK (kind IN ('CONFIRM','REVERSE')),
  quantity NUMERIC(12,2) NOT NULL CHECK (quantity > 0),
  reverses_id UUID UNIQUE,
  customer_reason VARCHAR(2000) NOT NULL,
  removed_part_disposition VARCHAR(40) NOT NULL,
  removed_part_note VARCHAR(2000),
  note TEXT,
  actor_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT usage_confirmations_tenant_id_work_order_part_id_fkey
    FOREIGN KEY(tenant_id,work_order_part_id) REFERENCES work_order_parts(tenant_id,id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  CHECK ((kind = 'REVERSE') = (reverses_id IS NOT NULL)),
  CHECK (removed_part_disposition IN ('NOT_APPLICABLE','RETURNED_TO_CUSTOMER','RETAINED_FOR_REVIEW','DISPOSED_WITH_CONSENT'))
);
CREATE INDEX idx_usage_confirmations_equipment ON usage_confirmations(tenant_id,equipment_id,customer_id,created_at);
CREATE TABLE inventory_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  entity_type VARCHAR(30) NOT NULL,
  entity_id UUID NOT NULL,
  action VARCHAR(30) NOT NULL,
  actor_id UUID NOT NULL,
  before JSONB,
  after JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_inventory_audit_entity ON inventory_audit(tenant_id,entity_type,entity_id,created_at);


-- Inventory M3 accountability additive migration: 0005_internal_cost_currency
\connect inventory_db

-- Legacy reference costs retain an explicitly unknown currency.
ALTER TABLE work_order_parts ADD COLUMN unit_cost_currency CHAR(3),
  ADD CONSTRAINT work_order_parts_cost_currency CHECK
    (unit_cost_currency IS NULL OR (unit_cost IS NOT NULL AND unit_cost_currency ~ '^[A-Z]{3}$'));


-- ADR 0016 / Work Order 0006: Inventory hold ownership, additive migration.
\connect workorder_db
-- ADR 0014 / 0016: local durable holds, no Inventory DB references/FKs.
CREATE TABLE "work_order_inventory_reservations" (
  "tenant_id" UUID NOT NULL,
  "request_id" UUID NOT NULL,
  "work_order_id" UUID NOT NULL,
  "fingerprint" CHAR(64) NOT NULL,
  "actor_id" UUID NOT NULL,
  "inventory_request" JSONB NOT NULL,
  "state" VARCHAR(20) NOT NULL,
  "inventory_usage_id" UUID,
  "stock_transaction_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "settled_at" TIMESTAMPTZ(6),
  CONSTRAINT "work_order_inventory_reservations_pkey" PRIMARY KEY ("tenant_id", "request_id"),
  CONSTRAINT "fk_wo_inventory_reservation_order" FOREIGN KEY ("tenant_id", "work_order_id") REFERENCES "work_orders"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "wo_inventory_reservation_identity_check" CHECK (
    fingerprint ~ '^[0-9a-f]{64}$' AND jsonb_typeof(inventory_request) = 'object'
  ),
  CONSTRAINT "wo_inventory_reservation_phase_check" CHECK (
    (state = 'HELD' AND settled_at IS NULL AND inventory_usage_id IS NULL AND stock_transaction_id IS NULL)
    OR (state = 'RELEASED' AND settled_at IS NOT NULL AND inventory_usage_id IS NULL AND stock_transaction_id IS NULL)
    OR (state = 'COMMITTED' AND settled_at IS NOT NULL AND inventory_usage_id IS NOT NULL AND stock_transaction_id IS NOT NULL)
  )
);
CREATE UNIQUE INDEX "uq_wo_inventory_reservation_usage" ON "work_order_inventory_reservations"("tenant_id", "inventory_usage_id");
CREATE UNIQUE INDEX "uq_wo_inventory_reservation_transaction" ON "work_order_inventory_reservations"("tenant_id", "stock_transaction_id");
CREATE INDEX "idx_wo_inventory_reservation_held" ON "work_order_inventory_reservations"("tenant_id", "work_order_id", "state");


-- ADR 0018: model-based service policies (additive; legacy sources remain NULL).
\connect asset_db

-- asset-service / 20261104090000_model_policies
-- AlterTable
ALTER TABLE "equipment_registrations" ADD COLUMN     "maintenance_plan_ids" UUID[] DEFAULT ARRAY[]::UUID[],
ADD COLUMN     "policy_preview" JSONB;

-- AlterTable
ALTER TABLE "warranties" ADD COLUMN     "policy_snapshot" JSONB,
ADD COLUMN     "policy_version_id" UUID;

-- CreateTable
CREATE TABLE "model_warranty_revisions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "model_id" UUID NOT NULL,
    "revision" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "body" JSONB NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "model_warranty_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "model_warranty_revisions_tenant_id_model_id_revision_key" ON "model_warranty_revisions"("tenant_id", "model_id", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "model_warranty_revisions_tenant_id_id_key" ON "model_warranty_revisions"("tenant_id", "id");


CREATE UNIQUE INDEX uq_model_warranty_revisions_default ON model_warranty_revisions(tenant_id,model_id) WHERE is_default;
ALTER TABLE model_warranty_revisions ADD CHECK (status IN ('DRAFT','PUBLISHED','RETIRED')), ADD CHECK (NOT is_default OR status='PUBLISHED'), ADD CHECK (revision>0 AND version>0);


-- asset-service / 20261104091000_model_setup_phases
-- Preserve the legacy codec's exact phase invariant and add a separate model-policy codec.
ALTER TABLE equipment_registrations DROP CONSTRAINT equipment_registrations_phase_check;
ALTER TABLE equipment_registrations ADD CONSTRAINT equipment_registrations_phase_check CHECK (
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
);


-- asset-service / 20261104093000_policy_local_references
-- AddForeignKey
ALTER TABLE "warranties" ADD CONSTRAINT "warranties_tenant_id_policy_version_id_fkey" FOREIGN KEY ("tenant_id", "policy_version_id") REFERENCES "model_warranty_revisions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "model_warranty_revisions" ADD CONSTRAINT "model_warranty_revisions_tenant_id_model_id_fkey" FOREIGN KEY ("tenant_id", "model_id") REFERENCES "equipment_models"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;


\connect maintenance_db

-- maintenance-service / 20261104090000_model_policies
-- AlterTable
ALTER TABLE "maintenance_plans" ADD COLUMN     "checklist" JSONB,
ADD COLUMN     "policy_version_id" UUID,
ADD COLUMN     "setup_group_id" UUID,
ADD COLUMN     "setup_item_id" UUID;

-- AlterTable
ALTER TABLE "maintenance_tasks" ADD COLUMN     "checklist" JSONB,
ADD COLUMN     "policy_version_id" UUID;

-- CreateTable
CREATE TABLE "model_maintenance_revisions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "model_id" UUID NOT NULL,
    "revision" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "body" JSONB NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "model_maintenance_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_setup_groups" (
    "tenant_id" UUID NOT NULL,
    "registration_id" UUID NOT NULL,
    "equipment_id" UUID NOT NULL,
    "input_hash" CHAR(64) NOT NULL,
    "receipt" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "maintenance_setup_groups_pkey" PRIMARY KEY ("tenant_id","registration_id")
);

-- CreateTable
CREATE TABLE "model_policy_audit" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "model_id" UUID NOT NULL,
    "revision_id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "action" VARCHAR(20) NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "model_policy_audit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "model_maintenance_revisions_tenant_id_model_id_revision_key" ON "model_maintenance_revisions"("tenant_id", "model_id", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "model_maintenance_revisions_tenant_id_id_key" ON "model_maintenance_revisions"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "model_policy_audit_tenant_id_model_id_created_at_idx" ON "model_policy_audit"("tenant_id", "model_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "maintenance_plans_tenant_id_setup_group_id_setup_item_id_key" ON "maintenance_plans"("tenant_id", "setup_group_id", "setup_item_id");


CREATE UNIQUE INDEX uq_model_maintenance_revisions_default ON model_maintenance_revisions(tenant_id,model_id) WHERE is_default;
ALTER TABLE model_maintenance_revisions ADD CHECK (status IN ('DRAFT','PUBLISHED','RETIRED')), ADD CHECK (NOT is_default OR status='PUBLISHED'), ADD CHECK (revision>0 AND version>0);


-- maintenance-service / 20261104092000_task_customer_summary
ALTER TABLE maintenance_tasks ADD COLUMN instruction_title VARCHAR(200), ADD COLUMN completion_summary JSONB;


-- maintenance-service / 20261104093000_policy_local_references
-- AddForeignKey
ALTER TABLE "maintenance_plans" ADD CONSTRAINT "maintenance_plans_tenant_id_setup_group_id_fkey" FOREIGN KEY ("tenant_id", "setup_group_id") REFERENCES "maintenance_setup_groups"("tenant_id", "registration_id") ON DELETE RESTRICT ON UPDATE NO ACTION;


\connect workorder_db

-- workorder-service / 0007_model_policy_checklist
-- AlterTable
ALTER TABLE "work_orders" ADD COLUMN     "checklist" JSONB,
ADD COLUMN     "checklist_results" JSONB,
ADD COLUMN     "checklist_version" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "policy_version_id" UUID;

-- CreateTable
CREATE TABLE "work_order_checklist_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "work_order_id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "assignment_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "results" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_order_checklist_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "work_order_checklist_history_tenant_id_work_order_id_versio_key" ON "work_order_checklist_history"("tenant_id", "work_order_id", "version");



-- workorder-service / 0008_checklist_history_reference
-- AddForeignKey
ALTER TABLE "work_order_checklist_history" ADD CONSTRAINT "work_order_checklist_history_tenant_id_work_order_id_fkey" FOREIGN KEY ("tenant_id", "work_order_id") REFERENCES "work_orders"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;


\connect service_request_db

-- service-request-service / 0006_warranty_assessment
-- AlterTable
ALTER TABLE "service_requests" ADD COLUMN     "assessment_required" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "assessment_version" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "coverage_assessment" JSONB;

-- CreateTable
CREATE TABLE "warranty_assessment_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "assessment" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "warranty_assessment_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "warranty_assessment_history_tenant_id_request_id_version_key" ON "warranty_assessment_history"("tenant_id", "request_id", "version");


ALTER TABLE service_requests ADD COLUMN warranty_policy_snapshot JSONB, ADD COLUMN warranty_policy_version_id UUID;


-- service-request-service / 0007_customer_checklist_summary
ALTER TABLE service_requests ADD COLUMN resolution_checklist JSONB;


-- service-request-service / 0008_assessment_history_reference
-- AddForeignKey
ALTER TABLE "warranty_assessment_history" ADD CONSTRAINT "warranty_assessment_history_tenant_id_request_id_fkey" FOREIGN KEY ("tenant_id", "request_id") REFERENCES "service_requests"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- ADR 0020: per-rule service term; existing Plans remain unlimited.
\connect maintenance_db
ALTER TABLE maintenance_plans
  ADD COLUMN term_mode VARCHAR(20) NOT NULL DEFAULT 'UNLIMITED',
  ADD COLUMN term_years INTEGER,
  ADD COLUMN end_date DATE;
ALTER TABLE maintenance_plans ADD CONSTRAINT maintenance_plan_term_check CHECK (
  (term_mode = 'UNLIMITED' AND term_years IS NULL AND end_date IS NULL)
  OR (term_mode = 'YEARS' AND term_years IS NOT NULL AND term_years BETWEEN 1 AND 100 AND end_date IS NOT NULL)
  OR (term_mode = 'WARRANTY_END' AND term_years IS NULL AND end_date IS NOT NULL)
);

-- ADR 0021: registration delivery methods and explicit customer acceptance.
\connect asset_db
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

-- asset-service / 20261109101000_registration_legacy_phase_guard
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

-- ADR 0022: service management and primary-branch access (additive, no inferred history).
\connect organization_db
-- organization-service / 20261109120000_site_routing_version
ALTER TABLE customer_sites ADD COLUMN routing_version INTEGER NOT NULL DEFAULT 0 CHECK (routing_version >= 0);

\connect service_request_db
-- service-request-service / 20261109120000_branch_service_scope
ALTER TABLE service_requests ADD COLUMN branch_id UUID NULL;
CREATE INDEX service_requests_tenant_id_branch_id_idx ON service_requests(tenant_id, branch_id);

\connect workorder_db
-- workorder-service / 20261109120000_branch_service_scope
ALTER TABLE work_orders ADD COLUMN branch_id UUID NULL;
CREATE INDEX work_orders_tenant_id_branch_id_idx ON work_orders(tenant_id, branch_id);
CREATE TABLE site_branch_snapshots (tenant_id UUID NOT NULL, site_id UUID NOT NULL, branch_id UUID NULL, revision INTEGER NOT NULL CHECK (revision >= 0), PRIMARY KEY (tenant_id, site_id));

\connect notification_db
-- notification-service / 20261109120000_branch_service_scope
ALTER TABLE notifications ADD COLUMN branch_id UUID NULL;
CREATE INDEX notifications_tenant_id_branch_id_idx ON notifications(tenant_id, branch_id);
