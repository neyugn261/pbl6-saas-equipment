# ==============================================================================
# PBL6 — M1 Vertical Slice Smoke Test (PowerShell for Windows)
#
# Tests the full end-to-end slice through the API Gateway:
# 1. Gateway /health and CORS
# 2. Gateway /internal blocking
# 3. Gateway proxy to Identity Service
# 4. Auth flow: login, me
# 5. User management: invite technician -> activate -> login -> assign role -> lock -> unlock
# ==============================================================================

param(
  [string]$GatewayUrl = "http://localhost:3000",
  [string]$TenantCode = "ACME-VN",
  [string]$AdminEmail = "admin@acme.vn",
  [string]$AdminPassword = "Admin#Pass123"
)

$ErrorActionPreference = "Stop"

function Pass($msg) { Write-Host "  [PASS] $msg" -ForegroundColor Green }
function Fail($msg) { Write-Host "  [FAIL] $msg" -ForegroundColor Red; exit 1 }
function Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Yellow }

Step "1. Testing API Gateway endpoints ($GatewayUrl)"

# 1.1 Gateway /health
try {
  $res = Invoke-RestMethod -Uri "$GatewayUrl/health" -Method Get
  if ($res.status -eq "ok") { Pass "GET /health returned 200 OK" }
  else { Fail "GET /health unexpected body: $res" }
} catch {
  Fail "GET /health failed: $_"
}

# 1.2 Internal endpoint blocking (must be 404)
try {
  Invoke-RestMethod -Uri "$GatewayUrl/api/internal/users/00000000-0000-0000-0000-000000000000" -Method Get
  Fail "Expected 404 for /api/internal/users"
} catch {
  if ($_.Exception.Response.StatusCode -eq 404) { Pass "GET /api/internal/users/:id blocked with 404" }
  else { Fail "Expected 404, got $($_.Exception.Response.StatusCode)" }
}

try {
  Invoke-RestMethod -Uri "$GatewayUrl/api/identity/internal/users" -Method Get
  Fail "Expected 404 for /api/identity/internal/users"
} catch {
  if ($_.Exception.Response.StatusCode -eq 404) { Pass "GET /api/identity/internal/users blocked with 404" }
  else { Fail "Expected 404, got $($_.Exception.Response.StatusCode)" }
}

Step "2. Testing Identity Service through Gateway"

# 2.1 Identity health through gateway
try {
  $res = Invoke-RestMethod -Uri "$GatewayUrl/api/identity/health" -Method Get
  if ($res.status -eq "ok") { Pass "GET /api/identity/health proxied successfully" }
  else { Fail "GET /api/identity/health unexpected body: $res" }
} catch {
  Fail "GET /api/identity/health failed: $_"
}

Step "3. Logging in as Tenant Admin ($AdminEmail)"
try {
  $body = @{
    tenantCode = $TenantCode
    email = $AdminEmail
    password = $AdminPassword
  } | ConvertTo-Json

  $loginRes = Invoke-RestMethod -Uri "$GatewayUrl/api/identity/auth/login" -Method Post -Body $body -ContentType "application/json"
  $AdminToken = $loginRes.accessToken
  Pass "Logged in as Tenant Admin (token received)"
} catch {
  Fail "Admin login failed: $_"
}

# 3.2 Verify /auth/me
try {
  $meRes = Invoke-RestMethod -Uri "$GatewayUrl/api/identity/auth/me" -Method Get -Headers @{ Authorization = "Bearer $AdminToken" }
  Pass "GET /api/identity/auth/me returned 200 (Caller: $($meRes.email))"
} catch {
  Fail "GET /auth/me failed: $_"
}

Step "4. Inviting a Technician"
$randomId = Get-Random -Minimum 1000 -Maximum 9999
$techEmail = "tech_$randomId@example.com"
$techPassword = "Tech#Password123"

try {
  $inviteBody = @{
    email = $techEmail
    fullName = "Test Technician $randomId"
    userType = "TENANT_STAFF"
    roles = @("TECHNICIAN")
  } | ConvertTo-Json

  $inviteRes = Invoke-RestMethod -Uri "$GatewayUrl/api/identity/users" -Method Post -Body $inviteBody -ContentType "application/json" -Headers @{ Authorization = "Bearer $AdminToken" }
  $techId = $inviteRes.user.id
  $actToken = $inviteRes.activationToken
  Pass "Invited technician: $techEmail (ID: $techId)"
} catch {
  Fail "Invite technician failed: $_"
}

Step "5. Activating Technician Account"
try {
  $actBody = @{
    token = $actToken
    password = $techPassword
  } | ConvertTo-Json

  $actRes = Invoke-RestMethod -Uri "$GatewayUrl/api/identity/users/activate" -Method Post -Body $actBody -ContentType "application/json"
  Pass "Technician account activated successfully"
} catch {
  Fail "Activate account failed: $_"
}

# Login as newly activated technician
try {
  $techLoginBody = @{
    tenantCode = $TenantCode
    email = $techEmail
    password = $techPassword
  } | ConvertTo-Json

  $techLogin = Invoke-RestMethod -Uri "$GatewayUrl/api/identity/auth/login" -Method Post -Body $techLoginBody -ContentType "application/json"
  Pass "Newly activated technician logged in successfully"
} catch {
  Fail "Technician login failed: $_"
}

Step "6. Assigning roles (TECHNICIAN + INVENTORY_STAFF)"
try {
  $roleBody = @{ roles = @("TECHNICIAN", "INVENTORY_STAFF") } | ConvertTo-Json
  $roleRes = Invoke-RestMethod -Uri "$GatewayUrl/api/identity/users/$techId/roles" -Method Patch -Body $roleBody -ContentType "application/json" -Headers @{ Authorization = "Bearer $AdminToken" }
  Pass "Updated roles to: $($roleRes.roles -join ', ')"
} catch {
  Fail "Role assignment failed: $_"
}

Step "7. Locking account (ACTIVE -> SUSPENDED)"
try {
  $lockBody = @{ status = "SUSPENDED" } | ConvertTo-Json
  $lockRes = Invoke-RestMethod -Uri "$GatewayUrl/api/identity/users/$techId/status" -Method Post -Body $lockBody -ContentType "application/json" -Headers @{ Authorization = "Bearer $AdminToken" }
  Pass "Account suspended"
} catch {
  Fail "Suspend account failed: $_"
}

# Verify login blocked
try {
  Invoke-RestMethod -Uri "$GatewayUrl/api/identity/auth/login" -Method Post -Body $techLoginBody -ContentType "application/json"
  Fail "Expected 403 for suspended user login"
} catch {
  if ($_.Exception.Response.StatusCode -eq 403) { Pass "Suspended technician login blocked with 403" }
  else { Fail "Expected 403, got $($_.Exception.Response.StatusCode)" }
}

Step "8. Unlocking account (SUSPENDED -> ACTIVE)"
try {
  $unlockBody = @{ status = "ACTIVE" } | ConvertTo-Json
  $unlockRes = Invoke-RestMethod -Uri "$GatewayUrl/api/identity/users/$techId/status" -Method Post -Body $unlockBody -ContentType "application/json" -Headers @{ Authorization = "Bearer $AdminToken" }
  Pass "Account re-activated"
} catch {
  Fail "Re-activate account failed: $_"
}

# Verify login works again
try {
  Invoke-RestMethod -Uri "$GatewayUrl/api/identity/auth/login" -Method Post -Body $techLoginBody -ContentType "application/json"
  Pass "Re-activated technician logged in successfully"
} catch {
  Fail "Re-activated login failed: $_"
}

Write-Host "`n======================================================" -ForegroundColor Green
Write-Host "   M1 VERTICAL SLICE SMOKE TEST PASSED SUCCESSFULLY   " -ForegroundColor Green
Write-Host "======================================================`n" -ForegroundColor Green
