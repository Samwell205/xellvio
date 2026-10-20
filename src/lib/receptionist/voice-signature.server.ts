import { verify } from "node:crypto";
export function verifyVoiceSignature(raw: string, signature: string | null, timestamp: string | null, publicKey: string, now = Date.now()): boolean {
  if (!signature || !timestamp || !/^\d{10}$/.test(timestamp) || Math.abs(now / 1000 - Number(timestamp)) > 300) return false;
  try {
    const key = Buffer.from(publicKey, "base64"), sig = Buffer.from(signature, "base64");
    if (key.length !== 32 || sig.length !== 64) return false;
    const der = Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), key]);
    return verify(null, Buffer.from(`${timestamp}|${raw}`), { key: der, format: "der", type: "spki" }, sig);
  } catch { return false; }
}