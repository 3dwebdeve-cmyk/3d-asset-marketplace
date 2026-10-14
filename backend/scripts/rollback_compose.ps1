# Recreate web, worker, and frontend on previous immutable image tags.
# Preserve the caller's COMPOSE_FILE, COMPOSE_PROFILES and environment.
# This does not reverse database migrations.

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
if ($env:PREVIOUS_WEB_IMAGE) { $env:WEB_IMAGE = $env:PREVIOUS_WEB_IMAGE }
if ($env:PREVIOUS_FRONTEND_IMAGE) { $env:FRONTEND_IMAGE = $env:PREVIOUS_FRONTEND_IMAGE }
if (-not $env:WEB_IMAGE -or -not $env:FRONTEND_IMAGE) { throw "Set previous WEB_IMAGE and FRONTEND_IMAGE." }
if ($env:WEB_IMAGE.EndsWith(":latest") -or $env:FRONTEND_IMAGE.EndsWith(":latest")) { throw "Refusing mutable :latest tags." }
if (-not $env:SENTRY_RELEASE) { $env:SENTRY_RELEASE = $env:WEB_IMAGE }

Write-Host "Rollback images: web/worker=$($env:WEB_IMAGE) frontend=$($env:FRONTEND_IMAGE)"
Write-Host "Compose files: $($env:COMPOSE_FILE)"
Invoke-Checked docker @("compose", "config", "--quiet")
Invoke-Checked docker @("compose", "up", "-d", "--no-deps", "--force-recreate", "--wait", "--wait-timeout", "180", "web", "worker", "frontend")

$port = if ($env:FRONTEND_PORT) { $env:FRONTEND_PORT } else { "8080" }
$baseUrl = if ($env:ROLLBACK_BASE_URL) { $env:ROLLBACK_BASE_URL.TrimEnd('/') } else { "http://localhost:$port" }
Invoke-Checked curl.exe @("--fail", "--silent", "--show-error", "$baseUrl/api/v1/healthz/")
Invoke-Checked curl.exe @("--fail", "--silent", "--show-error", "$baseUrl/")
Invoke-Checked docker @("compose", "exec", "-T", "worker", "python", "manage.py", "check_background_jobs")
Invoke-Checked docker @("compose", "ps", "web", "worker", "frontend")
Write-Host "Rollback services ready. Run check_rollback_rehearsal and record host evidence."
