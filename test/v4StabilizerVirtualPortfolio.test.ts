import { expect } from "chai";
import {
  applyVirtualBuy,
  applyVirtualSell,
  createStabilizerVirtualPortfolio,
  type StabilizerVirtualPortfolio,
} from "../scripts/matrix/stabilizerVirtualPortfolio.js";

const USDC = 10n ** 6n;
const NARA = 10n ** 18n;

function buy(
  state: StabilizerVirtualPortfolio,
  id: string,
  order: number,
  usdc: bigint,
  nara: bigint,
  gas = 0n,
  cost = 0n
) {
  return applyVirtualBuy(state, {
    id,
    order,
    usdcSpent: usdc,
    naraReceived: nara,
    gasUsdc: gas,
    explicitCostUsdc: cost,
  });
}

describe("v4 stabilizer virtual FIFO portfolio", () => {
  it("sells seeded hedge inventory against its explicit real basis", () => {
    const seeded = createStabilizerVirtualPortfolio(50n * USDC, [
      {
        id: "seed-hedge",
        acquiredOrder: 10,
        remainingNaraWei: 100n * NARA,
        remainingBasisUsdc: 80n * USDC,
      },
    ]);
    expect(seeded.naraBalance).to.equal(100n * NARA);
    expect(seeded.lastActionOrder).to.equal(10);
    expect(seeded.appliedActionIds).to.deep.equal(["seed-hedge"]);

    const sold = applyVirtualSell(seeded, {
      id: "hedge-sell",
      order: 11,
      naraSold: 50n * NARA,
      usdcProceeds: 55n * USDC,
      gasUsdc: 1n * USDC,
      explicitCostUsdc: 0n,
    });
    if (sold.status !== "applied") throw new Error("seeded sale failed");
    expect(sold.details.consumedBasisUsdc).to.equal(40n * USDC);
    expect(sold.details.netProceedsUsdc).to.equal(54n * USDC);
    expect(sold.details.realizedPnlUsdc).to.equal(14n * USDC);
    expect(sold.state.lots[0].remainingBasisUsdc).to.equal(40n * USDC);
  });

  it("rejects seed inventory with missing or invalid basis", () => {
    expect(() =>
      createStabilizerVirtualPortfolio(0n, [
        {
          id: "unknown-basis",
          acquiredOrder: 1,
          remainingNaraWei: NARA,
        } as never,
      ])
    ).to.throw("seed lot remainingBasisUsdc must be a bigint");
    expect(() =>
      createStabilizerVirtualPortfolio(0n, [
        {
          id: "negative-basis",
          acquiredOrder: 1,
          remainingNaraWei: NARA,
          remainingBasisUsdc: -1n,
        },
      ])
    ).to.throw("seed lot remainingBasisUsdc must be non-negative");
  });

  it("rejects invalid FIFO seed identity, size, and order", () => {
    expect(() =>
      createStabilizerVirtualPortfolio(0n, [
        {
          id: "zero",
          acquiredOrder: 1,
          remainingNaraWei: 0n,
          remainingBasisUsdc: 0n,
        },
      ])
    ).to.throw("seed lot remainingNaraWei must be positive");
    expect(() =>
      createStabilizerVirtualPortfolio(0n, [
        {
          id: "same",
          acquiredOrder: 2,
          remainingNaraWei: NARA,
          remainingBasisUsdc: USDC,
        },
        {
          id: "same",
          acquiredOrder: 3,
          remainingNaraWei: NARA,
          remainingBasisUsdc: USDC,
        },
      ])
    ).to.throw("duplicate seed lot id");
    expect(() =>
      createStabilizerVirtualPortfolio(0n, [
        {
          id: "later",
          acquiredOrder: 2,
          remainingNaraWei: NARA,
          remainingBasisUsdc: USDC,
        },
        {
          id: "earlier",
          acquiredOrder: 1,
          remainingNaraWei: NARA,
          remainingBasisUsdc: USDC,
        },
      ])
    ).to.throw("seed lot acquiredOrder must increase strictly");
  });

  it("prevents future actions from reusing or preceding seeded lots", () => {
    const seeded = createStabilizerVirtualPortfolio(10n * USDC, [
      {
        id: "seed",
        acquiredOrder: 5,
        remainingNaraWei: NARA,
        remainingBasisUsdc: USDC,
      },
    ]);
    expect(() => buy(seeded, "seed", 6, USDC, NARA)).to.throw(
      "duplicate action id"
    );
    expect(() => buy(seeded, "next", 5, USDC, NARA)).to.throw(
      "order must increase strictly"
    );
  });

  it("consumes multiple lots in FIFO order", () => {
    const initial = createStabilizerVirtualPortfolio(1_000n * USDC);
    const first = buy(initial, "buy-1", 1, 100n * USDC, 100n * NARA);
    expect(first.status).to.equal("applied");
    if (first.status !== "applied") return;
    const second = buy(first.state, "buy-2", 2, 240n * USDC, 120n * NARA);
    expect(second.status).to.equal("applied");
    if (second.status !== "applied") return;

    const sold = applyVirtualSell(second.state, {
      id: "sell-1",
      order: 3,
      naraSold: 160n * NARA,
      usdcProceeds: 250n * USDC,
      gasUsdc: 0n,
      explicitCostUsdc: 0n,
    });
    expect(sold.status).to.equal("applied");
    if (sold.status !== "applied") return;
    expect(sold.details.consumedBasisUsdc).to.equal(220n * USDC);
    expect(sold.details.realizedPnlUsdc).to.equal(30n * USDC);
    expect(sold.state.lots).to.deep.equal([
      {
        id: "buy-2",
        acquiredOrder: 2,
        remainingNaraWei: 60n * NARA,
        remainingBasisUsdc: 120n * USDC,
      },
    ]);
  });

  it("preserves proportional basis on a partial lot sale", () => {
    const initial = createStabilizerVirtualPortfolio(200n * USDC);
    const acquired = buy(initial, "buy", 1, 90n * USDC, 30n * NARA);
    if (acquired.status !== "applied") throw new Error("setup failed");
    const sold = applyVirtualSell(acquired.state, {
      id: "sell",
      order: 2,
      naraSold: 10n * NARA,
      usdcProceeds: 35n * USDC,
      gasUsdc: 0n,
      explicitCostUsdc: 0n,
    });
    if (sold.status !== "applied") throw new Error("sale failed");
    expect(sold.details.consumedBasisUsdc).to.equal(30n * USDC);
    expect(sold.state.lots[0].remainingBasisUsdc).to.equal(60n * USDC);
    expect(sold.state.lots[0].remainingNaraWei).to.equal(20n * NARA);
  });

  it("blocks a buy that lacks USDC without changing path state", () => {
    const state = createStabilizerVirtualPortfolio(10n * USDC);
    const result = buy(state, "buy", 1, 10n * USDC, NARA, 1n, 0n);
    expect(result).to.deep.equal({
      status: "blocked",
      state,
      reason: "INSUFFICIENT_USDC",
    });
  });

  it("blocks a sell larger than held NARA", () => {
    const initial = createStabilizerVirtualPortfolio(100n * USDC);
    const acquired = buy(initial, "buy", 1, 10n * USDC, NARA);
    if (acquired.status !== "applied") throw new Error("setup failed");
    const result = applyVirtualSell(acquired.state, {
      id: "sell",
      order: 2,
      naraSold: 2n * NARA,
      usdcProceeds: 20n * USDC,
      gasUsdc: 0n,
      explicitCostUsdc: 0n,
    });
    expect(result.status).to.equal("blocked");
    if (result.status === "blocked") {
      expect(result.reason).to.equal("INSUFFICIENT_NARA");
      expect(result.state).to.equal(acquired.state);
    }
  });

  it("includes buy and sell gas and explicit costs in realized P&L", () => {
    const initial = createStabilizerVirtualPortfolio(200n * USDC);
    const acquired = buy(
      initial,
      "buy",
      1,
      100n * USDC,
      10n * NARA,
      2n * USDC,
      3n * USDC
    );
    if (acquired.status !== "applied") throw new Error("setup failed");
    expect(acquired.details.totalDebitUsdc).to.equal(105n * USDC);
    const sold = applyVirtualSell(acquired.state, {
      id: "sell",
      order: 2,
      naraSold: 10n * NARA,
      usdcProceeds: 130n * USDC,
      gasUsdc: 4n * USDC,
      explicitCostUsdc: 1n * USDC,
    });
    if (sold.status !== "applied") throw new Error("sale failed");
    expect(sold.details.netProceedsUsdc).to.equal(125n * USDC);
    expect(sold.details.realizedPnlUsdc).to.equal(20n * USDC);
    expect(sold.state.usdcBalance).to.equal(220n * USDC);
  });

  it("uses sequential output state so inventory cannot be reused", () => {
    const initial = createStabilizerVirtualPortfolio(100n * USDC);
    const acquired = buy(initial, "buy", 1, 50n * USDC, 5n * NARA);
    if (acquired.status !== "applied") throw new Error("setup failed");
    const firstSell = applyVirtualSell(acquired.state, {
      id: "sell-1",
      order: 2,
      naraSold: 4n * NARA,
      usdcProceeds: 44n * USDC,
      gasUsdc: 0n,
      explicitCostUsdc: 0n,
    });
    if (firstSell.status !== "applied") throw new Error("sale failed");
    const secondSell = applyVirtualSell(firstSell.state, {
      id: "sell-2",
      order: 3,
      naraSold: 4n * NARA,
      usdcProceeds: 44n * USDC,
      gasUsdc: 0n,
      explicitCostUsdc: 0n,
    });
    expect(secondSell.status).to.equal("blocked");
    if (secondSell.status === "blocked") {
      expect(secondSell.reason).to.equal("INSUFFICIENT_NARA");
    }
  });

  it("rejects negative values, duplicate IDs, and non-increasing order", () => {
    const initial = createStabilizerVirtualPortfolio(100n * USDC);
    expect(() => buy(initial, "bad", 1, -1n, NARA)).to.throw(
      "usdcSpent must be non-negative"
    );
    const acquired = buy(initial, "buy", 1, 10n * USDC, NARA);
    if (acquired.status !== "applied") throw new Error("setup failed");
    expect(() => buy(acquired.state, "buy", 2, 1n, NARA)).to.throw(
      "duplicate action id"
    );
    expect(() => buy(acquired.state, "next", 1, 1n, NARA)).to.throw(
      "order must increase strictly"
    );
  });

  it("blocks a sale when proceeds cannot cover costs and cash is insufficient", () => {
    const initial = createStabilizerVirtualPortfolio(10n * USDC);
    const acquired = buy(initial, "buy", 1, 10n * USDC, NARA);
    if (acquired.status !== "applied") throw new Error("setup failed");
    const result = applyVirtualSell(acquired.state, {
      id: "sell",
      order: 2,
      naraSold: NARA,
      usdcProceeds: 1n * USDC,
      gasUsdc: 2n * USDC,
      explicitCostUsdc: 0n,
    });
    expect(result.status).to.equal("blocked");
    if (result.status === "blocked") {
      expect(result.reason).to.equal("INSUFFICIENT_USDC");
    }
  });
});
