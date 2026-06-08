import { getAddress, id, ZeroHash } from "ethers";
import { writeFileSync } from "fs";

const RETIRED_V3_BOND_VAULT = "0xcCe364b9cF815D47B0338aAd960367CdE8E3525D".toLowerCase();

function envAddress(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing env: ${name}`);
  const address = getAddress(value);
  if (address.toLowerCase() === RETIRED_V3_BOND_VAULT) {
    throw new Error(`${name} is the retired v3 bond vault address`);
  }
  return address;
}

const GRANTEE = envAddress("V4_ROLE_GRANTEE");
const BOND_VAULT = envAddress("V4_BOND_VAULT");
const BOND_DEPO = envAddress("V4_BOND_DEPOSITORY");

const roles: Record<string, string> = {
  ADMIN_ROLE: id("ADMIN_ROLE"),
  PARAM_ROLE: id("PARAM_ROLE"),
  TREASURY_ROLE: id("TREASURY_ROLE"),
  MARKET_ADMIN_ROLE: id("MARKET_ADMIN_ROLE"),
  CAP_ADMIN_ROLE: id("CAP_ADMIN_ROLE"),
  TERMS_ROLE: id("TERMS_ROLE"),
  PAUSER_ROLE: id("PAUSER_ROLE"),
  ENGINE_SETTER_ROLE: id("ENGINE_SETTER_ROLE"),
  DEFAULT_ADMIN_ROLE: ZeroHash,
};

const contractRoles: Record<string, string[]> = {
  [BOND_VAULT]: [roles.ADMIN_ROLE, roles.MARKET_ADMIN_ROLE, roles.CAP_ADMIN_ROLE, roles.DEFAULT_ADMIN_ROLE],
  [BOND_DEPO]: [roles.TERMS_ROLE, roles.PAUSER_ROLE, roles.TREASURY_ROLE, roles.DEFAULT_ADMIN_ROLE],
};

const grantMethod = {
  inputs: [
    { name: "role", type: "bytes32" },
    { name: "account", type: "address" },
  ],
  name: "grantRole",
  payable: false,
};

const transactions: object[] = [];

for (const [contract, roleList] of Object.entries(contractRoles)) {
  for (const role of roleList) {
    transactions.push({
      to: contract,
      value: "0",
      data: null,
      contractMethod: grantMethod,
      contractInputsValues: { role, account: GRANTEE },
    });
  }
}

const batch = {
  version: "1.0",
  chainId: "8453",
  createdAt: Date.now(),
  meta: {
    name: "Grant fresh v4 bond roles (step 1/2)",
    description: "Grant vault and bond-depository roles to V4_ROLE_GRANTEE; run the renounce batch after this confirms.",
  },
  transactions,
};

writeFileSync("roleGrantBatch.json", JSON.stringify(batch, null, 2));
console.log(`written: roleGrantBatch.json (${transactions.length} transactions)`);

const roleNames = Object.fromEntries(Object.entries(roles).map(([name, hash]) => [hash, name]));
for (const [contract, roleList] of Object.entries(contractRoles)) {
  for (const role of roleList) {
    console.log(`  grant ${roleNames[role]} on ${contract}`);
  }
}
