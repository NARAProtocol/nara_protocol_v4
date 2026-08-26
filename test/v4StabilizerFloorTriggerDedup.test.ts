import { expect } from "chai";
import { shouldRecordTriggerSkip } from "../scripts/matrix/stabilizerFloorTriggerDedup.js";

describe("v4 Phase 1 stabilizer skipped-trigger deduplication", () => {
  it("records a repeated side and transaction only once per scan", () => {
    const seen = new Set<string>();

    expect(shouldRecordTriggerSkip(seen, "floor", "0xAbC")).to.equal(true);
    expect(shouldRecordTriggerSkip(seen, "floor", "0xaBc")).to.equal(false);
  });

  it("keeps pump and floor skips distinct within one transaction", () => {
    const seen = new Set<string>();

    expect(shouldRecordTriggerSkip(seen, "pump", "0xabc")).to.equal(true);
    expect(shouldRecordTriggerSkip(seen, "floor", "0xabc")).to.equal(true);
  });

  it("does not suppress distinct transaction hashes", () => {
    const seen = new Set<string>();

    expect(shouldRecordTriggerSkip(seen, "floor", "0xabc")).to.equal(true);
    expect(shouldRecordTriggerSkip(seen, "floor", "0xdef")).to.equal(true);
  });

  it("starts fresh when the next scan supplies a new set", () => {
    expect(shouldRecordTriggerSkip(new Set(), "floor", "0xabc")).to.equal(true);
    expect(shouldRecordTriggerSkip(new Set(), "floor", "0xabc")).to.equal(true);
  });
});
