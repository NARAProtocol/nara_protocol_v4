param(
  [int]$MaxSeconds = 0,
  [long]$ReplayFromBlock = 0,
  [long]$ReplayToBlock = 0,
  [int]$MaxBlockRange = 0
)
$ErrorActionPreference = 'Stop'
Set-Location "$PSScriptRoot\..\.."

# Load only public/read-only values. Never place PRIVATE_KEY or execution
# confirmations into the shadow process environment.
$publicKeys = @(
  'BASE_MAINNET_RPC_URL',
  'BASE_RPC_URL',
  'V4_STABILIZER_RPC_URL',
  'V4_STABILIZER_WALLET',
  'V4_STABILIZER_POLL_MS',
  'V4_STABILIZER_MAX_BLOCK_RANGE',
  'V4_STABILIZER_FINALITY_CONFIRMATIONS',
  'V4_PUMP_TRIGGER_USDC',
  'V4_DUMP_TRIGGER_USDC',
  'V4_DEFENSE_USDC_CAP',
  'V4_RESERVE_FLOOR_USDC',
  'V4_MIN_EDGE_BPS',
  'V4_HEDGE_SELL_RATIO_BPS',
  'V4_HEDGE_BUCKET_NARA'
)
$envPath = Join-Path (Get-Location) '.env'
if (Test-Path -LiteralPath $envPath) {
  foreach ($line in Get-Content -LiteralPath $envPath) {
    if ($line -notmatch '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$') { continue }
    $name = $Matches[1]
    if ($publicKeys -notcontains $name) { continue }
    $value = $Matches[2].Trim()
    if (($value.StartsWith('"') -and $value.EndsWith('"')) -or
        ($value.StartsWith("'") -and $value.EndsWith("'"))) {
      $value = $value.Substring(1, $value.Length - 2)
    }
    Set-Item -Path "Env:$name" -Value $value
  }
}

if ($MaxSeconds -gt 0) {
  $env:V4_STABILIZER_MAX_SECONDS = "$MaxSeconds"
} else {
  Remove-Item -Path 'Env:V4_STABILIZER_MAX_SECONDS' -ErrorAction SilentlyContinue
}
if ($ReplayFromBlock -gt 0) {
  $env:V4_REPLAY_FROM_BLOCK = "$ReplayFromBlock"
} else {
  Remove-Item -Path 'Env:V4_REPLAY_FROM_BLOCK' -ErrorAction SilentlyContinue
}
if ($ReplayToBlock -gt 0) {
  $env:V4_REPLAY_TO_BLOCK = "$ReplayToBlock"
} else {
  Remove-Item -Path 'Env:V4_REPLAY_TO_BLOCK' -ErrorAction SilentlyContinue
}
if ($MaxBlockRange -gt 0) {
  $env:V4_STABILIZER_MAX_BLOCK_RANGE = "$MaxBlockRange"
}
Write-Host 'MODE: SHADOW — watches both pool sides, simulates defenses, sends NOTHING'
npx tsx scripts/matrix/runV4TwoSidedStabilizer.ts
exit $LASTEXITCODE
