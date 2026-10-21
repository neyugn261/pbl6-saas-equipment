-- ============================================================================
-- identity_db 0001_init
-- Source: docs/erd/pbl6-schema-v3.1.sql, section "1. identity_db" (copied
-- verbatim). See docs/decisions/0001-database-v3.1.md.
--
-- PostgreSQL-specific objects that schema.prisma cannot represent are kept
-- here and MUST NOT be dropped by later migrations:
--   * CHECK constraints on roles, users, auth_sessions, account_tokens,
--     tenant_directory
--   * Expression/partial unique indexes uq_users_tenant_email,
--     uq_users_platform_email and partial index idx_auth_sessions_user_active
--   * Triggers trg_user_roles_type_guard, trg_users_type_immutable_when_assigned,
--     trg_roles_type_immutable_when_assigned and their functions
-- The fixed role catalog is seeded at the end (ADR 0001: roles are seeded by
-- migration). Permissions are seeded separately (catalog not yet approved).
-- ============================================================================

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
