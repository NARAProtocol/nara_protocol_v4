# Deprecated Assumptions

Future AI agents must not reintroduce these assumptions unless the user
explicitly asks for historical analysis or a new v4 rebuild.

## Protocol

- v3 is deprecated and retired.
- v3 mainnet addresses are not live protocol addresses.
- Retired incident-stack v4 addresses are not public launch addresses.
- The active source path is `contracts/v4/`.
- The fresh v4 launch must use fresh deployment addresses.

## Features

- Jackpot/lotto is deprecated unless explicitly restored in a new v4 design.
- Mining is not active unless active v4 code proves otherwise.
- Arena and other old satellites are not active v4 features unless ported.
- MisterMint is historical unless rebuilt for v4.
- Old cron/keeper assumptions are deprecated. v4 uses JIT epoch behavior and
  router/periphery flows where documented.

## Integrations

- Old ABIs must not be hand-written into new integrations.
- Generated active v4 Hardhat artifacts are the source of truth for ABIs.
- Do not default to archived ABI names, event names, or address variables.
- Do not connect new monitor/indexer code to v3, jackpot, mining, arena, or
  retired incident-stack contracts.

## Core Editing

- Do not edit `NARAEngine.sol` unless explicitly ordered.
- Do not edit `NARAPositionNFTV4.sol` unless explicitly ordered.
- Do not add core events just for monitoring convenience.
- Do not change helper signatures just to make an indexer easier.
- Do not change storage layout casually.
- Do not change role model casually.

## AI And Operations

- AI agents are read/report only unless explicitly granted more authority.
- AI must not send transactions.
- AI must not hold private keys.
- AI must not perform production writes.
- AI must not deploy contracts without human approval.
- AI summaries must not invent evidence, hide critical alerts, lower severity,
  resolve alerts, or add recommendations not present in Commander reports.
