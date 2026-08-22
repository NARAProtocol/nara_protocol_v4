import { expect } from "chai";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  isBaseAccountConnector,
  isCoinbaseBrowserEnvironment,
  needsBaseAccountActivation,
  REOWN_PROJECT_ID_ENV_KEYS,
  resolveReownProjectId,
  walletErrorDiagnostic,
} from "../tools/v4-test-console/src/wallets.js";

describe("v4 test console wallet access", function () {
  it("accepts the canonical project ID and both historical environment names", function () {
    expect(REOWN_PROJECT_ID_ENV_KEYS).to.deep.equal([
      "VITE_REOWN_PROJECT_ID",
      "VITE_WALLETCONNECT_PROJECT_ID",
      "VITE_RAINBOW_PROJECT_ID",
    ]);
    expect(resolveReownProjectId({ VITE_REOWN_PROJECT_ID: " canonical " })).to.equal("canonical");
    expect(resolveReownProjectId({ VITE_WALLETCONNECT_PROJECT_ID: "walletconnect" })).to.equal("walletconnect");
    expect(resolveReownProjectId({ VITE_RAINBOW_PROJECT_ID: "rainbow" })).to.equal("rainbow");
    expect(resolveReownProjectId({})).to.equal(null);
  });

  it("separates wallet-app fallbacks from the Base Account passkey route", function () {
    const source = readFileSync(resolve("tools/v4-test-console/src/main.tsx"), "utf8");
    expect(source).to.include('coinbaseWallet.preference = "eoaOnly"');
    expect(source).to.include('{ groupName: "Wallet apps", wallets: walletAppFallbacks }');
    expect(source).to.include('{ groupName: "Base Account (passkey)", wallets: [baseWallet] }');
    expect(source).to.include("uniswapWallet");
    expect(source).to.include("walletConnectWallet");
  });

  it("does not describe the website handoff QR as a wallet connection QR", function () {
    const source = readFileSync(resolve("tools/v4-test-console/src/app.tsx"), "utf8");
    expect(source).to.include("Open site on phone");
    expect(source).to.include("Scan to open this site");
    expect(source).not.to.include("Open on mobile");
  });

  it("directs a pre-submission Base Account failure to the Base app signing surface", function () {
    const appSource = readFileSync(resolve("tools/v4-test-console/src/app.tsx"), "utf8");
    const dockSource = readFileSync(resolve("tools/v4-test-console/src/transaction-progress-dock.tsx"), "utf8");
    expect(appSource).to.include("Do not retry this Coinbase page");
    expect(appSource).to.include("inside the Base app Explorer");
    expect(appSource).to.include("choose Browser Wallet");
    expect(appSource).to.include("verify the address");
    expect(dockSource).to.include("Copy for Base app");
  });

  it("recognizes every Base Account connector identity without matching unrelated wallets", function () {
    expect(isBaseAccountConnector({ id: "baseAccount" })).to.equal(true);
    expect(isBaseAccountConnector({ type: "baseAccount" })).to.equal(true);
    expect(isBaseAccountConnector({ rkDetails: { id: "base" } })).to.equal(true);
    expect(isBaseAccountConnector({ id: "coinbaseWalletSDK" })).to.equal(false);
    expect(isBaseAccountConnector(undefined)).to.equal(false);
  });

  it("detects the Base app injected browser without matching ordinary browsers", function () {
    expect(isCoinbaseBrowserEnvironment({ ethereum: { isCoinbaseBrowser: true } })).to.equal(true);
    expect(isCoinbaseBrowserEnvironment({
      ethereum: { providers: [{}, { isCoinbaseBrowser: true }] },
    })).to.equal(true);
    expect(isCoinbaseBrowserEnvironment({ ethereum: { isCoinbaseWallet: true } })).to.equal(false);
    expect(isCoinbaseBrowserEnvironment(undefined)).to.equal(false);
  });

  it("provides a direct same-address connector switch instead of another transaction retry", function () {
    const appSource = readFileSync(resolve("tools/v4-test-console/src/app.tsx"), "utf8");
    const dockSource = readFileSync(resolve("tools/v4-test-console/src/transaction-progress-dock.tsx"), "utf8");
    expect(appSource).to.include('candidate.id === "injected"');
    expect(appSource).to.include("nextAddress.toLowerCase() !== expectedAddress");
    expect(appSource).to.include("Nothing was submitted");
    expect(appSource).to.include("Base app detected");
    expect(appSource).to.include("Use Base app wallet");
    expect(dockSource).to.include("Switch to Base app wallet");
  });

  it("keeps a code-empty Base Account in first-use mode", function () {
    expect(needsBaseAccountActivation({ baseAccount: true, bytecode: undefined })).to.equal(true);
    expect(needsBaseAccountActivation({ baseAccount: true, bytecode: "0x" })).to.equal(true);
    expect(needsBaseAccountActivation({ baseAccount: true, bytecode: "0xef0100" })).to.equal(false);
    expect(needsBaseAccountActivation({ baseAccount: false, bytecode: "0x" })).to.equal(false);
  });

  it("preserves nested provider error codes while redacting request URLs", function () {
    const diagnostic = walletErrorDiagnostic(new Error("Wallet request failed", {
      cause: {
        code: -32002,
        details: "paymaster failed at https://example.test/secret-client-key",
      },
    }));
    expect(diagnostic.message).to.equal("Wallet request failed");
    expect(diagnostic.code).to.equal("-32002");
    expect(diagnostic.details).to.equal("paymaster failed at [redacted URL]");
  });
});
