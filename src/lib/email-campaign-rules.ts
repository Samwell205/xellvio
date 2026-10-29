import { z } from "zod";
import { emailPlanFor, FREE_PLAN, FIRST_MONTHS_DISCOUNT } from "./email-plans";

export const emailBlockSchema = z.object({
  id: z.string().max(100),
  type: z.enum(["heading", "text", "image", "button", "divider"]),
  text: z.string().max(10000).default(""),
  url: z.string().max(2000).default(""),
});
export const emailDraftSchema = z.object({
  id: z.string().uuid(), name: z.string().trim().min(1).max(150),
  subject: z.string().max(200), preheader: z.string().max(250),
  from_name: z.string().max(100), from_email: z.string().max(254), reply_to: z.string().max(254),
  list_id: z.string().uuid().nullable(), postal_address: z.string().max(500),
  blocks: z.array(emailBlockSchema).max(60),
});
export type EmailDraft = z.infer<typeof emailDraftSchema>;
export type EmailBlock = z.infer<typeof emailBlockSchema>;
export function bundleQuote(plan: "free" | "standard" | "pro", contacts: number, paidMonths = 0) {
  if (plan === "free") return { contacts: FREE_PLAN.contacts, emails: FREE_PLAN.emails, price: 0, charge: 0 };
  const p = emailPlanFor(contacts)[plan];
  return { ...p, emails: Number.isFinite(p.emails) ? p.emails : null,
    charge: Math.round(p.price * (paidMonths < 3 ? 1 - FIRST_MONTHS_DISCOUNT : 1) * 100) / 100 };
}
export function assertEmailQuota(contacts: number, requested: number, used: number, limit: { contacts: number; emails: number | null }) {
  if (contacts > limit.contacts) throw new Error(`Your bundle allows ${limit.contacts.toLocaleString()} email contacts. Choose a larger bundle.`);
  if (limit.emails !== null && requested + used > limit.emails) throw new Error("This send exceeds your monthly email allowance. Choose a larger bundle or wait for renewal.");
}
export function emailSenderDomain(email: string) {
  const valid = z.string().email().safeParse(email.trim().toLowerCase());
  return valid.success ? valid.data.split("@")[1] : null;
}
export function escapeEmailHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] ?? c));
}
export function safeEmailUrl(value: string) {
  try { const u = new URL(value); return u.protocol === "https:" ? u.href : ""; } catch { return ""; }
}
export function renderEmail(draft: Pick<EmailDraft, "blocks" | "preheader" | "postal_address" | "from_name">, unsubscribe: string, firstName = "") {
  const personalize = (t: string) => escapeEmailHtml(t.replace(/\{\{\s*first_name\s*\}\}/g, firstName || "there"));
  const sections = draft.blocks.map((b) => {
    const text = personalize(b.text); const url = escapeEmailHtml(safeEmailUrl(b.url));
    if (b.type === "heading") return `<h1 style="font:700 30px Arial;color:#172521;margin:24px 0 16px">${text}</h1>`;
    if (b.type === "text") return `<p style="font:16px/1.7 Arial;color:#34443e;margin:16px 0">${text.replace(/\n/g, "<br>")}</p>`;
    if (b.type === "image") return url ? `<img src="${url}" alt="${text}" width="552" style="display:block;width:100%;height:auto;border:0">` : "";
    if (b.type === "button") return url ? `<table role="presentation"><tr><td bgcolor="#166b4c" style="padding:14px 24px"><a href="${url}" style="font:700 16px Arial;color:#ffffff;text-decoration:none">${text}</a></td></tr></table>` : "";
    return '<hr style="border:0;border-top:1px solid #dfe6e2;margin:28px 0">';
  }).join("");
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;background:#f0f4f2"><div style="display:none;max-height:0;overflow:hidden">${personalize(draft.preheader)}</div><table role="presentation" width="100%"><tr><td align="center"><table role="presentation" width="600" style="max-width:600px;width:100%;background:#ffffff"><tr><td style="padding:24px">${sections}<hr style="border:0;border-top:1px solid #dfe6e2;margin:32px 0"><p style="font:12px/1.6 Arial;color:#66756d">${escapeEmailHtml(draft.from_name)}<br>${escapeEmailHtml(draft.postal_address)}<br><a href="${escapeEmailHtml(unsubscribe)}">Unsubscribe</a></p></td></tr></table></td></tr></table></body></html>`;
}