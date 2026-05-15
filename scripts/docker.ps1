param(
  [ValidateSet("dev", "prod")]
  [string]$Profile = "dev",

  [ValidateSet("up", "down", "logs", "ps", "build", "restart", "check")]
  [string]$Action = "up"
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

function Invoke-Compose {
  param(
    [string[]]$ComposeArgs
  )

  if ($Profile -eq "prod") {
    if (Test-Path ".env.prod") {
      & docker compose --env-file .env.prod -f docker-compose.prod.yml @ComposeArgs
    }
    else {
      & docker compose -f docker-compose.prod.yml @ComposeArgs
    }
  }
  else {
    & docker compose @ComposeArgs
  }
}

function Test-HttpEndpoint {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Name,
    [Parameter(Mandatory = $true)]
    [string]$Url
  )

  try {
    $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 8
    if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 400) {
      Write-Host "[OK] $Name ($Url) -> $($response.StatusCode)" -ForegroundColor Green
      return $true
    }

    Write-Host "[FAIL] $Name ($Url) -> HTTP $($response.StatusCode)" -ForegroundColor Red
    return $false
  }
  catch {
    Write-Host "[FAIL] $Name ($Url) -> $($_.Exception.Message)" -ForegroundColor Red
    return $false
  }
}

switch ($Action) {
  "up" {
    Invoke-Compose -ComposeArgs @("up", "--build", "-d")
    break
  }
  "down" {
    Invoke-Compose -ComposeArgs @("down")
    break
  }
  "logs" {
    Invoke-Compose -ComposeArgs @("logs", "-f")
    break
  }
  "ps" {
    Invoke-Compose -ComposeArgs @("ps")
    break
  }
  "build" {
    Invoke-Compose -ComposeArgs @("build")
    break
  }
  "restart" {
    Invoke-Compose -ComposeArgs @("restart")
    break
  }
  "check" {
    $allGood = $true

    Write-Host "=== Compose service status ($Profile) ===" -ForegroundColor Cyan
    Invoke-Compose -ComposeArgs @("ps")

    $serviceRows = Invoke-Compose -ComposeArgs @("ps", "--format", "json")
    if ($serviceRows) {
      foreach ($row in $serviceRows) {
        try {
          $service = $row | ConvertFrom-Json
          if ($service.State -ne "running") {
            Write-Host "[FAIL] $($service.Name) state is '$($service.State)'" -ForegroundColor Red
            $allGood = $false
            continue
          }

          if ($service.Health -and $service.Health -ne "healthy") {
            Write-Host "[FAIL] $($service.Name) health is '$($service.Health)'" -ForegroundColor Red
            $allGood = $false
            continue
          }

          $healthSuffix = ""
          if (-not [string]::IsNullOrWhiteSpace($service.Health)) {
            $healthSuffix = " ($($service.Health))"
          }
          Write-Host "[OK] $($service.Name) is running$healthSuffix" -ForegroundColor Green
        }
        catch {
          Write-Host "[WARN] Could not parse service status row: $row" -ForegroundColor Yellow
        }
      }
    }

    if ($Profile -eq "dev") {
      Write-Host "=== Dev endpoint checks ===" -ForegroundColor Cyan
      if (-not (Test-HttpEndpoint -Name "Frontend" -Url "http://localhost:5173")) { $allGood = $false }
      if (-not (Test-HttpEndpoint -Name "Backend health" -Url "http://localhost:5000/health")) { $allGood = $false }
    }

    if ($allGood) {
      Write-Host "tc-dev-check: all checks passed." -ForegroundColor Green
    }
    else {
      Write-Host "tc-dev-check: one or more checks failed." -ForegroundColor Red
      exit 1
    }
    break
  }
}
