import { expect } from "chai";
import {
  LIVE_BUY_MATRIX_LEGACY_CONFIRMATION,
  resolveLiveBuyMatrixSchedule,
} from "../scripts/matrix/liveBuyMatrixSchedule.js";

describe("v4 live buy Matrix schedule", () => {
  it("preserves the evidenced six-second schedule and confirmation", () => {
    expect(resolveLiveBuyMatrixSchedule({})).to.deep.equal({
      count: 100,
      delaySeconds: 6,
      executionConfirmation: LIVE_BUY_MATRIX_LEGACY_CONFIRMATION,
      evidenceLabel: "tenmin-100x11",
    });
  });

  it("binds the requested three-second schedule to a distinct confirmation", () => {
    expect(
      resolveLiveBuyMatrixSchedule({ count: "100", delaySeconds: "3" })
    ).to.deep.equal({
      count: 100,
      delaySeconds: 3,
      executionConfirmation: "BUY_NARA_100_X_11_USDC_3_SECOND_MINIMUM",
      evidenceLabel: "3s-100x11",
    });
  });

  it("binds resume count into a non-default confirmation", () => {
    expect(
      resolveLiveBuyMatrixSchedule({ count: "37", delaySeconds: "3" })
        .executionConfirmation
    ).to.equal("BUY_NARA_37_X_11_USDC_3_SECOND_MINIMUM");
  });

  it("reserves legacy identity for the exact 100-buy six-second schedule", () => {
    expect(
      resolveLiveBuyMatrixSchedule({ count: "97", delaySeconds: "6" })
    ).to.deep.equal({
      count: 97,
      delaySeconds: 6,
      executionConfirmation: "BUY_NARA_97_X_11_USDC_6_SECOND_MINIMUM",
      evidenceLabel: "6s-97x11",
    });
  });

  it("rejects unsafe or malformed cadence values", () => {
    expect(() => resolveLiveBuyMatrixSchedule({ delaySeconds: "2" })).to.throw(
      "V4_BUY_MATRIX_DELAY_SECONDS must be an integer between 3 and 60"
    );
    expect(() =>
      resolveLiveBuyMatrixSchedule({ delaySeconds: "3.5" })
    ).to.throw(
      "V4_BUY_MATRIX_DELAY_SECONDS must be an integer between 3 and 60"
    );
  });
});
