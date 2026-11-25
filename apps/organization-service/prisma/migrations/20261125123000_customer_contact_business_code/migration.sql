-- Optional, caller-supplied business code for batch import lookups.
-- Existing contacts remain valid and continue to be discoverable by ID/list.
ALTER TABLE customer_contacts
    ADD COLUMN code VARCHAR(50);

CREATE UNIQUE INDEX uq_customer_contacts_live_code
    ON customer_contacts (tenant_id, customer_id, code)
    WHERE code IS NOT NULL AND deleted_at IS NULL;
