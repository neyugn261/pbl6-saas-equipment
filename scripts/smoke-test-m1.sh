#!/usr/bin/env bash
# ==============================================================================
# PBL6 — M1 Vertical Slice Smoke Test (Identity Service + API Gateway)
#
# Tests the full end-to-end slice through the API Gateway:
# 1. Gateway /health and CORS
# 2. Gateway /internal blocking
# 3. Gateway proxy to Identity Service
# 4. Auth flow: login, me
# 5. User management: invite technician -> activate -> login -> assign role -> lock -> unlock
#
# Prerequisites:
# - API Gateway running at GATEWAY_URL (default: http://localhost:3000)
# - Identity Service running at IDENTITY_SERVICE_URL (default: http://localhost:3001)
# - Databases initialized & seeded (tenant ACME-VN or seeded tenant)
# ==============================================================================

set -euo pipefail

GATEWAY_URL="${GATEWAY_URL:-http://localhost:3000}"
TENANT_CODE="${TENANT_CODE:-ACME-VN}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@acme.vn}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-Admin#Pass123}"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

pass() { echo -e "  [${GREEN}PASS${NC}] $1"; }
fail() { echo -e "  [${RED}FAIL${NC}] $1"; exit 1; }
info() { echo -e "\n${YELLOW}==>${NC} $1"; }

info "1. Testing API Gateway endpoints"

# 1.1 Gateway /health
res=$(curl -s -w "\n%{http_code}" "$GATEWAY_URL/health")
code=$(echo "$res" | tail -n1)
body=$(echo "$res" | head -n -1)
if [ "$code" -eq 200 ] && echo "$body" | grep -q '"status":"ok"'; then
  pass "GET /health returned 200 OK"
else
  fail "GET /health expected 200, got $code: $body"
fi

# 1.2 Internal endpoint blocking (must be 404)
code=$(curl -s -o /dev/null -w "%{http_code}" "$GATEWAY_URL/api/internal/users/00000000-0000-0000-0000-000000000000")
if [ "$code" -eq 404 ]; then
  pass "GET /api/internal/users/:id blocked with 404"
else
  fail "GET /api/internal/users/:id expected 404, got $code"
fi

code=$(curl -s -o /dev/null -w "%{http_code}" "$GATEWAY_URL/api/identity/internal/users")
if [ "$code" -eq 404 ]; then
  pass "GET /api/identity/internal/users blocked with 404"
else
  fail "GET /api/identity/internal/users expected 404, got $code"
fi

# 1.3 CORS preflight
res=$(curl -s -I -X OPTIONS "$GATEWAY_URL/health" \
  -H "Origin: http://localhost:3000" \
  -H "Access-Control-Request-Method: GET")
if echo "$res" | grep -iq "access-control-allow-origin"; then
  pass "OPTIONS /health returned CORS headers"
else
  fail "OPTIONS /health did not return CORS headers"
fi

info "2. Testing Identity Service through Gateway ($GATEWAY_URL/api/identity)"

# 2.1 Identity health
res=$(curl -s -w "\n%{http_code}" "$GATEWAY_URL/api/identity/health")
code=$(echo "$res" | tail -n1)
if [ "$code" -eq 200 ]; then
  pass "GET /api/identity/health proxied successfully (200 OK)"
else
  fail "GET /api/identity/health expected 200, got $code"
fi

# 2.2 Login as Tenant Admin
info "3. Logging in as Tenant Admin ($ADMIN_EMAIL)"
login_payload=$(cat <<EOF
{
  "tenantCode": "$TENANT_CODE",
  "email": "$ADMIN_EMAIL",
  "password": "$ADMIN_PASSWORD"
}
EOF
)

res=$(curl -s -w "\n%{http_code}" -X POST "$GATEWAY_URL/api/identity/auth/login" \
  -H "Content-Type: application/json" \
  -d "$login_payload")
code=$(echo "$res" | tail -n1)
body=$(echo "$res" | head -n -1)

if [ "$code" -eq 200 ]; then
  ADMIN_TOKEN=$(echo "$body" | grep -o '"accessToken":"[^"]*' | cut -d'"' -f4)
  pass "Logged in as Tenant Admin (token received)"
else
  fail "POST /api/identity/auth/login failed ($code): $body"
fi

# 2.3 Verify /auth/me
me_res=$(curl -s -w "\n%{http_code}" "$GATEWAY_URL/api/identity/auth/me" \
  -H "Authorization: Bearer $ADMIN_TOKEN")
code=$(echo "$me_res" | tail -n1)
if [ "$code" -eq 200 ]; then
  pass "GET /api/identity/auth/me returned 200"
else
  fail "GET /api/identity/auth/me expected 200, got $code"
fi

# 2.4 Invite Technician
info "4. Inviting a Technician"
RANDOM_SUFFIX=$((RANDOM % 9000 + 1000))
TECH_EMAIL="tech_${RANDOM_SUFFIX}@example.com"
invite_payload=$(cat <<EOF
{
  "email": "$TECH_EMAIL",
  "fullName": "Test Technician $RANDOM_SUFFIX",
  "userType": "TENANT_STAFF",
  "roles": ["TECHNICIAN"]
}
EOF
)

invite_res=$(curl -s -w "\n%{http_code}" -X POST "$GATEWAY_URL/api/identity/users" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$invite_payload")
code=$(echo "$invite_res" | tail -n1)
body=$(echo "$invite_res" | head -n -1)

if [ "$code" -eq 201 ]; then
  TECH_ID=$(echo "$body" | grep -o '"id":"[^"]*' | head -n1 | cut -d'"' -f4)
  ACT_TOKEN=$(echo "$body" | grep -o '"activationToken":"[^"]*' | cut -d'"' -f4)
  pass "Invited technician: $TECH_EMAIL (ID: $TECH_ID)"
else
  fail "POST /api/identity/users failed ($code): $body"
fi

# 2.5 Activate Technician Account
info "5. Activating Technician Account"
TECH_PASSWORD="Tech#Password123"
activate_payload=$(cat <<EOF
{
  "token": "$ACT_TOKEN",
  "password": "$TECH_PASSWORD"
}
EOF
)

act_res=$(curl -s -w "\n%{http_code}" -X POST "$GATEWAY_URL/api/identity/users/activate" \
  -H "Content-Type: application/json" \
  -d "$activate_payload")
code=$(echo "$act_res" | tail -n1)
if [ "$code" -eq 200 ]; then
  pass "Technician account activated successfully"
else
  fail "POST /api/identity/users/activate failed ($code)"
fi

# 2.6 Log in as newly activated Technician
tech_login_payload=$(cat <<EOF
{
  "tenantCode": "$TENANT_CODE",
  "email": "$TECH_EMAIL",
  "password": "$TECH_PASSWORD"
}
EOF
)
tech_login=$(curl -s -w "\n%{http_code}" -X POST "$GATEWAY_URL/api/identity/auth/login" \
  -H "Content-Type: application/json" \
  -d "$tech_login_payload")
code=$(echo "$tech_login" | tail -n1)
if [ "$code" -eq 200 ]; then
  pass "Newly activated technician logged in successfully"
else
  fail "Technician login failed ($code)"
fi

# 2.7 Assign additional role
info "6. Assigning roles (TECHNICIAN + INVENTORY_STAFF)"
role_payload='{"roles":["TECHNICIAN","INVENTORY_STAFF"]}'
role_res=$(curl -s -w "\n%{http_code}" -X PATCH "$GATEWAY_URL/api/identity/users/$TECH_ID/roles" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$role_payload")
code=$(echo "$role_res" | tail -n1)
if [ "$code" -eq 200 ]; then
  pass "Updated roles to [TECHNICIAN, INVENTORY_STAFF]"
else
  fail "PATCH /api/identity/users/:id/roles failed ($code)"
fi

# 2.8 Lock Technician account (SUSPENDED)
info "7. Locking account (ACTIVE -> SUSPENDED)"
lock_payload='{"status":"SUSPENDED"}'
lock_res=$(curl -s -w "\n%{http_code}" -X POST "$GATEWAY_URL/api/identity/users/$TECH_ID/status" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$lock_payload")
code=$(echo "$lock_res" | tail -n1)
if [ "$code" -eq 200 ]; then
  pass "Account suspended"
else
  fail "POST /api/identity/users/:id/status failed ($code)"
fi

# Verify technician cannot log in
tech_login_blocked=$(curl -s -w "\n%{http_code}" -X POST "$GATEWAY_URL/api/identity/auth/login" \
  -H "Content-Type: application/json" \
  -d "$tech_login_payload")
code=$(echo "$tech_login_blocked" | tail -n1)
if [ "$code" -eq 403 ]; then
  pass "Suspended technician login blocked with 403"
else
  fail "Expected 403 for suspended login, got $code"
fi

# 2.9 Unlock Technician account (SUSPENDED -> ACTIVE)
info "8. Unlocking account (SUSPENDED -> ACTIVE)"
unlock_payload='{"status":"ACTIVE"}'
unlock_res=$(curl -s -w "\n%{http_code}" -X POST "$GATEWAY_URL/api/identity/users/$TECH_ID/status" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$unlock_payload")
code=$(echo "$unlock_res" | tail -n1)
if [ "$code" -eq 200 ]; then
  pass "Account re-activated"
else
  fail "Unlocking account failed ($code)"
fi

# Verify technician can log in again
tech_login_again=$(curl -s -w "\n%{http_code}" -X POST "$GATEWAY_URL/api/identity/auth/login" \
  -H "Content-Type: application/json" \
  -d "$tech_login_payload")
code=$(echo "$tech_login_again" | tail -n1)
if [ "$code" -eq 200 ]; then
  pass "Re-activated technician logged in successfully"
else
  fail "Expected 200 for re-activated login, got $code"
fi

echo -e "\n${GREEN}======================================================${NC}"
echo -e "${GREEN}   M1 VERTICAL SLICE SMOKE TEST PASSED SUCCESSFULLY   ${NC}"
echo -e "${GREEN}======================================================${NC}"
