# Script Agent Rules

This folder contains deployment, verification, smoke, sync, and operations
scripts. Treat it as high risk.

- Do not run live deployment or write scripts without explicit human approval.
- Do not send transactions unless the user explicitly approves the exact action.
- Do not print private keys, RPC keys, deployer secrets, or API tokens.
- Use fresh v4 environment variables only.
- Do not add retired v3 or retired incident-stack address defaults.
- Do not reintroduce jackpot, mining, or old cron assumptions.
- Prefer read-only verification scripts when unsure.
- If a script may write to production, say so plainly before running it.
