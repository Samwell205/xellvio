import { geoFromHeaders, enrichGeo } from "@/lib/geo.server";

/** Countries that may not pay by card. */
export const CARD_BLOCKED_COUNTRIES = new Set(["NG"]);

export type CardEligibility = {
  allowed: boolean;
  country: string | null;
  reason: "ok" | "blocked_country" | "vpn_detected" | "unknown_location";
  message: string;
};

type NetCheck = { country: string | null; anonymized: boolean };

/** Best-effort VPN / proxy / datacenter detection. Never throws. */
async function inspectNetwork(ip: string | null): Promise<NetCheck> {
  if (!ip) return { country: null, anonymized: false };
  try {
    const res = await fetch(`https://api.ipapi.is/?q=${encodeURIComponent(ip)}`, {
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return { country: null, anonymized: false };
    const j = (await res.json()) as {
      is_vpn?: boolean;
      is_proxy?: boolean;
      is_tor?: boolean;
      is_datacenter?: boolean;
      location?: { country_code?: string };
    };
    return {
      country: j.location?.country_code ?? null,
      anonymized: !!(j.is_vpn || j.is_proxy || j.is_tor || j.is_datacenter),
    };
  } catch {
    return { country: null, anonymized: false };
  }
}

/**
 * Decides whether the current request may pay by card.
 * Blocks Nigeria, blocks VPN/proxy/Tor/datacenter traffic, and blocks
 * requests whose country cannot be determined at all.
 */
export async function checkCardEligibility(headers: Headers): Promise<CardEligibility> {
  const base = geoFromHeaders(headers);
  const geo = await enrichGeo(base);
  const net = await inspectNetwork(geo.ip);
  const country = (geo.country ?? net.country ?? "").toUpperCase() || null;

  if (net.anonymized) {
    return {
      allowed: false,
      country,
      reason: "vpn_detected",
      message:
        "Card payments can't be completed over a VPN, proxy or Tor connection. Please turn it off and try again.",
    };
  }
  if (!country) {
    return {
      allowed: false,
      country: null,
      reason: "unknown_location",
      message:
        "We couldn't verify your location for card payments. Disable any VPN or privacy proxy and try again.",
    };
  }
  if (CARD_BLOCKED_COUNTRIES.has(country)) {
    return {
      allowed: false,
      country,
      reason: "blocked_country",
      message:
        "Card payments aren't available in your country. Please use the bank/card option via our local processor, or pay with crypto.",
    };
  }
  // Mismatch between edge country and network lookup usually means a relay.
  if (geo.country && net.country && geo.country.toUpperCase() !== net.country.toUpperCase()) {
    return {
      allowed: false,
      country,
      reason: "vpn_detected",
      message:
        "Your connection looks like it is routed through a VPN or proxy. Please disable it to pay by card.",
    };
  }
  return { allowed: true, country, reason: "ok", message: "" };
}
