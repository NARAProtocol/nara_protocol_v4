# v4 Mock Contract Rules

This folder is test-only.

- Do not deploy mocks to production.
- Do not import mocks from active production contracts.
- Do not use mocks as evidence of live protocol behavior.
- Do not use mocks to justify v3, mining, jackpot, or cron assumptions.
- If a mock diverges from active v4 behavior, trust the active v4 contract and
  update the mock only when tests explicitly require it.
