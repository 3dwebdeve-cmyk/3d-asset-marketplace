<#
.SYNOPSIS
  Stop a local end-to-end stack started with Start-LocalStack.ps1 (docs/E2E_LOCAL.md).
.EXAMPLE
  ./e2e/local/Stop-LocalStack.ps1 -Name browser
#>
param(
  [Parameter(Mandatory = $true)] [ValidatePattern('^[a-z0-9_]{1,20}$')] [string] $Name
)
$runDir = Join-Path $env:TEMP "assethive-e2e\$Name"
foreach ($part in 'frontend', 'backend') {
  $pidFile = Join-Path $runDir "$part.pid"
  if (Test-Path $pidFile) {
    $processId = Get-Content $pidFile
    # /T also stops the child processes (npm starts node, runserver may start python).
    & taskkill.exe /PID $processId /T /F 2>$null | Out-Null
    Remove-Item $pidFile
    Write-Output "stopped $part ($processId)"
  }
}
