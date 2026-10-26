-- ============================================================================
-- PBL6 - development-only databases (not service-owned business data)
--
--   *_shadow_db  scratch databases for `prisma migrate dev` and drift checks;
--                Prisma wipes them on every run.
--   *_test_db    databases for e2e suites that truncate tables.
--
-- Docker runs this once, after 01-init.sql, when the postgres_data volume is
-- empty. On an existing volume run (bash or PowerShell):
--   docker compose up -d
--   docker compose exec postgres psql -U pbl6 -d postgres -f /docker-entrypoint-initdb.d/02-dev-databases.sql
-- ============================================================================
\set ON_ERROR_STOP on

SELECT 'CREATE DATABASE identity_shadow_db' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'identity_shadow_db')\gexec
SELECT 'CREATE DATABASE organization_shadow_db' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'organization_shadow_db')\gexec
SELECT 'CREATE DATABASE asset_shadow_db' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'asset_shadow_db')\gexec
SELECT 'CREATE DATABASE service_request_shadow_db' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'service_request_shadow_db')\gexec
SELECT 'CREATE DATABASE workorder_shadow_db' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'workorder_shadow_db')\gexec
SELECT 'CREATE DATABASE maintenance_shadow_db' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'maintenance_shadow_db')\gexec
SELECT 'CREATE DATABASE inventory_shadow_db' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'inventory_shadow_db')\gexec
SELECT 'CREATE DATABASE notification_shadow_db' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'notification_shadow_db')\gexec

SELECT 'CREATE DATABASE identity_test_db' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'identity_test_db')\gexec
SELECT 'CREATE DATABASE organization_test_db' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'organization_test_db')\gexec
SELECT 'CREATE DATABASE asset_test_db' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'asset_test_db')\gexec
SELECT 'CREATE DATABASE service_request_test_db' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'service_request_test_db')\gexec
SELECT 'CREATE DATABASE workorder_test_db' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'workorder_test_db')\gexec
