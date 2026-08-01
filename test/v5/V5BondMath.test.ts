import { expect } from "chai";

const UINT128_MAX = (1n << 128n) - 1n;
const UINT256_MAX = (1n << 256n) - 1n;

function payout(
  payment: bigint,
  numerator: bigint,
  denominator: bigint
): bigint {
  return (payment * numerator) / denominator;
}

function priceFloorSatisfied(args: {
  payoutNumerator: bigint;
  payoutDenominator: bigint;
  minimumPaymentPerPayoutNumerator: bigint;
  minimumPaymentPerPayoutDenominator: bigint;
}): boolean {
  return (
    args.payoutDenominator * args.minimumPaymentPerPayoutDenominator >=
    args.payoutNumerator * args.minimumPaymentPerPayoutNumerator
  );
}

function alignedUnlockAt(args: {
  epochOrigin: bigint;
  epochLength: bigint;
  openedAt: bigint;
  requestedDuration: bigint;
}): bigint {
  const candidate = args.openedAt + args.requestedDuration;
  const elapsed = candidate - args.epochOrigin;
  const epoch = (elapsed + args.epochLength - 1n) / args.epochLength;
  return args.epochOrigin + epoch * args.epochLength;
}

describe("V5 bond exact arithmetic model", function () {
  it("proves accepted payment lattices remain exact, split-linear, and completely fillable", function () {
    let configurations = 0;
    let acceptedPayments = 0;

    for (let minimumPayment = 1n; minimumPayment <= 32n; minimumPayment += 1n) {
      for (
        let payoutPerMinimum = 1n;
        payoutPerMinimum <= 32n;
        payoutPerMinimum += 1n
      ) {
        // numerator/denominator is chosen so one minimum payment maps to an
        // exact integer payout. Every accepted payment is a multiple of that
        // minimum, which is the contract's no-rounding lattice invariant.
        const numerator = payoutPerMinimum;
        const denominator = minimumPayment;

        for (let capacityLots = 1n; capacityLots <= 16n; capacityLots += 1n) {
          const capacity = capacityLots * payoutPerMinimum;
          for (
            let maximumPaymentLots = 1n;
            maximumPaymentLots <= 16n;
            maximumPaymentLots += 1n
          ) {
            const largestAcceptedLots =
              capacityLots < maximumPaymentLots
                ? capacityLots
                : maximumPaymentLots;
            for (
              let acceptedLots = 1n;
              acceptedLots <= largestAcceptedLots;
              acceptedLots += 1n
            ) {
              const payment = acceptedLots * minimumPayment;
              const expectedPayout = acceptedLots * payoutPerMinimum;
              const actualPayout = payout(payment, numerator, denominator);
              if (actualPayout !== expectedPayout) {
                throw new Error(
                  "accepted payment rounded away from its exact lattice payout"
                );
              }

              if (acceptedLots > 1n) {
                const firstLots = acceptedLots / 2n;
                const secondLots = acceptedLots - firstLots;
                const splitPayout =
                  payout(firstLots * minimumPayment, numerator, denominator) +
                  payout(secondLots * minimumPayment, numerator, denominator);
                if (splitPayout !== actualPayout) {
                  throw new Error(
                    "split purchases changed the exact linear payout"
                  );
                }
              }

              const residual = capacity - actualPayout;
              if (residual < 0n || residual % payoutPerMinimum !== 0n) {
                throw new Error(
                  "accepted purchase stranded a non-fillable residual capacity"
                );
              }
              acceptedPayments += 1;
            }
            configurations += 1;
          }
        }
      }
    }

    expect(configurations).to.equal(262_144);
    expect(acceptedPayments).to.equal(1_531_904);
  });

  it("matches the intended payment-per-payout floor inequality", function () {
    let comparisons = 0;
    for (
      let payoutNumerator = 1n;
      payoutNumerator <= 25n;
      payoutNumerator += 1n
    ) {
      for (
        let payoutDenominator = 1n;
        payoutDenominator <= 25n;
        payoutDenominator += 1n
      ) {
        for (
          let floorNumerator = 1n;
          floorNumerator <= 25n;
          floorNumerator += 1n
        ) {
          for (
            let floorDenominator = 1n;
            floorDenominator <= 25n;
            floorDenominator += 1n
          ) {
            const crossProductResult = priceFloorSatisfied({
              payoutNumerator,
              payoutDenominator,
              minimumPaymentPerPayoutNumerator: floorNumerator,
              minimumPaymentPerPayoutDenominator: floorDenominator,
            });
            const rationalResult =
              Number(payoutDenominator) / Number(payoutNumerator) >=
              Number(floorNumerator) / Number(floorDenominator);
            if (crossProductResult !== rationalResult) {
              throw new Error(
                "price-floor cross multiplication reversed the intended inequality"
              );
            }
            comparisons += 1;
          }
        }
      }
    }
    expect(comparisons).to.equal(390_625);
  });

  it("keeps every uint128 price-floor cross product inside uint256", function () {
    const largestCrossProduct = UINT128_MAX * UINT128_MAX;
    expect(largestCrossProduct <= UINT256_MAX).to.equal(true);
    expect(largestCrossProduct).to.equal((1n << 256n) - (1n << 129n) + 1n);
  });

  it("keeps epoch alignment within the disclosed one-epoch rounding interval", function () {
    const epochOrigin = 1_000_000n;
    for (let epochLength = 60n; epochLength <= 3_600n; epochLength += 60n) {
      for (let offset = 0n; offset < epochLength; offset += 1n) {
        const openedAt = epochOrigin + 10n * epochLength + offset;
        const requestedDuration = 7n * 24n * 60n * 60n;
        const unlockAt = alignedUnlockAt({
          epochOrigin,
          epochLength,
          openedAt,
          requestedDuration,
        });
        const effectiveDuration = unlockAt - openedAt;
        if (
          effectiveDuration < requestedDuration ||
          effectiveDuration > requestedDuration + epochLength - 1n
        ) {
          throw new Error(
            "epoch alignment escaped its disclosed rounding interval"
          );
        }
      }
    }
  });

  it("treats maximum payment as a transaction bound while lifetime capacity remains the hard exposure cap", function () {
    const minimumPayment = 10n;
    const maximumPayment = 100n;
    const numerator = 2n;
    const denominator = 1n;
    const capacity = 1_000n;
    let totalPayout = 0n;
    let acceptedTransactions = 0;

    while (
      totalPayout + payout(maximumPayment, numerator, denominator) <=
      capacity
    ) {
      const next = payout(maximumPayment, numerator, denominator);
      totalPayout += next;
      acceptedTransactions += 1;
    }

    expect(maximumPayment % minimumPayment).to.equal(0n);
    expect(acceptedTransactions).to.equal(5);
    expect(totalPayout).to.equal(capacity);
    expect(
      totalPayout + payout(maximumPayment, numerator, denominator) > capacity
    ).to.equal(true);
  });
});
