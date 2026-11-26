# Security policy

## Current security posture

The live Base Mainnet (`Chain ID: 8453`) deployment is **NARA Protocol V5** (`36` source-verified contracts including ownerless `NARAGenesisShieldVaultV5`, paired with `6` verified CryptoSLIP `v33`/`v32` contracts — `42/42` total), tracked at [`docs/CURRENT_STATE.md`](docs/CURRENT_STATE.md) and verified independently in [`NARAProtocol/nara_protocol`](https://github.com/NARAProtocol/nara_protocol). All August 2026 `contracts/v4/` contracts in this repository are **permanently retired, frozen, and read-only** (`npm run verify:frozen-v4`).

Official web interfaces (`https://naraprotocol.io`, `https://slip.naraprotocol.io`) publish RFC 9116 disclosure endpoints at [`/.well-known/security.txt`](https://naraprotocol.io/.well-known/security.txt), alongside public [Privacy Policy](https://naraprotocol.io/privacy), [Terms & Risk Disclosure](https://naraprotocol.io/terms), and [Accessibility Statement](https://naraprotocol.io/accessibility) notices.

The live contracts and pools operate with real assets on Base Mainnet. Deployment and observed operation do not imply a warranty, guaranteed liquidity, or a recommendation to transact. Transactions are irreversible; liquidity can be limited or unavailable; token values can fall to zero. Canonical state and verified addresses are maintained in [`docs/CURRENT_STATE.md`](docs/CURRENT_STATE.md).

## Reporting a vulnerability

Do not open a public issue, pull request, discussion, or social-media post for a suspected exploitable vulnerability.

- **Security Email (RFC 9116 `security.txt`):** **security@naraprotocol.io**
- **Privacy & GDPR Inquiries:** **privacy@naraprotocol.io** ([`https://naraprotocol.io/privacy`](https://naraprotocol.io/privacy))

Include, when possible:

- affected contract, function, and source line;
- affected network and contract address;
- concrete preconditions;
- attacker transaction or call sequence;
- expected and observed behavior;
- impact and reproducible test;
- suggested mitigation.

Do not include private keys, seed phrases, credentials, personal data, or funds.
Do not test against production contracts in a way that changes state or affects
other users.

## Scope

In scope:

- Solidity under `contracts/v4/`;
- v4 deployment and verification scripts;
- privilege, accounting, solvency, liveness, and integration failures;
- discrepancies between documented and deployed v4 bytecode;
- vulnerabilities in active v4 configuration that can cause unauthorized loss
  or control.

Out of scope:

- archived v3 implementations and retired addresses;
- token-price movement, market speculation, or unavailable liquidity by itself;
- attacks requiring a reporter to use stolen credentials;
- automated scanner output without a source location and reproducible attack
  path;
- denial-of-service against local developer tooling with no protocol impact.

The project does not promise a bounty, payment, safe harbor, response time, or
remediation deadline. Any such program requires separately published terms.

## Design controls

Important controls observable in the source include:

- fixed permanent token issuance, with only bounded same-transaction flash
  minting;
- an engine separated from token-transfer policy;
- sealed reward-reserve behavior;
- bounded epoch advancement and explicit stale-epoch failure;
- reentrancy guards on value-moving external entry points;
- zero deployed `REWARD_NOTIFIER_ROLE` holders and an operational prohibition
  on `notifyTokenRewards`; the immutable function's role check alone is not the
  current safety boundary;
- direct ETH rejection except through defined payable paths;
- bounded batch sizes and configurable-parameter caps;
- explicit deployment-state verification and bytecode-size gates.

These controls reduce specific risks; they do not prove the protocol is safe.

## Verification evidence

The repository includes:

- a full Hardhat unit and regression suite;
- deployment-coverage tests;
- engine accounting regression invariants;
- an Echidna engine property harness;
- Slither and Aderyn runners;
- deployable-bytecode and initcode size enforcement;
- optional Base-fork tests for Uniswap v4 integration;
- a sanitized fresh-core deployment manifest and canonical receipt
  reconciliation;
- receipt-pinned live buy/sell and same-block Hook-tax evidence; and
- receipt-pinned Engine recovery and Compounder validation/freeze evidence.

At the latest publication preparation pass:

- `npm run build` passed;
- `npm test` passed;
- `npm run size` passed for every deployable artifact;
- `npm audit --audit-level=high` passed;
- npm reported eight Low transitive advisories in the Hardhat explorer
  verification dependency chain, with no upstream fix available.

Automated analysis can produce false positives and false negatives. Internal
review and passing tests are not equivalent to an independent security audit,
formal verification, or a warranty.

## Operational limitations

The current Safe, treasury custody, keeper model, and operational procedures
must be evaluated separately from contract correctness. Current limitations,
including pending Engine lifecycle smoke, bounded recurring automation,
`integrationReady: false` Position NFT state, preview-only baskets,
range-manager deployment and canary gates, and custody requirements, are
documented in
[`docs/CURRENT_STATE.md`](docs/CURRENT_STATE.md).

Never:

- commit `.env` files or wallet material;
- paste a private RPC URL into an issue or CI log;
- use a production key for local tests;
- run deployment, seeding, role-transfer, or liquidity scripts without explicit
  authorization and an independently reviewed target configuration;
- assume an address is current because it appears in Git history or an archived
  document.

## Supported versions

Only the active v4 source on the default branch is eligible for security
maintenance. Historical v3 and incident-stack contracts remain onchain but are
not supported.
