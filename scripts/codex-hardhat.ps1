param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$HardhatArgs
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")
$localState = Join-Path $repoRoot ".codex-hardhat"
$localAppData = Join-Path $localState "localappdata"
$appData = Join-Path $localState "appdata"
$tempDir = Join-Path $localState "temp"
$hardhatCli = Join-Path $repoRoot "node_modules\hardhat\dist\src\cli.js"

foreach ($dir in @($localAppData, $appData, $tempDir)) {
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
}

$sourceCompilerCache = Join-Path $env:LOCALAPPDATA "hardhat-nodejs\Cache"
$targetCompilerCache = Join-Path $localAppData "hardhat-nodejs\Cache"
if ((Test-Path -LiteralPath $sourceCompilerCache) -and -not (Test-Path -LiteralPath (Join-Path $targetCompilerCache "compilers-v3"))) {
  New-Item -ItemType Directory -Force -Path $targetCompilerCache | Out-Null
  Copy-Item -Path (Join-Path $sourceCompilerCache "*") -Destination $targetCompilerCache -Recurse -Force
}

$env:LOCALAPPDATA = $localAppData
$env:APPDATA = $appData
$env:TEMP = $tempDir
$env:TMP = $tempDir
$env:HARDHAT_DISABLE_TELEMETRY = "true"

$nodeCandidates = @(
  "C:\nvm4w\nodejs\node.exe",
  "C:\Program Files\nodejs\node.exe",
  "node"
)

$nodeExe = $null
foreach ($candidate in $nodeCandidates) {
  $command = Get-Command $candidate -ErrorAction SilentlyContinue
  if ($null -ne $command) {
    $nodeExe = $command.Source
    break
  }
}

if ($null -eq $nodeExe) {
  throw "Node.js was not found."
}

if (-not (Test-Path -LiteralPath $hardhatCli)) {
  throw "Hardhat CLI was not found at $hardhatCli. Run dependency install before using this runner."
}

Push-Location $repoRoot
try {
  & $nodeExe --preserve-symlinks --preserve-symlinks-main $hardhatCli @HardhatArgs
  exit $LASTEXITCODE
} finally {
  Pop-Location
}
