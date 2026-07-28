# Router And Periphery Agent Rules

Routers and lenses are the preferred place for operational ergonomics and
observability when core contracts are frozen.

## Allowed Direction

- Routers may add observability events when explicitly requested.
- Routers may wrap admin/ops calls to make monitored paths clear.
- Lenses may add read-only views for dashboards and monitors.
- New periphery is preferred over edits to `NARAEngine.sol` or
  `NARAPositionNFTV4.sol`.

## Safety Rules

- Routers must not custody funds unexpectedly.
- Routers must not retain ETH, NARA, or ERC-20 tokens unless explicitly
  designed, documented, and tested.
- Router calls should make direct core admin calls distinguishable from normal
  operations.
- Routine `PARAM_ROLE` and `TREASURY_ROLE` actions should go through the
  approved ops router.
- Break-glass direct core calls are exceptional and monitored.
- Do not hide authority paths behind generic helper calls.

## Forbidden Reintroductions

- No v3 assumptions.
- No mining.
- No jackpot/lotto.
- No old cron/keeper behavior.
