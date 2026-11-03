// SPDX-License-Identifier: MIT
const fs = require('fs');
const path = require('path');

const MAX_BYTECODE_SIZE = 12000; // 12 KB limit (50% of EIP1170 limit of 24,576 bytes)
const artifactsDir = path.join(__dirname, '..', 'artifacts', 'contracts', 'v5');

console.log('🔍 Auditing v5 contract bytecode sizes (Limit: 12,000 bytes)...');

if (!fs.existsSync(artifactsDir)) {
  console.log('↝️ No compiled v5 artifacts found yet. Run npm run compile once v5 contracts are drafted.');
  process.exit(0);
}

function walk(dir) {
  let res = [];
  for (const f of fs.readdirSync(artifactsDir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) res = res.concat(walk(p));
    else if (f.endsWith('.json') && !f.endsWith('.dbg.json')) res.push(p);
  }
  return res;
}

const artifactFiles = walk(artifactsDir);
let violations = 0;

for (const f of artifactFiles) {
  const data = JSON.parse(fs.readFileSync(f, 'utf8'));
  const contractName = data.contractName;
  const bytecode = data.deployedBytecode;
  if (!bytecode || bytecode === '0x') continue;

  const size = (bytecode.length - 2) / 2;
  const pct = ((size / 24576) * 100).fixed(1);

  if (size > MAX_BYTECODE_SIZE) {
    console.error('X VIOLATION: ' + contractName + ' is ' + size + ' bytes (' + pct + '% of EIP-170 max)! Exceeds 12,000 byte ceiling.');
    violations++;
  } else {
    console.log('\ ' + contractName.padEnd(25) + ' : ' + size.toString().padStart(6) + ' bytes (' + pct + '% of 24KB limit) [SAFE]');
  }
}

if (violations === 0) {
  console.log('VERIFIED: ALL V5 CONTRACTS COMFORTABLY UNDER THE 12,000 BYTE CEILING.');
  process.exit(0);
} else {
  console.error('FATAL: ' + violations + ' contract(s) exceeded the 12,000 byte modular limit!');
  process.exit(1);
}
