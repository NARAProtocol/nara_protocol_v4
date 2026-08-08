param(
  [string]$OutDir = "slither-reports\v4",
  [string[]]$Targets = @(),
  [switch]$VerboseOutput
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$python = Join-Path $repoRoot ".venv-slither\Scripts\python.exe"
$solcDir = Join-Path $repoRoot ".venv-slither\solc-bin"
$solcList = Join-Path $repoRoot ".venv-slither\solc-windows-list.json"
$solcVersion = "0.8.34"
$outPath = Join-Path $repoRoot $OutDir

if (-not (Test-Path -LiteralPath $python)) {
  throw "Slither Python runtime not found at $python. Create .venv-slither and install slither-analyzer first."
}

function Ensure-Solc {
  New-Item -ItemType Directory -Force -Path $solcDir | Out-Null
  if (-not (Test-Path -LiteralPath $solcList)) {
    Invoke-WebRequest -Uri "https://binaries.soliditylang.org/windows-amd64/list.json" -OutFile $solcList
  }

  $list = Get-Content -LiteralPath $solcList -Raw | ConvertFrom-Json
  $build = $list.builds | Where-Object { $_.version -eq $solcVersion } | Select-Object -First 1
  if ($null -eq $build) {
    throw "solc $solcVersion not found in Solidity windows-amd64 list."
  }

  $solc = Join-Path $solcDir $build.path
  $expected = ([string]$build.sha256).Replace("0x", "").ToLowerInvariant()
  $needDownload = -not (Test-Path -LiteralPath $solc)
  if (-not $needDownload) {
    $actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $solc).Hash.ToLowerInvariant()
    $needDownload = $actual -ne $expected
  }

  if ($needDownload) {
    Invoke-WebRequest -Uri ("https://binaries.soliditylang.org/windows-amd64/" + $build.path) -OutFile $solc
    $actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $solc).Hash.ToLowerInvariant()
    if ($actual -ne $expected) {
      throw "Downloaded solc sha256 mismatch. expected=$expected actual=$actual"
    }
  }

  $versionOutput = & $solc --version
  if ($LASTEXITCODE -ne 0 -or ($versionOutput -join "`n") -notmatch [regex]::Escape($solcVersion)) {
    throw "solc $solcVersion failed version check at $solc"
  }

  return $solc
}

function Invoke-LoggedProcess {
  param(
    [string]$FilePath,
    [string[]]$ArgumentList,
    [string]$LogPath
  )

  function Quote-ProcessArgument {
    param([string]$Value)
    if ($Value -eq "") {
      return '""'
    }
    if ($Value -notmatch '[\s"]') {
      return $Value
    }
    return '"' + ($Value -replace '"', '\"') + '"'
  }

  $argString = (($ArgumentList | ForEach-Object { Quote-ProcessArgument $_ }) -join " ")
  $stdoutPath = "$LogPath.stdout.tmp"
  $stderrPath = "$LogPath.stderr.tmp"
  Remove-Item -LiteralPath $stdoutPath, $stderrPath -ErrorAction SilentlyContinue

  $process = Start-Process `
    -FilePath $FilePath `
    -ArgumentList $argString `
    -Wait `
    -PassThru `
    -NoNewWindow `
    -RedirectStandardOutput $stdoutPath `
    -RedirectStandardError $stderrPath

  $stdout = if (Test-Path -LiteralPath $stdoutPath) { Get-Content -LiteralPath $stdoutPath -Raw } else { "" }
  $stderr = if (Test-Path -LiteralPath $stderrPath) { Get-Content -LiteralPath $stderrPath -Raw } else { "" }
  Remove-Item -LiteralPath $stdoutPath, $stderrPath -ErrorAction SilentlyContinue

  $output = @()
  if (-not [string]::IsNullOrWhiteSpace($stdout)) {
    $output += $stdout.TrimEnd()
  }
  if (-not [string]::IsNullOrWhiteSpace($stderr)) {
    $output += $stderr.TrimEnd()
  }
  $text = $output -join "`n"
  Set-Content -LiteralPath $LogPath -Value $text
  if ($VerboseOutput -and -not [string]::IsNullOrWhiteSpace($text)) {
    Write-Host $text
  }

  return $process.ExitCode
}

if ($Targets.Count -eq 0) {
  $Targets = @(
    "contracts\v4\NARABondDepositoryV4.sol",
    "contracts\v4\NARABondDepositoryV4NFT.sol",
    "contracts\v4\NARABondVaultV4.sol",
    "contracts\v4\NARAEngine.sol",
    "contracts\v4\NARAGenesisRewardDistributorV4.sol",
    "contracts\v4\NARALauncher.sol",
    "contracts\v4\NARALiquidityCompounderV4.sol",
    "contracts\v4\NARALiquidityGrowthHook.sol",
    "contracts\v4\NARALiquidityGrowthVault.sol",
    "contracts\v4\NARAOpsVaultV4.sol",
    "contracts\v4\NARAArtMetadataV1.sol",
    "contracts\v4\NARAArtSecurityPrintV1.sol",
    "contracts\v4\NARAArtCorePlateV1.sol",
    "contracts\v4\NARAArtGenesisPlateV1.sol",
    "contracts\v4\NARAPositionAccountV4.sol",
    "contracts\v4\NARAPositionNFTV4.sol",
    "contracts\v4\NARAPositionRendererV5.sol",
    "contracts\v4\NARAPositionRendererV4.sol",
    "contracts\v4\NARARewardReserve.sol",
    "contracts\v4\NARAToken.sol",
    "contracts\v4\composability\NARAFractionalPositionFactoryV4.sol",
    "contracts\v4\composability\NARAFractionalPositionV4.sol",
    "contracts\v4\composability\NARAStakingPoolSYV4.sol",
    "contracts\v4\composability\NARAStakingPoolV4.sol",
    "contracts\v4\router\BribeRouterV4.sol",
    "contracts\v4\router\NARACirculatingSupplyV1.sol",
    "contracts\v4\router\NARADashboardLens.sol",
    "contracts\v4\router\NARAEngineOpsRouterV1.sol",
    "contracts\v4\router\NARAPositionDataLensV1.sol",
    "contracts\v4\router\NARAProtocolStatsLensV1.sol",
    "contracts\v4\router\NARARouter.sol",
    "contracts\v4\utils\Create2HookDeployer.sol"
  )
}

$solcPath = Ensure-Solc
New-Item -ItemType Directory -Force -Path $outPath | Out-Null
Get-ChildItem -LiteralPath $outPath -File -ErrorAction SilentlyContinue |
  Where-Object { $_.Extension -in @(".json", ".log", ".csv") } |
  Remove-Item -Force

$summary = @()
$failed = 0

Push-Location $repoRoot
try {
  foreach ($target in $Targets) {
    $targetPath = Join-Path $repoRoot $target
    if (-not (Test-Path -LiteralPath $targetPath)) {
      throw "Target not found: $target"
    }

    $name = ($target -replace "[:\\/\.]", "_")
    $json = Join-Path $outPath "$name.json"
    $log = Join-Path $outPath "$name.log"
    Remove-Item -LiteralPath $json, $log -ErrorAction SilentlyContinue

    $runs = "1"
    if ($target -in @(
      "contracts\v4\NARAToken.sol",
      "contracts\v4\NARALauncher.sol",
      "contracts\v4\NARALiquidityGrowthHook.sol",
      "contracts\v4\NARALiquidityGrowthVault.sol"
    )) {
      $runs = "200"
    }

    $solcArgs = "--base-path . --include-path node_modules --optimize --optimize-runs $runs --via-ir --evm-version cancun"
    if ($target -eq "contracts\v4\NARAEngine.sol") {
      $solcArgs += " --metadata-hash none"
    }

    Write-Host "Slither: $target"
    $slitherArgs = @(
      "-m", "slither",
      $target,
      "--solc", $solcPath,
      "--solc-working-dir", ".",
      "--solc-remaps", "@openzeppelin/=node_modules/@openzeppelin/ @uniswap/v4-core/=node_modules/@uniswap/v4-periphery/lib/v4-core/ @uniswap/v4-periphery/=node_modules/@uniswap/v4-periphery/",
      "--solc-args", $solcArgs,
      "--filter-paths", "node_modules|contracts/test|contracts/v4/mocks|contracts/mocks|archive",
      "--exclude-informational",
      "--exclude-low",
      "--json", $json,
      "--fail-none"
    )

    $exit = Invoke-LoggedProcess -FilePath $python -ArgumentList $slitherArgs -LogPath $log
    if ($exit -ne 0) {
      $failed += 1
    }

    $detectors = 0
    if (Test-Path -LiteralPath $json) {
      $data = Get-Content -LiteralPath $json -Raw | ConvertFrom-Json
      if ($data.results.PSObject.Properties.Name -contains "detectors") {
        $detectors = @($data.results.detectors).Count
      }
    }
    $summary += [pscustomobject]@{
      Target = $target
      Findings = $detectors
      ExitCode = $exit
      Json = $json
      Log = $log
    }
  }
} finally {
  Pop-Location
}

$summaryPath = Join-Path $outPath "_summary.csv"
$summary | Export-Csv -LiteralPath $summaryPath -NoTypeInformation
$summary | Format-Table -AutoSize

if ($failed -ne 0) {
  throw "$failed Slither target(s) failed. See $outPath"
}

Write-Host "Slither run complete. Summary: $summaryPath"
