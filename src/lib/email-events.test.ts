import { createSign, generateKeyPairSync, verify } from "node:crypto";
import { describe, expect, it } from "vitest";
import { derToRaw } from "./email-events.server";
describe("signed marketing email events", () => {
  it("converts real DER signatures for WebCrypto without changing the signed message", () => {
    const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    const signed = createSign("SHA256").update("123[]").sign(privateKey);
    const raw = derToRaw(signed);
    expect(verify("SHA256", Buffer.from("123[]"), { key: publicKey, dsaEncoding: "ieee-p1363" }, raw)).toBe(true);
    expect(verify("SHA256", Buffer.from("123[changed]"), { key: publicKey, dsaEncoding: "ieee-p1363" }, raw)).toBe(false);
  });
  it("rejects malformed signatures", () => expect(() => derToRaw(new Uint8Array([0, 1, 2]))).toThrow());
});