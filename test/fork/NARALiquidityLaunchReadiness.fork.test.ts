import { expect } from "chai";
import hre from "hardhat";

const STAGE_A_HOOK = "0x9a01c2DcF713cDB12B8ef4Eb264D5c3203b06088";
const NARA = "0x65E247AA3aa9C0131b2984b894c3D24c41341D7A";
const POOL_MANAGER = "0x498581fF718922c3f8e6A244956aF099B2652b2b";
const POOL_ID = "0xbb3287f32b95e96301c9582e8bf7e81fa362e4b9eea00cf016c537cf5970dff3";
const TARGET_NARA_DEPTH = 60_000n * 10n ** 18n;

const HOOK_ABI = [
  "function protocolDepth(address) view returns (uint256)",
  "function pendingProtocolDepth(address) view returns (uint256 depth,uint48 eta,bool exists)",
];
const POOL_MANAGER_ABI = ["function extsload(bytes32 slot) view returns (bytes32)"];

const hasRpc = !!(process.env.BASE_RPC_URL || process.env.BASE_MAINNET_RPC_URL);

(hasRpc ? describe : describe.skip)("NARA live deployment — Stage A quarantine", () => {
  it("confirms the obsolete Stage A pool is still uninitialized and must not be seeded", async function () {
    this.timeout(180_000);
    const { ethers } = await hre.network.connect("baseFork");

    const hook = new ethers.Contract(STAGE_A_HOOK, HOOK_ABI, ethers.provider);
    expect(await hook.protocolDepth(NARA)).to.equal(TARGET_NARA_DEPTH);

    const pending = await hook.pendingProtocolDepth(NARA);
    expect(pending.exists).to.equal(false);
    expect(pending.depth).to.equal(0n);

    const poolStateSlot = ethers.keccak256(
      ethers.solidityPacked(
        ["bytes32", "bytes32"],
        [POOL_ID, ethers.zeroPadValue("0x06", 32)],
      ),
    );
    const poolManager = new ethers.Contract(POOL_MANAGER, POOL_MANAGER_ABI, ethers.provider);
    const slot0 = BigInt(await poolManager.extsload(poolStateSlot)) & ((1n << 160n) - 1n);
    expect(slot0).to.equal(0n);

    // The corrected hook/vault/compounder trio must receive fresh addresses.
    // This test deliberately performs no initialization or liquidity write.
  });
});
