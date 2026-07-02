# Test Agent Rules

This folder contains the active v4 Hardhat test suite.

- Tests should target active v4 behavior.
- Do not reintroduce v3 tests from `archive/legacy-v3/`.
- Do not add jackpot, mining, or old cron assumptions.
- Mocks are test-only and must not be treated as live behavior.
- If changing production Solidity, add focused tests for the changed behavior.
- For docs-only work, no tests are required unless a docs lint command exists.
