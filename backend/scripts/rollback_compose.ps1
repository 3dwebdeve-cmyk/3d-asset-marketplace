# Phase K2 — recreate web/worker/frontend on previous immutable tags (Windows).
# Usage (from repo root):
#   $env:WEB_IMAGE = "marketplace-web:2026-09-18-abc1234"
#   $env:FRONTEND_IMAGE = "marketplace-frontend:2026-09-18-abc1234"
#   .\backend\scripts\rollback_compose.ps1
#
# Or:
#   $env:PREVIOUS_WEB_IMAGE = "..."
#   $env:PREVIOUS_FRONTEND_IMAGE = "..."
#   .\backend\scripts\rollback_compose.ps1
#
# Does NOT reverse migrations. Does NOT change postgres/redis/meili.
# See docs/ROLLBACK_REHEARSAL.md / PRODUCTION_CHECKLIST §4.

$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $Root

if ($env:PREVIOUS_WEB_IMAGE) {
  $env:WEB_IMAGE = $env:PREVIOUS_WEB_IMAGE
}
if ($env:PREVIOUS_FRONTEND_IMAGE) {
  $env:FRONTEND_IMAGE = $env:PREVIOUS_FRONTEND_IMAGE
}

if (-not $env:WEB_IMAGE -or -not $env:FRONTEND_IMAGE) {
  Write-Error "Set WEB_IMAGE + FRONTEND_IMAGE (or PREVIOUS_WEB_IMAGE + PREVIOUS_FRONTEND_IMAGE)."
}

if ($env:WEB_IMAGE.EndsWith(":latest") -or $env:FRONTEND_IMAGE.EndsWith(":latest")) {
  Write-Error "Refuse :latest tags — use git SHA / semver immutable tags."
}

if (-not $env:SENTRY_RELEASE) {
  $env:SENTRY_RELEASE = $env:WEB_IMAGE
}

Write-Host "Rolling back Compose app services to:"
Write-Host "  WEB_IMAGE=$($env:WEB_IMAGE)  (web + worker)"
Write-Host "  FRONTEND_IMAGE=$($env:FRONTEND_IMAGE)"
Write-Host "  (postgres / redis / meilisearch unchanged — no migrate reverse)"
Write-Host ""

docker compose up -d --no-deps --force-recreate web worker frontend

Write-Host ""
Write-Host "Waiting for web healthcheck..."
Start-Sleep -Seconds 5
docker compose ps web worker frontend

Write-Host ""
Write-Host "Next:"
Write-Host "  curl -fsS http://localhost:8080/api/v1/healthz/"
Write-Host "  docker compose exec web python manage.py check_rollback_rehearsal --profile staging --fail-on-warnings"
Write-Host "  # optional live Stripe test replay:"
Write-Host "  docker compose exec web python manage.py check_rollback_rehearsal --profile staging --smoke-webhook --fail-on-warnings"
Write-Host "Date the rehearsal in docs/ROLLBACK_REHEARSAL.md"
