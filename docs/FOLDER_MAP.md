# Folder Map For Cold AI

| Folder | Contains | Status | AI may edit | AI must not edit |
|---|---|---|---|---|
| `contracts/v4/` | Active v4 Solidity contracts | Active, high risk | Docs and new periphery only when requested | Frozen core without explicit order |
| `contracts/v4/router/` | Routers and lenses | Active periphery | Router docs, new router/periphery work when requested | Unexpected custody, retained ETH/NARA, hidden admin paths |
| `contracts/v4/composability/` | Staking, SY, fractional wrappers | Active/optional extension layer | Docs and explicitly requested periphery changes | Core lock/NFT assumptions without verifying source |
| `contracts/v4/mocks/` | Test-only mocks | Test-only | Docs or test support when requested | Production imports, deployment usage |
| `contracts/v4/interfaces/` | Active v4 interfaces | Active support | Interface docs when needed | Interface changes without matching active contracts |
| `contracts/v4/libraries/` | Shared libraries | Active support | Docs or explicit fixes | Silent behavior changes |
| `contracts/v4/utils/` | Utility contracts/helpers | Active support | Docs or explicit fixes | Production behavior changes without tests |
| `contracts/v4/bond/` | No folder present | Not present | Do not create unless requested | Do not assume bond files live here |
| `contracts/v4/lens/` | No folder present | Not present | Do not create unless requested | Do not assume lens files live here |
| `contracts/v4/baskets/` | No folder present | Not present | Do not create unless requested | Do not infer basket protocol from this repo |
| `scripts/` | Deploy, verification, smoke, sync scripts | Active ops, high risk | Docs and explicitly requested scripts | Live deploys/writes without human approval |
| `test/` | Active v4 Hardhat tests | Active test suite | Tests when code changes require them | v3 tests, jackpot/mining assumptions |
| `docs/` | Current v4 docs | Active docs | Documentation updates | Claims that conflict with source/current state |
| `archive/legacy-v3/` | Retired v3 code/docs | Historical only | Read-only archaeology | Imports, redeploys, "live" claims |
| `artifacts/` | Hardhat build artifacts | Generated | Read to verify ABIs | Manual edits |
| `deployments/` | Deployment outputs | Operational evidence | Read and document carefully | Treat retired outputs as fresh launch state |
| `aderyn-reports/`, `slither-reports/`, `audit-runs/` | Audit outputs | Evidence/history | Read for context | Treat old findings as current without verification |

If a folder is not listed here, treat its status as unknown and verify before
use. Do not claim it is active unless source or current deployment docs prove it.
