param([string]$BaseUrl = 'http://localhost:3000/api/identity')

$envFile = Join-Path $PSScriptRoot '..\..\..\.env'
$passwordLine = Get-Content -LiteralPath $envFile | Where-Object { $_ -match '^SEED_DEMO_PASSWORD=' } | Select-Object -First 1
if (-not $passwordLine) { throw 'SEED_DEMO_PASSWORD is missing from the root .env' }
$password = $passwordLine.Substring($passwordLine.IndexOf('=') + 1).Trim('"')
$accounts = @(
  @{ email = 'platform.admin@pbl6.local'; role = 'PLATFORM_ADMIN'; platform = $true },
  @{ email = 'tenant.admin@demo.local'; role = 'TENANT_ADMIN' },
  @{ email = 'service.manager@demo.local'; role = 'SERVICE_MANAGER' },
  @{ email = 'dispatcher@demo.local'; role = 'DISPATCHER' },
  @{ email = 'inventory@demo.local'; role = 'INVENTORY_STAFF' },
  @{ email = 'technician@demo.local'; role = 'TECHNICIAN' },
  @{ email = 'customer.admin@demo.local'; role = 'CUSTOMER_ADMIN'; customer = $true },
  @{ email = 'customer.user@demo.local'; role = 'CUSTOMER_USER'; customer = $true }
)

$results = foreach ($account in $accounts) {
  $body = @{ email = $account.email; password = $password }
  if (-not $account.platform) { $body.tenantCode = 'DEMO' }
  try {
    $login = Invoke-RestMethod -Uri "$BaseUrl/auth/login" -Method Post -ContentType 'application/json' -Body ($body | ConvertTo-Json -Compress) -TimeoutSec 10
    $headers = @{ Authorization = "Bearer $($login.accessToken)" }
    $me = Invoke-RestMethod -Uri "$BaseUrl/auth/me" -Headers $headers -TimeoutSec 10
    $valid = ($me.roles -contains $account.role) -and ([bool]$me.customerId -eq [bool]$account.customer)
    $refresh = Invoke-RestMethod -Uri "$BaseUrl/auth/refresh" -Method Post -ContentType 'application/json' -Body (@{ refreshToken = $login.refreshToken } | ConvertTo-Json -Compress) -TimeoutSec 10
    $rotated = $refresh.refreshToken -ne $login.refreshToken
    $meAfterRefresh = Invoke-RestMethod -Uri "$BaseUrl/auth/me" -Headers @{ Authorization = "Bearer $($refresh.accessToken)" } -TimeoutSec 10
    Invoke-RestMethod -Uri "$BaseUrl/auth/logout" -Method Post -ContentType 'application/json' -Body (@{ refreshToken = $refresh.refreshToken } | ConvertTo-Json -Compress) -TimeoutSec 10 | Out-Null
    $loggedOut = $false
    try { Invoke-RestMethod -Uri "$BaseUrl/auth/me" -Headers @{ Authorization = "Bearer $($refresh.accessToken)" } -TimeoutSec 10 | Out-Null }
    catch { $loggedOut = [int]$_.Exception.Response.StatusCode -eq 401 }
    [pscustomobject]@{ Email = $account.email; Role = $account.role; Result = $(if ($valid -and $rotated -and ($meAfterRefresh.roles -contains $account.role) -and $loggedOut) { 'PASS' } else { 'FAIL' }) }
  } catch {
    [pscustomobject]@{ Email = $account.email; Role = $account.role; Result = 'ERROR' }
  }
}
$results | Format-Table -AutoSize
if ($results.Result -contains 'FAIL' -or $results.Result -contains 'ERROR') { exit 1 }
