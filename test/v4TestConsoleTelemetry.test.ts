import { expect } from "chai";
import fs from "node:fs";
import path from "node:path";

import {
  redactTelemetryText,
  scrubTelemetryValue,
} from "../tools/v4-test-console/src/telemetry.js";

describe("NARA v4 console telemetry boundary", function () {
  const consoleRoot = path.resolve("tools/v4-test-console");

  it("loads Sentry conditionally and disables PII, tracing, and replay", function () {
    const main = fs.readFileSync(path.join(consoleRoot, "src/main.tsx"), "utf8");
    const telemetry = fs.readFileSync(path.join(consoleRoot, "src/telemetry.ts"), "utf8");

    expect(main).to.include("initializeTelemetry(import.meta.env)");
    expect(telemetry).to.include('await import("@sentry/react")');
    expect(telemetry).to.include("sendDefaultPii: false");
    expect(telemetry).to.include("tracesSampleRate: 0");
    expect(telemetry).to.include("replaysSessionSampleRate: 0");
    expect(telemetry).to.include("replaysOnErrorSampleRate: 0");
    expect(telemetry).to.include("scrubTelemetryValue");
    expect(telemetry).to.include("scrubbed.user = undefined");
  });

  it("documents public configuration without embedding a DSN or auth token", function () {
    const example = fs.readFileSync(path.join(consoleRoot, ".env.example"), "utf8");
    expect(example).to.include("VITE_SENTRY_DSN=");
    expect(example).to.include("VITE_SENTRY_ENVIRONMENT=preview");
    expect(example).to.include("Sentry auth token");
    expect(example).not.to.match(/https:\/\/[^\s]+@[^\s]+sentry/i);
  });

  it("redacts wallet, hash, query, authorization, and user fields", function () {
    const wallet = "0x290286870126c291594BC6Fa4Ed41DC4cF82020B";
    const hash = `0x${"a".repeat(64)}`;
    const text = redactTelemetryText(`${wallet} ${hash} https://rpc.example/v2?key=value authorization=secret-value-here`);
    expect(text).to.include("0x2902…020B");
    expect(text).to.include("0xaaaa…aaaa");
    expect(text).to.include("https://rpc.example/v2?<redacted>");
    expect(text).to.include("authorization=<redacted>");

    expect(scrubTelemetryValue({ user: { id: wallet }, wallet })).to.deep.equal({
      user: "<redacted>",
      wallet: "<redacted>",
    });
  });
});
