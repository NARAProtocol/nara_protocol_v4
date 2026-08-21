import { expect } from "chai";
import hre from "hardhat";
import type { Signer } from "ethers";

const ONE = 10n ** 18n;
const MAX_SUPPLY = 1_000_000n * ONE;
const MAX_FLASH_LOAN = 100_000n * ONE;
const FLASH_FEE_BPS = 10n;
const TOKEN_NAME = "NARA";
const TOKEN_SYMBOL = "NARA";

async function setup() {
    const connection = await hre.network.connect();
    const { ethers } = connection;
    const signers = await ethers.getSigners();
    const [deployer, treasury, alice, bob, carol, sink] = signers;
    return { ethers, deployer, treasury, alice, bob, carol, sink };
}

async function deployTokenFixture() {
    const ctx = await setup();
    const { ethers, treasury, sink } = ctx;
    const token: any = await ethers.deployContract("NARAToken", [treasury.address, sink.address, TOKEN_NAME, TOKEN_SYMBOL]);
    await token.waitForDeployment();
    return { ...ctx, token };
}

describe("NARAToken v4", function () {
    describe("Constructor & metadata", function () {
        it("mints MAX_SUPPLY to the treasury and sets immutables", async function () {
            const { token, treasury, sink } = await deployTokenFixture();
            expect(await token.name()).to.equal(TOKEN_NAME);
            expect(await token.symbol()).to.equal(TOKEN_SYMBOL);
            expect(await token.decimals()).to.equal(18n);
            expect(await token.MAX_SUPPLY()).to.equal(MAX_SUPPLY);
            expect(await token.totalSupply()).to.equal(MAX_SUPPLY);
            expect(await token.balanceOf(treasury.address)).to.equal(MAX_SUPPLY);
            expect(await token.FLASH_FEE_SINK()).to.equal(sink.address);
            expect(await token.FLASH_FEE_BPS()).to.equal(Number(FLASH_FEE_BPS));
        });

        it("reverts on zero treasury", async function () {
            const { ethers, sink } = await setup();
            const Token = await ethers.getContractFactory("NARAToken");
            await expect(Token.deploy(ethers.ZeroAddress, sink.address, TOKEN_NAME, TOKEN_SYMBOL))
                .to.be.revertedWithCustomError(Token, "ZeroAddress");
        });

        it("reverts on zero flash-fee sink", async function () {
            const { ethers, treasury } = await setup();
            const Token = await ethers.getContractFactory("NARAToken");
            await expect(Token.deploy(treasury.address, ethers.ZeroAddress, TOKEN_NAME, TOKEN_SYMBOL))
                .to.be.revertedWithCustomError(Token, "ZeroAddress");
        });

        it("reverts on empty metadata", async function () {
            const { ethers, treasury, sink } = await setup();
            const Token = await ethers.getContractFactory("NARAToken");
            await expect(Token.deploy(treasury.address, sink.address, "", TOKEN_SYMBOL))
                .to.be.revertedWithCustomError(Token, "EmptyMetadata");
            await expect(Token.deploy(treasury.address, sink.address, TOKEN_NAME, ""))
                .to.be.revertedWithCustomError(Token, "EmptyMetadata");
        });
    });

    describe("EIP-712", function () {
        it("exposes a domain separator", async function () {
            const { token } = await deployTokenFixture();
            const sep = await token.DOMAIN_SEPARATOR();
            expect(sep).to.not.equal("0x" + "00".repeat(32));
        });

        it("exposes EIP-5267 eip712Domain fields", async function () {
            const { token } = await deployTokenFixture();
            const domain = await token.eip712Domain();
            expect(domain.name).to.equal(TOKEN_NAME);
            expect(domain.version).to.equal("1");
            expect(domain.verifyingContract).to.equal(await token.getAddress());
        });
    });

    describe("ERC-2612 permit", function () {
        it("accepts a valid EOA signature and sets allowance", async function () {
            const { ethers, token, treasury, bob } = await deployTokenFixture();
            const value = 1000n * ONE;
            const deadline = Math.floor(Date.now() / 1000) + 3600;

            const nonce = await token.nonces(treasury.address);
            const chainId = (await ethers.provider.getNetwork()).chainId;
            const domain = {
                name: TOKEN_NAME,
                version: "1",
                chainId,
                verifyingContract: await token.getAddress(),
            };
            const types = {
                Permit: [
                    { name: "owner", type: "address" },
                    { name: "spender", type: "address" },
                    { name: "value", type: "uint256" },
                    { name: "nonce", type: "uint256" },
                    { name: "deadline", type: "uint256" },
                ],
            };
            const message = {
                owner: treasury.address,
                spender: bob.address,
                value,
                nonce,
                deadline,
            };

            const sig = await (treasury as unknown as Signer).signTypedData(domain, types, message);
            const { v, r, s } = ethers.Signature.from(sig);

            await token.permit(treasury.address, bob.address, value, deadline, v, r, s);
            expect(await token.allowance(treasury.address, bob.address)).to.equal(value);
            expect(await token.nonces(treasury.address)).to.equal(nonce + 1n);
        });

        it("rejects an expired permit", async function () {
            const { ethers, token, treasury, bob } = await deployTokenFixture();
            const value = 1000n * ONE;
            const deadline = 1; // long past

            const nonce = await token.nonces(treasury.address);
            const chainId = (await ethers.provider.getNetwork()).chainId;
            const domain = {
                name: TOKEN_NAME,
                version: "1",
                chainId,
                verifyingContract: await token.getAddress(),
            };
            const types = {
                Permit: [
                    { name: "owner", type: "address" },
                    { name: "spender", type: "address" },
                    { name: "value", type: "uint256" },
                    { name: "nonce", type: "uint256" },
                    { name: "deadline", type: "uint256" },
                ],
            };
            const sig = await (treasury as unknown as Signer).signTypedData(domain, types, {
                owner: treasury.address,
                spender: bob.address,
                value,
                nonce,
                deadline,
            });
            const { v, r, s } = ethers.Signature.from(sig);

            await expect(
                token.permit(treasury.address, bob.address, value, deadline, v, r, s)
            ).to.be.revertedWithCustomError(token, "ERC2612ExpiredSignature");
        });
    });

    describe("ERC-1363 transferAndCall / approveAndCall", function () {
        it("transferAndCall notifies the receiver contract", async function () {
            const { ethers, token, treasury } = await deployTokenFixture();
            const receiver = await ethers.deployContract("MockERC1363Receiver");
            await receiver.waitForDeployment();

            const amount = 500n * ONE;
            const data = ethers.toUtf8Bytes("hello");

            await token
                .connect(treasury)
                ["transferAndCall(address,uint256,bytes)"](await receiver.getAddress(), amount, data);

            expect(await token.balanceOf(await receiver.getAddress())).to.equal(amount);
            expect(await receiver.lastFrom()).to.equal(treasury.address);
            expect(await receiver.lastValue()).to.equal(amount);
        });

        it("transferAndCall reverts when receiver rejects", async function () {
            const { ethers, token, treasury } = await deployTokenFixture();
            const receiver = await ethers.deployContract("MockERC1363Receiver");
            await receiver.waitForDeployment();
            await receiver.setReject(true, false);

            await expect(
                token
                    .connect(treasury)
                    ["transferAndCall(address,uint256)"](await receiver.getAddress(), 100n * ONE)
            ).to.be.revertedWithCustomError(token, "ERC1363InvalidReceiver");
        });

        it("approveAndCall notifies the spender contract", async function () {
            const { ethers, token, treasury } = await deployTokenFixture();
            const spender = await ethers.deployContract("MockERC1363Receiver");
            await spender.waitForDeployment();

            const amount = 750n * ONE;
            const data = ethers.toUtf8Bytes("approve+lock");

            await token
                .connect(treasury)
                ["approveAndCall(address,uint256,bytes)"](await spender.getAddress(), amount, data);

            expect(await token.allowance(treasury.address, await spender.getAddress())).to.equal(amount);
            expect(await spender.lastOwner()).to.equal(treasury.address);
            expect(await spender.lastValue()).to.equal(amount);
        });

        it("supports IERC1363 and IERC3156FlashLender interfaces", async function () {
            const { token } = await deployTokenFixture();
            // IERC1363 interface id
            expect(await token.supportsInterface("0xb0202a11")).to.be.true;
            // IERC3156FlashLender interface id
            expect(await token.supportsInterface("0xe4143091")).to.be.true;
        });
    });

    describe("ERC-3156 flash loans", function () {
        it("quotes flash fee at 10 bps", async function () {
            const { token } = await deployTokenFixture();
            const amount = MAX_FLASH_LOAN;
            expect(await token.flashFee(await token.getAddress(), amount)).to.equal(
                (amount * FLASH_FEE_BPS) / 10_000n
            );
        });

        it("rejects flashFee for unsupported tokens", async function () {
            const { token, alice } = await deployTokenFixture();
            await expect(
                token.flashFee(alice.address, 1n * ONE)
            ).to.be.revertedWithCustomError(token, "ERC3156UnsupportedToken");
        });

        it("rejects flashFee quotes above the protocol cap", async function () {
            const { token } = await deployTokenFixture();
            await expect(
                token.flashFee(await token.getAddress(), MAX_FLASH_LOAN + 1n)
            ).to.be.revertedWithCustomError(token, "ERC3156ExceededMaxLoan")
              .withArgs(MAX_FLASH_LOAN);
        });

        it("routes fee to FLASH_FEE_SINK", async function () {
            const { ethers, token, treasury, sink } = await deployTokenFixture();
            const borrower = await ethers.deployContract("MockFlashBorrower", [await token.getAddress()]);
            await borrower.waitForDeployment();

            const loan = MAX_FLASH_LOAN;
            const fee = (loan * FLASH_FEE_BPS) / 10_000n;

            // Fund borrower with just enough to cover the fee
            await token.connect(treasury).transfer(await borrower.getAddress(), fee);
            const sinkBefore = await token.balanceOf(sink.address);

            await borrower.flashBorrow(await token.getAddress(), loan, "0x");

            expect(await token.balanceOf(sink.address)).to.equal(sinkBefore + fee);
            expect(await token.balanceOf(await borrower.getAddress())).to.equal(0n);
        });

        it("reverts when borrower returns wrong magic value", async function () {
            const { ethers, token, treasury } = await deployTokenFixture();
            const borrower = await ethers.deployContract("MockFlashBorrower", [await token.getAddress()]);
            await borrower.waitForDeployment();

            const loan = MAX_FLASH_LOAN;
            const fee = (loan * FLASH_FEE_BPS) / 10_000n;
            await token.connect(treasury).transfer(await borrower.getAddress(), fee);

            // data[0]=2 signals BAD_RETURN in MockFlashBorrower
            await expect(
                borrower.flashBorrow(await token.getAddress(), loan, "0x02")
            ).to.be.revertedWithCustomError(token, "ERC3156InvalidReceiver");
        });

        it("maxFlashLoan is hard-capped at the protocol cap", async function () {
            const { token } = await deployTokenFixture();
            const max = await token.maxFlashLoan(await token.getAddress());
            expect(max).to.equal(MAX_FLASH_LOAN);
        });

        it("rejects flash loans above the protocol cap", async function () {
            const { ethers, token, treasury } = await deployTokenFixture();
            const borrower = await ethers.deployContract("MockFlashBorrower", [await token.getAddress()]);
            await borrower.waitForDeployment();

            const fee = ((MAX_FLASH_LOAN + 1n) * FLASH_FEE_BPS) / 10_000n;
            await token.connect(treasury).transfer(await borrower.getAddress(), fee);

            await expect(
                borrower.flashBorrow(await token.getAddress(), MAX_FLASH_LOAN + 1n, "0x")
            ).to.be.revertedWithCustomError(token, "ERC3156ExceededMaxLoan")
              .withArgs(MAX_FLASH_LOAN);
        });

        it("enforces the cap across recursive flash loans", async function () {
            const { ethers, token, treasury } = await deployTokenFixture();
            const borrower = await ethers.deployContract(
                "MockRecursiveFlashBorrower",
                [await token.getAddress()],
            );
            await borrower.waitForDeployment();

            const outer = 60_000n * ONE;
            const nested = 40_000n * ONE;
            const totalFee = ((outer + nested) * FLASH_FEE_BPS) / 10_000n;
            await token.connect(treasury).transfer(await borrower.getAddress(), totalFee);

            await borrower.borrow(await token.getAddress(), outer, nested);

            expect(await borrower.peakSupply()).to.equal(MAX_SUPPLY + MAX_FLASH_LOAN);
            expect(await borrower.minimumRemainingCapacity()).to.equal(0n);
            expect(await token.totalSupply()).to.equal(MAX_SUPPLY);
            expect(await token.maxFlashLoan(await token.getAddress())).to.equal(MAX_FLASH_LOAN);
        });

        it("rejects recursion above the remaining aggregate capacity", async function () {
            const { ethers, token, treasury } = await deployTokenFixture();
            const borrower = await ethers.deployContract(
                "MockRecursiveFlashBorrower",
                [await token.getAddress()],
            );
            await borrower.waitForDeployment();

            const outer = 60_000n * ONE;
            const nested = 40_000n * ONE + 1n;
            const totalFee = ((outer + nested) * FLASH_FEE_BPS) / 10_000n;
            await token.connect(treasury).transfer(await borrower.getAddress(), totalFee);

            await expect(
                borrower.borrow(await token.getAddress(), outer, nested),
            ).to.be.revertedWithCustomError(token, "ERC3156ExceededMaxLoan")
              .withArgs(40_000n * ONE);
            expect(await token.totalSupply()).to.equal(MAX_SUPPLY);
        });
    });

    describe("Multicall", function () {
        it("batches multiple calls in one tx", async function () {
            const { ethers, token, treasury, alice, bob } = await deployTokenFixture();
            const iface = token.interface;
            const tx1 = iface.encodeFunctionData("transfer", [alice.address, 100n * ONE]);
            const tx2 = iface.encodeFunctionData("transfer", [bob.address, 200n * ONE]);

            await token.connect(treasury).multicall([tx1, tx2]);

            expect(await token.balanceOf(alice.address)).to.equal(100n * ONE);
            expect(await token.balanceOf(bob.address)).to.equal(200n * ONE);
        });
    });
});

describe("NARALauncher", function () {
    async function deployLauncher() {
        const ctx = await setup();
        const { ethers, deployer } = ctx;
        const launcher: any = await ethers.deployContract("NARALauncher", [deployer.address]);
        await launcher.waitForDeployment();
        return { ...ctx, launcher };
    }

    async function buildEngineCreationCode(ethers: any, configValue: bigint): Promise<string> {
        const artifact = await hre.artifacts.readArtifact("MockEngine");
        const encoded = ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [configValue]);
        return artifact.bytecode + encoded.slice(2);
    }

    it("stores the explicit launch admin", async function () {
        const { launcher, deployer } = await deployLauncher();

        expect(await launcher.launcherAdmin()).to.equal(deployer.address);
    });

    it("reverts on zero launch admin", async function () {
        const { ethers } = await setup();
        const Launcher = await ethers.getContractFactory("NARALauncher");

        await expect(Launcher.deploy(ethers.ZeroAddress))
            .to.be.revertedWithCustomError(Launcher, "ZeroAddress");
    });

    it("atomically deploys token and engine with matching CREATE2 address", async function () {
        const { ethers, launcher, treasury } = await deployLauncher();

        const salt = ethers.keccak256(ethers.toUtf8Bytes("NARA-LAUNCH-1"));
        const code = await buildEngineCreationCode(ethers, 42n);

        const predicted = await launcher.previewEngineAddress(code, salt);

        const tx = await launcher.launch(treasury.address, code, salt, TOKEN_NAME, TOKEN_SYMBOL);
        const receipt = await tx.wait();
        expect(receipt?.status).to.equal(1);

        const tokenAddr = await launcher.deployedToken();
        const engineAddr = await launcher.deployedEngine();

        expect(engineAddr).to.equal(predicted);
        expect(await launcher.launched()).to.equal(true);
        expect(await launcher.pendingToken()).to.equal(ethers.ZeroAddress);

        // Verify the engine read the token correctly from the launcher
        const engine = await ethers.getContractAt("MockEngine", engineAddr);
        expect(await engine.NARA()).to.equal(tokenAddr);
        expect(await engine.LAUNCHER()).to.equal(await launcher.getAddress());
        expect(await engine.CONFIG_VALUE()).to.equal(42n);

        // Verify the token bound the predicted engine as FLASH_FEE_SINK
        const token: any = await ethers.getContractAt("NARAToken", tokenAddr);
        expect(await token.FLASH_FEE_SINK()).to.equal(engineAddr);
        expect(await token.balanceOf(treasury.address)).to.equal(MAX_SUPPLY);
        expect(await token.name()).to.equal(TOKEN_NAME);
        expect(await token.symbol()).to.equal(TOKEN_SYMBOL);
    });

    it("only lets the configured launcher admin execute the one-shot launch", async function () {
        const { ethers, launcher, treasury, alice } = await deployLauncher();

        const salt = ethers.keccak256(ethers.toUtf8Bytes("NARA-LAUNCH-AUTH"));
        const code = await buildEngineCreationCode(ethers, 42n);

        await expect(
            launcher.connect(alice).launch(treasury.address, code, salt, TOKEN_NAME, TOKEN_SYMBOL),
        ).to.be.revertedWithCustomError(launcher, "UnauthorizedLauncher");

        await launcher.launch(treasury.address, code, salt, TOKEN_NAME, TOKEN_SYMBOL);
        expect(await launcher.launched()).to.equal(true);
    });

    it("failed engine deployment leaves the launcher unlaunched and retryable", async function () {
        const { ethers, launcher, treasury } = await deployLauncher();

        const badSalt = ethers.keccak256(ethers.toUtf8Bytes("NARA-LAUNCH-REVERT"));
        const revertingCreationCode = "0x60006000fd";

        await expect(
            launcher.launch(treasury.address, revertingCreationCode, badSalt, TOKEN_NAME, TOKEN_SYMBOL)
        ).to.be.revert(ethers);

        expect(await launcher.launched()).to.equal(false);
        expect(await launcher.pendingToken()).to.equal(ethers.ZeroAddress);
        expect(await launcher.deployedToken()).to.equal(ethers.ZeroAddress);
        expect(await launcher.deployedEngine()).to.equal(ethers.ZeroAddress);

        const goodSalt = ethers.keccak256(ethers.toUtf8Bytes("NARA-LAUNCH-RETRY"));
        const code = await buildEngineCreationCode(ethers, 7n);

        await launcher.launch(treasury.address, code, goodSalt, TOKEN_NAME, TOKEN_SYMBOL);

        expect(await launcher.launched()).to.equal(true);
        expect(await launcher.pendingToken()).to.equal(ethers.ZeroAddress);
        expect(await launcher.deployedToken()).to.not.equal(ethers.ZeroAddress);
        expect(await launcher.deployedEngine()).to.not.equal(ethers.ZeroAddress);
    });

    it("reverts on second launch attempt", async function () {
        const { ethers, launcher, treasury } = await deployLauncher();

        const salt1 = ethers.keccak256(ethers.toUtf8Bytes("a"));
        const salt2 = ethers.keccak256(ethers.toUtf8Bytes("b"));
        const code = await buildEngineCreationCode(ethers, 1n);

        await launcher.launch(treasury.address, code, salt1, TOKEN_NAME, TOKEN_SYMBOL);

        await expect(
            launcher.launch(treasury.address, code, salt2, TOKEN_NAME, TOKEN_SYMBOL)
        ).to.be.revertedWithCustomError(launcher, "AlreadyLaunched");
    });

    it("reverts on zero treasury", async function () {
        const { ethers, launcher } = await deployLauncher();
        const salt = ethers.keccak256(ethers.toUtf8Bytes("x"));
        const code = await buildEngineCreationCode(ethers, 1n);
        await expect(
            launcher.launch(ethers.ZeroAddress, code, salt, TOKEN_NAME, TOKEN_SYMBOL)
        ).to.be.revertedWithCustomError(launcher, "ZeroAddress");
    });

    it("reverts on empty engine code", async function () {
        const { ethers, launcher, treasury } = await deployLauncher();
        const salt = ethers.keccak256(ethers.toUtf8Bytes("x"));
        await expect(
            launcher.launch(treasury.address, "0x", salt, TOKEN_NAME, TOKEN_SYMBOL)
        ).to.be.revertedWithCustomError(launcher, "EmptyCode");
    });

    it("reverts on empty token metadata", async function () {
        const { ethers, launcher, treasury } = await deployLauncher();
        const salt = ethers.keccak256(ethers.toUtf8Bytes("metadata"));
        const code = await buildEngineCreationCode(ethers, 1n);
        await expect(
            launcher.launch(treasury.address, code, salt, "", TOKEN_SYMBOL)
        ).to.be.revertedWithCustomError(launcher, "EmptyMetadata");
    });
});
