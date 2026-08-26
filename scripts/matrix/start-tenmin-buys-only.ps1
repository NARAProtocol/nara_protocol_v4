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

  # Explicit 3-second minimum:
  $env:V4_LIVE_TEN_MIN_BUY_CONFIRMATION = 'BUY_NARA_100_X_11_USDC_3_SECOND_MINIMUM'
  .\scripts\matrix\start-tenmin-buys-only.ps1 -DelaySeconds 3
#>
param(
  [int]$Count = 0,
  [int]$DelaySeconds = 0,
  [switch]$ReadOnly
)
$ErrorActionPreference = 'Stop'

$countWasProvided = $PSBoundParameters.ContainsKey('Count')
$delayWasProvided = $PSBoundParameters.ContainsKey('DelaySeconds')
if ($countWasProvided -and ($Count -lt 1 -or $Count -gt 1000)) {
  throw 'Count must be an integer between 1 and 1000.'
}
if ($delayWasProvided -and ($DelaySeconds -lt 3 -or $DelaySeconds -gt 60)) {
  throw 'DelaySeconds must be an integer between 3 and 60.'
}

$effectiveCount = if ($countWasProvided) { $Count } else { 100 }
$effectiveDelay = if ($delayWasProvided) { $DelaySeconds } else { 6 }
$countEnvWasSet = Test-Path Env:V4_TEN_MIN_BUY_COUNT
$delayEnvWasSet = Test-Path Env:V4_BUY_MATRIX_DELAY_SECONDS
$previousCountEnv = $env:V4_TEN_MIN_BUY_COUNT
$previousDelayEnv = $env:V4_BUY_MATRIX_DELAY_SECONDS
$locationPushed = $false
$runnerExitCode = 1

try {
  Push-Location "$PSScriptRoot\..\.."
  $locationPushed = $true
  $env:V4_TEN_MIN_BUY_COUNT = "$effectiveCount"
  $env:V4_BUY_MATRIX_DELAY_SECONDS = "$effectiveDelay"

  if ($ReadOnly) {
    Write-Host 'MODE: READ_ONLY preflight (sends nothing, no key needed)'
    npx tsx scripts/matrix/runV4LiveTenMinBuyMatrix.ts
    $runnerExitCode = $LASTEXITCODE
  } else {
    $isLegacySchedule = $effectiveCount -eq 100 -and $effectiveDelay -eq 6
    $expectedConfirmation = if ($isLegacySchedule) {
      'BUY_NARA_100_X_11_USDC_TEN_MIN'
    } else {
      "BUY_NARA_${effectiveCount}_X_11_USDC_${effectiveDelay}_SECOND_MINIMUM"
    }
    if ($env:V4_LIVE_TEN_MIN_BUY_CONFIRMATION -ne $expectedConfirmation) {
      throw "Set V4_LIVE_TEN_MIN_BUY_CONFIRMATION=$expectedConfirmation before production start."
    }
    Write-Host 'MODE: EXECUTE buy-only matrix (hedging never armed)'
    npx tsx scripts/matrix/runV4LiveTenMinBuyMatrix.ts --execute
    $runnerExitCode = $LASTEXITCODE
  }
} finally {
  if ($countEnvWasSet) {
    $env:V4_TEN_MIN_BUY_COUNT = $previousCountEnv
  } else {
    Remove-Item Env:V4_TEN_MIN_BUY_COUNT -ErrorAction SilentlyContinue
  }
  if ($delayEnvWasSet) {
    $env:V4_BUY_MATRIX_DELAY_SECONDS = $previousDelayEnv
  } else {
    Remove-Item Env:V4_BUY_MATRIX_DELAY_SECONDS -ErrorAction SilentlyContinue
  }
  if ($locationPushed) {
    Pop-Location
  }
}

exit $runnerExitCode
