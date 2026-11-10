<#
.SYNOPSIS
  Start a local end-to-end stack with safe settings (docs/E2E_LOCAL.md).

.DESCRIPTION
  Own database (assethive_e2e_<Name>), own ports, files in this checkout's backend/media.
  Never touches the real R2 buckets, Stripe, Brevo email or Sentry: those settings are
  overridden here, and environment variables win over backend/.env.
  Seeds the E2E accounts (seed_e2e_commerce) and the pricing scenario (seed_e2e_pricing).

.EXAMPLE
  ./e2e/local/Start-LocalStack.ps1 -Name api -BackendPort 8001 -Fresh
  ./e2e/local/Start-LocalStack.ps1 -Name browser -BackendPort 8002 -FrontendPort 5174
#>
param(
  [Parameter(Mandatory = $true)] [ValidatePattern('^[a-z0-9_]{1,20}$')] [string] $Name,
  [int] $BackendPort = 8001,
  # 0 starts the backend only.
  [int] $FrontendPort = 0,
  [string] $Python = '',
  # Drop and recreate this stack's database first, like CI (no orders left from earlier runs).
  [switch] $Fresh
)
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$backend = Join-Path $repo 'backend'
$frontend = Join-Path $repo 'frontend'
$runDir = Join-Path $env:TEMP "assethive-e2e\$Name"
New-Item -ItemType Directory -Force -Path $runDir | Out-Null

if (-not $Python) {
  $candidates = @(
    (Join-Path $backend '.venv\Scripts\python.exe'),
    $env:E2E_PYTHON
  ) | Where-Object { $_ -and (Test-Path $_) }
  if (-not $candidates) { throw 'No Python found: pass -Python or set E2E_PYTHON to the backend virtualenv python.exe.' }
  $Python = @($candidates)[0]
}
if (-not (Test-Path (Join-Path $backend '.env'))) {
  throw 'backend/.env is missing (it holds the local database login). Copy it from the main checkout.'
}

$origin = if ($FrontendPort -gt 0) { "http://localhost:$FrontendPort" } else { "http://localhost:$BackendPort" }
$origins = if ($FrontendPort -gt 0) { "http://localhost:$FrontendPort,http://127.0.0.1:$FrontendPort" } else { "http://localhost:$BackendPort" }

$safe = [ordered]@{
  DEPLOYMENT_PROFILE           = 'test'
  DB_NAME                      = "assethive_e2e_$Name"
  DEBUG                        = 'False'
  ALLOWED_HOSTS                = 'localhost,127.0.0.1'
  # Blank R2 settings switch storage to local files (config/settings.py, R2_ENABLED).
  R2_ACCOUNT_ID                = ''
  R2_ACCESS_KEY_ID             = ''
  R2_SECRET_ACCESS_KEY         = ''
  R2_ENDPOINT_URL              = ''
  R2_PUBLIC_BUCKET             = ''
  R2_PRIVATE_BUCKET            = ''
  R2_PUBLIC_BASE_URL           = ''
  # Simulated Stripe with placeholder test keys: no request reaches Stripe.
  E2E_STRIPE_SIMULATE          = 'True'
  STRIPE_PAYMENT_MODE          = 'test'
  STRIPE_SECRET_KEY            = 'sk_test_e2e_local_placeholder_not_a_real_secret'
  STRIPE_PUBLISHABLE_KEY       = 'pk_test_e2e_local_placeholder'
  STRIPE_WEBHOOK_SECRET        = 'whsec_e2e_local_placeholder'
  # Email is printed to the backend log, never sent.
  EMAIL_BACKEND                = 'django.core.mail.backends.console.EmailBackend'
  ALLOW_CONSOLE_EMAIL          = 'True'
  BREVO_API_KEY                = ''
  SENTRY_DSN                   = ''
  GOOGLE_OAUTH_CLIENT_ID       = ''
  ADMIN_MFA_REQUIRED           = 'False'
  PASSWORD_BREACH_CHECK        = 'False'
  CATALOG_IMPORT_SCAN_REQUIRED = 'False'
  PACKAGE_SCAN_HOST            = ''
  EDGE_REQUIRE                 = 'False'
  EDGE_SHARED_SECRET           = ''
  ALLOW_LOCALHOST_FRONTEND     = 'True'
  JWT_REFRESH_COOKIE_SECURE    = 'False'
  SECURE_SSL_REDIRECT          = 'False'
  SECURE_HSTS_SECONDS          = '0'
  DJANGO_ADMIN_ENABLED         = 'False'
  RUN_BACKGROUND_JOBS_IN_WEB   = 'False'
  RUN_MAINTENANCE_LOOP_IN_WEB  = 'False'
  FRONTEND_BASE_URL            = $origin
  CORS_ALLOWED_ORIGINS         = $origins
  CSRF_TRUSTED_ORIGINS         = $origins
}
foreach ($key in $safe.Keys) { [Environment]::SetEnvironmentVariable($key, $safe[$key], 'Process') }

Push-Location $backend
try {
  # Create the stack's own database if needed (the login comes from backend/.env).
  & $Python (Join-Path $PSScriptRoot 'create_database.py') $(if ($Fresh) { '--fresh' })
  if ($LASTEXITCODE -ne 0) { throw 'Could not create the E2E database.' }
  & $Python manage.py migrate --noinput | Out-File (Join-Path $runDir 'migrate.log')
  if ($LASTEXITCODE -ne 0) { throw "migrate failed: see $runDir\migrate.log" }
  # The rate limits and login lockouts use the database cache.
  & $Python manage.py createcachetable
  if ($LASTEXITCODE -ne 0) { throw 'createcachetable failed.' }
  & $Python manage.py seed_e2e_commerce
  if ($LASTEXITCODE -ne 0) { throw 'seed_e2e_commerce failed.' }
  & $Python manage.py seed_e2e_pricing
  if ($LASTEXITCODE -ne 0) { throw 'seed_e2e_pricing failed.' }

  $backendProc = Start-Process -FilePath $Python `
    -ArgumentList @('manage.py', 'runserver', "127.0.0.1:$BackendPort", '--noreload') `
    -WorkingDirectory $backend -PassThru -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $runDir 'backend.out.log') `
    -RedirectStandardError (Join-Path $runDir 'backend.err.log')
  Set-Content -Path (Join-Path $runDir 'backend.pid') -Value $backendProc.Id
} finally {
  Pop-Location
}

function Wait-Url([string] $Url, [int] $Seconds) {
  $deadline = (Get-Date).AddSeconds($Seconds)
  while ((Get-Date) -lt $deadline) {
    try {
      $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5
      if ($response.StatusCode -lt 500) { return $true }
    } catch { Start-Sleep -Milliseconds 800 }
  }
  return $false
}

if (-not (Wait-Url "http://127.0.0.1:$BackendPort/api/v1/healthz/" 90)) {
  throw "The backend did not answer on port ${BackendPort}: see $runDir\backend.err.log"
}
Write-Output "backend ready: http://127.0.0.1:$BackendPort (database assethive_e2e_$Name, logs in $runDir)"

if ($FrontendPort -gt 0) {
  $env:DEV_API_TARGET = "http://127.0.0.1:$BackendPort"
  $frontendProc = Start-Process -FilePath 'cmd.exe' `
    -ArgumentList @('/c', 'npm', 'run', 'dev', '--', '--port', "$FrontendPort", '--strictPort', '--host', '127.0.0.1') `
    -WorkingDirectory $frontend -PassThru -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $runDir 'frontend.out.log') `
    -RedirectStandardError (Join-Path $runDir 'frontend.err.log')
  Set-Content -Path (Join-Path $runDir 'frontend.pid') -Value $frontendProc.Id
  if (-not (Wait-Url "http://127.0.0.1:$FrontendPort/" 120)) {
    throw "The frontend did not answer on port ${FrontendPort}: see $runDir\frontend.err.log"
  }
  Write-Output "frontend ready: http://localhost:$FrontendPort (API proxied to port $BackendPort)"
}
