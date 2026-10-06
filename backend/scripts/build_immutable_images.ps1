# Build and tag immutable Compose images for Phase K1 (Windows PowerShell).
# Usage (from repo root):
#   .\backend\scripts\build_immutable_images.ps1
#   $env:IMAGE_TAG = "2026-09-19-abc1234"; .\backend\scripts\build_immutable_images.ps1

$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $Root

if (-not $env:IMAGE_TAG) {
  $sha = ""
  try { $sha = (git rev-parse --short HEAD 2>$null).Trim() } catch { }
  if ($sha) {
    $env:IMAGE_TAG = "{0}-{1}" -f (Get-Date -AsUTC -Format "yyyy-MM-dd"), $sha
  } else {
    $env:IMAGE_TAG = Get-Date -AsUTC -Format "yyyyMMddTHHmmssZ"
  }
}

$registry = if ($env:IMAGE_REGISTRY) { $env:IMAGE_REGISTRY.TrimEnd("/") + "/" } else { "" }
if (-not $env:WEB_IMAGE) {
  $env:WEB_IMAGE = "${registry}marketplace-web:$($env:IMAGE_TAG)"
}
if (-not $env:FRONTEND_IMAGE) {
  $env:FRONTEND_IMAGE = "${registry}marketplace-frontend:$($env:IMAGE_TAG)"
}
if (-not $env:SENTRY_RELEASE) {
  $env:SENTRY_RELEASE = $env:IMAGE_TAG
}

Write-Host "Building immutable tags:"
Write-Host "  IMAGE_TAG=$($env:IMAGE_TAG)"
Write-Host "  WEB_IMAGE=$($env:WEB_IMAGE)"
Write-Host "  FRONTEND_IMAGE=$($env:FRONTEND_IMAGE)"
Write-Host "  SENTRY_RELEASE=$($env:SENTRY_RELEASE)"

docker compose build web worker frontend
if ($LASTEXITCODE -ne 0) { throw "Docker image build failed with exit code $LASTEXITCODE" }

if ($env:PUSH -eq "1") {
  docker compose push web worker frontend
  if ($LASTEXITCODE -ne 0) { throw "Docker image push failed with exit code $LASTEXITCODE" }
}

Write-Host ""
Write-Host "Record these for rollback (PRODUCTION_CHECKLIST / CUTOVER checklist):"
Write-Host "  `$env:IMAGE_TAG = '$($env:IMAGE_TAG)'"
Write-Host "  `$env:WEB_IMAGE = '$($env:WEB_IMAGE)'"
Write-Host "  `$env:FRONTEND_IMAGE = '$($env:FRONTEND_IMAGE)'"
Write-Host "  `$env:SENTRY_RELEASE = '$($env:SENTRY_RELEASE)'"
Write-Host "Then: docker compose up -d"
Write-Host "Gate: docker compose exec web python manage.py check_cutover --profile staging --fail-on-warnings"
Write-Host "Rollback to a previous tag later:"
Write-Host "  `$env:PREVIOUS_WEB_IMAGE = '<old-web>'; `$env:PREVIOUS_FRONTEND_IMAGE = '<old-frontend>'; .\backend\scripts\rollback_compose.ps1"
Write-Host "  docker compose exec web python manage.py check_rollback_rehearsal --profile staging"
