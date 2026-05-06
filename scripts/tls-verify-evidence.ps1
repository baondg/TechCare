param(
  [Parameter(Mandatory = $true)]
  [string]$StagingHost,
  [Parameter(Mandatory = $true)]
  [string]$ProductionHost,
  [string]$OutFile = "docs/operations/evidence/tls-verification-latest.txt",
  [string]$OutJson = "docs/operations/evidence/tls-verification-latest.json"
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

function Invoke-CurlHead([string]$url) {
  try {
    $result = & curl.exe -sS -I $url 2>&1
    return [string]::Join("`n", $result)
  } catch {
    return $_.Exception.Message
  }
}

function Get-StatusCode([string]$content) {
  $match = [regex]::Match($content, 'HTTP/\d\.\d\s+(\d{3})')
  if ($match.Success) { return [int]$match.Groups[1].Value }
  return -1
}

function Test-HttpsPass([string]$content) {
  $status = Get-StatusCode $content
  return $status -ge 200 -and $status -lt 500
}

function Test-HttpBlockedOrRedirected([string]$content) {
  $status = Get-StatusCode $content
  return ($status -eq 301) -or ($status -eq 302) -or ($status -eq 307) -or ($status -eq 308) -or ($status -eq 403)
}

$timestamp = (Get-Date).ToString("o")
$stagingHttps = Invoke-CurlHead "https://$StagingHost/health"
$stagingHttp = Invoke-CurlHead "http://$StagingHost/health"
$productionHttps = Invoke-CurlHead "https://$ProductionHost/health"
$productionHttp = Invoke-CurlHead "http://$ProductionHost/health"

New-Item -ItemType Directory -Force -Path (Split-Path -Parent $OutFile) | Out-Null
$lines = @(
  "Timestamp: $timestamp",
  "[staging:https://$StagingHost/health]",
  $stagingHttps,
  "[staging:http://$StagingHost/health]",
  $stagingHttp,
  "[production:https://$ProductionHost/health]",
  $productionHttps,
  "[production:http://$ProductionHost/health]",
  $productionHttp
)
Set-Content -Path $OutFile -Value $lines -Encoding UTF8
Write-Host "Wrote TLS evidence: $OutFile"

$result = [ordered]@{
  generatedAt = $timestamp
  staging = [ordered]@{
    host = $StagingHost
    httpsStatus = Get-StatusCode $stagingHttps
    httpStatus = Get-StatusCode $stagingHttp
    httpsPass = Test-HttpsPass $stagingHttps
    httpBlockedOrRedirected = Test-HttpBlockedOrRedirected $stagingHttp
    pass = (Test-HttpsPass $stagingHttps) -and (Test-HttpBlockedOrRedirected $stagingHttp)
  }
  production = [ordered]@{
    host = $ProductionHost
    httpsStatus = Get-StatusCode $productionHttps
    httpStatus = Get-StatusCode $productionHttp
    httpsPass = Test-HttpsPass $productionHttps
    httpBlockedOrRedirected = Test-HttpBlockedOrRedirected $productionHttp
    pass = (Test-HttpsPass $productionHttps) -and (Test-HttpBlockedOrRedirected $productionHttp)
  }
}
$result.pass = $result.staging.pass -and $result.production.pass
$result | ConvertTo-Json -Depth 6 | Set-Content -Path $OutJson -Encoding UTF8
Write-Host "Wrote TLS summary: $OutJson"
if (-not $result.pass) { exit 1 }
