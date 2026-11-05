import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_maps";

function creds() {
  const lovable = process.env["LOVABLE_API_KEY"];
  const maps = process.env["GOOGLE_MAPS_API_KEY"];
  if (!lovable || !maps) throw new Error("Address search is not configured");
  return { Authorization: `Bearer ${lovable}`, "X-Connection-Api-Key": maps };
}

export const suggestAddresses = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { input: string; sessionToken: string }) => {
    const input = String(d?.input ?? "").trim().slice(0, 200);
    const sessionToken = String(d?.sessionToken ?? "").slice(0, 64);
    return { input, sessionToken };
  })
  .handler(async ({ data }) => {
    if (data.input.length < 3) return { suggestions: [] as { placeId: string; text: string }[] };
    const res = await fetch(`${GATEWAY_URL}/places/v1/places:autocomplete`, {
      method: "POST",
      headers: {
        ...creds(),
        "Content-Type": "application/json",
        "X-Goog-FieldMask": "suggestions.placePrediction.placeId,suggestions.placePrediction.text.text",
      },
      body: JSON.stringify({ input: data.input, sessionToken: data.sessionToken || undefined }),
    });
    if (!res.ok) {
      console.error(`Address autocomplete failed [${res.status}]: ${await res.text()}`);
      return { suggestions: [] };
    }
    const json = (await res.json()) as {
      suggestions?: { placePrediction?: { placeId?: string; text?: { text?: string } } }[];
    };
    const suggestions = (json.suggestions ?? [])
      .map((s) => ({ placeId: s.placePrediction?.placeId ?? "", text: s.placePrediction?.text?.text ?? "" }))
      .filter((s) => s.placeId && s.text)
      .slice(0, 6);
    return { suggestions };
  });

export const getAddressDetails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { placeId: string; sessionToken: string }) => {
    const placeId = String(d?.placeId ?? "");
    if (!/^[A-Za-z0-9_-]{5,300}$/.test(placeId)) throw new Error("Invalid place");
    return { placeId, sessionToken: String(d?.sessionToken ?? "").slice(0, 64) };
  })
  .handler(async ({ data }) => {
    const qs = data.sessionToken ? `?sessionToken=${encodeURIComponent(data.sessionToken)}` : "";
    const res = await fetch(`${GATEWAY_URL}/places/v1/places/${data.placeId}${qs}`, {
      headers: { ...creds(), "X-Goog-FieldMask": "formattedAddress,addressComponents" },
    });
    if (!res.ok) {
      console.error(`Address details failed [${res.status}]: ${await res.text()}`);
      return { address: null as string | null, parts: null as AddressParts | null };
    }
    const json = (await res.json()) as {
      formattedAddress?: string;
      addressComponents?: { longText?: string; shortText?: string; types?: string[] }[];
    };
    const c = json.addressComponents ?? [];
    const get = (t: string, short = false) => {
      const x = c.find((a) => a.types?.includes(t));
      return (short ? x?.shortText : x?.longText) ?? "";
    };
    const parts: AddressParts = {
      line1: [get("street_number"), get("route")].filter(Boolean).join(" ") || get("premise"),
      line2: get("subpremise"),
      city: get("locality") || get("postal_town") || get("administrative_area_level_2"),
      state: get("administrative_area_level_1"),
      postcode: get("postal_code"),
      country: get("country"),
    };
    return { address: json.formattedAddress ?? null, parts };
  });

export type AddressParts = { line1: string; line2: string; city: string; state: string; postcode: string; country: string };
