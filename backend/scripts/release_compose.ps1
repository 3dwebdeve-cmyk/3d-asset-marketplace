$ErrorActionPreference = "Stop"
function Invoke-Checked {
  param([string]$File, [string[]]$Arguments)
  & $File @Arguments
  if ($LASTEXITCODE -ne 0) { throw "$File failed with exit code $LASTEXITCODE" }
}

$Root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $Root
# A docker-compose.override.yml holds local development values. Plain `docker compose`
# loads it automatically, so refuse unless COMPOSE_FILE names the files explicitly.
if ((Test-Path "docker-compose.override.yml") -and -not $env:COMPOSE_FILE) {
  throw "docker-compose.override.yml is present: set COMPOSE_FILE (e.g. docker-compose.yml;docker-compose.prod.yml) or remove it."
}
if (-not $env:WEB_IMAGE -or -not $env:FRONTEND_IMAGE) { throw "Set immutable WEB_IMAGE and FRONTEND_IMAGE before release." }
if ($env:WEB_IMAGE.EndsWith(":latest") -or $env:FRONTEND_IMAGE.EndsWith(":latest")) { throw "Refusing mutable :latest image tags." }

Invoke-Checked docker @("compose", "config", "--quiet")
Invoke-Checked docker @("compose", "up", "-d", "--wait", "--wait-timeout", "120", "postgres")
Invoke-Checked docker @("compose", "run", "--rm", "--no-deps", "migrate")
Invoke-Checked docker @("compose", "up", "-d", "--no-deps", "--force-recreate", "--wait", "--wait-timeout", "180", "web", "worker", "frontend")

$port = if ($env:FRONTEND_PORT) { $env:FRONTEND_PORT } else { "8080" }
$baseUrl = if ($env:RELEASE_BASE_URL) { $env:RELEASE_BASE_URL.TrimEnd('/') } else { "http://localhost:$port" }
Invoke-Checked curl.exe @("--fail", "--silent", "--show-error", "$baseUrl/api/v1/healthz/")
Invoke-Checked curl.exe @("--fail", "--silent", "--show-error", "$baseUrl/")
Invoke-Checked docker @("compose", "exec", "-T", "worker", "python", "manage.py", "check_background_jobs")
Invoke-Checked docker @("compose", "exec", "-T", "web", "python", "manage.py", "check_payment_reconciliation")
Invoke-Checked docker @("compose", "exec", "-T", "web", "python", "manage.py", "audit_published_packages", "--fail-on-missing")
Invoke-Checked docker @("compose", "exec", "-T", "web", "python", "manage.py", "check_capacity")
$backupDir = if ($env:BACKUP_DIR) { $env:BACKUP_DIR } else { Join-Path $Root "backups" }
$maxAgeMinutes = if ($env:BACKUP_MAX_AGE_MINUTES) { [int]$env:BACKUP_MAX_AGE_MINUTES } else { 2160 }
if ($maxAgeMinutes -lt 1) { throw "BACKUP_MAX_AGE_MINUTES must be positive" }
$recent = Get-ChildItem -LiteralPath $backupDir -File -Filter "marketplace-*.dump" -ErrorAction SilentlyContinue | Where-Object { $_.LastWriteTimeUtc -ge [datetime]::UtcNow.AddMinutes(-$maxAgeMinutes) } | Select-Object -First 1
if (-not $recent) { throw "No recent PostgreSQL backup dump; release check failed" }
Invoke-Checked docker @("compose", "ps", "web", "worker", "frontend")
Write-Host "Release services ready; run host-specific staging integration checks."
