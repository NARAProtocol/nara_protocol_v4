import { expect } from "chai";
import hre from "hardhat";
import { deployRenderer } from "./helpers/art";

const ONE = 10n ** 18n;
const USDC = 10n ** 6n;
const LOCK_FEE = 10n ** 14n;
const BPS = 10_000n;
const SQRT_PRICE_1_1 = 1n << 96n;
const MAX_UINT64 = (1n << 64n) - 1n;
const FEE_UPDATE_DELAY = 24 * 60 * 60;

function sameAddress(a: string, b: string) {
    return a.toLowerCase() === b.toLowerCase();
}

function sortAddresses(a: string, b: string): [string, string] {
    return BigInt(a) < BigInt(b) ? [a, b] : [b, a];
}

function poolFee(amount: bigint, bps: bigint) {
    return (amount * bps) / BPS;
}

function packedBeforeSwapDelta(specifiedDelta: bigint) {
    return specifiedDelta << 128n;
}

async function increaseTime(ethers: any, seconds: number) {
    await ethers.provider.send("evm_increaseTime", [seconds]);
    await ethers.provider.send("evm_mine", []);
}

async function deployFixture(options: { skipVaultHook?: boolean } = {}) {
    const connection = await hre.network.connect();
    const { ethers } = connection;
    const [owner, alice, keeper, attacker] = await ethers.getSigners();

    const token = await ethers.deployContract("MockERC20", ["NARA", "NARA", 18], owner);
    await token.waitForDeployment();
    const base = await ethers.deployContract("MockERC20", ["Wrapped Ether", "WETH", 18], owner);
    await base.waitForDeployment();

    const manager = await ethers.deployContract("MockV4PoolManager", [], owner);
    await manager.waitForDeployment();

    const tokenAddr = await token.getAddress();
    const baseAddr = await base.getAddress();
    const managerAddr = await manager.getAddress();

    const vault = await ethers.deployContract("NARALiquidityGrowthVault", [owner.address, tokenAddr, baseAddr], owner);
    await vault.waitForDeployment();
    const vaultAddr = await vault.getAddress();
    await vault.connect(owner).setCompoundKeeper(keeper.address, true);

    const hook = await ethers.deployContract(
        "TestNARALiquidityGrowthHook",
        [managerAddr, owner.address, tokenAddr, baseAddr, vaultAddr],
        owner,
    );
    await hook.waitForDeployment();
    const hookAddr = await hook.getAddress();
    if (!options.skipVaultHook) {
        await vault.connect(owner).setHook(hookAddr);
    }

    const [currency0, currency1] = sortAddresses(tokenAddr, baseAddr);
    const key = {
        currency0,
        currency1,
        fee: 3_000,
        tickSpacing: 60,
        hooks: hookAddr,
    };

    const exactInParams = (inputCurrency: string, amountIn: bigint) => ({
        zeroForOne: sameAddress(inputCurrency, key.currency0),
        amountSpecified: -amountIn,
        sqrtPriceLimitX96: 0n,
    });

    return {
        ethers,
        owner,
        alice,
        keeper,
        attacker,
        token,
        base,
        manager,
        vault,
        hook,
        tokenAddr,
        baseAddr,
        managerAddr,
        vaultAddr,
        hookAddr,
        key,
        exactInParams,
    };
}

describe("NARALiquidityGrowth v4 - hook registration", () => {
    it("uses the intended Uniswap v4 hook permissions", async () => {
        const { hook } = await deployFixture();
        const permissions = await hook.getHookPermissions();

        expect(permissions.beforeInitialize).to.equal(true);
        expect(permissions.beforeSwap).to.equal(true);
        expect(permissions.beforeSwapReturnDelta).to.equal(true);
        expect(permissions.afterSwap).to.equal(false);
        expect(permissions.afterSwapReturnDelta).to.equal(false);
    });

    it("rejects initialize and swap calls before the official pool is registered", async () => {
        const { manager, hook, hookAddr, key, exactInParams, baseAddr } = await deployFixture();

        await expect(
            manager.callBeforeInitialize(hookAddr, key, SQRT_PRICE_1_1),
        ).to.be.revertedWithCustomError(hook, "PoolNotRegistered");

        await expect(
            manager.callBeforeSwap(hookAddr, key, exactInParams(baseAddr, ONE), "0x"),
        ).to.be.revertedWithCustomError(hook, "PoolNotRegistered");
    });

    it("registers one pool and rejects wrong hook, wrong pair, and duplicate registrations", async () => {
        const { ethers, owner, attacker, hook, key, tokenAddr, baseAddr } = await deployFixture();

        await expect(hook.connect(attacker).registerPool(key, SQRT_PRICE_1_1))
            .to.be.revertedWithCustomError(hook, "OwnableUnauthorizedAccount")
            .withArgs(attacker.address);

        await expect(hook.connect(owner).registerPool({ ...key, hooks: ethers.ZeroAddress }, SQRT_PRICE_1_1))
            .to.be.revertedWithCustomError(hook, "UnauthorizedPool");
        await expect(hook.connect(owner).registerPool({ ...key, fee: 500 }, SQRT_PRICE_1_1))
            .to.be.revertedWithCustomError(hook, "InvalidPoolConfig");
        await expect(hook.connect(owner).registerPool({ ...key, tickSpacing: 10 }, SQRT_PRICE_1_1))
            .to.be.revertedWithCustomError(hook, "InvalidPoolConfig");

        const wrongToken = await ethers.deployContract("MockERC20", ["Other", "OTHER", 18], owner);
        await wrongToken.waitForDeployment();
        const wrongTokenAddr = await wrongToken.getAddress();
        const [wrong0, wrong1] = sortAddresses(wrongTokenAddr, baseAddr);
        await expect(
            hook.connect(owner).registerPool(
                { ...key, currency0: wrong0, currency1: wrong1 },
                SQRT_PRICE_1_1,
            ),
        ).to.be.revertedWithCustomError(hook, "InvalidTokenPair");

        await expect(hook.connect(owner).registerPool(key, 0n))
            .to.be.revertedWithCustomError(hook, "ZeroInitializationPrice");

        await expect(hook.connect(owner).registerPool(key, SQRT_PRICE_1_1))
            .to.emit(hook, "PoolRegistered")
            .and.to.emit(hook, "InitializationPriceBound");
        expect(await hook.poolRegistered()).to.equal(true);
        expect(await hook.expectedSqrtPriceX96()).to.equal(SQRT_PRICE_1_1);

        const [currency0, currency1] = sortAddresses(tokenAddr, baseAddr);
        expect(key.currency0).to.equal(currency0);
        expect(key.currency1).to.equal(currency1);
        expect(await hook.tokenIsCurrency0()).to.equal(sameAddress(currency0, tokenAddr));

        await expect(hook.connect(owner).registerPool(key, SQRT_PRICE_1_1))
            .to.be.revertedWithCustomError(hook, "PoolAlreadyRegistered");
    });

    it("rejects a noncanonical pool config after registration", async () => {
        const { owner, manager, hook, hookAddr, key, exactInParams, baseAddr } = await deployFixture();
        await hook.connect(owner).registerPool(key, SQRT_PRICE_1_1);

        await expect(
            manager.callBeforeSwap(
                hookAddr,
                { ...key, fee: 10_000 },
                exactInParams(baseAddr, ONE),
                "0x",
            ),
        ).to.be.revertedWithCustomError(hook, "InvalidPoolConfig");
    });

    it("permanently binds initialization to the registered opening price", async () => {
        const { owner, attacker, manager, hook, hookAddr, key } = await deployFixture();
        await hook.connect(owner).registerPool(key, SQRT_PRICE_1_1);

        await expect(
            manager.connect(attacker).callBeforeInitialize(hookAddr, key, SQRT_PRICE_1_1 + 1n),
        )
            .to.be.revertedWithCustomError(hook, "InvalidInitializationPrice")
            .withArgs(SQRT_PRICE_1_1, SQRT_PRICE_1_1 + 1n);

        await manager.connect(attacker).callBeforeInitialize(hookAddr, key, SQRT_PRICE_1_1);
    });
});

describe("NARALiquidityGrowth v4 - pool fee", () => {
    it("skims the default 5% base pool fee on a normal buy", async () => {
        const { owner, alice, manager, vault, hook, hookAddr, key, exactInParams, baseAddr, vaultAddr } =
            await deployFixture();

        await hook.connect(owner).setProtocolDepth(baseAddr, 10n * ONE);
        await hook.connect(owner).registerPool(key, SQRT_PRICE_1_1);

        const amountIn = ONE / 10n;
        const expectedFee = poolFee(amountIn, 500n);

        await expect(
            manager.connect(alice).callBeforeSwap(hookAddr, key, exactInParams(baseAddr, amountIn), "0x"),
        )
            .to.emit(manager, "TakeCalled")
            .withArgs(baseAddr, vaultAddr, expectedFee)
            .and.to.emit(vault, "PoolFeeRecorded")
            .withArgs(baseAddr, alice.address, expectedFee, 500, true)
            .and.to.emit(hook, "PoolFeeTaken");

        expect(await manager.taken(baseAddr, vaultAddr)).to.equal(expectedFee);
        expect(await vault.totalBaseFeeRecorded()).to.equal(expectedFee);
        expect(await manager.lastBeforeSwapDelta()).to.equal(packedBeforeSwapDelta(expectedFee));
        expect(await manager.lastBeforeSwapFeeOverride()).to.equal(0n);
    });

    it("charges heavy buys more when order size is large versus protocol depth", async () => {
        const { owner, alice, manager, vault, hook, hookAddr, key, exactInParams, baseAddr, vaultAddr } =
            await deployFixture();

        await hook.connect(owner).setProtocolDepth(baseAddr, 10n * ONE);
        await hook.connect(owner).registerPool(key, SQRT_PRICE_1_1);

        const amountIn = 35n * ONE / 10n;
        const [, expectedFee] = await hook.quotePoolFee(true, amountIn);

        await manager.connect(alice).callBeforeSwap(hookAddr, key, exactInParams(baseAddr, amountIn), "0x");

        expect(await manager.taken(baseAddr, vaultAddr)).to.equal(expectedFee);
        expect(await vault.totalBaseFeeRecorded()).to.equal(expectedFee);
    });

    it("charges exactly the same aggregate fee for a meaningful same-block split", async () => {
        const single = await deployFixture();
        await single.hook.connect(single.owner).setProtocolDepth(single.baseAddr, 10n * ONE);
        await single.hook.connect(single.owner).registerPool(single.key, SQRT_PRICE_1_1);
        const total = 3n * ONE;
        await single.manager.connect(single.alice).callBeforeSwap(
            single.hookAddr, single.key, single.exactInParams(single.baseAddr, total), "0x",
        );
        const singleFee = await single.manager.taken(single.baseAddr, single.vaultAddr);

        const split = await deployFixture();
        await split.hook.connect(split.owner).setProtocolDepth(split.baseAddr, 10n * ONE);
        await split.hook.connect(split.owner).registerPool(split.key, SQRT_PRICE_1_1);
        await split.manager.connect(split.alice).callBeforeSwaps(
            split.hookAddr,
            split.key,
            [
                split.exactInParams(split.baseAddr, 2n * ONE),
                split.exactInParams(split.baseAddr, ONE),
            ],
            "0x",
        );
        const splitFee = await split.manager.taken(split.baseAddr, split.vaultAddr);

        expect(splitFee).to.equal(singleFee);
        expect(await split.hook.flowAmountInBlock(split.baseAddr)).to.equal(total);
        expect(await split.hook.flowDepthInBlock(split.baseAddr)).to.equal(10n * ONE);
    });

    it("uses deterministic configured depth while exposing lower live depth as telemetry", async () => {
        const { owner, alice, manager, vault, hook, hookAddr, key, exactInParams, tokenAddr, vaultAddr } =
            await deployFixture();
        const configuredDepth = 60_000n * ONE;
        const liveDepth = 20_000n * ONE;
        const amountIn = 11_367n * ONE;

        await hook.connect(owner).setProtocolDepth(tokenAddr, configuredDepth);
        await hook.connect(owner).registerPool(key, SQRT_PRICE_1_1);
        const poolId = await hook.registeredPoolId();
        await manager.setPoolState(poolId, SQRT_PRICE_1_1, liveDepth);

        expect(await hook.probeLiveDepth(tokenAddr)).to.equal(liveDepth);
        const [, quotedFee] = await hook.quotePoolFee(false, amountIn);
        expect(quotedFee).to.equal(8_067n * ONE / 10n);

        await manager.connect(alice).callBeforeSwap(
            hookAddr,
            key,
            exactInParams(tokenAddr, amountIn),
            "0x",
        );

        expect(await manager.taken(tokenAddr, vaultAddr)).to.equal(quotedFee);
        expect(await vault.totalTokenFeeRecorded()).to.equal(quotedFee);
        expect(await hook.flowDepthInBlock(tokenAddr)).to.equal(configuredDepth);
    });

    it("skims token-side sell pool fee and records it separately", async () => {
        const { owner, alice, manager, vault, hook, hookAddr, key, exactInParams, tokenAddr, vaultAddr } =
            await deployFixture();

        await hook.connect(owner).setProtocolDepth(tokenAddr, 25_000n * ONE);
        await hook.connect(owner).registerPool(key, SQRT_PRICE_1_1);

        const amountIn = 1_000n * ONE;
        const expectedFee = poolFee(amountIn, 500n);

        await expect(
            manager.connect(alice).callBeforeSwap(hookAddr, key, exactInParams(tokenAddr, amountIn), "0x"),
        )
            .to.emit(manager, "TakeCalled")
            .withArgs(tokenAddr, vaultAddr, expectedFee)
            .and.to.emit(vault, "PoolFeeRecorded")
            .withArgs(tokenAddr, alice.address, expectedFee, 500, false);

        expect(await vault.totalTokenFeeRecorded()).to.equal(expectedFee);
    });

    it("uses the max pressure tier when depth is zero", async () => {
        const { owner, alice, manager, vault, hook, hookAddr, key, exactInParams, baseAddr } =
            await deployFixture();

        await hook.connect(owner).registerPool(key, SQRT_PRICE_1_1);

        const amountIn = ONE;
        const expectedFee = poolFee(amountIn, 2_000n);
        await manager.connect(alice).callBeforeSwap(hookAddr, key, exactInParams(baseAddr, amountIn), "0x");

        expect(await vault.totalBaseFeeRecorded()).to.equal(expectedFee);
    });

    it("continues the pool-fee path if vault accounting is miswired", async () => {
        const { owner, alice, manager, vault, hook, hookAddr, key, exactInParams, baseAddr, vaultAddr } =
            await deployFixture({ skipVaultHook: true });

        await hook.connect(owner).setProtocolDepth(baseAddr, 10n * ONE);
        await hook.connect(owner).registerPool(key, SQRT_PRICE_1_1);

        const amountIn = ONE / 10n;
        const expectedFee = poolFee(amountIn, 500n);

        await expect(
            manager.connect(alice).callBeforeSwap(hookAddr, key, exactInParams(baseAddr, amountIn), "0x"),
        )
            .to.emit(manager, "TakeCalled")
            .withArgs(baseAddr, vaultAddr, expectedFee)
            .and.to.emit(hook, "PoolFeeRecordFailed")
            .withArgs(await hook.registeredPoolId(), alice.address, baseAddr, expectedFee, 500, true)
            .and.to.emit(hook, "PoolFeeTaken");

        expect(await manager.taken(baseAddr, vaultAddr)).to.equal(expectedFee);
        expect(await vault.totalBaseFeeRecorded()).to.equal(0n);
        expect(await manager.lastBeforeSwapDelta()).to.equal(packedBeforeSwapDelta(expectedFee));
    });

    it("rejects exact-output swaps so the pool fee cannot flip swap semantics", async () => {
        const { owner, alice, manager, hook, hookAddr, key } = await deployFixture();
        await hook.connect(owner).registerPool(key, SQRT_PRICE_1_1);

        await expect(
            manager.connect(alice).callBeforeSwap(
                hookAddr,
                key,
                { zeroForOne: true, amountSpecified: ONE, sqrtPriceLimitX96: 0n },
                "0x",
            ),
        ).to.be.revertedWithCustomError(hook, "ExactOutputUnsupported");
    });

    it("lets the owner tune curves but enforces a hard pool-fee cap", async () => {
        const { owner, attacker, hook, baseAddr } = await deployFixture();
        const curve = {
            mediumPressureBps: 100,
            highPressureBps: 500,
            extremePressureBps: 1_000,
            baseFeeBps: 400,
            mediumFeeBps: 900,
            highFeeBps: 1_500,
            extremeFeeBps: 3_000,
            maxFeeBps: 3_000,
        };

        await expect(hook.connect(attacker).setFeeCurve(true, curve))
            .to.be.revertedWithCustomError(hook, "OwnableUnauthorizedAccount")
            .withArgs(attacker.address);

        await expect(hook.connect(owner).setFeeCurve(true, curve)).to.emit(hook, "FeeCurveSet");
        await hook.connect(owner).setProtocolDepth(baseAddr, 10n * ONE);
        await expect(hook.connect(owner).setProtocolDepth(baseAddr, 999_999n))
            .to.be.revertedWithCustomError(hook, "DepthTooSmall");

        const quotedAmount = ONE / 10n;
        const [bps, quotedFee] = await hook.quotePoolFee(true, quotedAmount);
        expect(bps).to.equal(900n);
        expect(quotedFee).to.equal(poolFee(quotedAmount, 400n));

        await expect(
            hook.connect(owner).setFeeCurve(true, { ...curve, maxFeeBps: 5_001 }),
        ).to.be.revertedWithCustomError(hook, "InvalidCurve");
    });

    it("timelocks fee curve and depth changes after the pool is registered", async () => {
        const { ethers, owner, hook, key, baseAddr } = await deployFixture();
        const curve = {
            mediumPressureBps: 100,
            highPressureBps: 500,
            extremePressureBps: 1_000,
            baseFeeBps: 400,
            mediumFeeBps: 900,
            highFeeBps: 1_500,
            extremeFeeBps: 3_000,
            maxFeeBps: 3_000,
        };

        await hook.connect(owner).setProtocolDepth(baseAddr, 10n * ONE);
        await hook.connect(owner).registerPool(key, SQRT_PRICE_1_1);

        await expect(hook.connect(owner).setFeeCurve(true, curve)).to.emit(hook, "FeeCurveProposed");
        await expect(hook.connect(owner).setProtocolDepth(baseAddr, 20n * ONE))
            .to.emit(hook, "ProtocolDepthProposed");

        expect(await hook.protocolDepth(baseAddr)).to.equal(10n * ONE);
        await expect(hook.connect(owner).executeFeeCurve(true))
            .to.be.revertedWithCustomError(hook, "UpdateNotReady");
        await expect(hook.connect(owner).executeProtocolDepth(baseAddr))
            .to.be.revertedWithCustomError(hook, "UpdateNotReady");

        await increaseTime(ethers, FEE_UPDATE_DELAY + 1);

        await expect(hook.connect(owner).executeProtocolDepth(baseAddr))
            .to.emit(hook, "ProtocolDepthSet")
            .withArgs(baseAddr, 20n * ONE);
        await expect(hook.connect(owner).executeFeeCurve(true)).to.emit(hook, "FeeCurveSet");

        const quotedAmount = ONE / 5n;
        const [bps, quotedFee] = await hook.quotePoolFee(true, quotedAmount);
        expect(bps).to.equal(900n);
        expect(quotedFee).to.equal(poolFee(quotedAmount, 400n));
    });

    it("executes ready updates after a dust flow without changing that block's fee basis", async () => {
        const { ethers, owner, manager, hook, hookAddr, key, baseAddr, vaultAddr, exactInParams } =
            await deployFixture();
        const oldDepth = 10n * ONE;
        const newDepth = 100n * ONE;
        const amountPerSwap = ONE;
        const curve = {
            mediumPressureBps: 100,
            highPressureBps: 500,
            extremePressureBps: 1_000,
            baseFeeBps: 100,
            mediumFeeBps: 200,
            highFeeBps: 300,
            extremeFeeBps: 400,
            maxFeeBps: 400,
        };

        await hook.connect(owner).setProtocolDepth(baseAddr, oldDepth);
        await hook.connect(owner).registerPool(key, SQRT_PRICE_1_1);
        const [, expectedOldBlockFee] = await hook.quotePoolFee(true, amountPerSwap * 2n);

        await hook.connect(owner).setFeeCurve(true, curve);
        await hook.connect(owner).setProtocolDepth(baseAddr, newDepth);
        await increaseTime(ethers, FEE_UPDATE_DELAY + 1);

        const sequencer = await ethers.deployContract("MockHookUpdateSequencer", [], owner);
        await sequencer.waitForDeployment();
        await hook.connect(owner).transferOwnership(await sequencer.getAddress());

        await sequencer.swapExecuteAndSwap(
            await manager.getAddress(),
            hookAddr,
            key,
            exactInParams(baseAddr, amountPerSwap),
            exactInParams(baseAddr, amountPerSwap),
            baseAddr,
        );

        expect(await manager.taken(baseAddr, vaultAddr)).to.equal(expectedOldBlockFee);
        expect(await hook.protocolDepth(baseAddr)).to.equal(newDepth);
        const activeCurve = await hook.buyCurve();
        expect(activeCurve.baseFeeBps).to.equal(curve.baseFeeBps);
        expect(activeCurve.maxFeeBps).to.equal(curve.maxFeeBps);

        await ethers.provider.send("evm_mine", []);
        const [, nextBlockFee] = await hook.quotePoolFee(true, amountPerSwap * 2n);
        expect(nextBlockFee).to.not.equal(expectedOldBlockFee);
    });
});

describe("NARALiquidityGrowth v4 - vault routing", () => {
    it("rejects a one-shot hook binding that points at a different vault", async () => {
        const { ethers, owner, token, base, vaultAddr } = await deployFixture();
        const freshVault = await ethers.deployContract(
            "NARALiquidityGrowthVault",
            [owner.address, await token.getAddress(), await base.getAddress()],
            owner,
        );
        await freshVault.waitForDeployment();
        const wrongBinding = await ethers.deployContract(
            "MockLiquidityHookBinding",
            [await token.getAddress(), await base.getAddress(), vaultAddr],
            owner,
        );
        await wrongBinding.waitForDeployment();

        await expect(freshVault.connect(owner).setHook(await wrongBinding.getAddress()))
            .to.be.revertedWithCustomError(freshVault, "InvalidConfig");
        expect(await freshVault.hook()).to.equal(ethers.ZeroAddress);
    });

    it("rejects a compounder bound to the wrong token pair or vault", async () => {
        const { ethers, owner, token, base, vault, vaultAddr } = await deployFixture();
        const wrongCompounder = await ethers.deployContract(
            "MockLiquidityCompounder",
            [await base.getAddress(), await token.getAddress(), vaultAddr],
            owner,
        );
        await wrongCompounder.waitForDeployment();

        await expect(vault.connect(owner).setCompounder(await wrongCompounder.getAddress()))
            .to.be.revertedWithCustomError(vault, "InvalidConfig");
        expect(await vault.compounder()).to.equal(ethers.ZeroAddress);
    });

    it("only accepts pool-fee accounting from the hook", async () => {
        const { owner, vault, hookAddr, baseAddr } = await deployFixture();

        await expect(
            vault.connect(owner).recordPoolFee(baseAddr, ONE, 500, owner.address, true),
        ).to.be.revertedWithCustomError(vault, "UnauthorizedHook");

        await expect(vault.connect(owner).setHook(hookAddr))
            .to.be.revertedWithCustomError(vault, "AlreadySet");
    });

    it("compounds pool-fee balances with an authorized keeper bounty", async () => {
        const { ethers, owner, keeper, token, base, vault, vaultAddr } = await deployFixture();
        const compounder = await ethers.deployContract(
            "MockLiquidityCompounder",
            [await token.getAddress(), await base.getAddress(), vaultAddr],
            owner,
        );
        await compounder.waitForDeployment();
        const compounderAddr = await compounder.getAddress();

        await vault.connect(owner).setCompounder(compounderAddr);
        await vault.connect(owner).setKeeperBounty(100, ONE / 100n);

        const tokenAmount = 1_000n * ONE;
        const baseAmount = ONE;
        const bounty = poolFee(baseAmount, 100n);

        await token.mint(vaultAddr, tokenAmount);
        await base.mint(vaultAddr, baseAmount);

        await expect(vault.connect(keeper).compound(tokenAmount, baseAmount, tokenAmount + baseAmount - bounty, MAX_UINT64, "0x"))
            .to.emit(vault, "Compounded")
            .withArgs(keeper.address, compounderAddr, tokenAmount, baseAmount - bounty, bounty, tokenAmount + baseAmount - bounty);

        expect(await token.balanceOf(compounderAddr)).to.equal(tokenAmount);
        expect(await base.balanceOf(compounderAddr)).to.equal(baseAmount - bounty);
        expect(await base.balanceOf(keeper.address)).to.equal(bounty);
        expect(await vault.totalTokenCompounded()).to.equal(tokenAmount);
        expect(await vault.totalBaseCompounded()).to.equal(baseAmount - bounty);
        expect(await vault.totalBaseBountyPaid()).to.equal(bounty);
    });

    it("reverts if the compounder adapter does not actually consume the approved funds", async () => {
        const { ethers, owner, keeper, token, base, vault, vaultAddr } = await deployFixture();
        const compounder = await ethers.deployContract(
            "MockLiquidityCompounder",
            [await token.getAddress(), await base.getAddress(), vaultAddr],
            owner,
        );
        await compounder.waitForDeployment();
        await compounder.setSkipPulls(true);

        const tokenAmount = 100n * ONE;
        const baseAmount = ONE;

        await vault.connect(owner).setCompounder(await compounder.getAddress());
        await token.mint(vaultAddr, tokenAmount);
        await base.mint(vaultAddr, baseAmount);

        await expect(vault.connect(keeper).compound(tokenAmount, baseAmount, 1, MAX_UINT64, "0x"))
            .to.be.revertedWithCustomError(vault, "CompounderDidNotSpend");

        expect(await vault.totalTokenCompounded()).to.equal(0n);
        expect(await vault.totalBaseCompounded()).to.equal(0n);
    });

    it("rejects unauthorized compound callers", async () => {
        const { ethers, owner, attacker, token, base, vault, vaultAddr } = await deployFixture();
        const compounder = await ethers.deployContract(
            "MockLiquidityCompounder",
            [await token.getAddress(), await base.getAddress(), vaultAddr],
            owner,
        );
        await compounder.waitForDeployment();

        const tokenAmount = 100n * ONE;
        const baseAmount = ONE;

        await vault.connect(owner).setCompounder(await compounder.getAddress());
        await token.mint(vaultAddr, tokenAmount);
        await base.mint(vaultAddr, baseAmount);

        await expect(vault.connect(attacker).compound(tokenAmount, baseAmount, 0, MAX_UINT64, "0x"))
            .to.be.revertedWithCustomError(vault, "UnauthorizedKeeper");
    });

    it("permanently disables engine token-reward routing modes", async () => {
        const { ethers, owner, keeper, token, base, vault, vaultAddr } = await deployFixture();
        const engine = await ethers.deployContract("MockNARAEngineRouting", [await token.getAddress()], owner);
        await engine.waitForDeployment();

        await token.mint(vaultAddr, 100n * ONE);
        await base.mint(vaultAddr, ONE);
        await vault.connect(owner).setEngine(await engine.getAddress());
        await vault.connect(owner).setSplitEngineShare(3_000);

        await expect(vault.connect(owner).setRouteMode(1))
            .to.be.revertedWithCustomError(vault, "EngineTokenRoutingDisabled");
        await expect(vault.connect(owner).setRouteMode(2))
            .to.be.revertedWithCustomError(vault, "EngineTokenRoutingDisabled");
        await expect(vault.connect(keeper).routeToEngine(100n * ONE, ONE))
            .to.be.revertedWithCustomError(vault, "WrongRouteMode");

        expect(await token.balanceOf(vaultAddr)).to.equal(100n * ONE);
        expect(await base.balanceOf(vaultAddr)).to.equal(ONE);
    });

    it("rejects engine routing targets bound to a different NARA token", async () => {
        const { ethers, owner, base, vault } = await deployFixture();
        const wrongEngine = await ethers.deployContract("MockNARAEngineRouting", [await base.getAddress()], owner);
        await wrongEngine.waitForDeployment();

        await expect(vault.connect(owner).setEngine(await wrongEngine.getAddress()))
            .to.be.revertedWithCustomError(vault, "InvalidConfig");
    });

    it("enforces vault-level deadline and minimum liquidity output", async () => {
        const { ethers, owner, keeper, token, base, vault, vaultAddr } = await deployFixture();
        const compounder = await ethers.deployContract(
            "MockLiquidityCompounder",
            [await token.getAddress(), await base.getAddress(), vaultAddr],
            owner,
        );
        await compounder.waitForDeployment();

        const tokenAmount = 100n * ONE;
        const baseAmount = ONE;
        const expectedLiquidity = tokenAmount + baseAmount;

        await vault.connect(owner).setCompounder(await compounder.getAddress());
        await token.mint(vaultAddr, tokenAmount * 2n);
        await base.mint(vaultAddr, baseAmount * 2n);

        await expect(vault.connect(keeper).compound(tokenAmount, baseAmount, 0, 1, "0x"))
            .to.be.revertedWithCustomError(vault, "DeadlineExpired");

        await expect(vault.connect(keeper).compound(tokenAmount, baseAmount, expectedLiquidity + 1n, MAX_UINT64, "0x"))
            .to.be.revertedWithCustomError(vault, "SlippageExceeded");

        await expect(vault.connect(keeper).compound(tokenAmount, baseAmount, expectedLiquidity, MAX_UINT64, "0x"))
            .to.emit(vault, "Compounded");
    });

    it("keeps split-engine configuration bounded even though the route is disabled", async () => {
        const { owner, vault } = await deployFixture();
        await expect(vault.connect(owner).setSplitEngineShare(0))
            .to.be.revertedWithCustomError(vault, "InvalidConfig");
        await expect(vault.connect(owner).setSplitEngineShare(10_000))
            .to.be.revertedWithCustomError(vault, "InvalidConfig");

        await vault.connect(owner).setSplitEngineShare(3_000);
        expect(await vault.splitEngineShareBps()).to.equal(3_000n);
        await expect(vault.connect(owner).setRouteMode(2))
            .to.be.revertedWithCustomError(vault, "EngineTokenRoutingDisabled");
    });

    it("routes USDC pool fees into Genesis NFT reward claims", async () => {
        const {
            ethers,
            owner,
            alice,
            keeper,
            token,
            base,
            manager,
            vault,
            hook,
            hookAddr,
            key,
            exactInParams,
            tokenAddr,
            baseAddr,
            vaultAddr,
        } = await deployFixture();

        const engine = await ethers.deployContract("MockNARAEngineV4", [], owner);
        await engine.waitForDeployment();
        await engine.setNara(tokenAddr);

        const accountImpl = await ethers.deployContract("NARAPositionAccountV4", [], owner);
        await accountImpl.waitForDeployment();

        const renderer = await deployRenderer(ethers, owner);

        const positionNft = await ethers.deployContract(
            "NARAPositionNFTV4",
            [
                await engine.getAddress(),
                tokenAddr,
                await accountImpl.getAddress(),
                await renderer.getAddress(),
                owner.address,
                owner.address,
                0,
            ],
            owner,
        );
        await positionNft.waitForDeployment();

        const genesisDistributor = await ethers.deployContract(
            "NARAGenesisRewardDistributorV4",
            [await positionNft.getAddress(), baseAddr],
            owner,
        );
        await genesisDistributor.waitForDeployment();
        await positionNft.setGenesisRewardDistributor(await genesisDistributor.getAddress());
        await positionNft.setGenesisMinter(alice.address, true);

        await token.mint(alice.address, 1_000n * ONE);
        await token.connect(alice).approve(await positionNft.getAddress(), 1_000n * ONE);
        await positionNft.connect(alice).mintGenesisAndLockFor(
            alice.address,
            1_000n * ONE,
            96,
            0,
            1,
            1,
            20_000,
            false,
            { value: LOCK_FEE },
        );

        await vault.connect(owner).setGenesisRewardDistributor(await genesisDistributor.getAddress());
        await vault.connect(owner).setRouteMode(3);
        await hook.connect(owner).setProtocolDepth(baseAddr, 10_000n * USDC);
        await hook.connect(owner).registerPool(key, SQRT_PRICE_1_1);

        const amountIn = 1_000n * USDC;
        const [, expectedFee] = await hook.quotePoolFee(true, amountIn);
        await manager.connect(alice).callBeforeSwap(hookAddr, key, exactInParams(baseAddr, amountIn), "0x");

        expect(await vault.totalBaseFeeRecorded()).to.equal(expectedFee);
        await base.mint(vaultAddr, expectedFee);

        await expect(vault.connect(keeper).routeAllBaseToGenesis())
            .to.emit(vault, "RoutedToGenesis")
            .withArgs(keeper.address, expectedFee);

        expect(await base.balanceOf(await genesisDistributor.getAddress())).to.equal(expectedFee);
        expect(await positionNft.claimableGenesisToken(1)).to.equal(expectedFee);

        await positionNft.connect(alice).claimGenesisToken(1, alice.address);
        expect(await base.balanceOf(alice.address)).to.equal(expectedFee);
        expect(await vault.totalBaseRoutedToGenesis()).to.equal(expectedFee);
    });

    it("splits USDC pool fees between Genesis rewards and liquidity compounding", async () => {
        const { ethers, owner, keeper, token, base, vault, vaultAddr, baseAddr } = await deployFixture();
        const compounder = await ethers.deployContract(
            "MockLiquidityCompounder",
            [await token.getAddress(), await base.getAddress(), vaultAddr],
            owner,
        );
        await compounder.waitForDeployment();
        const compounderAddr = await compounder.getAddress();

        const engine = await ethers.deployContract("MockNARAEngineV4", [], owner);
        await engine.waitForDeployment();
        await engine.setNara(await token.getAddress());

        const accountImpl = await ethers.deployContract("NARAPositionAccountV4", [], owner);
        await accountImpl.waitForDeployment();

        const renderer = await deployRenderer(ethers, owner);

        const positionNft = await ethers.deployContract(
            "NARAPositionNFTV4",
            [
                await engine.getAddress(),
                await token.getAddress(),
                await accountImpl.getAddress(),
                await renderer.getAddress(),
                owner.address,
                owner.address,
                0,
            ],
            owner,
        );
        await positionNft.waitForDeployment();

        const genesisDistributor = await ethers.deployContract(
            "NARAGenesisRewardDistributorV4",
            [await positionNft.getAddress(), baseAddr],
            owner,
        );
        await genesisDistributor.waitForDeployment();
        await positionNft.setGenesisRewardDistributor(await genesisDistributor.getAddress());
        await positionNft.setGenesisMinter(owner.address, true);

        const tokenAmount = 1_000n * ONE;
        const baseAmount = 1_000n * USDC;
        const baseToGenesis = 200n * USDC;
        const baseToCompound = 800n * USDC;

        await token.mint(vaultAddr, tokenAmount);
        await token.mint(owner.address, 1_000n * ONE);
        await token.approve(await positionNft.getAddress(), 1_000n * ONE);
        await positionNft.mintGenesisAndLockFor(
            owner.address,
            1_000n * ONE,
            96,
            0,
            1,
            1,
            20_000,
            false,
            { value: LOCK_FEE },
        );
        await base.mint(vaultAddr, baseAmount);
        await vault.connect(owner).setCompounder(compounderAddr);
        await vault.connect(owner).setGenesisRewardDistributor(await genesisDistributor.getAddress());

        await expect(vault.connect(owner).setRouteMode(4))
            .to.be.revertedWithCustomError(vault, "InvalidConfig");

        await vault.connect(owner).setSplitGenesisShare(2_000);
        await vault.connect(owner).setRouteMode(4);

        await expect(vault.connect(keeper).processGenesisSplitAll(tokenAmount + baseToCompound, MAX_UINT64, "0x"))
            .to.emit(vault, "GenesisSplitProcessed")
            .withArgs(keeper.address, baseToGenesis, tokenAmount, baseToCompound, tokenAmount + baseToCompound);

        expect(await base.balanceOf(await genesisDistributor.getAddress())).to.equal(baseToGenesis);
        expect(await token.balanceOf(compounderAddr)).to.equal(tokenAmount);
        expect(await base.balanceOf(compounderAddr)).to.equal(baseToCompound);
        expect(await vault.totalBaseRoutedToGenesis()).to.equal(baseToGenesis);
        expect(await vault.totalTokenCompounded()).to.equal(tokenAmount);
        expect(await vault.totalBaseCompounded()).to.equal(baseToCompound);
    });
});
