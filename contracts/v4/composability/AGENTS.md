# v4 Composability Agent Rules

This folder contains optional v4 extension contracts built on top of the locked
position layer.

- Treat these contracts as active v4 code, but not frozen core.
- Do not assume deployment unless current deployment docs prove it.
- Do not change core engine or NFT behavior from here.
- Do not imply pooled, fractional, or Pendle integrations are active on mainnet
  until deployment docs prove it.
- Do not reintroduce v3 wrapper assumptions.
- Do not connect to mining or jackpot logic.
- New behavior must preserve read-only monitor assumptions unless the user
  explicitly requests otherwise.
