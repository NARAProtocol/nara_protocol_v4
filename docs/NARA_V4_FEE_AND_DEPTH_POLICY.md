# NARA v4 Fee and Depth Policy

Historical Change-ID: `NARA-20260731-fee-policy`

Status: **SUPERSEDED — DO NOT FINALIZE.** The low 0.75%/1%/2% curves were
proposed on-chain but were never activated. The liquidity-stack reset decision
`NARA-20260731-liquidity-stack-reset` retires this policy and the current
hook/vault/compounder stack. Do not build, sign, or execute the pending
`executeFeeCurve(true)` or `executeFeeCurve(false)` calls. A pending curve is
inert until those owner calls execute.

The approved replacement direction is documented in
[NARA_V4_LIQUIDITY_STACK_RESET_PLAN.md](NARA_V4_LIQUIDITY_STACK_RESET_PLAN.md).
The material below is preserved as historical analysis only; it is not an
operator runbook.

## Fee Curve

The active 2026-07-30 hook curve charges a 5% floor and materially rewards
splitting trades across blocks. The reviewed replacement uses the same curve
for buys and sells:

| Marginal depth band | Fee |
|---|---:|
| 0% to 25% | 0.75% |
| 25% to 50% | 1.00% |
| Above 50% | 2.00% |

The formal encoded curve retains an unused 10% boundary because the hook
requires three strictly increasing thresholds. The fee on both sides of that
boundary is the same 0.75%.

At the configured 300 USDC depth:

- 1 USDC pays 0.0075 USDC;
- 96 USDC in one trade pays 0.7725 USDC; and
- eight 12 USDC trades pay 0.72 USDC in aggregate.

The maximum measured saving from that split is 0.0525 USDC, or roughly 0.055%
of input, instead of the current 4.95 USDC saving. Price impact and the
underlying Uniswap pool fee remain separate from the hook fee.

Historical command (disabled for this migration; do not use):

```powershell
npm run build:v4:fee-curve
```

Historical finalization command (do not use):

```powershell
npm run build:v4:fee-curve -- --finalize
```

The old builder was non-broadcasting, but its calldata would target a policy
that is no longer approved. The pending owner calls must remain unexecuted while
the old pool is wound down.

## Protocol Depth

`protocolDepth` is a conservative fee-capacity reference, not a spot-price
oracle and not a claim about redeemable liquidity. It does not update itself.
The operator must review it on a fixed schedule so thresholds do not remain
anchored to launch depth as liquidity changes.

Policy:

1. Review NARA and USDC live full-range depth every seven days and before any
   campaign or material treasury liquidity change.
2. Use the lower 25th-percentile observed depth over the completed seven-day
   window. Never use a single block or a same-day maximum.
3. Propose an update when configured depth differs from that conservative
   reference by more than 25%.
4. Cap an upward update at 25% per proposal. A decrease may move directly to
   the conservative reference so fees never assume absent liquidity.
5. Apply both currency updates through the Safe and the hook's one-day
   timelock. Record proposal and execution transaction hashes.
6. Keep the frontend input cap based on the lower of configured and live depth;
   a depth-policy update must never loosen the app independently of live depth.

This policy limits administrative drift without letting a momentary liquidity
spike or flash position loosen fees. A future hook replacement may automate a
rolling measure, but the deployed hook cannot safely gain cross-block address
accounting or automatic depth tracking through an owner call.
