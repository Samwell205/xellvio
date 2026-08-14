// Helpers for campaign MMS media URLs. Pure — safe on client and server.

/** Extract the storage object path from any campaign-media URL, if present. */
export function campaignMediaObjectPath(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = /\/storage\/v1\/object\/(?:sign|public|authenticated)\/campaign-media\/([^?#]+)/.exec(url);
  if (m?.[1]) return decodeURIComponent(m[1]);
  const p = /\/api\/public\/campaign-media\/([^?#]+)/.exec(url);
  return p?.[1] ? decodeURIComponent(p[1]) : null;
}

/**
 * Rewrite a stored/signed campaign-media URL into our short, token-free public
 * delivery URL. Signed storage links carry a ~400 character query token and an
 * expiry — both of which can cause the carrier's MMS gateway to drop the
 * attachment, leaving recipients with text only. Anything we don't recognise is
 * returned unchanged (tenants can paste their own hosted image URL).
 */
export function publicCampaignMediaUrl(url: string | null | undefined, baseUrl: string): string {
  if (!url) return "";
  const path = campaignMediaObjectPath(url);
  if (!path) return url;
  const base = baseUrl.replace(/\/$/, "");
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  return `${base}/api/public/campaign-media/${encoded}`;
}
