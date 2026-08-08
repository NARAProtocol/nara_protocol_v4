# NARA-20260809-fresh-v4-core-deployment

Change-ID: `NARA-20260809-fresh-v4-core-deployment`

Origin remote: `NARAProtocol/nara_protocol_v4`

Immutable deployment origin commit:
`027af3f06bbe6dea2c187dfd8062e50c228f1c35`

Chain: Base, chain ID `8453`.

State: **core deployed and source-verified; liquidity activation incomplete**.
This is not an availability, completed-launch, independent-audit, security, or
production-readiness claim.

## Approved core configuration

- public brand: `NARA`;
- ERC-20 name: `NARA`;
- raw ERC-20 symbol: `NARA`;
- presentation ticker: `$NARA`;
- configured NARA token depth / later seed target: `60,000 NARA`;
- configured USDC base depth / later seed target: `300 USDC`;
- planned opening price: `$0.005/NARA`;
- pool fee: `3000`;
- tick spacing: `60`; and
- Compounder decision at core deploy: skipped intentionally, leaving the Vault
  Compounder at the zero address.

Configured depth and planned seed values do not mean liquidity exists.

## Deployed and verified contracts

All contracts in this table are source-verified on Basescan.

| Component | Address |
|---|---|
| `NARALauncher` | `0xb8CF0274d0Fb2dB2Ba5dC58b0Ab378F3b8f35BA2` |
| `NARAToken` | `0xB6333F5D4cEd8dffA80F3F13697D6aA3BB3f19c1` |
| `NARAEngine` | `0x98ab6406D6B548F37dEF7110961bb45A399e5aFC` |
| `NARARewardReserve` | `0x8369CEf28128A4B24Bc5ed52aA6196D92D563F2f` |
| `NARALiquidityGrowthVault` | `0xD7f7b44BF65EBa3E90fDe0642687ed22A323084D` |
| `Create2HookDeployer` | `0xDE9E3Cac08b7a31Db18c7432d4C45DF4584Fd646` |
| `NARALiquidityGrowthHook` | `0x59AEf9799DEA01A7FB7dA73BEA10dfB08858A088` |

Planned pool ID:
`0x83edced1f39e6adf7469cd718eeb409824d948959263408d4cfb6e745c8db464`.

Production admin Safe:
`0xd65c0e390Dc187A22c52c03816591CC736C0D755`.

Treasury: `0xfe3A8678A9c729438BB11718bD1391E7Ab491E8e`.

Verification readback block: `49719008`.

## Transaction anchors

| Action | Base transaction hash |
|---|---|
| Launcher deployment | `0xcce4ab3a2e1b8da44321dc2f6e3f42802416585d46b03b1569c991ca7cfa9d78` |
| Atomic Token and Engine launch | `0x00955909b2fc299fe010c72ecd9988dc8802ad0569a3964453287e221ff5076c` |
| RewardReserve deployment | `0x8406e7905839ba5c126969fb2b006e850b056fa888486eece553a14b562537d4` |
| Fund RewardReserve with `650,000 NARA` | `0x6cb7bbaabd425e8bf5d95a1a625b2fb6d31a0e8b5139c1284bfcf6469a5f3ab3` |
| Vault deployment | `0xea9845388d1bd22cd7f31214b7fe518a911e4777d53f3d726650632dd37e4af9` |
| CREATE2 Hook deployer deployment | `0x80d7609555eb895706f9dfd4096edb8cf06fd26a68e508fbc24d0040081c55f3` |
| Hook deployment | `0x233ad46f29b97147ca50079e1eae2b9ae0ce9ae9a3746d697039d9e0e1e7aeae` |
| Propose Hook ownership transfer | `0xb11a143b07ad68add1ee19284e9e762ab4f465fbeccdac4f677f55a31d678580` |
| Propose Vault ownership transfer | `0xe3c461eefcb8f0b868214851988acbab80bbe6b76be42d540ddaa31bc810a735` |
| Transfer CREATE2 deployer ownership | `0xc8a826cf02f468dbf4d8a70bf743ae5595c94054ffa46b832ff56a479e83f20a` |

These anchors do not replace the complete 31-step canonical receipt
reconciliation.

## Verified dormant state

- The Hook has the required `0x2088` low permission bits.
- The Hook and Vault immutable reciprocal bindings match.
- The Engine points to the fresh NARA token and RewardReserve.
- The RewardReserve holds exactly `650,000 NARA`; treasury holds exactly
  `350,000 NARA` after reserve funding.
- Engine and RewardReserve production roles are held by the Safe; the deployer
  renounced its temporary roles.
- `REWARD_NOTIFIER_ROLE` is absent from the deployer, Safe, and Vault.
- `Create2HookDeployer.owner()` is the Safe.
- Hook and Vault current owner is still the deployment signer, with the Safe as
  `pendingOwner()`. Human Safe acceptance is required on both contracts.
- `Vault.compounder()` is the zero address.
- The pool is not registered, initialized, or seeded; expected opening price
  and PoolManager slot0 are zero.
- No LP NFT exists.
- Vault balances and recorded lifetime pool fees are zero.
- The pre-seed wiring/readback gate passed against this dormant state.

## Receipt evidence reconciliation

The deployment journal contains 31 confirmed steps with no failed, prepared,
submitted, or otherwise unresolved entry. It records transaction hashes,
status, and block numbers, but 24 normalized receipt entries stored the zero
block hash even though canonical RPC receipts return nonzero canonical hashes.

The original journal was preserved unchanged. The separately tracked
`deployments/v4-base-usdc-receipt-reconciliation-2026-08-08.json` records all
31 canonical receipts. Its result is `PASS`: 31/31 receipts reconcile and
succeeded, all 24 zero hashes are supplemented, all seven recorded nonzero
hashes match, and there are zero other field mismatches. The timestamped fresh
manifest and `deployments/v4-base-usdc-latest.json` contain the same sanitized
fresh-core deployment evidence.

## Remaining activation gates

1. Have the Safe accept Hook and Vault ownership and verify current owners.
2. Deploy, verify, and Safe-wire the replacement Compounder while the Vault is
   empty; keep it unfrozen pending validation.
3. Pass pre-seed verification and exact atomic-batch simulation.
4. Atomically register, initialize, and seed the pool only under a separate
   execution approval; record the LP NFT and canonical receipt.
5. Validate and reconcile the Compounder, then separately freeze it.
6. Pass post-seed preflight and receipt-pinned buy/sell smoke tests.
7. Complete later allocations and downstream handoffs independently.

The GitHub v4 operations and liquidity-maintainer workflows are disabled and
both repository enable variables are false. No recurring v4 keeper is active.
Do not re-enable or dispatch those workflows without a new explicit user order
and current deployment-specific review.

Onchain or production writes performed by this documentation change: **none**.
No private key, mnemonic, RPC credential, or environment value is recorded in
this release record.
