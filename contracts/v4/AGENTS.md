# v4 Contract Agent Rules

This folder contains the active v4 Solidity source. Treat it as high risk.

## Frozen Core

- `NARAEngine.sol` is frozen core. Do not edit it unless the user explicitly
  orders that exact edit.
- `NARAPositionNFTV4.sol` is frozen core. Do not edit it unless the user
  explicitly orders that exact edit.
- Do not add events to frozen core just for monitoring.
- Do not change helper signatures for indexer convenience.
- Do not change storage layout casually.
- Do not change role model casually.

## Preferred Change Path

Use these before touching frozen core:

- new periphery contracts
- routers
- lenses
- monitor handlers
- offchain scanners
- SQL views
- docs

Observability should usually happen through router events, monitor indexing,
call traces, failed transaction scanning, and read-only reports.

## Forbidden Reintroductions

- No v3 imports.
- No mining.
- No jackpot/lotto.
- No old keeper/cron assumptions.
- No retired incident-stack address defaults.
- No production private keys or transactions from AI.
