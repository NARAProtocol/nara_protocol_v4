export interface VirtualInventoryLot {
  readonly id: string;
  readonly acquiredOrder: number;
  readonly remainingNaraWei: bigint;
  readonly remainingBasisUsdc: bigint;
}

export interface StabilizerVirtualPortfolio {
  readonly usdcBalance: bigint;
  readonly naraBalance: bigint;
  readonly lots: readonly VirtualInventoryLot[];
  readonly realizedPnlUsdc: bigint;
  readonly lastActionOrder: number | null;
  readonly appliedActionIds: readonly string[];
}

interface OrderedAction {
  readonly id: string;
  readonly order: number;
}

export interface VirtualBuy extends OrderedAction {
  readonly usdcSpent: bigint;
  readonly naraReceived: bigint;
  readonly gasUsdc: bigint;
  readonly explicitCostUsdc: bigint;
}

export interface VirtualSell extends OrderedAction {
  readonly naraSold: bigint;
  readonly usdcProceeds: bigint;
  readonly gasUsdc: bigint;
  readonly explicitCostUsdc: bigint;
}

export type VirtualPortfolioBlockReason =
  | "INSUFFICIENT_USDC"
  | "INSUFFICIENT_NARA";

export interface VirtualPortfolioApplied<TDetails> {
  readonly status: "applied";
  readonly state: StabilizerVirtualPortfolio;
  readonly details: TDetails;
}

export interface VirtualPortfolioBlocked {
  readonly status: "blocked";
  readonly state: StabilizerVirtualPortfolio;
  readonly reason: VirtualPortfolioBlockReason;
}

export interface VirtualBuyDetails {
  readonly totalDebitUsdc: bigint;
  readonly lot: VirtualInventoryLot;
}

export interface VirtualSellDetails {
  readonly grossProceedsUsdc: bigint;
  readonly netProceedsUsdc: bigint;
  readonly consumedBasisUsdc: bigint;
  readonly realizedPnlUsdc: bigint;
}

const requireNonNegative = (name: string, value: bigint): void => {
  if (typeof value !== "bigint") throw new Error(`${name} must be a bigint`);
  if (value < 0n) throw new Error(`${name} must be non-negative`);
};

function validateAction(
  state: StabilizerVirtualPortfolio,
  action: OrderedAction
): void {
  if (action.id.trim() === "") throw new Error("id must not be empty");
  if (!Number.isSafeInteger(action.order) || action.order < 0) {
    throw new Error("order must be a non-negative safe integer");
  }
  if (state.appliedActionIds.includes(action.id)) {
    throw new Error(`duplicate action id: ${action.id}`);
  }
  if (state.lastActionOrder !== null && action.order <= state.lastActionOrder) {
    throw new Error("order must increase strictly");
  }
}

function appliedState(
  state: StabilizerVirtualPortfolio,
  action: OrderedAction,
  changes: Pick<
    StabilizerVirtualPortfolio,
    "usdcBalance" | "naraBalance" | "lots" | "realizedPnlUsdc"
  >
): StabilizerVirtualPortfolio {
  return {
    ...changes,
    lastActionOrder: action.order,
    appliedActionIds: [...state.appliedActionIds, action.id],
  };
}

export function createStabilizerVirtualPortfolio(
  initialUsdcBalance: bigint,
  seedLots: readonly VirtualInventoryLot[] = []
): StabilizerVirtualPortfolio {
  requireNonNegative("initialUsdcBalance", initialUsdcBalance);
  let naraBalance = 0n;
  let previousOrder: number | null = null;
  const lotIds = new Set<string>();
  const lots = seedLots.map((lot) => {
    if (lot.id.trim() === "") throw new Error("seed lot id must not be empty");
    if (lotIds.has(lot.id)) throw new Error(`duplicate seed lot id: ${lot.id}`);
    if (!Number.isSafeInteger(lot.acquiredOrder) || lot.acquiredOrder < 0) {
      throw new Error(
        "seed lot acquiredOrder must be a non-negative safe integer"
      );
    }
    if (previousOrder !== null && lot.acquiredOrder <= previousOrder) {
      throw new Error("seed lot acquiredOrder must increase strictly");
    }
    requireNonNegative("seed lot remainingNaraWei", lot.remainingNaraWei);
    if (lot.remainingNaraWei === 0n) {
      throw new Error("seed lot remainingNaraWei must be positive");
    }
    requireNonNegative("seed lot remainingBasisUsdc", lot.remainingBasisUsdc);
    lotIds.add(lot.id);
    previousOrder = lot.acquiredOrder;
    naraBalance += lot.remainingNaraWei;
    return { ...lot };
  });
  return {
    usdcBalance: initialUsdcBalance,
    naraBalance,
    lots,
    realizedPnlUsdc: 0n,
    lastActionOrder: previousOrder,
    appliedActionIds: [...lotIds],
  };
}

export function applyVirtualBuy(
  state: StabilizerVirtualPortfolio,
  buy: VirtualBuy
): VirtualPortfolioApplied<VirtualBuyDetails> | VirtualPortfolioBlocked {
  validateAction(state, buy);
  requireNonNegative("usdcSpent", buy.usdcSpent);
  requireNonNegative("naraReceived", buy.naraReceived);
  requireNonNegative("gasUsdc", buy.gasUsdc);
  requireNonNegative("explicitCostUsdc", buy.explicitCostUsdc);
  if (buy.naraReceived === 0n) throw new Error("naraReceived must be positive");

  const totalDebitUsdc = buy.usdcSpent + buy.gasUsdc + buy.explicitCostUsdc;
  if (totalDebitUsdc > state.usdcBalance) {
    return { status: "blocked", state, reason: "INSUFFICIENT_USDC" };
  }

  const lot: VirtualInventoryLot = {
    id: buy.id,
    acquiredOrder: buy.order,
    remainingNaraWei: buy.naraReceived,
    remainingBasisUsdc: totalDebitUsdc,
  };
  const nextState = appliedState(state, buy, {
    usdcBalance: state.usdcBalance - totalDebitUsdc,
    naraBalance: state.naraBalance + buy.naraReceived,
    lots: [...state.lots, lot],
    realizedPnlUsdc: state.realizedPnlUsdc,
  });
  return {
    status: "applied",
    state: nextState,
    details: { totalDebitUsdc, lot },
  };
}

export function applyVirtualSell(
  state: StabilizerVirtualPortfolio,
  sell: VirtualSell
): VirtualPortfolioApplied<VirtualSellDetails> | VirtualPortfolioBlocked {
  validateAction(state, sell);
  requireNonNegative("naraSold", sell.naraSold);
  requireNonNegative("usdcProceeds", sell.usdcProceeds);
  requireNonNegative("gasUsdc", sell.gasUsdc);
  requireNonNegative("explicitCostUsdc", sell.explicitCostUsdc);
  if (sell.naraSold === 0n) throw new Error("naraSold must be positive");
  if (sell.naraSold > state.naraBalance) {
    return { status: "blocked", state, reason: "INSUFFICIENT_NARA" };
  }

  const costsUsdc = sell.gasUsdc + sell.explicitCostUsdc;
  const nextUsdcBalance = state.usdcBalance + sell.usdcProceeds - costsUsdc;
  if (nextUsdcBalance < 0n) {
    return { status: "blocked", state, reason: "INSUFFICIENT_USDC" };
  }

  let remainingToSell = sell.naraSold;
  let consumedBasisUsdc = 0n;
  const nextLots: VirtualInventoryLot[] = [];
  for (const lot of state.lots) {
    if (remainingToSell === 0n) {
      nextLots.push(lot);
      continue;
    }
    const consumedNara =
      remainingToSell < lot.remainingNaraWei
        ? remainingToSell
        : lot.remainingNaraWei;
    const consumedBasis =
      consumedNara === lot.remainingNaraWei
        ? lot.remainingBasisUsdc
        : (lot.remainingBasisUsdc * consumedNara) / lot.remainingNaraWei;
    consumedBasisUsdc += consumedBasis;
    remainingToSell -= consumedNara;

    const remainingNaraWei = lot.remainingNaraWei - consumedNara;
    if (remainingNaraWei > 0n) {
      nextLots.push({
        ...lot,
        remainingNaraWei,
        remainingBasisUsdc: lot.remainingBasisUsdc - consumedBasis,
      });
    }
  }
  if (remainingToSell !== 0n) {
    throw new Error("portfolio lot invariant violated");
  }

  const netProceedsUsdc = sell.usdcProceeds - costsUsdc;
  const realizedPnlUsdc = netProceedsUsdc - consumedBasisUsdc;
  const nextState = appliedState(state, sell, {
    usdcBalance: nextUsdcBalance,
    naraBalance: state.naraBalance - sell.naraSold,
    lots: nextLots,
    realizedPnlUsdc: state.realizedPnlUsdc + realizedPnlUsdc,
  });
  return {
    status: "applied",
    state: nextState,
    details: {
      grossProceedsUsdc: sell.usdcProceeds,
      netProceedsUsdc,
      consumedBasisUsdc,
      realizedPnlUsdc,
    },
  };
}
