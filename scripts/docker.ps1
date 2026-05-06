param(
  [ValidateSet("dev", "prod")]
  [string]$Profile = "dev",

  [ValidateSet("up", "down", "logs", "ps", "build", "restart")]
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
}
