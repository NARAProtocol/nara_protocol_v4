import { expect } from "chai";
import { readFileSync } from "node:fs";

describe("v4 one-click live buy Matrix launcher", () => {
  it("binds one reviewed click to the exact 100x11 three-second minimum run", () => {
    const source = readFileSync(
      "scripts/matrix/start-100-buy-matrix-one-click.ps1",
      "utf8"
    );

    expect(source).to.contain("100 separate NARA buys x 11.00 USDC");
    expect(source).to.contain("Maximum gross USDC input: 1,100.00 USDC");
    expect(source).to.contain(
      "Minimum interval between submissions: 3 seconds"
    );
    expect(source).to.contain("Hedging: OFF");
    expect(source).to.contain("MessageBoxDefaultButton]::Button2");
    expect(source).to.contain("$env:V4_TEN_MIN_BUY_COUNT = '100'");
    expect(source).to.contain("$env:V4_BUY_MATRIX_DELAY_SECONDS = '3'");
    expect(source).to.contain(
      "$env:V4_LIVE_TEN_MIN_BUY_CONFIRMATION = 'BUY_NARA_100_X_11_USDC_3_SECOND_MINIMUM'"
    );
    expect(source).to.contain("runV4LiveTenMinBuyMatrix.ts --execute");
  });

  it("blocks duplicate launchers and defaults the review dialog to No", () => {
    const source = readFileSync(
      "scripts/matrix/start-100-buy-matrix-one-click.ps1",
      "utf8"
    );

    expect(source).to.contain("Local\\NARA_100_BUY_MATRIX");
    expect(source).to.contain("$mutex.WaitOne(0)");
    expect(source).to.contain("A NARA buy Matrix launcher is already running");
    expect(source).to.contain("MessageBoxDefaultButton]::Button2");
    expect(source).to.contain("No transaction was constructed or sent");
  });
});
