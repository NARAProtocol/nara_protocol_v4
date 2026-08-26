import { expect } from "chai";
import { calculatePersistence } from "../scripts/matrix/stabilizerPersistence.js";

describe("v4 stabilizer price persistence", () => {
  it("measures partial pump persistence", () => {
    expect(
      calculatePersistence(1, 1.2, [
        { offsetBlocks: 1, midUsdcPerNara: 1.2 },
        { offsetBlocks: 5, midUsdcPerNara: 1.1 },
        { offsetBlocks: 20, midUsdcPerNara: 1 },
      ])
    ).to.deep.equal({
      referenceMidUsdcPerNara: 1,
      triggerMidUsdcPerNara: 1.2,
      triggerMoveBps: 2_000,
      points: [
        {
          offsetBlocks: 1,
          midUsdcPerNara: 1.2,
          remainingMoveBps: 2_000,
          persistenceBps: 10_000,
        },
        {
          offsetBlocks: 5,
          midUsdcPerNara: 1.1,
          remainingMoveBps: 1_000,
          persistenceBps: 5_000,
        },
        {
          offsetBlocks: 20,
          midUsdcPerNara: 1,
          remainingMoveBps: 0,
          persistenceBps: 0,
        },
      ],
    });
  });

  it("uses the same signed persistence measure for a dump", () => {
    const result = calculatePersistence(1, 0.8, [
      { offsetBlocks: 1, midUsdcPerNara: 0.7 },
      { offsetBlocks: 5, midUsdcPerNara: 0.9 },
      { offsetBlocks: 20, midUsdcPerNara: 1.05 },
    ]);

    expect(result.triggerMoveBps).to.equal(-2_000);
    expect(result.points.map((point) => point.persistenceBps)).to.deep.equal([
      15_000, 5_000, -2_500,
    ]);
  });

  it("returns null persistence when the trigger block has no price move", () => {
    const result = calculatePersistence(2, 2, [
      { offsetBlocks: 1, midUsdcPerNara: 2.1 },
    ]);
    expect(result.triggerMoveBps).to.equal(0);
    expect(result.points[0].persistenceBps).to.equal(null);
  });

  it("rejects invalid prices and duplicate offsets", () => {
    expect(() => calculatePersistence(0, 1, [])).to.throw(
      "referenceMidUsdcPerNara must be a positive finite number"
    );
    expect(() =>
      calculatePersistence(1, 1.1, [
        { offsetBlocks: 1, midUsdcPerNara: 1.05 },
        { offsetBlocks: 1, midUsdcPerNara: 1.04 },
      ])
    ).to.throw("duplicate persistence offset: 1");
  });
});
