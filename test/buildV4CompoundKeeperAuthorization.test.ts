import { expect } from "chai";
import {
  validateDedicatedKeeperAccount,
  validateDedicatedKeeperAuthority,
} from "../scripts/buildV4CompoundKeeperAuthorization.js";

describe("v4 compound keeper authorization builder", function () {
  const noRoles = {
    defaultAdmin: false,
    param: false,
    treasury: false,
    rewardNotifier: false,
  };

  it("accepts only an unused plain EOA with no privileged authority", function () {
    expect(() => validateDedicatedKeeperAccount("0x", 0)).not.to.throw();
    expect(() => validateDedicatedKeeperAuthority(false, noRoles)).not.to.throw();
  });

  it("rejects EIP-7702 delegation code and previously used accounts", function () {
    expect(() => validateDedicatedKeeperAccount(
      "0xef010063c0c19a282a1b52b07dd5a65b58948a07dae32b",
      0,
    )).to.throw("must be an EOA");
    expect(() => validateDedicatedKeeperAccount("0x", 1)).to.throw("must be unused");
  });

  it("rejects Safe owners and Engine role holders", function () {
    expect(() => validateDedicatedKeeperAuthority(true, noRoles)).to.throw("must not be a Safe owner");
    expect(() => validateDedicatedKeeperAuthority(false, {
      ...noRoles,
      treasury: true,
    })).to.throw("must not hold an Engine administration role");
  });
});
