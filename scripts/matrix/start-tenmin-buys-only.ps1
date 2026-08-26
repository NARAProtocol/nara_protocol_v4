#requires -Version 5.1
<#
.SYNOPSIS
  VERSION 1 OF 2 - BUY ONLY (no hedging).
  Runs the original PASS-evidenced ten-min matrix: 100 x 11 USDC buys,
  one per distinct later block. Whale watching is NOT armed.

.USAGE
  # Read-only preflight first (sends nothing):
  .\scripts\matrix\start-tenmin-buys-only.ps1 -ReadOnly

  # Production execution (confirmation env must already be set):
  $env:V4_LIVE_TEN_MIN_BUY_CONFIRMATION = 'BUY_NARA_100_X_11_USDC_TEN_MIN'
  .\scripts\matrix\start-tenmin-buys-only.ps1                 # full 100 buys
  .\scripts\matrix\start-tenmin-buys-only.ps1 -Count 97       # resume support
#>
param(
  [int]$Count = 0,
  [switch]$ReadOnly
)
$ErrorActionPreference = 'Stop'
Set-Location "$PSScriptRoot\..\.."
if ($Count -gt 0) { $env:V4_TEN_MIN_BUY_COUNT = "$Count" }
if ($ReadOnly) {
  Write-Host 'MODE: READ_ONLY preflight (sends nothing, no key needed)'
  npx tsx scripts/matrix/runV4LiveTenMinBuyMatrix.ts
  exit $LASTEXITCODE
}
if ($env:V4_LIVE_TEN_MIN_BUY_CONFIRMATION -ne 'BUY_NARA_100_X_11_USDC_TEN_MIN') {
  throw 'Set V4_LIVE_TEN_MIN_BUY_CONFIRMATION=BUY_NARA_100_X_11_USDC_TEN_MIN before production start.'
}
Write-Host 'MODE: EXECUTE buy-only matrix (hedging never armed)'
npx tsx scripts/matrix/runV4LiveTenMinBuyMatrix.ts --execute
exit $LASTEXITCODE
