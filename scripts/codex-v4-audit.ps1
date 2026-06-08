$ErrorActionPreference = "Stop"

$runner = Join-Path $PSScriptRoot "codex-hardhat.ps1"

& $runner compile
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

& $runner test `
  "test/NARAToken.v4.test.ts" `
  "test/NARAEngine.v4.test.ts" `
  "test/NARALiquidityGrowth.v4.test.ts"
exit $LASTEXITCODE
