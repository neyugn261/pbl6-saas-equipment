$ErrorActionPreference = 'Stop'

# Set SEED_DEMO_PASSWORD to the password used by identity:seed:dev.
# Optional: GATEWAY_URL, TENANT_CODE, CUSTOMER_EMAIL, MANAGER_EMAIL,
# M1_EQUIPMENT_ID, WEB_ORIGIN.
node (Join-Path $PSScriptRoot 'smoke-test-m1.mjs')
exit $LASTEXITCODE
