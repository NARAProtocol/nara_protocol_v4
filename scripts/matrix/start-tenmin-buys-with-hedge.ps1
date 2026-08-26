#requires -Version 5.1
<#
.SYNOPSIS
  VERSION 2 OF 2 - BUY + BIG-BUY HEDGE.
  Same ten-min buy schedule PLUS reactive hedging: external buys >= 100 USDC
  are watched; whale bursts aggregate and once quiet 90% of the total
  whale-equivalent NARA is sold back in one swap; buys continue unchanged.

.USAGE
  # Read-only preflight + DRY-RUN hedge accounting (sends nothing):
  .\scripts\matrix\start-tenmin-buys-with-hedge.ps1 -ReadOnly

  # Production execution (both confirmation envs must already be set):
  $env:V4_LIVE_TEN_MIN_BUY_CONFIRMATION   = 'BUY_NARA_100_X_11_USDC_TEN_MIN'
  $env:V4_LIVE_TEN_MIN_HEDGE_CONFIRMATION = 'HEDGE_SELL_ON_BIG_EXTERNAL_BUY'
  .\scripts\matrix\start-tenmin-buys-with-hedge.ps1                 # full 100 buys
  .\scripts\matrix\start-tenmin-buys-with-hedge.ps1 -Count 97       # resume support

.OPTIONAL KNOBS (env)
  V4_HEDGE_TRIGGER_USDC (default 100), V4_HEDGE_SELL_RATIO_BPS (default 9000),
  V4_HEDGE_MAX_SELLS (default 25), V4_HEDGE_MIN_SELL_USDC (default 5),
  V4_HEDGE_QUIET_BLOCKS (default 2)
#>
param(
  [int]$Count = 0,
  [switch]$ReadOnly,
  [switch]$Instant
)
$ErrorActionPreference = 'Stop'
Set-Location "$PSScriptRoot\..\.."
$runnerArgs = @()
if ($Instant) { $runnerArgs += '--hedge', '--instant' } else { $runnerArgs += '--hedge' }
if ($Count -gt 0) { $env:V4_TEN_MIN_BUY_COUNT = "$Count" }
if ($ReadOnly) {
  Write-Host 'MODE: READ_ONLY preflight + DRY_RUN hedges (sends nothing)'
  npx tsx scripts/matrix/runV4LiveTenMinBuyMatrixWithBigBuyHedge.ts @runnerArgs
  exit $LASTEXITCODE
}
if ($env:V4_LIVE_TEN_MIN_BUY_CONFIRMATION -ne 'BUY_NARA_100_X_11_USDC_TEN_MIN') {
  throw 'Set V4_LIVE_TEN_MIN_BUY_CONFIRMATION=BUY_NARA_100_X_11_USDC_TEN_MIN before production start.'
}
if ($env:V4_LIVE_TEN_MIN_HEDGE_CONFIRMATION -ne 'HEDGE_SELL_ON_BIG_EXTERNAL_BUY') {
  throw 'Armed hedging additionally requires V4_LIVE_TEN_MIN_HEDGE_CONFIRMATION=HEDGE_SELL_ON_BIG_EXTERNAL_BUY.'
}
Write-Host 'MODE: EXECUTE buy matrix WITH armed big-buy hedging'
npx tsx scripts/matrix/runV4LiveTenMinBuyMatrixWithBigBuyHedge.ts --execute @runnerArgs
exit $LASTEXITCODE
