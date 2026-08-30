/** Best-effort request geolocation from edge headers, with an IP lookup fallback. */
export type RequestGeo = {
  ip: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
};

export function geoFromHeaders(headers: Headers): RequestGeo {
  const ip =
    headers.get("cf-connecting-ip") ??
    headers.get("x-real-ip") ??
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    null;
  const dec = (v: string | null) => {
    if (!v) return null;
    try {
      return decodeURIComponent(v);
    } catch {
      return v;
    }
  };
  return {
    ip,
    country: headers.get("cf-ipcountry") ?? dec(headers.get("x-vercel-ip-country")),
    region: dec(headers.get("cf-region") ?? headers.get("x-vercel-ip-country-region")),
    city: dec(headers.get("cf-ipcity") ?? headers.get("x-vercel-ip-city")),
  };
}

/** Fills in missing city/region/country via a free IP geolocation API. Never throws. */
export async function enrichGeo(geo: RequestGeo): Promise<RequestGeo> {
  if (!geo.ip || (geo.city && geo.country)) return geo;
  try {
    const res = await fetch(
      `http://ip-api.com/json/${encodeURIComponent(geo.ip)}?fields=status,countryCode,regionName,city`,
      { signal: AbortSignal.timeout(3000) },
    );
    if (!res.ok) return geo;
    const j = (await res.json()) as {
      status?: string;
      countryCode?: string;
      regionName?: string;
      city?: string;
    };
    if (j.status !== "success") return geo;
    return {
      ip: geo.ip,
      country: geo.country ?? j.countryCode ?? null,
      region: geo.region ?? j.regionName ?? null,
      city: geo.city ?? j.city ?? null,
    };
  } catch {
    return geo;
  }
}
