# Security policy

## Current security posture

NARA v4 has a fresh core deployment on Base from the immutable release commit
identified in `docs/CURRENT_STATE.md`. The token, engine, reward reserve,
liquidity hook, liquidity vault, and CREATE2 Hook deployer are deployed and
source-verified. The Compounder is deployed, source-verified, live-validated,
and permanently bound to the Vault. The NARA/USDC pool is registered,
initialized, seeded, and trading. The Safe owns seed LP NFT `2898124`; the
Compounder owns validated LP NFT `2898486`. Public locking and reward use have
not been activated, and recurring maintenance remains disabled.

Deployment does not imply activation, audit completion, economic safety, or a
recommendation to transact. Canonical state and addresses are maintained in
[`docs/CURRENT_STATE.md`](docs/CURRENT_STATE.md).

## Reporting a vulnerability

Do not open a public issue, pull request, discussion, or social-media post for a
suspected exploitable vulnerability.

Email: **security@naraprotocol.pro**

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
- role-gated ERC-20 reward notification;
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
including disabled recurring maintenance, pending Engine lifecycle smoke,
preview-only baskets, and custody requirements, are documented in
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
