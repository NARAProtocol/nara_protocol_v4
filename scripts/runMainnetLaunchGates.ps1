param(
  [switch]$SkipLocal,
  [switch]$SkipStatic,
  [switch]$SkipLivePreflight
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$skipDirs = @(
  "node_modules",
  "artifacts",
  "cache",
  "aderyn-reports",
  "slither-reports",
  ".venv-slither",
  ".codex-hardhat",
  "archive",
  "types",
  "deployments"
)
$secretPattern = '(?i)(private[_-]?key|mnemonic|seed[_-]?phrase|secret)\s*[:=]\s*["'']?(0x[a-f0-9]{64}|[a-z]+\s+[a-z]+\s+[a-z]+\s+[a-z]+\s+[a-z]+\s+[a-z]+|[A-Za-z0-9/+_=]{40,})'

function Invoke-Gate {
  param(
    [string]$Name,
    [string[]]$Command
  )

  Write-Host ""
  Write-Host "==> $Name"
  $exe = $Command[0]
  $args = @($Command | Select-Object -Skip 1)
  & $exe @args
  if ($LASTEXITCODE -ne 0) {
    throw "Gate failed: $Name"
  }
}

function Invoke-SecretAssignmentScan {
  Write-Host ""
  Write-Host "==> hardcoded secret assignment scan"
  $hits = New-Object System.Collections.Generic.HashSet[string]

  Get-ChildItem -LiteralPath $repoRoot -Recurse -File -Force -Include *.ts,*.js,*.json,*.md,*.cjs,*.ps1,*.cmd |
    Where-Object {
      $path = $_.FullName
      $inSkippedDir = $false
      foreach ($dir in $skipDirs) {
        if ($path -like "*$([IO.Path]::DirectorySeparatorChar)$dir$([IO.Path]::DirectorySeparatorChar)*") {
          $inSkippedDir = $true
          break
        }
      }
      -not $inSkippedDir -and $_.Name -notin @(".env", "package-lock.json")
    } |
    ForEach-Object {
      $text = Get-Content -LiteralPath $_.FullName -Raw -ErrorAction SilentlyContinue
      if ($text -match $secretPattern) {
        [void]$hits.Add($_.FullName)
      }
    }

  if ($hits.Count -gt 0) {
    Write-Host "Hardcoded secret-looking assignments found:"
    $hits | Sort-Object | ForEach-Object { Write-Host $_ }
    throw "Gate failed: hardcoded secret assignment scan"
  }

  Write-Host "No hardcoded key/mnemonic/secret assignments found outside local/generated paths."
}

Push-Location $repoRoot
try {
  if (-not $SkipLocal) {
    Invoke-Gate "build" @("npm", "run", "build")
    Invoke-Gate "tests" @("npm", "test")
    Invoke-Gate "bytecode size" @("npm", "run", "size")
    Invoke-Gate "dependency audit high/critical" @("npm", "audit", "--audit-level=high")
    Invoke-SecretAssignmentScan
  }

  if (-not $SkipStatic) {
    Invoke-Gate "Slither v4" @("npm", "run", "slither:v4")
    Invoke-Gate "Aderyn v4" @("npm", "run", "aderyn:v4")
    Invoke-Gate "Echidna v4" @("npm", "run", "echidna:v4")
  }

  if (-not $SkipLivePreflight) {
    if ($env:V4_ALLOW_RETIRED_DEFAULTS -eq "1") {
      throw "Gate failed: V4_ALLOW_RETIRED_DEFAULTS=1 is recovery-only and cannot be used for launch gates."
    }
    Invoke-Gate "read-only v4 preflight" @("npm", "run", "verify:v4:preflight")
    Invoke-Gate "v4 launch-gate verification (audit gates)" @("npm", "run", "verify:v4:launch-gates")
  }

  Write-Host ""
  Write-Host "Mainnet launch gates completed."
  if ($SkipLivePreflight) {
    Write-Host "Live preflight skipped. Run without -SkipLivePreflight after final fresh v4 addresses are set."
  }
} finally {
  Pop-Location
}
