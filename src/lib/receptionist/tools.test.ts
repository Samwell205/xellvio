import { afterEach, describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { buildCallTools, verifyCallToolToken } from "./tools.server";

const previousSecret = process.env['APP_USER_CONNECTION_KEY_SECRET'];
afterEach(() => {
  if (previousSecret === undefined) delete process.env['APP_USER_CONNECTION_KEY_SECRET'];
  else process.env['APP_USER_CONNECTION_KEY_SECRET'] = previousSecret;
});
describe("call-scoped action authentication", () => {
  it("only offers human handoff when the business configured a destination", () => {
    process.env['APP_USER_CONNECTION_KEY_SECRET'] = "unit-test-only";
    const hasTransfer = (config: unknown) => buildCallTools("call-a", "https://xellvio.com", config).some(t => (t.webhook as { name?: string } | undefined)?.name === "transfer_to_team");
    expect(hasTransfer({})).toBe(false);
    expect(hasTransfer({handoffNumber:"+447700900123"})).toBe(true);
  });
  it("rejects another call's token", () => {
    process.env['APP_USER_CONNECTION_KEY_SECRET'] = "unit-test-only";
    const token = createHmac("sha256", "unit-test-only").update("xellvio-voice-call:call-a").digest("hex");
    expect(verifyCallToolToken("call-a", token)).toBe(true);
    expect(verifyCallToolToken("call-b", token)).toBe(false);
  });
  it("fails closed when authentication configuration is missing", () => {
    delete process.env['APP_USER_CONNECTION_KEY_SECRET'];
    expect(verifyCallToolToken("call-a", "a".repeat(64))).toBe(false);
    expect(verifyCallToolToken("call-a", null)).toBe(false);
  });
});