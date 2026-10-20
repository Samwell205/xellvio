import { describe, it, expect } from "vitest";
import { generateKeyPairSync, sign } from "node:crypto";
import { verifyVoiceSignature } from "./voice-signature.server";
describe("voice webhook verification", () => {
  const pair = generateKeyPairSync("ed25519");
  const key = pair.publicKey.export({ format: "der", type: "spki" }).subarray(-32).toString("base64");
  const raw = '{"data":{"id":"event-1"}}', ts = "1792500000";
  const signature = sign(null, Buffer.from(`${ts}|${raw}`), pair.privateKey).toString("base64");
  it("accepts the signed raw body", () => expect(verifyVoiceSignature(raw, signature, ts, key, Number(ts)*1000)).toBe(true));
  it("rejects changed content", () => expect(verifyVoiceSignature(raw+" ", signature, ts, key, Number(ts)*1000)).toBe(false));
  it("rejects replay outside five minutes", () => expect(verifyVoiceSignature(raw, signature, ts, key, (Number(ts)+301)*1000)).toBe(false));
  it("fails closed without valid authentication", () => expect(verifyVoiceSignature(raw, null, ts, key, Number(ts)*1000)).toBe(false));
});