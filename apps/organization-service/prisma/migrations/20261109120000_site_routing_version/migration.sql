ALTER TABLE customer_sites ADD COLUMN routing_version INTEGER NOT NULL DEFAULT 0 CHECK (routing_version >= 0);
