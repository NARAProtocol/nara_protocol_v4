#requires -Version 5.1
<#
.SYNOPSIS
  One-click reviewed launch for the real Base 100 x 11 USDC buy-only Matrix.

.DESCRIPTION
  Loads the existing local environment without displaying secrets, shows one
  fail-closed Windows confirmation dialog, then starts the production runner.
  The runner performs its full live preflight again before any approval or buy.
#>
param(
  [string]$EnvFile = ""
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path "$PSScriptRoot\..\..").Path
if ([string]::IsNullOrWhiteSpace($EnvFile)) {
  $EnvFile = Join-Path $repoRoot '.env'
}
$resolvedEnv = (Resolve-Path -LiteralPath $EnvFile -ErrorAction Stop).Path

Add-Type -AssemblyName System.Windows.Forms
$mutex = New-Object System.Threading.Mutex($false, 'Local\NARA_100_BUY_MATRIX')
$ownsMutex = $false
try {
  $ownsMutex = $mutex.WaitOne(0)
  if (-not $ownsMutex) {
    [System.Windows.Forms.MessageBox]::Show(
      'A NARA buy Matrix launcher is already running. This launch was blocked.',
      'NARA Matrix - Already Running',
      [System.Windows.Forms.MessageBoxButtons]::OK,
      [System.Windows.Forms.MessageBoxIcon]::Stop
    ) | Out-Null
    exit 1
  }

$review = @"
REAL BASE TRANSACTIONS

100 separate NARA buys x 11.00 USDC
Maximum gross USDC input: 1,100.00 USDC
Minimum interval between submissions: 3 seconds
Actual spacing may be longer for confirmations
Hedging: OFF
Output protection: 10% quote tolerance
Additional transactions: approval and cleanup when required

The runner stops if a quote, simulation, receipt, tax, balance, or accounting check fails.

Launch the real Matrix now?
"@
$choice = [System.Windows.Forms.MessageBox]::Show(
  $review,
  'NARA Matrix - Confirm Real Trades',
  [System.Windows.Forms.MessageBoxButtons]::YesNo,
  [System.Windows.Forms.MessageBoxIcon]::Warning,
  [System.Windows.Forms.MessageBoxDefaultButton]::Button2
)
if ($choice -ne [System.Windows.Forms.DialogResult]::Yes) {
  Write-Host 'Cancelled. No transaction was constructed or sent.'
  exit 2
}

foreach ($line in Get-Content -LiteralPath $resolvedEnv) {
  if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$') {
    $key = $matches[1]
    $value = $matches[2].Trim()
    if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
      $value = $value.Substring(1, $value.Length - 2)
    }
    [Environment]::SetEnvironmentVariable($key, $value, 'Process')
  }
}

$env:V4_TEN_MIN_BUY_COUNT = '100'
$env:V4_BUY_MATRIX_DELAY_SECONDS = '3'
$env:V4_LIVE_TEN_MIN_BUY_CONFIRMATION = 'BUY_NARA_100_X_11_USDC_3_SECOND_MINIMUM'

Set-Location $repoRoot
Write-Host 'Starting NARA 100 x 11 USDC buy-only Matrix...'
Write-Host 'The production runner will print its current preflight before execution.'
& npx tsx scripts/matrix/runV4LiveTenMinBuyMatrix.ts --execute
exit $LASTEXITCODE
} finally {
  if ($ownsMutex) {
    $mutex.ReleaseMutex()
  }
  $mutex.Dispose()
}
