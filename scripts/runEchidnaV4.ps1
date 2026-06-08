param(
  [string]$OutLog = "echidna\v4-engine.log",
  [string]$Distro = $(if ($env:ECHIDNA_WSL_DISTRO) { $env:ECHIDNA_WSL_DISTRO } else { "AderynTmp20260524" }),
  [string]$EchidnaBin = $(if ($env:ECHIDNA_BIN) { $env:ECHIDNA_BIN } else { "/root/echidna-2.3.2/echidna" }),
  [string]$VenvBin = $(if ($env:ECHIDNA_VENV_BIN) { $env:ECHIDNA_VENV_BIN } else { "/root/echidna-venv/bin" }),
  [string]$SolcDir = $(if ($env:ECHIDNA_SOLC_DIR) { $env:ECHIDNA_SOLC_DIR } else { "/root/.svm/0.8.34" }),
  [string]$SolcBin = $(if ($env:ECHIDNA_SOLC_BIN) { $env:ECHIDNA_SOLC_BIN } else { "/root/.svm/0.8.34/solc-0.8.34" }),
  [int]$TestLimit = 0,
  [int]$SeqLen = 0,
  [switch]$EnableSlither
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$logPath = Join-Path $repoRoot $OutLog
$logDir = Split-Path -Parent $logPath
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

function ConvertTo-WslPath {
  param([string]$Path)
  if ($Path.StartsWith("/")) {
    return $Path
  }

  $fullPath = [System.IO.Path]::GetFullPath($Path)
  if ($fullPath -notmatch "^([A-Za-z]):\\(.*)$") {
    throw "Only local drive paths can be converted for WSL: $Path"
  }

  $drive = $Matches[1].ToLowerInvariant()
  $relative = $Matches[2] -replace "\\", "/"
  return "/mnt/$drive/$relative"
}

function Quote-Bash {
  param([string]$Value)
  return "'" + ($Value -replace "'", "'\''") + "'"
}

function Get-LinuxDir {
  param([string]$Path)
  if ($Path.StartsWith("/")) {
    return ($Path -replace "/[^/]+$", "")
  }
  return Split-Path -Parent $Path
}

function Join-LinuxPath {
  param([string]$Left, [string]$Right)
  return $Left.TrimEnd("/") + "/" + $Right.TrimStart("/")
}

function Invoke-WslBash {
  param([string]$Command)
  $encoded = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($Command))
  & wsl.exe -d $Distro -- bash -lc "printf %s $encoded | base64 -d | bash"
  if ($LASTEXITCODE -ne 0) {
    throw "Echidna v4 failed in WSL distro '$Distro'."
  }
}

$repoWsl = ConvertTo-WslPath $repoRoot
$logWsl = ConvertTo-WslPath $logPath
$echidnaDir = Get-LinuxDir $EchidnaBin
$solcLink = Join-LinuxPath $SolcDir "solc"

$limitArgs = ""
if ($TestLimit -gt 0) {
  $limitArgs = " --test-limit $TestLimit"
}

$seqArgs = ""
if ($SeqLen -gt 0) {
  $seqArgs = " --seq-len $SeqLen"
}

$slitherArgs = ""
if (-not $EnableSlither) {
  $slitherArgs = " --disable-slither"
}

$command = @"
set -euo pipefail
export PATH=$(Quote-Bash $SolcDir):$(Quote-Bash $VenvBin):$(Quote-Bash $echidnaDir):"`$PATH"
ln -sf $(Quote-Bash $SolcBin) $(Quote-Bash $solcLink)
cd $(Quote-Bash $repoWsl)

echo "Echidna: `$($(Quote-Bash $EchidnaBin) --version)"
echo "crytic-compile: `$(crytic-compile --version)"
echo "solc: `$(solc --version | head -2 | tail -1)"

set +e
$(Quote-Bash $EchidnaBin) echidna/harnesses/EchidnaNARAEngineV4Harness.sol \
  --contract EchidnaNARAEngineV4Harness \
  --config echidna/v4-engine.yaml \
  --format text$limitArgs$seqArgs$slitherArgs \
  --solc-args "--base-path . --include-path node_modules --optimize --optimize-runs 1 --via-ir --evm-version cancun --metadata-hash none --allow-paths .,node_modules" \
  > $(Quote-Bash $logWsl) 2>&1
status=`$?
set -e
tail -160 $(Quote-Bash $logWsl)
exit `$status
"@

Invoke-WslBash $command

Write-Host "Echidna run complete. Log: $logPath"
