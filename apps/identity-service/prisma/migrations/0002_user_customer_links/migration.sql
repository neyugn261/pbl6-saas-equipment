-- ============================================================================
-- identity_db 0002_user_customer_links
-- ADR 0003 (customer scope): local read model of
-- organization_db.customer_user_memberships, fed by the
-- CustomerMembershipChanged event. Identity puts `customer_id` into the access
-- token of a CUSTOMER account from this table, so other services can limit
-- that account to its own customer without calling Organization Service.
-- Additive only: no existing object is changed.
-- ============================================================================

CREATE TABLE user_customer_links (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL, -- Logical reference to organization_db.tenants.id
    customer_id UUID NOT NULL, -- Logical reference to organization_db.customers.id
    membership_id UUID NOT NULL, -- Logical reference to organization_db.customer_user_memberships.id
    status VARCHAR(30) NOT NULL CHECK (status IN ('ACTIVE', 'INACTIVE')),
    -- updated_at of the membership in Organization; an event older than this is ignored.
    source_changed_at TIMESTAMPTZ NOT NULL,
    synced_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_user_customer_links_customer
    ON user_customer_links (tenant_id, customer_id);

-- Only a CUSTOMER account of the same tenant can be linked to a customer.
CREATE OR REPLACE FUNCTION enforce_user_customer_link()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_user_type VARCHAR(20);
    v_tenant_id UUID;
BEGIN
    SELECT user_type, tenant_id INTO v_user_type, v_tenant_id
    FROM users WHERE id = NEW.user_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'User % does not exist', NEW.user_id;
    END IF;
    IF v_user_type <> 'CUSTOMER' THEN
        RAISE EXCEPTION 'Only CUSTOMER accounts can be linked to a customer (user %)', NEW.user_id;
    END IF;
    IF v_tenant_id IS DISTINCT FROM NEW.tenant_id THEN
        RAISE EXCEPTION 'Customer link tenant does not match the account tenant (user %)', NEW.user_id;
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER trg_user_customer_links_guard
BEFORE INSERT OR UPDATE OF user_id, tenant_id ON user_customer_links
FOR EACH ROW EXECUTE FUNCTION enforce_user_customer_link();
