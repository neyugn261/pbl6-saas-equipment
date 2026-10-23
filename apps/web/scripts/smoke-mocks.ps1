param([string]$BaseUrl = 'http://127.0.0.1:5173')

$headers = @{ Authorization = 'Bearer mock-contract-test' }
$results = @()
foreach ($area in @(
  @{ name = 'Organization'; path = '/mock/organization/customers' },
  @{ name = 'Asset'; path = '/mock/asset/equipment' },
  @{ name = 'Service Request'; path = '/mock/requests/service-requests' }
)) {
  try {
    $list = Invoke-RestMethod -Uri "$BaseUrl$($area.path)?page=1&pageSize=20" -Headers $headers -TimeoutSec 10
    $id = $list.items[0].id
    $detail = Invoke-RestMethod -Uri "$BaseUrl$($area.path)/$id" -Headers $headers -TimeoutSec 10
    $valid = [bool]$id -and [bool]$detail.id -and $list.items.Count -ge 1
    $results += [pscustomobject]@{ Area = $area.name; Scenario = 'List and detail'; Result = $(if ($valid) { 'PASS' } else { 'FAIL' }) }
  } catch {
    $results += [pscustomobject]@{ Area = $area.name; Scenario = 'List and detail'; Result = 'ERROR' }
  }
}

try {
  $equipment = Invoke-RestMethod -Uri "$BaseUrl/mock/asset/equipment?page=1&pageSize=20" -Headers $headers -TimeoutSec 10
  $item = $equipment.items[0]
  $body = @{ equipmentId = $item.id; customerId = $item.customerId; type = 'REPAIR'; priority = 'NORMAL'; title = 'M1 mock request'; description = 'Testing the request creation contract' } | ConvertTo-Json -Compress
  $created = Invoke-RestMethod -Uri "$BaseUrl/mock/requests/service-requests" -Method Post -ContentType 'application/json' -Headers $headers -Body $body -TimeoutSec 10
  $results += [pscustomobject]@{ Area = 'Service Request'; Scenario = 'Create'; Result = $(if ($created.id -and $created.status) { 'PASS' } else { 'FAIL' }) }
} catch {
  $results += [pscustomobject]@{ Area = 'Service Request'; Scenario = 'Create'; Result = 'ERROR' }
}

try {
  $list = Invoke-RestMethod -Uri "$BaseUrl/mock/requests/service-requests?page=1&pageSize=20" -Headers $headers -TimeoutSec 10
  $id = $list.items[0].id
  $detail = Invoke-RestMethod -Uri "$BaseUrl/mock/requests/service-requests/$id" -Headers $headers -TimeoutSec 10
  $history = Invoke-RestMethod -Uri "$BaseUrl/mock/requests/service-requests/$id/history" -Headers $headers -TimeoutSec 10
  $comments = Invoke-RestMethod -Uri "$BaseUrl/mock/requests/service-requests/$id/comments" -Headers $headers -TimeoutSec 10
  $transition = Invoke-RestMethod -Uri "$BaseUrl/mock/requests/service-requests/$id/review" -Method Post -Headers $headers -TimeoutSec 10
  $valid = [bool]$detail.id -and $null -ne $history -and $null -ne $comments -and [bool]$transition.id
  $results += [pscustomobject]@{ Area = 'Service Request'; Scenario = 'Activity and review action'; Result = $(if ($valid) { 'PASS' } else { 'FAIL' }) }
} catch {
  $results += [pscustomobject]@{ Area = 'Service Request'; Scenario = 'Activity and review action'; Result = 'ERROR' }
}
$results | Format-Table -AutoSize
if ($results.Result -contains 'FAIL' -or $results.Result -contains 'ERROR') { exit 1 }
