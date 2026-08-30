/**
 * Deploy-coverage entry point for NARATreasuryRangeManagerV1.
 *
 * This command only builds the same unsigned, nonce-bound Safe proposal as the
 * build-prefixed compatibility entry point. It never creates a signer and
 * never broadcasts a transaction.
 */
import { buildV4TreasuryRangeManagerDeployment } from "./buildV4TreasuryRangeManagerDeployment.js";
import { safeTreasuryRangeError } from "./lib/v4TreasuryRangeSafeBuilder.js";

export const TREASURY_RANGE_MANAGER_FQN =
  "contracts/v4/NARATreasuryRangeManagerV1.sol:NARATreasuryRangeManagerV1";

void buildV4TreasuryRangeManagerDeployment().catch((error) => {
  process.stderr.write(`${safeTreasuryRangeError(error)}\n`);
  process.exitCode = 1;
});
