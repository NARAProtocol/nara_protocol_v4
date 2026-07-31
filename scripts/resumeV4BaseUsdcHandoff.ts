/**
 * Historical Stage A handoff entry point — permanently disabled.
 *
 * The original handoff completed before the 2026-07-28 liquidity-stack
 * quarantine. Its deployer is no longer the protocol administrator, and the
 * registered Stage A hook/vault must not be initialized or seeded.
 *
 * Use the current launch runbook instead:
 *   1. deploy the replacement vault + hook + compounder trio;
 *   2. update and verify the fresh-address manifest;
 *   3. revoke every REWARD_NOTIFIER_ROLE grant through the current admin;
 *   4. run the fresh-address launch gates before any liquidity action.
 */
async function main() {
  throw new Error(
    "Disabled historical script: Stage A is quarantined. Follow docs/NARA_V4_LAUNCH_RUNBOOK.md.",
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
