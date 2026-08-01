import { expect } from "chai";
import hre from "hardhat";

const BPS = 10_000n;
const BOOTSTRAP_FEE_BPS = 1_500n;
const MIN_FEEABLE_RAW_AMOUNT = 10_000n;
const SQRT_PRICE_1_1 = 1n << 96n;
const MIN_BOOTSTRAP_LIQUIDITY = 1_000n;
const LATER_PHASE_MINIMUM_ACTIVE_LIQUIDITY = [1_250n, 1_500n, 1_750n, 2_000n];
const INT128_MAX = (1n << 127n) - 1n;
const INT256_MIN = -(1n << 255n);
const UINT128_MASK = (1n << 128n) - 1n;

function sameAddress(a: string, b: string): boolean {
    return a.toLowerCase() === b.toLowerCase();
}

function ceilFee(amount: bigint, feeBps: bigint): bigint {
    if (amount === 0n || feeBps === 0n) return 0n;
    return ((amount * feeBps) + BPS - 1n) / BPS;
}

function packBalanceDelta(amount0: bigint, amount1: bigint): bigint {
    const packed = (BigInt.asUintN(128, amount0) << 128n) | (BigInt.asUintN(128, amount1) & UINT128_MASK);
    return BigInt.asIntN(256, packed);
}

function packBeforeSwapDelta(specifiedDelta: bigint, unspecifiedDelta = 0n): bigint {
    return packBalanceDelta(specifiedDelta, unspecifiedDelta);
}

function rawAmmDelta(zeroForOne: boolean, actualAmmInput: bigint, grossOutput: bigint): bigint {
    return zeroForOne
        ? packBalanceDelta(-actualAmmInput, grossOutput)
        : packBalanceDelta(grossOutput, -actualAmmInput);
}

function swapParams(zeroForOne: boolean, grossInput: bigint) {
    return {
        zeroForOne,
        amountSpecified: -grossInput,
        sqrtPriceLimitX96: 0n,
    };
}

function asPoolKey(result: any) {
    return {
        currency0: result.currency0,
        currency1: result.currency1,
        fee: result.fee,
        tickSpacing: result.tickSpacing,
        hooks: result.hooks,
    };
}

type FixtureOptions = {
    tokenIsCurrency0?: boolean;
    minimumTokenAmount?: bigint;
    minimumBaseAmount?: bigint;
    laterPhaseFeeBps?: number[];
    laterPhaseMinimumActiveLiquidity?: bigint[];
    bindCompanions?: boolean;
    activate?: boolean;
};

async function deployFixture(options: FixtureOptions = {}) {
    const connection = await hre.network.connect();
    const { ethers } = connection;
    const [owner, alice, bob, attacker] = await ethers.getSigners();
    const manager = await ethers.deployContract("MockV4PoolManagerV5", [], owner);
    const assetA = await ethers.deployContract("MockERC20", ["Asset A", "A", 18], owner);
    const assetB = await ethers.deployContract("MockERC20", ["Asset B", "B", 18], owner);
    await Promise.all([manager.waitForDeployment(), assetA.waitForDeployment(), assetB.waitForDeployment()]);

    const assetAAddress = await assetA.getAddress();
    const assetBAddress = await assetB.getAddress();
    const [lowAsset, highAsset] = BigInt(assetAAddress) < BigInt(assetBAddress)
        ? [assetA, assetB]
        : [assetB, assetA];
    const tokenIsCurrency0 = options.tokenIsCurrency0 ?? true;
    const token = tokenIsCurrency0 ? lowAsset : highAsset;
    const base = tokenIsCurrency0 ? highAsset : lowAsset;
    const tokenAddress = await token.getAddress();
    const baseAddress = await base.getAddress();
    const managerAddress = await manager.getAddress();

    const vault = await ethers.deployContract(
        "MockNARALiquidityGrowthVaultV5",
        [tokenAddress, baseAddress, managerAddress],
        owner,
    );
    const controller = await ethers.deployContract("MockNARALiquidityPhaseControllerV5", [], owner);
    await Promise.all([vault.waitForDeployment(), controller.waitForDeployment()]);

    const laterPhaseFeeBps = options.laterPhaseFeeBps ?? [1_250, 1_000, 750, 500];
    const laterPhaseMinimumActiveLiquidity =
        options.laterPhaseMinimumActiveLiquidity ?? LATER_PHASE_MINIMUM_ACTIVE_LIQUIDITY;
    const hook = await ethers.deployContract(
        "TestNARALiquidityGrowthHookV5",
        [
            managerAddress,
            owner.address,
            tokenAddress,
            baseAddress,
            await vault.getAddress(),
            SQRT_PRICE_1_1,
            MIN_BOOTSTRAP_LIQUIDITY,
            options.minimumTokenAmount ?? MIN_FEEABLE_RAW_AMOUNT,
            options.minimumBaseAmount ?? MIN_FEEABLE_RAW_AMOUNT,
            laterPhaseFeeBps,
            laterPhaseMinimumActiveLiquidity,
        ],
        owner,
    );
    await hook.waitForDeployment();
    const hookAddress = await hook.getAddress();
    const key = asPoolKey(await hook.canonicalPoolKey());
    const poolId = await hook.poolId();
    const phaseScheduleHash = await hook.phaseScheduleHash();
    await controller.configureStatic(poolId, phaseScheduleHash);

    if (options.bindCompanions ?? true) {
        await hook.bindPhaseController(await controller.getAddress());
        await vault.bind(hookAddress, poolId);
        await controller.bind(hookAddress, poolId, phaseScheduleHash);
    }

    await manager.setPoolState(poolId, SQRT_PRICE_1_1, MIN_BOOTSTRAP_LIQUIDITY);
    await controller.setActiveProtocolLiquidity(MIN_BOOTSTRAP_LIQUIDITY);
    await controller.setActivationAllowed(true);
    if (options.activate ?? true) {
        await hook.connect(owner).activatePool();
    }

    return {
        ethers,
        owner,
        alice,
        bob,
        attacker,
        manager,
        token,
        base,
        vault,
        controller,
        hook,
        key,
        poolId,
        managerAddress,
        hookAddress,
        tokenAddress,
        baseAddress,
        tokenIsCurrency0,
    };
}

function directionFor(fixture: Awaited<ReturnType<typeof deployFixture>>, isBuy: boolean) {
    const inputCurrency = isBuy ? fixture.baseAddress : fixture.tokenAddress;
    const outputCurrency = isBuy ? fixture.tokenAddress : fixture.baseAddress;
    const zeroForOne = sameAddress(inputCurrency, fixture.key.currency0);
    return { inputCurrency, outputCurrency, zeroForOne };
}

async function runLifecycle(
    fixture: Awaited<ReturnType<typeof deployFixture>>,
    options: {
        isBuy: boolean;
        grossInput: bigint;
        grossOutput: bigint;
        caller?: any;
        hookData?: string;
        actualAmmInput?: bigint;
        rawDelta?: bigint;
    },
) {
    const feeBps = BigInt(await fixture.hook.currentFeeBps());
    const inputFee = ceilFee(options.grossInput, feeBps);
    const outputFee = ceilFee(options.grossOutput, feeBps);
    const ammInput = options.grossInput - inputFee;
    const direction = directionFor(fixture, options.isBuy);
    const params = swapParams(direction.zeroForOne, options.grossInput);
    const delta = options.rawDelta ?? rawAmmDelta(
        direction.zeroForOne,
        options.actualAmmInput ?? ammInput,
        options.grossOutput,
    );
    const caller = options.caller ?? fixture.alice;
    const hookData = options.hookData ?? "0x";
    const transaction = fixture.manager.connect(caller).callSwapLifecycle(
        fixture.hookAddress,
        fixture.key,
        params,
        delta,
        hookData,
    );
    return {
        transaction,
        feeBps,
        inputFee,
        outputFee,
        ammInput,
        params,
        delta,
        caller,
        hookData,
        ...direction,
    };
}

async function encodeSwapProtection(
    fixture: Awaited<ReturnType<typeof deployFixture>>,
    overrides: Partial<{
        version: number;
        minimumAcceptedPhase: number;
        maximumPerLegFeeBps: number;
        maximumNominalCombinedHookFeeBps: number;
        deadline: bigint;
        expectedPhaseScheduleHash: string;
        minimumNetOutput: bigint;
    }> = {},
) {
    const latest = await fixture.ethers.provider.getBlock("latest");
    if (!latest) throw new Error("latest block unavailable");
    const phase = Number(await fixture.hook.currentPhase());
    const feeBps = Number(await fixture.hook.currentFeeBps());
    const combinedFeeBps = Number(await fixture.hook.combinedEffectiveFeeBps(feeBps));
    return fixture.ethers.AbiCoder.defaultAbiCoder().encode(
        [
            "tuple(uint8 version,uint8 minimumAcceptedPhase,uint16 maximumPerLegFeeBps,uint16 maximumNominalCombinedHookFeeBps,uint64 deadline,bytes32 expectedPhaseScheduleHash,uint256 minimumNetOutput)",
        ],
        [[
            overrides.version ?? 1,
            overrides.minimumAcceptedPhase ?? phase,
            overrides.maximumPerLegFeeBps ?? feeBps,
            overrides.maximumNominalCombinedHookFeeBps ?? combinedFeeBps,
            overrides.deadline ?? BigInt(latest.timestamp + 3_600),
            overrides.expectedPhaseScheduleHash ?? await fixture.hook.phaseScheduleHash(),
            overrides.minimumNetOutput ?? 0n,
        ]],
    );
}

describe("NARALiquidityGrowthHookV5 - construction, schedule, and caps", () => {
    it("freezes the 1500 bps bootstrap phase, descending schedule, effective cap, and schedule hash", async () => {
        const f = await deployFixture();

        expect(await f.hook.BOOTSTRAP_FEE_BPS()).to.equal(1_500n);
        expect(await f.hook.PHASE_STEP_FEE_BPS()).to.equal(250n);
        expect(await f.hook.MIN_LEG_FEE_BPS()).to.equal(500n);
        expect(await f.hook.MAX_LEG_FEE_BPS()).to.equal(1_500n);
        expect(await f.hook.MAX_COMBINED_EFFECTIVE_FEE_BPS()).to.equal(2_775n);
        expect(await f.hook.minimumTokenAmount()).to.equal(MIN_FEEABLE_RAW_AMOUNT);
        expect(await f.hook.minimumBaseAmount()).to.equal(MIN_FEEABLE_RAW_AMOUNT);
        expect(await f.hook.MINIMUM_AMOUNT_FOR_ONE_BPS_ROUNDING_BOUND()).to.equal(10_000n);
        expect(await f.hook.MAX_ROUNDING_SURCHARGE_RAW_PER_LEG()).to.equal(1n);
        expect(await f.hook.FIXED_PHASE_COUNT()).to.equal(5n);
        expect(await f.hook.phaseCount()).to.equal(5n);
        expect(await f.hook.phaseFeeBps(0)).to.equal(1_500n);
        expect(await f.hook.phaseFeeBps(1)).to.equal(1_250n);
        expect(await f.hook.phaseFeeBps(2)).to.equal(1_000n);
        expect(await f.hook.phaseFeeBps(3)).to.equal(750n);
        expect(await f.hook.phaseFeeBps(4)).to.equal(500n);
        expect(await f.hook.currentPhase()).to.equal(0n);
        expect(await f.hook.currentFeeBps()).to.equal(1_500n);
        expect(await f.hook.combinedEffectiveFeeBps(1_500)).to.equal(2_775n);
        expect(await f.hook.combinedEffectiveFeeBps(1_250)).to.equal(2_344n);
        expect(await f.hook.combinedEffectiveFeeBps(1_000)).to.equal(1_900n);
        expect(await f.hook.combinedEffectiveFeeBps(750)).to.equal(1_444n);
        expect(await f.hook.combinedEffectiveFeeBps(500)).to.equal(975n);

        expect(await f.hook.phaseMinimumActiveLiquidity(0)).to.equal(1_000n);
        expect(await f.hook.phaseMinimumActiveLiquidity(1)).to.equal(1_250n);
        expect(await f.hook.phaseMinimumActiveLiquidity(2)).to.equal(1_500n);
        expect(await f.hook.phaseMinimumActiveLiquidity(3)).to.equal(1_750n);
        expect(await f.hook.phaseMinimumActiveLiquidity(4)).to.equal(2_000n);

        const expectedHash = f.ethers.keccak256(f.ethers.AbiCoder.defaultAbiCoder().encode(
            ["uint16[]", "uint128[]"],
            [[1_500, 1_250, 1_000, 750, 500], [1_000, 1_250, 1_500, 1_750, 2_000]],
        ));
        expect(await f.hook.phaseScheduleHash()).to.equal(expectedHash);
        await expect(f.hook.phaseFeeBps(5)).to.be.revertedWithCustomError(f.hook, "InvalidPhaseSchedule");
        await expect(f.hook.phaseMinimumActiveLiquidity(5))
            .to.be.revertedWithCustomError(f.hook, "InvalidLiquiditySchedule");
        await expect(f.hook.combinedEffectiveFeeBps(10_001)).to.be.revertedWithCustomError(f.hook, "FeeCapExceeded");
    });

    it("rejects every schedule except the frozen 15-to-5 curve in 2.5-point steps", async () => {
        const f = await deployFixture();
        const args = (schedule: number[], liquiditySchedule = LATER_PHASE_MINIMUM_ACTIVE_LIQUIDITY) => [
            f.managerAddress,
            f.owner.address,
            f.tokenAddress,
            f.baseAddress,
            f.vault.getAddress(),
            SQRT_PRICE_1_1,
            MIN_BOOTSTRAP_LIQUIDITY,
            MIN_FEEABLE_RAW_AMOUNT,
            MIN_FEEABLE_RAW_AMOUNT,
            schedule,
            liquiditySchedule,
        ];

        await expect(f.ethers.deployContract("TestNARALiquidityGrowthHookV5", await Promise.all(args([])), f.owner))
            .to.be.revertedWithCustomError(f.hook, "InvalidPhaseSchedule");
        await expect(f.ethers.deployContract("TestNARALiquidityGrowthHookV5", await Promise.all(args([1_500])), f.owner))
            .to.be.revertedWithCustomError(f.hook, "InvalidPhaseSchedule");
        await expect(f.ethers.deployContract("TestNARALiquidityGrowthHookV5", await Promise.all(args([1_000, 1_100])), f.owner))
            .to.be.revertedWithCustomError(f.hook, "InvalidPhaseSchedule");
        await expect(
            f.ethers.deployContract(
                "TestNARALiquidityGrowthHookV5",
                await Promise.all(args([1_250, 1_000, 750, 250])),
                f.owner,
            ),
        ).to.be.revertedWithCustomError(f.hook, "InvalidPhaseSchedule");
        await expect(
            f.ethers.deployContract(
                "TestNARALiquidityGrowthHookV5",
                await Promise.all(args([1_250, 1_000, 750, 500], [1_250n, 1_500n, 1_750n])),
                f.owner,
            ),
        ).to.be.revertedWithCustomError(f.hook, "InvalidLiquiditySchedule");
        await expect(
            f.ethers.deployContract(
                "TestNARALiquidityGrowthHookV5",
                await Promise.all(args([1_250, 1_000, 750, 500], [1_250n, 1_500n, 1_500n, 2_000n])),
                f.owner,
            ),
        ).to.be.revertedWithCustomError(f.hook, "InvalidLiquiditySchedule");
        await expect(
            f.ethers.deployContract(
                "TestNARALiquidityGrowthHookV5",
                await Promise.all(args(Array.from({ length: 16 }, (_, index) => 1_499 - index))),
                f.owner,
            ),
        ).to.be.revertedWithCustomError(f.hook, "InvalidPhaseSchedule");
    });

    it("rejects invalid pair, price, liquidity, and reciprocal vault bindings", async () => {
        const f = await deployFixture();
        const deploy = (overrides: Record<string, unknown> = {}) => f.ethers.deployContract(
            "TestNARALiquidityGrowthHookV5",
            [
                overrides.manager ?? f.managerAddress,
                f.owner.address,
                overrides.token ?? f.tokenAddress,
                overrides.base ?? f.baseAddress,
                overrides.vault ?? f.vault.getAddress(),
                overrides.price ?? SQRT_PRICE_1_1,
                overrides.minimumLiquidity ?? MIN_BOOTSTRAP_LIQUIDITY,
                overrides.minimumTokenAmount ?? MIN_FEEABLE_RAW_AMOUNT,
                overrides.minimumBaseAmount ?? MIN_FEEABLE_RAW_AMOUNT,
                [1_250, 1_000, 750, 500],
                LATER_PHASE_MINIMUM_ACTIVE_LIQUIDITY,
            ],
            f.owner,
        );

        await expect(deploy({ token: f.ethers.ZeroAddress })).to.be.revertedWithCustomError(f.hook, "InvalidTokenPair");
        await expect(deploy({ base: f.tokenAddress })).to.be.revertedWithCustomError(f.hook, "InvalidTokenPair");
        await expect(deploy({ price: 0n })).to.be.revertedWithCustomError(f.hook, "ZeroInitializationPrice");
        await expect(deploy({ minimumLiquidity: 0n })).to.be.revertedWithCustomError(f.hook, "InvalidPoolConfig");
        await expect(deploy({ minimumTokenAmount: 9_999n }))
            .to.be.revertedWithCustomError(f.hook, "InvalidMinimumTradeAmount");
        await expect(deploy({ minimumBaseAmount: 9_999n }))
            .to.be.revertedWithCustomError(f.hook, "InvalidMinimumTradeAmount");
        await expect(deploy({ manager: f.owner.address })).to.be.revertedWithCustomError(f.hook, "NotAContract");
        await expect(deploy({ token: f.owner.address })).to.be.revertedWithCustomError(f.hook, "NotAContract");
        await expect(deploy({ base: f.attacker.address })).to.be.revertedWithCustomError(f.hook, "NotAContract");
        await expect(deploy({ vault: f.owner.address })).to.be.revertedWithCustomError(f.hook, "NotAContract");
        const wrongVault = await f.ethers.deployContract(
            "MockNARALiquidityGrowthVaultV5",
            [f.baseAddress, f.tokenAddress, f.managerAddress],
            f.owner,
        );
        await wrongVault.waitForDeployment();
        await expect(deploy({ vault: await wrongVault.getAddress() }))
            .to.be.revertedWithCustomError(f.hook, "VaultBindingMismatch");
    });

    it("advertises exactly the five required Uniswap v4 permissions", async () => {
        const f = await deployFixture();
        const permissions = await f.hook.getHookPermissions();
        expect(permissions.beforeInitialize).to.equal(true);
        expect(permissions.beforeSwap).to.equal(true);
        expect(permissions.afterSwap).to.equal(true);
        expect(permissions.beforeSwapReturnDelta).to.equal(true);
        expect(permissions.afterSwapReturnDelta).to.equal(true);
        expect(permissions.beforeAddLiquidity).to.equal(false);
        expect(permissions.afterAddLiquidity).to.equal(false);
        expect(permissions.beforeRemoveLiquidity).to.equal(false);
        expect(permissions.afterRemoveLiquidity).to.equal(false);
        expect(permissions.beforeDonate).to.equal(false);
        expect(permissions.afterDonate).to.equal(false);
    });
});

describe("NARALiquidityGrowthHookV5 - canonical pool and activation", () => {
    it("binds the exact static controller once, pins its runtime hash, and rejects every alternate path", async () => {
        const f = await deployFixture({ bindCompanions: false, activate: false });
        const controllerAddress = await f.controller.getAddress();
        expect(await f.hook.phaseController()).to.equal(f.ethers.ZeroAddress);
        await expect(f.hook.connect(f.attacker).bindPhaseController(controllerAddress))
            .to.be.revertedWithCustomError(f.hook, "OwnableUnauthorizedAccount")
            .withArgs(f.attacker.address);
        await expect(f.hook.bindPhaseController(f.ethers.ZeroAddress))
            .to.be.revertedWithCustomError(f.hook, "ZeroAddress");
        await expect(f.hook.bindPhaseController(f.owner.address))
            .to.be.revertedWithCustomError(f.hook, "NotAContract");

        const wrongController = await f.ethers.deployContract("MockNARALiquidityPhaseControllerV5");
        await wrongController.waitForDeployment();
        await wrongController.configureStatic(
            f.poolId,
            f.ethers.keccak256(f.ethers.toUtf8Bytes("wrong-phase-schedule")),
        );
        await expect(f.hook.bindPhaseController(await wrongController.getAddress()))
            .to.be.revertedWithCustomError(f.hook, "PhaseControllerBindingMismatch");

        await expect(f.hook.bindPhaseController(controllerAddress))
            .to.emit(f.hook, "PhaseControllerBound");
        expect(await f.hook.phaseController()).to.equal(controllerAddress);
        expect(await f.hook.phaseControllerCodeHash()).to.equal(
            f.ethers.keccak256(await f.ethers.provider.getCode(controllerAddress)),
        );
        await expect(f.hook.bindPhaseController(controllerAddress))
            .to.be.revertedWithCustomError(f.hook, "PhaseControllerAlreadyBound");
    });

    it("binds the sorted canonical key and exact opening price", async () => {
        const f = await deployFixture({ tokenIsCurrency0: false });
        expect(BigInt(f.key.currency0)).to.be.lessThan(BigInt(f.key.currency1));
        expect(f.key.hooks).to.equal(f.hookAddress);
        expect(f.key.fee).to.equal(3_000n);
        expect(f.key.tickSpacing).to.equal(60n);
        expect(await f.hook.tokenIsCurrency0()).to.equal(false);
        expect(await f.hook.expectedSqrtPriceX96()).to.equal(SQRT_PRICE_1_1);
        expect(await f.hook.expectedOpeningTick()).to.equal(0n);
        expect(await f.hook.vaultConfigurationHash()).to.equal(await f.vault.configurationHash());
        expect(await f.hook.phaseControllerConfigurationHash()).to.equal(await f.controller.configurationHash());

        await expect(f.manager.callBeforeInitialize(f.hookAddress, f.key, SQRT_PRICE_1_1 + 1n))
            .to.be.revertedWithCustomError(f.hook, "InvalidInitializationPrice")
            .withArgs(SQRT_PRICE_1_1, SQRT_PRICE_1_1 + 1n);
        await f.manager.callBeforeInitialize(f.hookAddress, f.key, SQRT_PRICE_1_1);

        await expect(f.manager.callBeforeInitialize(f.hookAddress, { ...f.key, hooks: f.ethers.ZeroAddress }, SQRT_PRICE_1_1))
            .to.be.revertedWithCustomError(f.hook, "UnauthorizedPool");
        await expect(f.manager.callBeforeInitialize(f.hookAddress, { ...f.key, fee: 500 }, SQRT_PRICE_1_1))
            .to.be.revertedWithCustomError(f.hook, "InvalidPoolConfig");
        await expect(f.manager.callBeforeInitialize(f.hookAddress, { ...f.key, tickSpacing: 10 }, SQRT_PRICE_1_1))
            .to.be.revertedWithCustomError(f.hook, "InvalidPoolConfig");
        await expect(
            f.manager.callBeforeInitialize(
                f.hookAddress,
                { ...f.key, currency0: f.attacker.address },
                SQRT_PRICE_1_1,
            ),
        ).to.be.revertedWithCustomError(f.hook, "InvalidTokenPair");
    });

    it("fails activation closed on missing bindings, price mismatch, controller veto, and invalid named POL", async () => {
        const unbound = await deployFixture({ bindCompanions: false, activate: false });
        await expect(unbound.hook.activatePool()).to.be.revertedWithCustomError(
            unbound.hook,
            "CompanionCodeHashMismatch",
        );
        await unbound.hook.bindPhaseController(await unbound.controller.getAddress());
        await expect(unbound.hook.activatePool()).to.be.revertedWithCustomError(unbound.hook, "VaultBindingMismatch");

        await unbound.vault.bind(unbound.hookAddress, unbound.poolId);
        await expect(unbound.hook.activatePool()).to.be.revertedWithCustomError(
            unbound.hook,
            "PhaseControllerBindingMismatch",
        );
        await unbound.controller.bind(unbound.hookAddress, unbound.poolId, await unbound.hook.phaseScheduleHash());

        await unbound.manager.setPoolState(unbound.poolId, SQRT_PRICE_1_1 + 1n, MIN_BOOTSTRAP_LIQUIDITY);
        await expect(unbound.hook.activatePool())
            .to.be.revertedWithCustomError(unbound.hook, "InvalidInitializationPrice")
            .withArgs(SQRT_PRICE_1_1, SQRT_PRICE_1_1 + 1n);

        await unbound.manager.setPoolState(unbound.poolId, SQRT_PRICE_1_1, MIN_BOOTSTRAP_LIQUIDITY);
        await unbound.controller.setActivationAllowed(false);
        await expect(unbound.hook.activatePool())
            .to.be.revertedWithCustomError(unbound.hook, "PhaseControllerActivationBlocked");

        await unbound.controller.setActivationAllowed(true);
        await unbound.controller.setActiveProtocolLiquidity(MIN_BOOTSTRAP_LIQUIDITY - 1n);
        await expect(unbound.hook.activatePool())
            .to.be.revertedWithCustomError(unbound.hook, "InsufficientBootstrapLiquidity")
            .withArgs(MIN_BOOTSTRAP_LIQUIDITY, MIN_BOOTSTRAP_LIQUIDITY - 1n);

        await unbound.controller.setActiveProtocolLiquidity(MIN_BOOTSTRAP_LIQUIDITY + 1n);
        await expect(unbound.hook.activatePool())
            .to.be.revertedWithCustomError(unbound.hook, "ProtocolLiquidityExceedsPoolLiquidity")
            .withArgs(MIN_BOOTSTRAP_LIQUIDITY + 1n, MIN_BOOTSTRAP_LIQUIDITY);

        await unbound.controller.setActiveProtocolLiquidity(MIN_BOOTSTRAP_LIQUIDITY);
        await expect(unbound.hook.connect(unbound.attacker).activatePool())
            .to.be.revertedWithCustomError(unbound.hook, "OwnableUnauthorizedAccount")
            .withArgs(unbound.attacker.address);
        await expect(unbound.hook.activatePool()).to.emit(unbound.hook, "PoolActivated");
        await expect(unbound.hook.activatePool()).to.be.revertedWithCustomError(unbound.hook, "PoolAlreadyActive");
    });

    it("rejects an opening tick that does not match the exact opening price", async () => {
        const f = await deployFixture({ activate: false });
        await f.manager.setRawPoolState(
            f.poolId,
            SQRT_PRICE_1_1,
            1,
            0,
            3_000,
            MIN_BOOTSTRAP_LIQUIDITY,
        );

        await expect(f.hook.activatePool()).to.be.revertedWithCustomError(f.hook, "InvalidPoolConfig");
    });

    it("rejects an opening LP fee that does not match the canonical pool fee", async () => {
        const f = await deployFixture({ activate: false });
        await f.manager.setRawPoolState(
            f.poolId,
            SQRT_PRICE_1_1,
            0,
            0,
            2_999,
            MIN_BOOTSTRAP_LIQUIDITY,
        );

        await expect(f.hook.activatePool()).to.be.revertedWithCustomError(f.hook, "InvalidPoolConfig");
    });

    it("requires the Hook to bind the controller's exact static pool and phase schedule", async () => {
        const f = await deployFixture({ bindCompanions: false, activate: false });
        const wrongController = await f.ethers.deployContract("MockNARALiquidityPhaseControllerV5");
        await wrongController.waitForDeployment();
        await wrongController.configureStatic(
            f.poolId,
            f.ethers.keccak256(f.ethers.toUtf8Bytes("wrong-schedule")),
        );

        await expect(f.hook.bindPhaseController(await wrongController.getAddress()))
            .to.be.revertedWithCustomError(f.hook, "PhaseControllerBindingMismatch");
    });

    it("requires sealed companion configurations and rejects post-activation drift", async () => {
        const f = await deployFixture({ activate: false });
        const expectedControllerConfigurationHash = await f.controller.configurationHash();
        await f.vault.setConfigurationSealed(false);
        await expect(f.hook.activatePool())
            .to.be.revertedWithCustomError(f.hook, "CompanionConfigurationUnsealed");

        await f.vault.setConfigurationSealed(true);
        await f.controller.setConfigurationHash(f.ethers.ZeroHash);
        await expect(f.hook.activatePool())
            .to.be.revertedWithCustomError(f.hook, "CompanionConfigurationUnsealed");

        await f.controller.setConfigurationHash(expectedControllerConfigurationHash);
        await f.hook.activatePool();
        await f.vault.setConfigurationHash(
            f.ethers.keccak256(f.ethers.toUtf8Bytes("mutated-vault-configuration")),
        );

        const run = await runLifecycle(f, {
            isBuy: true,
            grossInput: 10_000n,
            grossOutput: 20_000n,
        });
        await expect(run.transaction)
            .to.be.revertedWithCustomError(f.hook, "CompanionConfigurationMismatch");
        expect(await f.manager.mintCount()).to.equal(0n);
    });

    it("rejects swaps until activation succeeds", async () => {
        const f = await deployFixture({ activate: false });
        const direction = directionFor(f, true);
        const grossInput = 100n;
        const inputFee = ceilFee(grossInput, BOOTSTRAP_FEE_BPS);
        await expect(
            f.manager.callSwapLifecycle(
                f.hookAddress,
                f.key,
                swapParams(direction.zeroForOne, grossInput),
                rawAmmDelta(direction.zeroForOne, grossInput - inputFee, 100n),
                "0x",
            ),
        ).to.be.revertedWithCustomError(f.hook, "PoolInactive");
        expect(await f.manager.mintCount()).to.equal(0n);
    });
});

describe("NARALiquidityGrowthHookV5 - exact 1500 + 1500 fee math", () => {
    it("uses ceiling math and quotes both legs without presenting the nominal sum as effective", async () => {
        const f = await deployFixture();
        const cases: Array<[bigint, bigint]> = [
            [0n, 0n],
            [1n, 1n],
            [2n, 1n],
            [6n, 1n],
            [7n, 2n],
            [19n, 3n],
            [20n, 3n],
            [9_999n, 1_500n],
            [10_000n, 1_500n],
            [10_001n, 1_501n],
        ];
        for (const [amount, expected] of cases) {
            expect(await f.hook.feeFor(amount, 1_500)).to.equal(expected);
        }

        const quote = await f.hook.quoteFeesForGrossAmounts(true, 10_000n, 20_000n);
        expect(quote.phase).to.equal(0n);
        expect(quote.feeBps).to.equal(1_500n);
        expect(quote.inputFee).to.equal(1_500n);
        expect(quote.ammInput).to.equal(8_500n);
        expect(quote.outputFee).to.equal(3_000n);
        expect(quote.netOutput).to.equal(17_000n);
        expect(await f.hook.combinedEffectiveFeeBps(quote.feeBps)).to.equal(2_775n);
    });

    it("enforces the raw-amount floor on both legs and accepts the exact boundary", async () => {
        const f = await deployFixture();
        await expect(f.hook.quoteFeesForGrossAmounts(true, 0n, MIN_FEEABLE_RAW_AMOUNT))
            .to.be.revertedWithCustomError(f.hook, "ZeroAmount");
        await expect(f.hook.quoteFeesForGrossAmounts(true, MIN_FEEABLE_RAW_AMOUNT, 0n))
            .to.be.revertedWithCustomError(f.hook, "ZeroAmount");
        await expect(f.hook.quoteFeesForGrossAmounts(true, MIN_FEEABLE_RAW_AMOUNT - 1n, MIN_FEEABLE_RAW_AMOUNT))
            .to.be.revertedWithCustomError(f.hook, "TradeAmountBelowMinimum")
            .withArgs(MIN_FEEABLE_RAW_AMOUNT, MIN_FEEABLE_RAW_AMOUNT - 1n);
        await expect(f.hook.quoteFeesForGrossAmounts(true, MIN_FEEABLE_RAW_AMOUNT, MIN_FEEABLE_RAW_AMOUNT - 1n))
            .to.be.revertedWithCustomError(f.hook, "TradeAmountBelowMinimum")
            .withArgs(MIN_FEEABLE_RAW_AMOUNT, MIN_FEEABLE_RAW_AMOUNT - 1n);

        const belowInput = await runLifecycle(f, {
            isBuy: true,
            grossInput: MIN_FEEABLE_RAW_AMOUNT - 1n,
            grossOutput: MIN_FEEABLE_RAW_AMOUNT,
        });
        await expect(belowInput.transaction)
            .to.be.revertedWithCustomError(f.hook, "TradeAmountBelowMinimum")
            .withArgs(MIN_FEEABLE_RAW_AMOUNT, MIN_FEEABLE_RAW_AMOUNT - 1n);
        expect(await f.manager.mintCount()).to.equal(0n);

        const boundary = await runLifecycle(f, {
            isBuy: true,
            grossInput: MIN_FEEABLE_RAW_AMOUNT,
            grossOutput: MIN_FEEABLE_RAW_AMOUNT,
        });
        await boundary.transaction;
        expect(await f.manager.lastAfterSwapDelta()).to.equal(1_500n);
        expect(await f.vault.totalBaseFees()).to.equal(1_500n);
        expect(await f.vault.totalTokenFees()).to.equal(1_500n);
    });

    it("uses separately frozen token and base minimums in both trade directions", async () => {
        const f = await deployFixture({ minimumTokenAmount: 20_000n, minimumBaseAmount: 30_000n });
        expect(await f.hook.minimumFeeableAmount(f.tokenAddress)).to.equal(20_000n);
        expect(await f.hook.minimumFeeableAmount(f.baseAddress)).to.equal(30_000n);

        await expect(f.hook.quoteFeesForGrossAmounts(true, 29_999n, 20_000n))
            .to.be.revertedWithCustomError(f.hook, "TradeAmountBelowMinimum")
            .withArgs(30_000, 29_999);
        await expect(f.hook.quoteFeesForGrossAmounts(true, 30_000n, 19_999n))
            .to.be.revertedWithCustomError(f.hook, "TradeAmountBelowMinimum")
            .withArgs(20_000, 19_999);
        await expect(f.hook.quoteFeesForGrossAmounts(false, 19_999n, 30_000n))
            .to.be.revertedWithCustomError(f.hook, "TradeAmountBelowMinimum")
            .withArgs(20_000, 19_999);
        await expect(f.hook.quoteFeesForGrossAmounts(false, 20_000n, 29_999n))
            .to.be.revertedWithCustomError(f.hook, "TradeAmountBelowMinimum")
            .withArgs(30_000, 29_999);

        const valid = await runLifecycle(f, { isBuy: true, grossInput: 30_000n, grossOutput: 20_000n });
        await valid.transaction;
    });

    it("bounds ceiling-rounding surcharge to at most one raw unit per leg", async () => {
        const f = await deployFixture();
        for (const feeBps of [1_500n, 1_250n, 1_000n, 750n, 500n]) {
            for (const amount of [10_000n, 10_001n, 99_999n, 1_000_003n]) {
                const roundedUp = await f.hook.feeFor(amount, feeBps);
                const roundedDown = (amount * feeBps) / BPS;
                expect(roundedUp - roundedDown).to.be.lte(1n);
                expect((roundedUp * BPS + amount - 1n) / amount).to.be.lte(feeBps + 1n);

                const grossOutput = amount - roundedUp;
                const outputFee = ceilFee(grossOutput, feeBps);
                const netOutput = grossOutput - outputFee;
                const realizedCombinedBps = ((amount - netOutput) * BPS + amount - 1n) / amount;
                const nominalCombinedBps = BigInt(await f.hook.combinedEffectiveFeeBps(feeBps));
                expect(realizedCombinedBps).to.be.lte(nominalCombinedBps + 2n);
            }
        }
    });

    it("is split-invariant under ceiling rounding for the observed ladder and arbitrary partitions", async () => {
        const f = await deployFixture();
        const total = 300_000_000n;
        const single = await f.hook.feeFor(total, 1_500);
        const ladder = Array.from({ length: 20 }, () => 15_000_000n);
        const ladderFee = (await Promise.all(ladder.map((amount) => f.hook.feeFor(amount, 1_500))))
            .reduce((sum, fee) => sum + fee, 0n);
        expect(single).to.equal(45_000_000n);
        expect(ladderFee).to.equal(single);

        let seed = 0x5eedn;
        for (let caseIndex = 0; caseIndex < 64; caseIndex += 1) {
            seed = (seed * 1_103_515_245n + 12_345n) & ((1n << 63n) - 1n);
            const pieceCount = Number((seed % 32n) + 2n);
            const pieces: bigint[] = [];
            let remaining = total;
            for (let index = 0; index < pieceCount - 1; index += 1) {
                seed = (seed * 1_103_515_245n + 12_345n) & ((1n << 63n) - 1n);
                const maxPiece = remaining - BigInt(pieceCount - index - 1);
                const piece = (seed % maxPiece) + 1n;
                pieces.push(piece);
                remaining -= piece;
            }
            pieces.push(remaining);
            const splitFee = (await Promise.all(pieces.map((amount) => f.hook.feeFor(amount, 1_500))))
                .reduce((sum, fee) => sum + fee, 0n);
            expect(splitFee).to.be.greaterThanOrEqual(single);
        }
    });

    it("charges identical flat rates across callers and later blocks", async () => {
        const f = await deployFixture();
        const first = await runLifecycle(f, { isBuy: true, grossInput: 10_000n, grossOutput: 20_000n, caller: f.alice });
        await first.transaction;
        await f.ethers.provider.send("evm_mine", []);
        await f.ethers.provider.send("evm_mine", []);
        const second = await runLifecycle(f, { isBuy: true, grossInput: 10_000n, grossOutput: 20_000n, caller: f.bob });
        await second.transaction;

        expect(first.inputFee).to.equal(second.inputFee);
        expect(first.outputFee).to.equal(second.outputFee);
        expect(await f.vault.buyInputBaseFees()).to.equal(first.inputFee + second.inputFee);
        expect(await f.vault.buyOutputTokenFees()).to.equal(first.outputFee + second.outputFee);
    });
});

for (const tokenIsCurrency0 of [true, false]) {
    for (const isBuy of [true, false]) {
        describe(`NARALiquidityGrowthHookV5 - ${tokenIsCurrency0 ? "NARA currency0" : "NARA currency1"} ${isBuy ? "buy" : "sell"}`, () => {
            it("maps specified/input and unspecified/output deltas and reconciles event, vault, and claim accrual", async () => {
                const f = await deployFixture({ tokenIsCurrency0 });
                const run = await runLifecycle(f, {
                    isBuy,
                    grossInput: 10_000n,
                    grossOutput: 20_000n,
                });
                const netOutput = 20_000n - run.outputFee;

                await expect(run.transaction)
                    .to.emit(f.hook, "SwapFeeClaimsAccrued")
                    .withArgs(
                        f.poolId,
                        f.alice.address,
                        0,
                        run.inputCurrency,
                        run.outputCurrency,
                        10_000n,
                        run.inputFee,
                        run.ammInput,
                        20_000n,
                        run.outputFee,
                        netOutput,
                        1_500,
                        isBuy,
                    );

                expect(await f.manager.lastBeforeSwapSelector()).to.equal(
                    f.hook.interface.getFunction("beforeSwap")!.selector,
                );
                expect(await f.manager.lastAfterSwapSelector()).to.equal(
                    f.hook.interface.getFunction("afterSwap")!.selector,
                );
                expect(await f.manager.lastBeforeSwapDelta()).to.equal(packBeforeSwapDelta(run.inputFee));
                expect(await f.manager.lastAfterSwapDelta()).to.equal(run.outputFee);
                const vaultAddress = await f.vault.getAddress();
                expect(await f.manager.mintCount()).to.equal(2n);
                expect(await f.manager.balanceOf(vaultAddress, BigInt(run.inputCurrency))).to.equal(run.inputFee);
                expect(await f.manager.balanceOf(vaultAddress, BigInt(run.outputCurrency))).to.equal(run.outputFee);
                expect(await f.vault.totalTokenFees()).to.equal(isBuy ? run.outputFee : run.inputFee);
                expect(await f.vault.totalBaseFees()).to.equal(isBuy ? run.inputFee : run.outputFee);
                expect(await f.vault.buyInputBaseFees()).to.equal(isBuy ? run.inputFee : 0n);
                expect(await f.vault.buyOutputTokenFees()).to.equal(isBuy ? run.outputFee : 0n);
                expect(await f.vault.sellInputTokenFees()).to.equal(isBuy ? 0n : run.inputFee);
                expect(await f.vault.sellOutputBaseFees()).to.equal(isBuy ? 0n : run.outputFee);
            });
        });
    }
}

describe("NARALiquidityGrowthHookV5 - invalid swaps and transient context", () => {
    it("rejects zero, exact-output, int256-min, and oversized exact-input before accruing a claim", async () => {
        const f = await deployFixture();
        const direction = directionFor(f, true);
        const invoke = (amountSpecified: bigint) => f.manager.callSwapLifecycle(
            f.hookAddress,
            f.key,
            { zeroForOne: direction.zeroForOne, amountSpecified, sqrtPriceLimitX96: 0n },
            rawAmmDelta(direction.zeroForOne, 1n, 1n),
            "0x",
        );

        await expect(invoke(0n)).to.be.revertedWithCustomError(f.hook, "ZeroAmount");
        await expect(invoke(100n)).to.be.revertedWithCustomError(f.hook, "ExactOutputUnsupported");
        await expect(invoke(INT256_MIN)).to.be.revertedWithCustomError(f.hook, "AmountTooLarge");
        await expect(invoke(-(INT128_MAX + 1n))).to.be.revertedWithCustomError(f.hook, "AmountTooLarge");
        expect(await f.manager.mintCount()).to.equal(0n);
    });

    it("rejects partial fills and every wrong-sign raw AMM delta atomically", async () => {
        const cases = [
            { name: "partial fill", actualInput: 8_499n, output: 20_000n, error: "PartialFillUnsupported" },
            { name: "zero specified", actualInput: 0n, output: 20_000n, error: "InvalidSwapDelta" },
            { name: "zero output", actualInput: -8_500n, output: 0n, error: "InvalidSwapDelta", raw: true },
            { name: "negative output", actualInput: -8_500n, output: -1n, error: "InvalidSwapDelta", raw: true },
        ];

        for (const testCase of cases) {
            const f = await deployFixture();
            const direction = directionFor(f, true);
            const raw = testCase.raw
                ? (direction.zeroForOne
                    ? packBalanceDelta(testCase.actualInput, testCase.output)
                    : packBalanceDelta(testCase.output, testCase.actualInput))
                : rawAmmDelta(direction.zeroForOne, testCase.actualInput, testCase.output);
            const run = await runLifecycle(f, {
                isBuy: true,
                grossInput: 10_000n,
                grossOutput: 20_000n,
                rawDelta: raw,
            });
            const assertion = expect(run.transaction).to.be.revertedWithCustomError(f.hook, testCase.error);
            if (testCase.name === "partial fill") await assertion.withArgs(8_500n, 8_499n);
            else await assertion;
            expect(await f.manager.mintCount()).to.equal(0n);
            expect(await f.vault.totalTokenFees()).to.equal(0n);
            expect(await f.vault.totalBaseFees()).to.equal(0n);
        }
    });

    it("rejects a raw output below the floor and rolls back the already-accrued input leg", async () => {
        const f = await deployFixture();
        const run = await runLifecycle(f, { isBuy: true, grossInput: 10_000n, grossOutput: 9_999n });
        await expect(run.transaction)
            .to.be.revertedWithCustomError(f.hook, "TradeAmountBelowMinimum")
            .withArgs(MIN_FEEABLE_RAW_AMOUNT, MIN_FEEABLE_RAW_AMOUNT - 1n);
        expect(await f.manager.mintCount()).to.equal(0n);
        expect(await f.manager.balanceOf(await f.vault.getAddress(), BigInt(run.inputCurrency))).to.equal(0n);
    });

    it("rejects afterSwap without context and rejects a repeated afterSwap after successful cleanup", async () => {
        const f = await deployFixture();
        const run = await runLifecycle(f, { isBuy: true, grossInput: 10_000n, grossOutput: 20_000n });

        await expect(
            f.manager.callAfterSwap(f.hookAddress, f.key, run.params, run.delta, "0x"),
        ).to.be.revertedWithCustomError(f.hook, "MissingSwapContext");

        await run.transaction;
        await expect(
            f.manager.callAfterSwap(f.hookAddress, f.key, run.params, run.delta, "0x"),
        ).to.be.revertedWithCustomError(f.hook, "MissingSwapContext");
    });

    it("rolls back transient context on a caught partial-fill revert and succeeds on a same-transaction retry", async () => {
        const f = await deployFixture();
        const grossInput = 100_000n;
        const grossOutput = 200_000n;
        const inputFee = ceilFee(grossInput, BOOTSTRAP_FEE_BPS);
        const outputFee = ceilFee(grossOutput, BOOTSTRAP_FEE_BPS);
        const ammInput = grossInput - inputFee;
        const direction = directionFor(f, true);
        const params = swapParams(direction.zeroForOne, grossInput);
        const failedDelta = rawAmmDelta(direction.zeroForOne, ammInput - 1n, grossOutput);
        const retryDelta = rawAmmDelta(direction.zeroForOne, ammInput, grossOutput);

        await f.manager.catchFailedLifecycleThenRetry(
            f.hookAddress,
            f.key,
            params,
            failedDelta,
            retryDelta,
            "0x",
        );

        const vaultAddress = await f.vault.getAddress();
        expect(await f.manager.balanceOf(vaultAddress, BigInt(direction.inputCurrency))).to.equal(inputFee);
        expect(await f.manager.balanceOf(vaultAddress, BigInt(direction.outputCurrency))).to.equal(outputFee);
        expect(await f.manager.mintCount()).to.equal(2n);
    });
});

describe("NARALiquidityGrowthHookV5 - versioned swap protection", () => {
    it("accepts empty data or a complete current protection envelope", async () => {
        const f = await deployFixture();
        const unprotected = await runLifecycle(f, {
            isBuy: true,
            grossInput: 10_000n,
            grossOutput: 20_000n,
        });
        await unprotected.transaction;

        const accepted = await runLifecycle(f, {
            isBuy: true,
            grossInput: 10_000n,
            grossOutput: 20_000n,
            hookData: await encodeSwapProtection(f, { minimumNetOutput: 17_000n }),
        });
        await accepted.transaction;
    });

    it("keeps a quote valid after a beneficial fee-phase decrease", async () => {
        const f = await deployFixture();
        const phaseZeroProtection = await encodeSwapProtection(f);
        await f.manager.setPoolState(f.poolId, SQRT_PRICE_1_1, 1_250n);
        await f.controller.setActiveProtocolLiquidity(1_250n);
        await f.controller.advance(0);

        const run = await runLifecycle(f, {
            isBuy: true,
            grossInput: 10_000n,
            grossOutput: 20_000n,
            hookData: phaseZeroProtection,
        });
        await run.transaction;
        expect(run.feeBps).to.equal(1_250n);
        expect(run.inputFee).to.equal(1_250n);
        expect(run.outputFee).to.equal(2_500n);
    });

    it("separately enforces per-leg and combined hook-fee ceilings", async () => {
        const f = await deployFixture();

        const perLeg = await runLifecycle(f, {
            isBuy: true,
            grossInput: 10_000n,
            grossOutput: 20_000n,
            hookData: await encodeSwapProtection(f, { maximumPerLegFeeBps: 1_499 }),
        });
        await expect(perLeg.transaction)
            .to.be.revertedWithCustomError(f.hook, "PerLegFeeLimitExceeded")
            .withArgs(1_500, 1_499);

        const combined = await runLifecycle(f, {
            isBuy: true,
            grossInput: 10_000n,
            grossOutput: 20_000n,
            hookData: await encodeSwapProtection(f, { maximumNominalCombinedHookFeeBps: 2_774 }),
        });
        await expect(combined.transaction)
            .to.be.revertedWithCustomError(f.hook, "NominalCombinedFeeLimitExceeded")
            .withArgs(2_775, 2_774);
    });

    it("binds protection to version, deadline, phase, schedule, and minimum net output", async () => {
        const f = await deployFixture();
        const cases = [
            {
                hookData: await encodeSwapProtection(f, { version: 2 }),
                error: "UnsupportedSwapProtectionVersion",
            },
            {
                hookData: await encodeSwapProtection(f, { deadline: 1n }),
                error: "SwapProtectionExpired",
            },
            {
                hookData: await encodeSwapProtection(f, { minimumAcceptedPhase: 1 }),
                error: "PhaseBelowMinimumAccepted",
            },
            {
                hookData: await encodeSwapProtection(f, { expectedPhaseScheduleHash: f.ethers.ZeroHash }),
                error: "UnexpectedPhaseSchedule",
            },
            {
                hookData: await encodeSwapProtection(f, { minimumNetOutput: 17_001n }),
                error: "MinimumNetOutputNotMet",
            },
        ];

        for (const item of cases) {
            const run = await runLifecycle(f, {
                isBuy: true,
                grossInput: 10_000n,
                grossOutput: 20_000n,
                hookData: item.hookData,
            });
            await expect(run.transaction).to.be.revertedWithCustomError(f.hook, item.error);
        }

        expect(await f.manager.mintCount()).to.equal(0n);
        expect(await f.vault.totalBaseFees()).to.equal(0n);
        expect(await f.vault.totalTokenFees()).to.equal(0n);
    });

    it("rejects legacy scalar and malformed protection encodings", async () => {
        const f = await deployFixture();
        const coder = f.ethers.AbiCoder.defaultAbiCoder();
        const malformed = await runLifecycle(f, {
            isBuy: true,
            grossInput: 10_000n,
            grossOutput: 20_000n,
            hookData: "0x01",
        });
        await expect(malformed.transaction).to.be.revertedWithCustomError(f.hook, "InvalidHookData");

        const oversized = await runLifecycle(f, {
            isBuy: true,
            grossInput: 10_000n,
            grossOutput: 20_000n,
            hookData: coder.encode(["uint256"], [1_500]),
        });
        await expect(oversized.transaction).to.be.revertedWithCustomError(f.hook, "InvalidHookData");
    });
});

describe("NARALiquidityGrowthHookV5 - fail-closed accounting", () => {
    it("tolerates preexisting claim donations without counting them as swap fees", async () => {
        const f = await deployFixture();
        const vaultAddress = await f.vault.getAddress();
        const donatedBaseClaims = 777n;
        await f.manager.mint(vaultAddress, BigInt(f.baseAddress), donatedBaseClaims);

        const run = await runLifecycle(f, {
            isBuy: true,
            grossInput: 100_000n,
            grossOutput: 200_000n,
        });
        await run.transaction;

        expect(await f.manager.balanceOf(vaultAddress, BigInt(f.baseAddress)))
            .to.equal(donatedBaseClaims + run.inputFee);
        expect(await f.manager.balanceOf(vaultAddress, BigInt(f.tokenAddress))).to.equal(run.outputFee);
        expect(await f.vault.totalBaseFees()).to.equal(run.inputFee);
        expect(await f.vault.totalTokenFees()).to.equal(run.outputFee);
    });

    it("prevents a vault callback from advancing the fee phase during a swap", async () => {
        const f = await deployFixture();
        const nextPhaseLiquidity = LATER_PHASE_MINIMUM_ACTIVE_LIQUIDITY[0];
        await f.manager.setPoolState(f.poolId, SQRT_PRICE_1_1, nextPhaseLiquidity);
        await f.controller.setActiveProtocolLiquidity(nextPhaseLiquidity);
        await f.vault.setPhaseReentry(await f.controller.getAddress(), true);

        const run = await runLifecycle(f, {
            isBuy: false,
            grossInput: 100_000n,
            grossOutput: 200_000n,
        });
        await run.transaction;

        expect(await f.vault.lastPhaseReentrySucceeded()).to.equal(false);
        expect(await f.vault.lastPhaseReentryErrorSelector()).to.equal(
            f.hook.interface.getError("NestedSwapUnsupported")!.selector,
        );
        expect(await f.hook.currentPhase()).to.equal(0n);
        expect(await f.hook.currentFeeBps()).to.equal(1_500n);
    });

    it("rolls back persistent companion-configuration drift during vault accounting", async () => {
        const f = await deployFixture();
        const pinnedHash = await f.hook.vaultConfigurationHash();
        await f.vault.setDriftConfigurationDuringRecord(true);

        const failed = await runLifecycle(f, {
            isBuy: true,
            grossInput: 100_000n,
            grossOutput: 200_000n,
        });
        await expect(failed.transaction)
            .to.be.revertedWithCustomError(f.hook, "CompanionConfigurationMismatch");

        expect(await f.vault.configurationHash()).to.equal(pinnedHash);
        expect(await f.manager.mintCount()).to.equal(0n);
        expect(await f.vault.totalBaseFees()).to.equal(0n);
        expect(await f.vault.totalTokenFees()).to.equal(0n);
    });

    it("rolls back the input claim when output claim minting fails, then permits a clean retry", async () => {
        const f = await deployFixture();
        await f.manager.setRevertOnMintNumber(2);
        const failed = await runLifecycle(f, { isBuy: true, grossInput: 10_000n, grossOutput: 20_000n });
        await expect(failed.transaction).to.be.revertedWithCustomError(f.manager, "ForcedMintRevert");

        expect(await f.manager.mintCount()).to.equal(0n);
        expect(await f.manager.balanceOf(await f.vault.getAddress(), BigInt(failed.inputCurrency))).to.equal(0n);
        expect(await f.vault.totalBaseFees()).to.equal(0n);
        expect(await f.vault.totalTokenFees()).to.equal(0n);

        await f.manager.setRevertOnMintNumber(0);
        const retry = await runLifecycle(f, { isBuy: true, grossInput: 10_000n, grossOutput: 20_000n });
        await retry.transaction;
        expect(await f.manager.mintCount()).to.equal(2n);
        expect(await f.manager.balanceOf(await f.vault.getAddress(), BigInt(retry.inputCurrency))).to.equal(retry.inputFee);
        expect(await f.manager.balanceOf(await f.vault.getAddress(), BigInt(retry.outputCurrency))).to.equal(retry.outputFee);
        expect(await f.vault.totalBaseFees()).to.equal(retry.inputFee);
        expect(await f.vault.totalTokenFees()).to.equal(retry.outputFee);
    });

    it("rolls back both claims and all vault accounting when recordSwapFees reverts", async () => {
        const f = await deployFixture();
        await f.vault.setRecordReverts(true);
        const failed = await runLifecycle(f, { isBuy: false, grossInput: 10_000n, grossOutput: 20_000n });
        await expect(failed.transaction).to.be.revertedWithCustomError(f.vault, "ForcedRevert");

        const vaultAddress = await f.vault.getAddress();
        expect(await f.manager.mintCount()).to.equal(0n);
        expect(await f.manager.balanceOf(vaultAddress, BigInt(failed.inputCurrency))).to.equal(0n);
        expect(await f.manager.balanceOf(vaultAddress, BigInt(failed.outputCurrency))).to.equal(0n);
        expect(await f.vault.totalBaseFees()).to.equal(0n);
        expect(await f.vault.totalTokenFees()).to.equal(0n);

        await f.vault.setRecordReverts(false);
        const retry = await runLifecycle(f, { isBuy: false, grossInput: 10_000n, grossOutput: 20_000n });
        await retry.transaction;
        expect(await f.manager.balanceOf(vaultAddress, BigInt(retry.inputCurrency))).to.equal(retry.inputFee);
        expect(await f.manager.balanceOf(vaultAddress, BigInt(retry.outputCurrency))).to.equal(retry.outputFee);
        expect(await f.vault.totalTokenFees()).to.equal(retry.inputFee);
        expect(await f.vault.totalBaseFees()).to.equal(retry.outputFee);
    });

    for (const [label, mutation] of [["input", 1], ["output", 2]] as const) {
        it(`rejects a vault that moves the ${label} claim while recording and rolls everything back`, async () => {
            const f = await deployFixture();
            await f.vault.setClaimMutation(mutation);
            const failed = await runLifecycle(f, {
                isBuy: true,
                grossInput: 100_000n,
                grossOutput: 200_000n,
            });

            await expect(failed.transaction).to.be.revertedWithCustomError(f.hook, "FeeClaimMintMismatch");

            const vaultAddress = await f.vault.getAddress();
            expect(await f.manager.mintCount()).to.equal(0n);
            expect(await f.manager.balanceOf(vaultAddress, BigInt(failed.inputCurrency))).to.equal(0n);
            expect(await f.manager.balanceOf(vaultAddress, BigInt(failed.outputCurrency))).to.equal(0n);
            expect(await f.vault.totalBaseFees()).to.equal(0n);
            expect(await f.vault.totalTokenFees()).to.equal(0n);
            expect(await f.vault.unprocessedBaseFees()).to.equal(0n);
            expect(await f.vault.unprocessedTokenFees()).to.equal(0n);
        });
    }
});

describe("NARALiquidityGrowthHookV5 - dynamic reserve and POL regression", () => {
    it("tracks controller POL and actual swap claims without a static 300 USDC assumption", async () => {
        const f = await deployFixture({ activate: false });
        const vaultAddress = await f.vault.getAddress();
        const initialLiveUsdc = 125_000_000n;
        const laterLiveUsdc = 725_000_000n;
        const activationPol = 1_234n;
        const phaseOnePol = 1_777n;

        // This isolated manager represents the single canonical pool. Start its
        // live base balance below 300 USDC and bind activation to named POL.
        await f.base.mint(f.managerAddress, initialLiveUsdc);
        await f.manager.setPoolState(f.poolId, SQRT_PRICE_1_1, 2_000n);
        await f.controller.setActiveProtocolLiquidity(activationPol);
        expect(await f.controller.activeProtocolLiquidity()).to.equal(activationPol);
        await expect(f.hook.activatePool())
            .to.emit(f.hook, "PoolActivated")
            .withArgs(f.poolId, activationPol, await f.hook.phaseScheduleHash(), 0, 0, 3_000);

        const bootstrapBuy = await runLifecycle(f, {
            isBuy: true,
            grossInput: 15_000_000n,
            grossOutput: 30_000_000n,
        });
        await bootstrapBuy.transaction;
        expect(bootstrapBuy.feeBps).to.equal(1_500n);
        expect(bootstrapBuy.inputFee).to.equal(2_250_000n);
        expect(bootstrapBuy.outputFee).to.equal(4_500_000n);
        expect(await f.manager.balanceOf(vaultAddress, BigInt(f.baseAddress))).to.equal(bootstrapBuy.inputFee);
        expect(await f.manager.balanceOf(vaultAddress, BigInt(f.tokenAddress))).to.equal(bootstrapBuy.outputFee);
        expect(await f.base.balanceOf(f.managerAddress)).to.equal(initialLiveUsdc);

        await f.ethers.provider.send("evm_mine", []);
        await f.ethers.provider.send("evm_mine", []);
        await f.base.mint(f.managerAddress, laterLiveUsdc - initialLiveUsdc);
        expect(await f.base.balanceOf(f.managerAddress)).to.equal(laterLiveUsdc);

        // POL remains a controller-reported liquidity value, independent of
        // the changed live USDC balance. The controller then advances phase.
        await f.controller.setActiveProtocolLiquidity(phaseOnePol);
        expect(await f.controller.activeProtocolLiquidity()).to.equal(phaseOnePol);
        await expect(f.controller.advance(0))
            .to.emit(f.hook, "PhaseAdvanced")
            .withArgs(0, 1, 1_250, 1_250, phaseOnePol);

        const phaseOneSell = await runLifecycle(f, {
            isBuy: false,
            grossInput: 40_000_000n,
            grossOutput: 25_000_000n,
        });
        await phaseOneSell.transaction;
        expect(phaseOneSell.feeBps).to.equal(1_250n);
        expect(phaseOneSell.inputFee).to.equal(5_000_000n);
        expect(phaseOneSell.outputFee).to.equal(3_125_000n);

        const expectedBaseClaims = bootstrapBuy.inputFee + phaseOneSell.outputFee;
        const expectedTokenClaims = bootstrapBuy.outputFee + phaseOneSell.inputFee;
        expect(await f.manager.balanceOf(vaultAddress, BigInt(f.baseAddress))).to.equal(expectedBaseClaims);
        expect(await f.manager.balanceOf(vaultAddress, BigInt(f.tokenAddress))).to.equal(expectedTokenClaims);
        expect(await f.vault.totalBaseFees()).to.equal(expectedBaseClaims);
        expect(await f.vault.totalTokenFees()).to.equal(expectedTokenClaims);
        expect(await f.base.balanceOf(f.managerAddress)).to.equal(laterLiveUsdc);
        expect(await f.controller.activeProtocolLiquidity()).to.equal(phaseOnePol);
    });
});

describe("NARALiquidityGrowthHookV5 - sequential phase controller", () => {
    it("rechecks the current phase liquidity floor before every swap", async () => {
        const f = await deployFixture();
        await f.manager.setPoolState(f.poolId, SQRT_PRICE_1_1, 1_250n);
        await f.controller.setActiveProtocolLiquidity(1_250n);
        await f.controller.advance(0);

        await f.controller.setActiveProtocolLiquidity(1_249n);
        const belowPhaseFloor = await runLifecycle(f, {
            isBuy: true,
            grossInput: 10_000n,
            grossOutput: 20_000n,
        });
        await expect(belowPhaseFloor.transaction)
            .to.be.revertedWithCustomError(f.hook, "InsufficientPhaseLiquidity")
            .withArgs(1, 1_250, 1_249);

        await f.controller.setActiveProtocolLiquidity(1_250n);
        await f.manager.setPoolState(f.poolId, SQRT_PRICE_1_1, 1_249n);
        const exceedsLivePool = await runLifecycle(f, {
            isBuy: false,
            grossInput: 10_000n,
            grossOutput: 20_000n,
        });
        await expect(exceedsLivePool.transaction)
            .to.be.revertedWithCustomError(f.hook, "ProtocolLiquidityExceedsPoolLiquidity")
            .withArgs(1_250, 1_249);

        expect(await f.manager.mintCount()).to.equal(0n);
    });

    it("allows only the bound controller to advance exactly one frozen phase at a time", async () => {
        const f = await deployFixture();

        await expect(f.hook.connect(f.attacker).advancePhase(0))
            .to.be.revertedWithCustomError(f.hook, "UnauthorizedPhaseController");
        await expect(f.controller.advance(1)).to.be.revertedWithCustomError(f.hook, "InvalidPhaseAdvance");
        await expect(f.controller.advance(0))
            .to.be.revertedWithCustomError(f.hook, "InsufficientPhaseLiquidity")
            .withArgs(1, 1_250, 1_000);

        await f.controller.setActiveProtocolLiquidity(1_250n);
        await expect(f.controller.advance(0))
            .to.be.revertedWithCustomError(f.hook, "ProtocolLiquidityExceedsPoolLiquidity")
            .withArgs(1_250, 1_000);

        await f.manager.setPoolState(f.poolId, SQRT_PRICE_1_1, 2_000n);
        await expect(f.controller.advance(0))
            .to.emit(f.hook, "PhaseAdvanced")
            .withArgs(0, 1, 1_250, 1_250, 1_250);
        expect(await f.hook.currentPhase()).to.equal(1n);
        expect(await f.hook.currentFeeBps()).to.equal(1_250n);
        const phaseOneQuote = await f.hook.quoteFeesForGrossAmounts(true, 10_000n, 20_000n);
        expect(phaseOneQuote.inputFee).to.equal(1_250n);
        expect(phaseOneQuote.outputFee).to.equal(2_500n);

        await expect(f.controller.advance(0)).to.be.revertedWithCustomError(f.hook, "InvalidPhaseAdvance");
        await f.controller.setActiveProtocolLiquidity(1_500n);
        await expect(f.controller.advance(1))
            .to.emit(f.hook, "PhaseAdvanced")
            .withArgs(1, 2, 1_000, 1_500, 1_500);
        await f.controller.setActiveProtocolLiquidity(1_750n);
        await expect(f.controller.advance(2))
            .to.emit(f.hook, "PhaseAdvanced")
            .withArgs(2, 3, 750, 1_750, 1_750);
        await f.controller.setActiveProtocolLiquidity(2_000n);
        await expect(f.controller.advance(3))
            .to.emit(f.hook, "PhaseAdvanced")
            .withArgs(3, 4, 500, 2_000, 2_000);
        expect(await f.hook.currentPhase()).to.equal(4n);
        expect(await f.hook.currentFeeBps()).to.equal(500n);
        await expect(f.controller.advance(4)).to.be.revertedWithCustomError(f.hook, "InvalidPhaseAdvance");
    });

    it("blocks controller advancement before pool activation and applies the new phase to fee limits", async () => {
        const inactive = await deployFixture({ activate: false });
        await expect(inactive.controller.advance(0)).to.be.revertedWithCustomError(inactive.hook, "InvalidPhaseAdvance");

        const f = await deployFixture();
        await f.manager.setPoolState(f.poolId, SQRT_PRICE_1_1, 1_250n);
        await f.controller.setActiveProtocolLiquidity(1_250n);
        await f.controller.advance(0);
        const accepted = await runLifecycle(f, {
            isBuy: true,
            grossInput: 10_000n,
            grossOutput: 20_000n,
            hookData: await encodeSwapProtection(f, { maximumPerLegFeeBps: 1_250 }),
        });
        await accepted.transaction;
        expect(accepted.inputFee).to.equal(1_250n);
        expect(accepted.outputFee).to.equal(2_500n);

        const staleLimit = await runLifecycle(f, {
            isBuy: true,
            grossInput: 10_000n,
            grossOutput: 20_000n,
            hookData: await encodeSwapProtection(f, { maximumPerLegFeeBps: 1_249 }),
        });
        await expect(staleLimit.transaction)
            .to.be.revertedWithCustomError(f.hook, "PerLegFeeLimitExceeded")
            .withArgs(1_250, 1_249);
    });

    it("permits only the bound controller to retire the pool exactly once and blocks all later swaps and advances", async () => {
        const f = await deployFixture();

        await expect(f.hook.connect(f.attacker).retirePool())
            .to.be.revertedWithCustomError(f.hook, "UnauthorizedPhaseController");
        await expect(f.controller.retire())
            .to.emit(f.hook, "PoolRetired")
            .withArgs(f.poolId, 0);
        expect(await f.hook.poolRetired()).to.equal(true);
        expect(await f.hook.poolActive()).to.equal(false);

        const afterRetirement = await runLifecycle(f, {
            isBuy: true,
            grossInput: 10_000n,
            grossOutput: 20_000n,
        });
        await expect(afterRetirement.transaction)
            .to.be.revertedWithCustomError(f.hook, "PoolPermanentlyRetired");
        await expect(f.hook.activatePool()).to.be.revertedWithCustomError(f.hook, "PoolPermanentlyRetired");
        await expect(f.controller.advance(0)).to.be.revertedWithCustomError(f.hook, "InvalidPhaseAdvance");
        await expect(f.controller.retire()).to.be.revertedWithCustomError(f.hook, "PoolPermanentlyRetired");
    });
});
