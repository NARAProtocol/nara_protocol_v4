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

const RENOUNCER = envAddress("V4_ROLE_RENOUNCER");
const BOND_VAULT = envAddress("V4_BOND_VAULT");
const BOND_DEPO = envAddress("V4_BOND_DEPOSITORY");

const roles: Record<string, string> = {
  ADMIN_ROLE: id("ADMIN_ROLE"),
  MARKET_ADMIN_ROLE: id("MARKET_ADMIN_ROLE"),
  CAP_ADMIN_ROLE: id("CAP_ADMIN_ROLE"),
  TERMS_ROLE: id("TERMS_ROLE"),
  PAUSER_ROLE: id("PAUSER_ROLE"),
  TREASURY_ROLE: id("TREASURY_ROLE"),
  DEFAULT_ADMIN_ROLE: ZeroHash,
};

const contractRoles: Record<string, string[]> = {
  [BOND_VAULT]: [roles.ADMIN_ROLE, roles.MARKET_ADMIN_ROLE, roles.CAP_ADMIN_ROLE, roles.DEFAULT_ADMIN_ROLE],
  [BOND_DEPO]: [roles.TERMS_ROLE, roles.PAUSER_ROLE, roles.TREASURY_ROLE, roles.DEFAULT_ADMIN_ROLE],
};

const renounceMethod = {
  inputs: [
    { name: "role", type: "bytes32" },
    { name: "callerConfirmation", type: "address" },
  ],
  name: "renounceRole",
  payable: false,
};

const transactions: object[] = [];

for (const [contract, roleList] of Object.entries(contractRoles)) {
  for (const role of roleList) {
    transactions.push({
      to: contract,
      value: "0",
      data: null,
      contractMethod: renounceMethod,
      contractInputsValues: { role, callerConfirmation: RENOUNCER },
    });
  }
}

const batch = {
  version: "1.0",
  chainId: "8453",
  createdAt: Date.now(),
  meta: {
    name: "Renounce fresh v4 bond roles (step 2/2)",
    description: "V4_ROLE_RENOUNCER renounces vault and bond-depository roles after the grant batch confirms.",
  },
  transactions,
};

writeFileSync("roleRenounceBatch.json", JSON.stringify(batch, null, 2));
console.log(`written: roleRenounceBatch.json (${transactions.length} transactions)`);
