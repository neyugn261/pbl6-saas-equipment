-- ============================================================================
-- PBL6 - PostgreSQL bootstrap (database-per-microservice)
--
-- Only creates the eight logical databases. Tables, indexes, triggers and seed
-- data are owned by each microservice through its own Prisma migrations.
-- Design reference: docs/erd/pbl6-schema-v3.1.sql
--
-- Docker runs this once, when the postgres_data volume is empty.
-- Re-runnable manually: psql -U pbl6 -d postgres -f infrastructure/postgres/init.sql
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
