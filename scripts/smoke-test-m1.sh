#!/usr/bin/env bash
set -euo pipefail

# Set SEED_DEMO_PASSWORD to the password used by identity:seed:dev.
# Optional: GATEWAY_URL, TENANT_CODE, CUSTOMER_EMAIL, MANAGER_EMAIL,
# M1_EQUIPMENT_ID, WEB_ORIGIN.
exec node "$(dirname "$0")/smoke-test-m1.mjs"
