param(
  [string]$OutDir = "aderyn-reports\v4",
  [string]$Distro = $(if ($env:ADERYN_WSL_DISTRO) { $env:ADERYN_WSL_DISTRO } else { "AderynTmp20260524" }),
  [string]$AderynBin = $env:ADERYN_BIN,
  [string]$SolcBin = $env:ADERYN_SOLC_PATH,
  [switch]$FullOnly,
  [switch]$V4Only
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$outPath = Join-Path $repoRoot $OutDir
$solcVersion = "0.8.34"

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

function Invoke-WslBash {
  param([string]$Command)
  $encoded = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($Command))
  & wsl.exe -d $Distro -- bash -lc "printf %s $encoded | base64 -d | bash"
  if ($LASTEXITCODE -ne 0) {
    throw "WSL command failed in distro '$Distro'."
  }
}

function Resolve-AderynBinary {
  if (-not [string]::IsNullOrWhiteSpace($AderynBin)) {
    if ($AderynBin.StartsWith("/")) {
      return $AderynBin
    }
    if (-not (Test-Path -LiteralPath $AderynBin)) {
      throw "ADERYN_BIN was set but file was not found: $AderynBin"
    }
    return ConvertTo-WslPath $AderynBin
  }

  $tempRoot = Join-Path $env:LOCALAPPDATA "Temp\aderyn-wsl"
  $candidateBins = @(
    (Join-Path $tempRoot "aderyn-x86_64-unknown-linux-gnu\aderyn"),
    (Join-Path $tempRoot "aderyn-bin\aderyn-x86_64-unknown-linux-gnu\aderyn")
  )

  foreach ($defaultBin in $candidateBins) {
    if (Test-Path -LiteralPath $defaultBin) {
      return ConvertTo-WslPath $defaultBin
    }
  }

  $archive = Join-Path $tempRoot "aderyn-x86_64-unknown-linux-gnu.tar.xz"
  $extractedBin = $candidateBins[0]
  if (Test-Path -LiteralPath $archive) {
    $archiveWsl = ConvertTo-WslPath $archive
    $tempRootWsl = ConvertTo-WslPath $tempRoot
    Invoke-WslBash "set -euo pipefail; mkdir -p $(Quote-Bash $tempRootWsl); tar -xf $(Quote-Bash $archiveWsl) -C $(Quote-Bash $tempRootWsl); chmod +x $(Quote-Bash (ConvertTo-WslPath $extractedBin))"
    if (Test-Path -LiteralPath $extractedBin) {
      return ConvertTo-WslPath $extractedBin
    }
  }

  $pathProbe = & wsl.exe -d $Distro -- bash -lc "command -v aderyn || true"
  if ($LASTEXITCODE -eq 0 -and -not [string]::IsNullOrWhiteSpace($pathProbe)) {
    $pathHit = ($pathProbe | Select-Object -First 1).Trim()
    if (-not $pathHit.StartsWith("/mnt/")) {
      return $pathHit
    }
  }

  throw "Aderyn binary not found. Install it inside WSL or set ADERYN_BIN to the Linux Aderyn binary path."
}

function Ensure-SolcInSvm {
  if ([string]::IsNullOrWhiteSpace($SolcBin)) {
    $defaultSolc = Join-Path $env:LOCALAPPDATA "Temp\aderyn-wsl\solc-linux-amd64-v0.8.34+commit.80d5c536"
    if (Test-Path -LiteralPath $defaultSolc) {
      $SolcBin = $defaultSolc
    }
  }

  $solcWsl = ""
  if (-not [string]::IsNullOrWhiteSpace($SolcBin)) {
    if ($SolcBin.StartsWith("/")) {
      $solcWsl = $SolcBin
    } elseif (Test-Path -LiteralPath $SolcBin) {
      $solcWsl = ConvertTo-WslPath $SolcBin
    } else {
      throw "ADERYN_SOLC_PATH was set but file was not found: $SolcBin"
    }
  }

  $solcWslQuoted = Quote-Bash $solcWsl

  $seedCommand = @"
set -euo pipefail
mkdir -p "`$HOME/.svm/$solcVersion"
seed_src=$solcWslQuoted
if [ ! -x "`$HOME/.svm/$solcVersion/solc-$solcVersion" ]; then
  if [ -z "`$seed_src" ] || [ ! -f "`$seed_src" ]; then
    echo "solc $solcVersion not found in SVM and no seed binary was available." >&2
    echo "Set ADERYN_SOLC_PATH to the Linux solc $solcVersion binary." >&2
    exit 64
  fi
  cp "`$seed_src" "`$HOME/.svm/$solcVersion/solc-$solcVersion"
  chmod +x "`$HOME/.svm/$solcVersion/solc-$solcVersion"
fi
printf "$solcVersion\n" > "`$HOME/.svm/.global-version"
"`$HOME/.svm/$solcVersion/solc-$solcVersion" --version | grep "$solcVersion" >/dev/null
"@

  Invoke-WslBash $seedCommand
}

function Invoke-AderynReport {
  param(
    [string]$AderynWsl,
    [string]$RepoWsl,
    [string]$OutputFile,
    [string]$Includes,
    [string]$Excludes
  )

  $outputWsl = ConvertTo-WslPath $OutputFile
  $parts = @(
    "cd $(Quote-Bash $RepoWsl)",
    "&&",
    "$(Quote-Bash $AderynWsl)",
    "-s contracts"
  )
  if (-not [string]::IsNullOrWhiteSpace($Includes)) {
    $parts += "-i $(Quote-Bash $Includes)"
  }
  if (-not [string]::IsNullOrWhiteSpace($Excludes)) {
    $parts += "-x $(Quote-Bash $Excludes)"
  }
  $parts += "-o $(Quote-Bash $outputWsl)"
  $parts += "."

  Write-Host "Aderyn: $OutputFile"
  Invoke-WslBash ($parts -join " ")
}

if ($FullOnly -and $V4Only) {
  throw "Use either -FullOnly or -V4Only, not both."
}

New-Item -ItemType Directory -Force -Path $outPath | Out-Null

$repoWsl = ConvertTo-WslPath $repoRoot
$aderynWsl = Resolve-AderynBinary
Ensure-SolcInSvm

$scopes = @()
if (-not $V4Only) {
  $scopes += [pscustomobject]@{
    Name = "report"
    Includes = ""
    Excludes = "archive,contracts/test,contracts/v4/mocks"
  }
}
if (-not $FullOnly) {
  $scopes += [pscustomobject]@{
    Name = "report-v4-only"
    Includes = "contracts/v4"
    Excludes = "contracts/v4/mocks"
  }
}

foreach ($scope in $scopes) {
  foreach ($format in @("md", "json", "sarif")) {
    $outputFile = Join-Path $outPath "$($scope.Name).$format"
    Invoke-AderynReport `
      -AderynWsl $aderynWsl `
      -RepoWsl $repoWsl `
      -OutputFile $outputFile `
      -Includes $scope.Includes `
      -Excludes $scope.Excludes
  }
}

Write-Host "Aderyn run complete. Reports: $outPath"
