import drop from "@/assets/email-drop.jpg.asset.json";
import table from "@/assets/email-table.jpg.asset.json";
import party from "@/assets/email-afterhours.jpg.asset.json";
import type { EmailDraft } from "./email-campaign-rules";

export function emailTemplateCategory(name: string, category = "") {
  if (category && !["Ready-made", "Saved", "General"].includes(category)) return category;
  if (/welcome|onboard|confirmation/i.test(name)) return "Welcome & onboarding";
  if (/abandon|receipt|purchase|order|shipping/i.test(name)) return "Orders & follow-up";
  if (/black friday|sale|deal|promo|offer/i.test(name)) return "Sales & promotions";
  if (/event|invitation|holiday|contest/i.test(name)) return "Events & seasonal";
  if (/food|restaurant|hospitality|hotel/i.test(name)) return "Food & hospitality";
  if (/launch|product|announcement/i.test(name)) return "Product launches";
  if (/newsletter|digest|update/i.test(name)) return "Newsletters";
  return "General";
}

// Original campaign content: palettes belong to these emails, not the application theme.
const palettes = {
  drop: { background: "#d8fd43", ink: "#161616", accent: "#161616" },
  table: { background: "#ff6b78", ink: "#441823", accent: "#441823" },
  party: { background: "#101010", ink: "#f4f5f0", accent: "#d8fd43" },
};
function design(palette: keyof typeof palettes, eyebrow: string, headline: string, image: string, copy: string, cta: string) {
  const p = palettes[palette];
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>@media(max-width:600px){.headline{font-size:48px!important}.pad{padding:28px!important}}</style></head><body style="margin:0;background:${p.background}"><table width="100%" role="presentation" cellspacing="0" cellpadding="0"><tr><td align="center"><table width="600" role="presentation" style="width:100%;max-width:600px;color:${p.ink};font-family:Arial,sans-serif" cellspacing="0" cellpadding="0"><tr><td class="pad" style="padding:36px 40px 24px"><p style="font-size:13px;font-weight:700;margin:0 0 28px">YOUR BRAND &nbsp; / &nbsp; ${eyebrow}</p><h1 class="headline" style="font-size:76px;line-height:1.02;margin:0;font-weight:900">${headline}</h1></td></tr><tr><td><img src="${image}" alt="${eyebrow}" width="600" style="display:block;width:100%;height:auto;border:0"></td></tr><tr><td class="pad" style="padding:36px 40px"><p style="font-size:20px;line-height:1.6;margin:0 0 28px">Hi {{first_name}},<br>${copy}</p><table role="presentation"><tr><td style="background:${p.accent};padding:18px 28px"><a href="https://xellvio.com" style="color:${p.background};font-size:16px;font-weight:700;text-decoration:none">${cta} &rarr;</a></td></tr></table><p style="font-size:12px;margin:32px 0 0">Made for a little more extraordinary.</p></td></tr></table></td></tr></table></body></html>`;
}
export const CREATIVE_EMAIL_TEMPLATES: { id: string; name: string; category: string; values: Partial<EmailDraft> }[] = [
  { id: "studio-drop", name: "The Electric Drop", category: "Product launches", values: { content_mode: "html", blocks: [], plain_body: "", theme: {}, html_body: design("drop", "NEW COLLECTION", "NOT MADE<br>TO BLEND IN.", drop.url, "A fresh perspective. A fearless new collection. Meet your next everyday obsession.", "Explore the collection") } },
  { id: "studio-table", name: "Fresh, Loud & Lovely", category: "Food & hospitality", values: { content_mode: "html", blocks: [], plain_body: "", theme: {}, html_body: design("table", "FRESH THIS WEEK", "GOOD TASTE.<br>BIG ENERGY.", table.url, "Fresh picks, bright flavors and a little something worth sharing. See what is new on the menu.", "Discover the menu") } },
  { id: "studio-party", name: "After Hours", category: "Events & seasonal", values: { content_mode: "html", blocks: [], plain_body: "", theme: {}, html_body: design("party", "YOU ARE INVITED", "MAKE IT<br>A NIGHT.", party.url, "Good people. Great sound. One unforgettable evening. Join us for something out of the ordinary.<br><br>Add your date, time and venue here.", "See event details") } },
];