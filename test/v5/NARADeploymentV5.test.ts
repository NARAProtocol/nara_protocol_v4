import { expect } from "chai";
import hre from "hardhat";

describe("NARACreate2FactoryV5", function () {
  it("deploys only the exact reviewed init code at the independently predicted address", async function () {
    const { ethers } = await hre.network.connect();
    const [authority] = await ethers.getSigners();
    const factory = await ethers.deployContract("NARACreate2FactoryV5");
    await factory.waitForDeployment();
    const probeFactory = await ethers.getContractFactory("ConstructorProbeV5");
    const configurationHash = ethers.keccak256(ethers.toUtf8Bytes("reviewed-v5-configuration"));
    const deploy = await probeFactory.getDeployTransaction(authority.address, configurationHash);
    const initCode = deploy.data!;
    const initCodeHash = ethers.keccak256(initCode);
    const salt = ethers.keccak256(ethers.toUtf8Bytes("nara-v5:rehearsal:probe"));
    const predicted = await factory.computeAddress(salt, initCodeHash);

    await expect(factory.deploy(salt, initCode, initCodeHash, predicted))
      .to.emit(factory, "DeterministicContractDeployed")
      .withArgs(predicted, salt, initCodeHash, authority.address);
    const probe = await ethers.getContractAt("ConstructorProbeV5", predicted);
    expect(await probe.authority()).to.equal(authority.address);
    expect(await probe.configurationHash()).to.equal(configurationHash);
  });

  it("rejects init-code/address drift and an already occupied prediction", async function () {
    const { ethers } = await hre.network.connect();
    const [authority, other] = await ethers.getSigners();
    const factory = await ethers.deployContract("NARACreate2FactoryV5");
    await factory.waitForDeployment();
    const probeFactory = await ethers.getContractFactory("ConstructorProbeV5");
    const deploy = await probeFactory.getDeployTransaction(authority.address, ethers.ZeroHash);
    const initCode = deploy.data!;
    const initCodeHash = ethers.keccak256(initCode);
    const salt = ethers.id("reviewed-salt");
    const predicted = await factory.computeAddress(salt, initCodeHash);

    await expect(factory.deploy(salt, initCode, ethers.id("wrong"), predicted))
      .to.be.revertedWithCustomError(factory, "InitCodeHashMismatch");
    await expect(factory.deploy(salt, initCode, initCodeHash, other.address))
      .to.be.revertedWithCustomError(factory, "PredictedAddressMismatch");
    await factory.deploy(salt, initCode, initCodeHash, predicted);
    await expect(factory.deploy(salt, initCode, initCodeHash, predicted))
      .to.be.revertedWithCustomError(factory, "AddressAlreadyHasCode");
  });

  it("checks low-address Hook permission bits without interpreting policy", async function () {
    const { ethers } = await hre.network.connect();
    const factory = await ethers.deployContract("NARACreate2FactoryV5");
    await factory.waitForDeployment();
    const candidate = "0x00000000000000000000000000000000000000a5";
    expect(await factory.permissionBitsMatch(candidate, 0xa5, 0xff)).to.equal(true);
    expect(await factory.permissionBitsMatch(candidate, 0xa4, 0xff)).to.equal(false);
    expect(await factory.permissionBitsMatch(candidate, 0x05, 0x0f)).to.equal(true);
  });
});
