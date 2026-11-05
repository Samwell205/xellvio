// Pure rules for the pre-send destination guard. When the carrier rejects a
// send because texting to that destination is switched off (Twilio 21408),
// every further send to the same region would be rejected too and lower the
// carrier health score. We remember the region for a while and fail those
// recipients locally, without contacting the carrier. After the window one
// real attempt is allowed again, so enabling the region clears the block.

export const GEO_BLOCK_MS = 6 * 60 * 60 * 1000;
const GEO_CODES = new Set(["21408", "21612"]);

export function isGeoPermissionError(code: string | null | undefined): boolean {
  if (!code) return false;
  return GEO_CODES.has(String(code).replace(/^TW/i, ""));
}

/** North America is split by area code (e.g. Puerto Rico +1787); elsewhere by leading digits. */
export function geoRegionKey(phone: string | null | undefined): string | null {
  const p = String(phone ?? "").trim();
  if (!/^\+[1-9]\d{6,14}$/.test(p)) return null;
  if (p.startsWith("+1")) return p.slice(0, 5);
  return p.slice(0, 4);
}

export function isGeoBlocked(blocks: Record<string, string> | null | undefined, phone: string, nowMs: number): boolean {
  const key = geoRegionKey(phone);
  if (!key || !blocks) return false;
  const at = Date.parse(blocks[key] ?? "");
  return Number.isFinite(at) && nowMs - at < GEO_BLOCK_MS;
}

/** Returns blocks with this phone's region recorded and expired entries dropped. */
export function withGeoBlock(blocks: Record<string, string> | null | undefined, phone: string, nowMs: number): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(blocks ?? {})) {
    const at = Date.parse(v);
    if (Number.isFinite(at) && nowMs - at < GEO_BLOCK_MS) out[k] = v;
  }
  const key = geoRegionKey(phone);
  if (key) out[key] = new Date(nowMs).toISOString();
  return out;
}
