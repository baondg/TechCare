#Requires -Version 5.1
param(
  [Parameter(Mandatory = $true)][string]$BackendBaseUrl
)
$ErrorActionPreference = "Stop"
$u = $BackendBaseUrl.TrimEnd("/")
$target = "$u/health"
Write-Host "GET $target"
$code = curl.exe -sS -o NUL -w "%{http_code}" --max-time 30 $target
if ($code -ne "200") { throw "Expected HTTP 200, got: $code" }
Write-Host "OK (200)"
