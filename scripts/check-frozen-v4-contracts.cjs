// SPDX-License-Identifier: MIT
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function walk(dir) {
  let res = [];
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) res = res.concat(walk(p));
    else if (p.endsWith('.sol')) res.push(p);
  }
  return res;
}

const manifestPath = path.join(__dirname, '..', 'docs', 'FROZEN_V4_SOLIDITY_MANIFEST.json');
if (!fs.existsSync(manifestPath)) {
  console.error('X Frozen manifest missing at:', manifestPath);
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const currentFiles = walk(path.join(__dirname, '..', 'contracts', 'v4')).sort();
let drift = 0;

console.log(' Checking ' + manifest.contracts.length + ' frozen contracts against cryptographic manifest...');

if (currentFiles.length !== manifest.contracts.length) {
  console.error('X Count mismatch: found ' + currentFiles.length + ', expected ' + manifest.contracts.length);
  drift++;
}

for (const c of manifest.contracts) {
  const fullPath = path.join(__dirname, '..', c.file);
  if (!fs.existsSync(fullPath)) {
    console.error('X Missing file: ' + c.file);
    drift++;
    continue;
  }
  const content = fs.readFileSync(fullPath);
  const h = crypto.createHash('sha256').update(content).digest('hex');
  if (h !== c.sha256) {
    console.error('X MUTATION DETECTED in: ' + c.file);
    drift++;
  }
}

if (drift === 0) {
  console.log(' VERIFIED: ALL ' + manifest.contracts.length + ' V4 CONTRACTS ARE 100% PRISTINE & UNTOUCHED.');
  process.exit(0);
} else {
  console.error('FATAL: ' + drift + ' MUTATION(S) DETECTED IN FROZEND�X4 CONTRACTS!');
  process.exit(1);
}
