import hre from "hardhat";

async function main() {
  const { ethers } = await hre.network.connect();
  const provider = new ethers.JsonRpcProvider("https://mainnet.base.org", 8453, { staticNetwork: true, batchMaxCount: 1 });

  const engine = "0x98ab6406D6B548F37dEF7110961bb45A399e5aFC";
  const iface = [
    "function lockFeeWei() view returns (uint96)",
    "function unlockFeeWei() view returns (uint96)",
    "function hasRole(bytes32 role, address account) view returns (bool)",
    "function DEFAULT_ADMIN_ROLE() view returns (bytes32)",
    "function PARAM_ROLE() view returns (bytes32)",
    "function TREASURY_ROLE() view returns (bytes32)"
  ];
  const c = new ethers.Contract(engine, iface, provider);

  const lockFee = await c.lockFeeWei();
  const unlockFee = await c.unlockFeeWei();
  const paramRole = await c.PARAM_ROLE();
  const adminRole = await c.DEFAULT_ADMIN_ROLE();

  const deployer = "0xAE9D1667B45558232BeD9d45DcCA53940F892aB5";
  const safe = "0xd65c0e390Dc187A22c52c03816591CC736C0D755";

  console.log("Current Lock Fee Wei:  ", lockFee.toString(), `(${ethers.formatEther(lockFee)} ETH)`);
  console.log("Current Unlock Fee Wei:", unlockFee.toString(), `(${ethers.formatEther(unlockFee)} ETH)`);

  console.log("Deployer has PARAM_ROLE: ", await c.hasRole(paramRole, deployer));
  console.log("Deployer has ADMIN_ROLE: ", await c.hasRole(adminRole, deployer));
  console.log("Safe has PARAM_ROLE:     ", await c.hasRole(paramRole, safe));
  console.log("Safe has ADMIN_ROLE:     ", await c.hasRole(adminRole, safe));
}

main().catch(console.error);
