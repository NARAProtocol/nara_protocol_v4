import { expect } from "chai";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import hre from "hardhat";

const ONE = 10n ** 18n;
const USDC = 10n ** 6n;
const Q96 = 1n << 96n;
const POOL_FEE = 3_000;
const TICK_SPACING = 60;
const MIN_TICK = -887_220;
const MAX_TICK = 887_220;
const MIN_SQRT_PRICE = 4_295_128_739n;
const MAX_SQRT_PRICE = 1_461_446_703_485_210_103_287_273_052_203_988_822_378_723_970_342n;
const HOOK_FLAG_MASK = 0x3fffn;
const REQUIRED_HOOK_FLAGS = 0x2088n;

type FoundryArtifact = {
    abi: unknown[];
    bytecode: { object: string };
};

function foundryArtifact(contractName: string): FoundryArtifact {
    const path = resolve(
        process.cwd(),
        "node_modules",
        "@uniswap",
        "v4-core",
        "out",
        `${contractName}.sol`,
        `${contractName}.json`,
    );
    return JSON.parse(readFileSync(path, "utf8")) as FoundryArtifact;
}

function sameAddress(a: string, b: string): boolean {
    return a.toLowerCase() === b.toLowerCase();
}

function sortAddresses(a: string, b: string): [string, string] {
    return BigInt(a) < BigInt(b) ? [a, b] : [b, a];
}

function isqrt(n: bigint): bigint {
    if (n < 2n) return n;
    let x = n;
    let y = (x + 1n) >> 1n;
    while (y < x) {
        x = y;
        y = (x + n / x) >> 1n;
    }
    return x;
}

function sqrtPriceX96FromAmounts(amount0: bigint, amount1: bigint): bigint {
    return isqrt((amount1 * (1n << 192n)) / amount0);
}

function mineHookSalt(
    ethers: any,
    create2Deployer: string,
    initCode: string,
): { salt: string; address: string } {
    const initCodeHash = ethers.keccak256(initCode);
    const seed = ethers.keccak256(ethers.toUtf8Bytes("NARA-REAL-V4-DEPTH-REGRESSION"));

    for (let i = 0; i < 250_000; i += 1) {
        const salt = ethers.keccak256(
            ethers.solidityPacked(["bytes32", "uint256"], [seed, BigInt(i)]),
        );
        const candidate = ethers.getCreate2Address(create2Deployer, salt, initCodeHash);
        if ((BigInt(candidate) & HOOK_FLAG_MASK) === REQUIRED_HOOK_FLAGS) {
            return { salt, address: candidate };
        }
    }

    throw new Error("Unable to mine a valid hook address");
}

async function deployFoundryContract(
    ethers: any,
    signer: any,
    contractName: string,
    constructorArgs: unknown[],
) {
    const artifact = foundryArtifact(contractName);
    const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode.object, signer);
    const contract = await factory.deploy(...constructorArgs);
    await contract.waitForDeployment();
    return contract;
}

describe("NARALiquidityGrowthHook - real Uniswap v4 PoolManager", () => {
    it("keeps buy and sell fees invariant under meaningful same-block splits while live depth moves", async function () {
        this.timeout(180_000);

        const connection = await hre.network.connect();
        const { ethers } = connection;
        const [owner] = await ethers.getSigners();
        const provider = ethers.provider;

        const manager = await deployFoundryContract(ethers, owner, "PoolManager", [owner.address]);
        const managerAddress = await manager.getAddress();
        const liquidityRouter = await deployFoundryContract(
            ethers,
            owner,
            "PoolModifyLiquidityTest",
            [managerAddress],
        );
        const swapRouter = await deployFoundryContract(ethers, owner, "PoolSwapTest", [managerAddress]);

        const nara = await ethers.deployContract("MockERC20", ["NARA", "NARA", 18], owner);
        const usdc = await ethers.deployContract("MockERC20", ["USD Coin", "USDC", 6], owner);
        await Promise.all([nara.waitForDeployment(), usdc.waitForDeployment()]);
        const naraAddress = await nara.getAddress();
        const usdcAddress = await usdc.getAddress();

        const vault = await ethers.deployContract(
            "NARALiquidityGrowthVault",
            [owner.address, naraAddress, usdcAddress],
            owner,
        );
        await vault.waitForDeployment();
        const vaultAddress = await vault.getAddress();

        const create2 = await ethers.deployContract("Create2HookDeployer", [owner.address], owner);
        await create2.waitForDeployment();
        const create2Address = await create2.getAddress();

        const Hook = await ethers.getContractFactory("NARALiquidityGrowthHook", owner);
        const deployTx = await Hook.getDeployTransaction(
            managerAddress,
            owner.address,
            naraAddress,
            usdcAddress,
            vaultAddress,
        );
        if (typeof deployTx.data !== "string") throw new Error("Hook init code unavailable");
        const mined = mineHookSalt(ethers, create2Address, deployTx.data);
        await (await create2.deploy(mined.salt, deployTx.data)).wait();

        const hook = await ethers.getContractAt("NARALiquidityGrowthHook", mined.address, owner);
        await vault.setHook(mined.address);
        await hook.setProtocolDepth(naraAddress, 60_000n * ONE);
        await hook.setProtocolDepth(usdcAddress, 300n * USDC);

        const [currency0, currency1] = sortAddresses(naraAddress, usdcAddress);
        const naraIsCurrency0 = sameAddress(currency0, naraAddress);
        const key = [currency0, currency1, POOL_FEE, TICK_SPACING, mined.address] as const;
        const naraSeed = 60_000n * ONE;
        const usdcSeed = 300n * USDC;
        const amount0 = naraIsCurrency0 ? naraSeed : usdcSeed;
        const amount1 = naraIsCurrency0 ? usdcSeed : naraSeed;
        const sqrtPriceX96 = sqrtPriceX96FromAmounts(amount0, amount1);
        await hook.registerPool({
            currency0,
            currency1,
            fee: POOL_FEE,
            tickSpacing: TICK_SPACING,
            hooks: mined.address,
        }, sqrtPriceX96);
        const liquidity0 = (amount0 * sqrtPriceX96) / Q96;
        const liquidity1 = (amount1 * Q96) / sqrtPriceX96;
        const liquidity = liquidity0 < liquidity1 ? liquidity0 : liquidity1;

        await nara.mint(owner.address, 500_000n * ONE);
        await usdc.mint(owner.address, 5_000n * USDC);
        await nara.approve(await liquidityRouter.getAddress(), ethers.MaxUint256);
        await usdc.approve(await liquidityRouter.getAddress(), ethers.MaxUint256);
        await nara.approve(await swapRouter.getAddress(), ethers.MaxUint256);
        await usdc.approve(await swapRouter.getAddress(), ethers.MaxUint256);

        await manager.initialize(key, sqrtPriceX96);
        await liquidityRouter[
            "modifyLiquidity((address,address,uint24,int24,address),(int24,int24,int256,bytes32),bytes)"
        ](
            key,
            [MIN_TICK, MAX_TICK, liquidity, ethers.ZeroHash],
            "0x",
        );

        const swapParams = (inputCurrency: string, amountIn: bigint) => {
            const zeroForOne = sameAddress(inputCurrency, currency0);
            return {
                zeroForOne,
                amountSpecified: -amountIn,
                sqrtPriceLimitX96: zeroForOne ? MIN_SQRT_PRICE + 1n : MAX_SQRT_PRICE - 1n,
            };
        };

        const executeSwap = async (inputCurrency: string, amountIn: bigint, overrides: Record<string, unknown> = {}) =>
            swapRouter.swap(
                key,
                swapParams(inputCurrency, amountIn),
                [false, false],
                "0x",
                overrides,
            );

        const executeSameBlockSplit = async (
            inputCurrency: string,
            firstAmount: bigint,
            secondAmount: bigint,
        ) => {
            await provider.send("evm_setAutomine", [false]);
            try {
                const nonce = await provider.getTransactionCount(owner.address, "pending");
                const first = await executeSwap(inputCurrency, firstAmount, {
                    nonce,
                    gasLimit: 6_000_000n,
                });
                const second = await executeSwap(inputCurrency, secondAmount, {
                    nonce: nonce + 1,
                    gasLimit: 6_000_000n,
                });
                await provider.send("evm_mine", []);
                const [firstReceipt, secondReceipt] = await Promise.all([first.wait(), second.wait()]);
                expect(firstReceipt?.blockNumber).to.equal(secondReceipt?.blockNumber);
            } finally {
                await provider.send("evm_setAutomine", [true]);
            }
        };

        const rootSnapshot = await provider.send("evm_snapshot", []);

        // Deplete live NARA depth with a USDC buy, then compare one sell with
        // two sells whose gross total is identical.
        await (await executeSwap(usdcAddress, 100n * USDC)).wait();
        const depletedNaraDepth = await hook.probeLiveDepth(naraAddress);
        expect(depletedNaraDepth).to.be.lessThan(60_000n * ONE);
        const sellTotal = (depletedNaraDepth * 56_835n) / 100_000n;
        const sellFirst = (depletedNaraDepth * 50_685n) / 100_000n;
        const sellSecond = sellTotal - sellFirst;
        const sellState = await provider.send("evm_snapshot", []);

        const tokenFeeBeforeSingle = await vault.totalTokenFeeRecorded();
        await (await executeSwap(naraAddress, sellTotal)).wait();
        const singleSellFee = (await vault.totalTokenFeeRecorded()) - tokenFeeBeforeSingle;

        expect(await provider.send("evm_revert", [sellState])).to.equal(true);
        const tokenFeeBeforeSplit = await vault.totalTokenFeeRecorded();
        await executeSameBlockSplit(naraAddress, sellFirst, sellSecond);
        const splitSellFee = (await vault.totalTokenFeeRecorded()) - tokenFeeBeforeSplit;

        expect(splitSellFee).to.equal(singleSellFee);
        expect(await hook.flowAmountInBlock(naraAddress)).to.equal(sellTotal);
        expect(await hook.flowDepthInBlock(naraAddress)).to.equal(60_000n * ONE);
        expect(await hook.probeLiveDepth(naraAddress)).to.be.greaterThan(depletedNaraDepth);
        expect(await nara.balanceOf(vaultAddress)).to.equal(await vault.totalTokenFeeRecorded());

        expect(await provider.send("evm_revert", [rootSnapshot])).to.equal(true);

        // Deplete live USDC depth with a NARA sell, then perform the symmetric
        // single-versus-split comparison for buys.
        await (await executeSwap(naraAddress, 20_000n * ONE)).wait();
        const depletedUsdcDepth = await hook.probeLiveDepth(usdcAddress);
        expect(depletedUsdcDepth).to.be.lessThan(300n * USDC);
        const buyTotal = (depletedUsdcDepth * 56_835n) / 100_000n;
        const buyFirst = (depletedUsdcDepth * 50_685n) / 100_000n;
        const buySecond = buyTotal - buyFirst;
        const buyState = await provider.send("evm_snapshot", []);

        const baseFeeBeforeSingle = await vault.totalBaseFeeRecorded();
        await (await executeSwap(usdcAddress, buyTotal)).wait();
        const singleBuyFee = (await vault.totalBaseFeeRecorded()) - baseFeeBeforeSingle;

        expect(await provider.send("evm_revert", [buyState])).to.equal(true);
        const baseFeeBeforeSplit = await vault.totalBaseFeeRecorded();
        await executeSameBlockSplit(usdcAddress, buyFirst, buySecond);
        const splitBuyFee = (await vault.totalBaseFeeRecorded()) - baseFeeBeforeSplit;

        expect(splitBuyFee).to.equal(singleBuyFee);
        expect(await hook.flowAmountInBlock(usdcAddress)).to.equal(buyTotal);
        expect(await hook.flowDepthInBlock(usdcAddress)).to.equal(300n * USDC);
        expect(await hook.probeLiveDepth(usdcAddress)).to.be.greaterThan(depletedUsdcDepth);
        expect(await usdc.balanceOf(vaultAddress)).to.equal(await vault.totalBaseFeeRecorded());
    });
});
