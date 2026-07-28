#!/usr/bin/env bash
# NARA v4 — Linux security-gate runner (Aderyn + Echidna)
# Run as root on a fresh Ubuntu box. Expects /root/nara-gates.tgz (allowlisted source) present.
# Usage: bash /root/run-gates-linux.sh
# Reports land in /root/: aderyn-v4.md, aderyn-full.md, echidna-smoke.log, echidna-full.log
set -uo pipefail
log(){ echo "[$(date +%H:%M:%S)] $*"; }

log "=== NARA v4 Linux gate runner starting ==="

# 0) swap (4 GB box: solc --via-ir + echidna are memory-hungry)
if ! swapon --show 2>/dev/null | grep -q /swapfile; then
  log "adding 4G swap"
  fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
fi

# 1) extract allowlisted source
cd /root || exit 1
rm -rf nara-protocol-hardhat
tar xzf /root/nara-gates.tgz || { log "FATAL: cannot extract /root/nara-gates.tgz"; exit 1; }
cd /root/nara-protocol-hardhat || exit 1
log "source extracted: $(find contracts -name '*.sol' | wc -l) .sol files"

# 2) base packages
export DEBIAN_FRONTEND=noninteractive
log "apt installing base packages"
apt-get update -y >/tmp/apt.log 2>&1
apt-get install -y curl git build-essential python3 python3-pip python3-venv xz-utils ca-certificates jq >>/tmp/apt.log 2>&1

# 3) Node 20
if ! command -v node >/dev/null 2>&1; then
  log "installing Node 20"
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/tmp/node.log 2>&1
  apt-get install -y nodejs >>/tmp/node.log 2>&1
fi
log "node $(node -v)  npm $(npm -v)"

# 4) npm deps (needed for @openzeppelin / @uniswap import resolution)
log "npm ci (this pulls OpenZeppelin and Uniswap for import resolution)"
npm ci --no-audit --no-fund >/tmp/npmci.log 2>&1 \
  || { log "FATAL: npm ci failed"; tail -40 /tmp/npmci.log; exit 1; }
# Hard guard: the analyzers MUST have dependencies, otherwise they silently produce
# invalid output (echidna/slither fail to compile; aderyn reports false positives like
# "contract locks Ether" because it can't see the OZ base contracts). Fail loud instead.
if [ ! -f node_modules/@openzeppelin/contracts/utils/math/Math.sol ]; then
  log "FATAL: npm dependencies missing (node_modules/@openzeppelin not found)."
  log "Analyzer results would be INVALID without dependencies. Aborting. Last npm log:"
  tail -40 /tmp/npmci.log
  exit 1
fi
log "npm deps installed ($(ls node_modules | wc -l) packages)"

# 5) solc 0.8.34 + crytic-compile
log "installing solc-select + crytic-compile"
pip3 install --break-system-packages -q solc-select crytic-compile >/tmp/pip.log 2>&1
export PATH="$HOME/.local/bin:$PATH"
solc-select install 0.8.34 >>/tmp/pip.log 2>&1
solc-select use 0.8.34 >>/tmp/pip.log 2>&1
log "solc: $(solc --version 2>/dev/null | tail -1)"

# 6) Aderyn (via npm)
log "installing Aderyn"
npm i -g @cyfrin/aderyn >/tmp/aderyn-install.log 2>&1
log "aderyn: $(aderyn --version 2>&1 | head -1)"
aderyn --help 2>&1 | head -40 > /root/aderyn-help.txt

# 7) Echidna (latest linux binary)
log "downloading Echidna (latest linux release)"
EURL=$(curl -fsSL https://api.github.com/repos/crytic/echidna/releases/latest | jq -r '.assets[].browser_download_url' | grep -iE 'x86_64-linux.*\.tar\.gz' | head -1)
if [ -z "$EURL" ]; then EURL="https://github.com/crytic/echidna/releases/download/v2.2.6/echidna-2.2.6-x86_64-linux.tar.gz"; fi
log "echidna url: $EURL"
curl -fsSL -o /tmp/echidna.tar.gz "$EURL" && tar xzf /tmp/echidna.tar.gz -C /tmp && chmod +x /tmp/echidna && mv /tmp/echidna /usr/local/bin/echidna
log "echidna: $(echidna --version 2>&1 | head -1)"

SOLC_ARGS="--base-path . --include-path node_modules --optimize --optimize-runs 1 --via-ir --evm-version cancun --metadata-hash none --allow-paths .,node_modules"

# 8) ADERYN
set +e
log "=== ADERYN v4-only ==="
aderyn -i contracts/v4 -x contracts/v4/mocks -o /root/aderyn-v4.md . 2>/root/aderyn-v4.err
[ -s /root/aderyn-v4.md ] || { log "scoped flags failed, retrying plain"; aderyn contracts/v4 -o /root/aderyn-v4.md . 2>>/root/aderyn-v4.err; }
log "aderyn v4 report: $(wc -l < /root/aderyn-v4.md 2>/dev/null) lines"

log "=== ADERYN full ==="
aderyn -x contracts/v4/mocks,contracts/test -o /root/aderyn-full.md . 2>/root/aderyn-full.err
log "aderyn full report: $(wc -l < /root/aderyn-full.md 2>/dev/null) lines"

# 9) ECHIDNA
log "=== ECHIDNA SMOKE (test-limit 1000) ==="
timeout 1800 echidna echidna/harnesses/EchidnaNARAEngineV4Harness.sol \
  --contract EchidnaNARAEngineV4Harness --config echidna/v4-engine.yaml --format text \
  --test-limit 1000 --seq-len 32 --solc-args "$SOLC_ARGS" >/root/echidna-smoke.log 2>&1
log "smoke tail:"; tail -25 /root/echidna-smoke.log

log "=== ECHIDNA FULL (config test-limit 10000) ==="
timeout 5400 echidna echidna/harnesses/EchidnaNARAEngineV4Harness.sol \
  --contract EchidnaNARAEngineV4Harness --config echidna/v4-engine.yaml --format text \
  --solc-args "$SOLC_ARGS" >/root/echidna-full.log 2>&1
log "full tail:"; tail -40 /root/echidna-full.log
set -e

# 10) summary
log "=== SUMMARY ==="
echo "----- ADERYN v4 (issue headers) -----"
grep -iE "^#|issues?|critical|high|medium|low" /root/aderyn-v4.md 2>/dev/null | head -40
echo "----- ECHIDNA full (verdicts) -----"
grep -iE "passing|passed|failed|falsified|tests:|property" /root/echidna-full.log 2>/dev/null | tail -30
echo
log "Reports on server: /root/aderyn-v4.md /root/aderyn-full.md /root/echidna-smoke.log /root/echidna-full.log"
log "=== DONE ==="
