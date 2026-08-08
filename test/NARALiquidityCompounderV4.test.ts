import { expect } from "chai";
import hre from "hardhat";

const ONE = 10n ** 18n;
const USDC = 10n ** 6n;
const MAX_UINT64 = (1n << 64n) - 1n;
const SQRT_PRICE_1_1 = 1n << 96n;
const POOL_FEE = 3000;
const TICK_SPACING = 60;

function sortAddresses(a: string, b: string): [string, string] {
    return BigInt(a) < BigInt(b) ? [a, b] : [b, a];
}

function isqrt(n: bigint): bigint {
    if (n < 2n) return n;
    let x = n;
    let y = (x + 1n) >> 1n;
    while (y < x) { x = y; y = (x + n / x) >> 1n; }
    return x;
}

function sqrtPriceX96FromAmounts(amount0: bigint, amount1: bigint): bigint {
    return isqrt((amount1 << 192n) / amount0);
}

function encodeConstraints(
    ethers: any,
    referenceSqrtPriceX96: bigint,
    overrides: Partial<{
        minSqrtPriceX96: bigint;
        maxSqrtPriceX96: bigint;
        maxReferenceValueImbalanceBps: number;
        maxNaraUsed: bigint;
        maxUsdcUsed: bigint;
    }> = {},
) {
    return ethers.AbiCoder.defaultAbiCoder().encode(
        ["tuple(uint160 referenceSqrtPriceX96,uint160 minSqrtPriceX96,uint160 maxSqrtPriceX96,uint16 maxReferenceValueImbalanceBps,uint256 maxNaraUsed,uint256 maxUsdcUsed)"],
        [[
            referenceSqrtPriceX96,
            overrides.minSqrtPriceX96 ?? referenceSqrtPriceX96,
            overrides.maxSqrtPriceX96 ?? referenceSqrtPriceX96,
            overrides.maxReferenceValueImbalanceBps ?? 500,
            overrides.maxNaraUsed ?? ethers.MaxUint256,
            overrides.maxUsdcUsed ?? ethers.MaxUint256,
        ]],
    );
}

async function deployFixture(seedBalances = true) {
    const { ethers } = await hre.network.connect();
    const [owner, keeper, alice, attacker] = await ethers.getSigners();

    const nara = await ethers.deployContract("MockERC20", ["NARA", "NARA", 18], owner);
    await nara.waitForDeployment();
    const usdc = await ethers.deployContract("MockERC20", ["USD Coin", "USDC", 6], owner);
    await usdc.waitForDeployment();

    const naraAddr = await nara.getAddress();
    const usdcAddr = await usdc.getAddress();
    const naraIsCurrency0 = BigInt(naraAddr) < BigInt(usdcAddr);
    const [currency0, currency1] = sortAddresses(naraAddr, usdcAddr);

    const permit2 = await ethers.deployContract("MockPermit2", [], owner);
    await permit2.waitForDeployment();
    const permit2Addr = await permit2.getAddress();

    const vault = await ethers.deployContract(
        "NARALiquidityGrowthVault",
        [owner.address, naraAddr, usdcAddr],
        owner,
    );
    await vault.waitForDeployment();
    const vaultAddr = await vault.getAddress();
    await vault.connect(owner).setCompoundKeeper(keeper.address, true);

    const stack = await ethers.deployContract(
        "MockV4PositionStack",
        [permit2Addr, naraAddr, usdcAddr, vaultAddr],
        owner,
    );
    await stack.waitForDeployment();
    const stackAddr = await stack.getAddress();
    const referenceSqrtPriceX96 = sqrtPriceX96FromAmounts(
        naraIsCurrency0 ? ONE : USDC,
        naraIsCurrency0 ? USDC : ONE,
    );
    await stack.setSqrtPrice(referenceSqrtPriceX96);

    const compounder = await ethers.deployContract(
        "NARALiquidityCompounderV4",
        [
            owner.address,
            vaultAddr,
            stackAddr, // poolManager (extsload)
            stackAddr, // positionManager (modifyLiquidities)
            permit2Addr,
            naraAddr,
            usdcAddr,
            POOL_FEE,
            TICK_SPACING,
            stackAddr, // hooks (any non-zero; only stored in the pool key)
        ],
        owner,
    );
    await compounder.waitForDeployment();
    const compounderAddr = await compounder.getAddress();
    await vault.connect(owner).setHook(stackAddr);
    await vault.connect(owner).setCompounder(compounderAddr);

    const compoundData = encodeConstraints(ethers, referenceSqrtPriceX96);

    // Seed the vault with skim balances unless a test needs an exact inventory shape.
    if (seedBalances) {
        await nara.mint(vaultAddr, 1_000n * ONE);
        await usdc.mint(vaultAddr, 1_000n * USDC);
    }

    return {
        ethers, owner, keeper, alice, attacker,
        nara, usdc, permit2, stack, vault, compounder,
        naraAddr, usdcAddr, stackAddr, compounderAddr, naraIsCurrency0, referenceSqrtPriceX96, compoundData,
    };
}

// Map a (nara, usdc) amount pair to (pull0, pull1) in currency order.
function toCurrencyOrder(naraIsCurrency0: boolean, naraAmt: bigint, usdcAmt: bigint): [bigint, bigint] {
    return naraIsCurrency0 ? [naraAmt, usdcAmt] : [usdcAmt, naraAmt];
}

describe("NARALiquidityCompounderV4", () => {
    it("rejects mismatched PoolManager, PositionManager, Permit2, and Hook immutables", async () => {
        const f = await deployFixture(false);
        const { ethers, owner, vault, permit2, stackAddr, naraAddr, usdcAddr } = f;
        const vaultAddr = await vault.getAddress();
        const permit2Addr = await permit2.getAddress();
        const otherStack = await ethers.deployContract(
            "MockV4PositionStack",
            [permit2Addr, naraAddr, usdcAddr, vaultAddr],
            owner,
        );
        await otherStack.waitForDeployment();
        const otherStackAddr = await otherStack.getAddress();
        const fakePermit2 = await ethers.deployContract("MockPermit2", [], owner);
        await fakePermit2.waitForDeployment();

        const deploy = (poolManager: string, positionManager: string, permit2Binding: string, hook: string) =>
            ethers.deployContract("NARALiquidityCompounderV4", [
                owner.address, vaultAddr, poolManager, positionManager, permit2Binding,
                naraAddr, usdcAddr, POOL_FEE, TICK_SPACING, hook,
            ], owner);

        for (const args of [
            [otherStackAddr, stackAddr, permit2Addr, stackAddr],
            [stackAddr, otherStackAddr, permit2Addr, stackAddr],
            [stackAddr, stackAddr, await fakePermit2.getAddress(), stackAddr],
            [stackAddr, stackAddr, permit2Addr, otherStackAddr],
        ] as const) {
            await expect(deploy(...args)).to.be.revertedWithCustomError(f.compounder, "InvalidPeripheryBinding");
        }
    });

    it("keeps one-sided NARA fees banked until matching USDC arrives, then adds POL", async () => {
        const f = await deployFixture(false);
        const { keeper, vault, compounder, nara, usdc, stack, compounderAddr, naraIsCurrency0 } = f;
        const vaultAddr = await vault.getAddress();

        const naraOnly = 100n * ONE;
        await nara.mint(vaultAddr, naraOnly);
        await expect(
            vault.connect(keeper).compoundAll(1n, MAX_UINT64, f.compoundData),
        ).to.be.revertedWithCustomError(vault, "SlippageExceeded");

        expect(await compounder.positionTokenId()).to.equal(0n);
        expect(await compounder.totalLiquidityAdded()).to.equal(0n);
        expect(await nara.balanceOf(vaultAddr)).to.equal(naraOnly);
        expect(await nara.balanceOf(compounderAddr)).to.equal(0n);
        expect(await usdc.balanceOf(compounderAddr)).to.equal(0n);

        const matchingUsdc = 100n * USDC;
        await usdc.mint(vaultAddr, matchingUsdc);
        const naraPulled = 60n * ONE;
        const usdcPulled = 60n * USDC;
        const [pull0, pull1] = toCurrencyOrder(naraIsCurrency0, naraPulled, usdcPulled);
        await stack.setPull(pull0, pull1);

        await expect(
            vault.connect(keeper).compoundAll(1n, MAX_UINT64, f.compoundData),
        ).to.emit(vault, "Compounded");

        expect(await compounder.positionTokenId()).to.equal(1n);
        expect(await compounder.totalLiquidityAdded()).to.be.greaterThan(0n);
        expect(await nara.balanceOf(compounderAddr)).to.equal(naraOnly - naraPulled);
        expect(await usdc.balanceOf(compounderAddr)).to.equal(matchingUsdc - usdcPulled);
    });

    it("mints a full-range POL position, satisfies exact-spend, and banks the remainder", async () => {
        const f = await deployFixture();
        const { ethers, keeper, vault, compounder, nara, usdc, stack, compounderAddr, naraIsCurrency0 } = f;

        const naraIn = 100n * ONE;
        const usdcIn = 100n * USDC;

        // Pull 60% of each side; 40% should remain banked in the compounder.
        const naraPulled = (naraIn * 60n) / 100n;
        const usdcPulled = (usdcIn * 60n) / 100n;
        const [pull0, pull1] = toCurrencyOrder(naraIsCurrency0, naraPulled, usdcPulled);
        await stack.setPull(pull0, pull1);

        const vaultNaraBefore = await nara.balanceOf(await vault.getAddress());
        const vaultUsdcBefore = await usdc.balanceOf(await vault.getAddress());

        await expect(
            vault.connect(keeper).compound(naraIn, usdcIn, 1n, MAX_UINT64, f.compoundData),
        ).to.emit(vault, "Compounded");

        // Exact-spend: the vault released exactly the requested amounts (or it would have reverted).
        expect(vaultNaraBefore - (await nara.balanceOf(await vault.getAddress()))).to.equal(naraIn);
        expect(vaultUsdcBefore - (await usdc.balanceOf(await vault.getAddress()))).to.equal(usdcIn);

        // Remainder banked in the compounder.
        expect(await nara.balanceOf(compounderAddr)).to.equal(naraIn - naraPulled);
        expect(await usdc.balanceOf(compounderAddr)).to.equal(usdcIn - usdcPulled);

        // POL position minted to and held by the compounder.
        expect(await compounder.positionTokenId()).to.equal(1n);
        expect(await stack.ownerOf(1n)).to.equal(compounderAddr);
        expect(await compounder.totalLiquidityAdded()).to.be.greaterThan(0n);
        expect(await stack.lastFirstAction()).to.equal(2n); // MINT_POSITION
    });

    it("rolls banked remainder into the next compound via INCREASE_LIQUIDITY (no new mint)", async () => {
        const f = await deployFixture();
        const { ethers, keeper, vault, compounder, nara, usdc, stack, compounderAddr, naraIsCurrency0 } = f;

        // First compound mints position #1.
        let [p0, p1] = toCurrencyOrder(naraIsCurrency0, 60n * ONE, 60n * USDC);
        await stack.setPull(p0, p1);
        await vault.connect(keeper).compound(100n * ONE, 100n * USDC, 1n, MAX_UINT64, f.compoundData);
        expect(await compounder.positionTokenId()).to.equal(1n);

        // Second compound increases the SAME position; no new NFT minted.
        [p0, p1] = toCurrencyOrder(naraIsCurrency0, 50n * ONE, 50n * USDC);
        await stack.setPull(p0, p1);
        await vault.connect(keeper).compound(100n * ONE, 100n * USDC, 1n, MAX_UINT64, f.compoundData);

        expect(await compounder.positionTokenId()).to.equal(1n); // unchanged
        expect(await stack.lastFirstAction()).to.equal(0n); // INCREASE_LIQUIDITY
        expect(await stack.ownerOf(1n)).to.equal(compounderAddr);
    });

    it("reverts via the vault's slippage guard when minLiquidityAdded is too high", async () => {
        const f = await deployFixture();
        const { keeper, vault, stack, naraIsCurrency0 } = f;
        const [p0, p1] = toCurrencyOrder(naraIsCurrency0, 60n * ONE, 60n * USDC);
        await stack.setPull(p0, p1);

        await expect(
            vault.connect(keeper).compound(100n * ONE, 100n * USDC, 1n << 200n, MAX_UINT64, f.compoundData),
        ).to.be.revertedWithCustomError(vault, "SlippageExceeded");
    });

    it("rejects sandwich-moved spot even when the liquidity minimum would pass", async () => {
        const f = await deployFixture();
        const { keeper, vault, compounder, stack, naraIsCurrency0, referenceSqrtPriceX96 } = f;
        const [p0, p1] = toCurrencyOrder(naraIsCurrency0, 60n * ONE, 60n * USDC);
        await stack.setPull(p0, p1);
        await stack.setSqrtPrice(referenceSqrtPriceX96 + referenceSqrtPriceX96 / 100n);

        await expect(
            vault.connect(keeper).compound(100n * ONE, 100n * USDC, 1n, MAX_UINT64, f.compoundData),
        ).to.be.revertedWithCustomError(compounder, "ExecutionPriceOutOfBounds");
    });

    it("enforces explicit per-token compound caps", async () => {
        const f = await deployFixture();
        const { ethers, keeper, vault, compounder, stack, naraIsCurrency0, referenceSqrtPriceX96 } = f;
        const naraPulled = 60n * ONE;
        const usdcPulled = 60n * USDC;
        const [p0, p1] = toCurrencyOrder(naraIsCurrency0, naraPulled, usdcPulled);
        await stack.setPull(p0, p1);
        const capped = encodeConstraints(ethers, referenceSqrtPriceX96, { maxNaraUsed: naraPulled - 1n });

        await expect(
            vault.connect(keeper).compound(100n * ONE, 100n * USDC, 1n, MAX_UINT64, capped),
        ).to.be.revertedWithCustomError(compounder, "CompoundAmountExceeded");
    });

    it("rejects reference-value imbalance after a bounded-price add", async () => {
        const f = await deployFixture();
        const { ethers, keeper, vault, compounder, stack, naraIsCurrency0, referenceSqrtPriceX96 } = f;
        const [p0, p1] = toCurrencyOrder(naraIsCurrency0, 60n * ONE, 30n * USDC);
        await stack.setPull(p0, p1);
        const strict = encodeConstraints(ethers, referenceSqrtPriceX96, { maxReferenceValueImbalanceBps: 100 });

        await expect(
            vault.connect(keeper).compound(100n * ONE, 100n * USDC, 1n, MAX_UINT64, strict),
        ).to.be.revertedWithCustomError(compounder, "ReferenceValueLossExceeded");
    });

    it("only the vault can call compound", async () => {
        const f = await deployFixture();
        const { compounder, attacker, naraAddr, usdcAddr } = f;
        await expect(
            compounder.connect(attacker).compound(naraAddr, usdcAddr, 0n, 0n, "0x"),
        ).to.be.revertedWithCustomError(compounder, "NotVault");
    });

    it("migrate is gated by the 7-day cooldown: reverts early, succeeds after, holders get the window", async () => {
        const f = await deployFixture();
        const { ethers, owner, keeper, alice, vault, compounder, stack, naraIsCurrency0 } = f;
        const [p0, p1] = toCurrencyOrder(naraIsCurrency0, 60n * ONE, 60n * USDC);
        await stack.setPull(p0, p1);
        await vault.connect(keeper).compound(100n * ONE, 100n * USDC, 1n, MAX_UINT64, f.compoundData);

        // RecoveryKind.MigratePosition = 1
        await expect(compounder.connect(owner).proposeRecovery(1, alice.address))
            .to.emit(compounder, "RecoveryProposed");

        // Cannot execute before the cooldown elapses.
        await expect(compounder.connect(owner).executeRecovery())
            .to.be.revertedWithCustomError(compounder, "RecoveryNotReady");

        // Warp 7 days + 1s.
        await ethers.provider.send("evm_increaseTime", [7 * 24 * 60 * 60 + 1]);
        await ethers.provider.send("evm_mine", []);

        await expect(compounder.connect(owner).executeRecovery())
            .to.emit(compounder, "PositionMigrated");
        expect(await stack.ownerOf(1n)).to.equal(alice.address);
        expect(await compounder.positionTokenId()).to.equal(0n);
    });

    it("windDown (after cooldown) removes whatever is left: position NFT + banked tokens", async () => {
        const f = await deployFixture();
        const { ethers, owner, keeper, alice, vault, compounder, nara, usdc, stack, compounderAddr, naraIsCurrency0 } = f;
        const [p0, p1] = toCurrencyOrder(naraIsCurrency0, 60n * ONE, 60n * USDC);
        await stack.setPull(p0, p1);
        await vault.connect(keeper).compound(100n * ONE, 100n * USDC, 1n, MAX_UINT64, f.compoundData);

        const bankedNara = await nara.balanceOf(compounderAddr);
        const bankedUsdc = await usdc.balanceOf(compounderAddr);
        expect(bankedNara).to.be.greaterThan(0n);

        // RecoveryKind.WindDown = 3
        await compounder.connect(owner).proposeRecovery(3, alice.address);
        await ethers.provider.send("evm_increaseTime", [7 * 24 * 60 * 60 + 1]);
        await ethers.provider.send("evm_mine", []);
        await expect(compounder.connect(owner).executeRecovery()).to.emit(compounder, "WoundDown");

        expect(await stack.ownerOf(1n)).to.equal(alice.address);
        expect(await nara.balanceOf(alice.address)).to.equal(bankedNara);
        expect(await usdc.balanceOf(alice.address)).to.equal(bankedUsdc);
        expect(await nara.balanceOf(compounderAddr)).to.equal(0n);
        expect(await usdc.balanceOf(compounderAddr)).to.equal(0n);
    });

    it("owner can cancel a pending recovery and recovery cannot run without a proposal", async () => {
        const f = await deployFixture();
        const { owner, alice, compounder } = f;
        await expect(compounder.connect(owner).executeRecovery())
            .to.be.revertedWithCustomError(compounder, "NoPendingRecovery");

        await compounder.connect(owner).proposeRecovery(1, alice.address);
        await expect(compounder.connect(owner).cancelRecovery()).to.emit(compounder, "RecoveryCancelled");
        await expect(compounder.connect(owner).executeRecovery())
            .to.be.revertedWithCustomError(compounder, "NoPendingRecovery");
    });

    it("recovery is owner-only and foreign-token recovery still excludes pool tokens", async () => {
        const f = await deployFixture();
        const { ethers, owner, alice, attacker, compounder, naraAddr } = f;
        await expect(compounder.connect(attacker).proposeRecovery(1, attacker.address))
            .to.be.revertedWithCustomError(compounder, "OwnableUnauthorizedAccount");

        await expect(
            compounder.connect(owner).recoverForeignToken(naraAddr, alice.address, 1n),
        ).to.be.revertedWithCustomError(compounder, "WrongTokens");

        const foreign = await ethers.deployContract("MockERC20", ["X", "X", 18], owner);
        await foreign.waitForDeployment();
        await foreign.mint(await compounder.getAddress(), 5n * ONE);
        await compounder.connect(owner).recoverForeignToken(await foreign.getAddress(), alice.address, 5n * ONE);
        expect(await foreign.balanceOf(alice.address)).to.equal(5n * ONE);
    });
});
