import { z } from "zod";
import { emailPlanFor, FREE_PLAN, FIRST_MONTHS_DISCOUNT } from "./email-plans";

export const EMAIL_BLOCK_TYPES = ["heading", "text", "image", "button", "divider", "spacer", "columns", "quote", "social", "logo"] as const;
export const emailBlockSchema = z.object({
  id: z.string().max(100),
  type: z.enum(EMAIL_BLOCK_TYPES),
  text: z.string().max(10000).default(""),
  url: z.string().max(2000).default(""),
  align: z.enum(["left", "center"]).optional(),
});
export const emailThemeSchema = z.object({
  brand: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#166b4c"),
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#f0f4f2"),
  text: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#34443e"),
  font: z.enum(["Arial", "Georgia", "Verdana", "Trebuchet MS", "Helvetica"]).default("Arial"),
}).partial();
export const EMAIL_MODES = ["design", "plain", "html"] as const;
export type EmailMode = (typeof EMAIL_MODES)[number];
export const emailDraftSchema = z.object({
  id: z.string().uuid(), name: z.string().trim().min(1).max(150),
  subject: z.string().max(200), preheader: z.string().max(250),
  from_name: z.string().max(100), from_email: z.string().max(254), reply_to: z.string().max(254),
  list_id: z.string().uuid().nullable(), postal_address: z.string().max(500),
  blocks: z.array(emailBlockSchema).max(60),
  content_mode: z.enum(EMAIL_MODES).default("design"),
  plain_body: z.string().max(50000).default(""),
  html_body: z.string().max(400000).default(""),
  theme: emailThemeSchema.nullish().transform((t) => t ?? {}),
});
export type EmailDraft = z.infer<typeof emailDraftSchema>;
export type EmailBlock = z.infer<typeof emailBlockSchema>;
export type EmailTheme = z.infer<typeof emailThemeSchema>;
export function resolveTheme(t: EmailTheme | null | undefined) {
  return { brand: t?.brand ?? "#166b4c", background: t?.background ?? "#f0f4f2", text: t?.text ?? "#34443e", font: t?.font ?? "Arial" };
}

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
  try { const u = new URL(value.trim()); return u.protocol === "https:" || u.protocol === "mailto:" ? u.href : ""; } catch { return ""; }
}
const FIRST = /\{\{\s*first_name\s*\}\}/g;
const UNSUB = /\{\{\s*unsubscribe_url\s*\}\}|\[unsubscribe\]|<%asm_group_unsubscribe_raw_url%>|\{\{\s*\{?\s*unsubscribe\s*\}?\s*\}\}/gi;

/** Removes executable or embedded content from tenant HTML; links must be https or mailto. */
export function sanitizeEmailHtml(html: string) {
  let out = html
    .replace(/<!--[\s\S]*?-->/g, (c) => (/\[if /i.test(c) ? c : ""))
    .replace(/<(script|iframe|object|embed|form|input|button|textarea|select|base|meta[^>]*http-equiv)[\s\S]*?(<\/\1>|>)/gi, "")
    .replace(/<\/?(script|iframe|object|embed|form|base)[^>]*>/gi, "")
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\ssrcdoc\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  out = out.replace(/\s(href|src|action|background)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/gi, (_m, attr: string, _v, a, b, c) => {
    const raw = String(a ?? b ?? c ?? "").trim();
    if (UNSUB.test(raw)) { UNSUB.lastIndex = 0; return ` ${attr}="${raw}"`; }
    UNSUB.lastIndex = 0;
    if (/^(#|cid:)/i.test(raw)) return ` ${attr}="${raw}"`;
    const safe = /^(https:|mailto:)/i.test(raw) || (attr.toLowerCase() === "src" && /^data:image\/(png|jpe?g|gif|webp);/i.test(raw)) ? raw : "";
    return ` ${attr}="${safe.replace(/"/g, "&quot;")}"`;
  });
  return out.replace(/expression\s*\(|javascript:/gi, "");
}

/** Plain-text alternative included with every email for deliverability. */
export function htmlToText(html: string) {
  return html.replace(/<(style|head)[\s\S]*?<\/\1>/gi, "")
    .replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, "$2 ($1)")
    .replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|h[1-6]|tr|li|table)>/gi, "\n")
    .replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function linkify(escaped: string, brand: string) {
  return escaped.replace(/https:\/\/[^\s<]+/g, (u) => `<a href="${u}" style="color:${brand}">${u}</a>`);
}
function footer(draft: Pick<EmailDraft, "from_name" | "postal_address">, unsubscribe: string, color = "#66756d", font = "Arial") {
  return `<p style="font:12px/1.6 ${font},sans-serif;color:${color};margin:0">${escapeEmailHtml(draft.from_name)}<br>${escapeEmailHtml(draft.postal_address)}<br><a href="${escapeEmailHtml(unsubscribe)}" style="color:${color}">Unsubscribe</a></p>`;
}

type RenderDraft = Pick<EmailDraft, "blocks" | "preheader" | "postal_address" | "from_name"> & Partial<Pick<EmailDraft, "content_mode" | "plain_body" | "html_body" | "theme">>;

export function renderEmail(draft: RenderDraft, unsubscribe: string, firstName = "") {
  const mode = draft.content_mode ?? "design";
  const th = resolveTheme(draft.theme);
  const f = `${th.font},sans-serif`;
  const nameSafe = escapeEmailHtml(firstName || "there");
  const personalize = (t: string) => escapeEmailHtml(t).replace(FIRST, nameSafe);
  const pre = `<div style="display:none;max-height:0;overflow:hidden">${personalize(draft.preheader)}</div>`;
  if (mode === "html") {
    let html = sanitizeEmailHtml(draft.html_body ?? "").replace(FIRST, nameSafe);
    const hasUnsub = UNSUB.test(html); UNSUB.lastIndex = 0;
    html = html.replace(UNSUB, escapeEmailHtml(unsubscribe));
    if (!hasUnsub) {
      const foot = `<table role="presentation" width="100%"><tr><td align="center" style="padding:24px">${footer(draft, unsubscribe)}</td></tr></table>`;
      html = /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${foot}</body>`) : html + foot;
    }
    if (!/<html/i.test(html)) html = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>${pre}${html}</body></html>`;
    return html;
  }
  if (mode === "plain") {
    const body = linkify(personalize(draft.plain_body ?? ""), th.brand).replace(/\n/g, "<br>");
    return `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;padding:24px;background:#ffffff">${pre}<div style="max-width:600px;font:15px/1.6 ${f};color:#222222">${body}<br><br>${footer(draft, unsubscribe, "#777777", th.font)}</div></body></html>`;
  }
  const sections = draft.blocks.map((b) => {
    const text = personalize(b.text); const url = escapeEmailHtml(safeEmailUrl(b.url));
    const align = b.align === "center" ? "center" : "left";
    if (b.type === "heading") return `<h1 style="font:700 30px/1.25 ${f};color:#172521;margin:24px 0 16px;text-align:${align}">${text}</h1>`;
    if (b.type === "text") return `<p style="font:16px/1.7 ${f};color:${th.text};margin:16px 0;text-align:${align}">${linkify(text, th.brand).replace(/\n/g, "<br>")}</p>`;
    if (b.type === "quote") return `<blockquote style="margin:20px 0;padding:12px 20px;border-left:4px solid ${th.brand};font:italic 18px/1.6 ${f};color:${th.text}">${text.replace(/\n/g, "<br>")}</blockquote>`;
    if (b.type === "image") return url ? `<img src="${url}" alt="${text}" width="552" style="display:block;width:100%;height:auto;border:0;margin:12px 0">` : "";
    if (b.type === "logo") return url ? `<div style="text-align:center;margin:8px 0 16px"><img src="${url}" alt="${text}" width="140" style="display:inline-block;width:140px;height:auto;border:0"></div>` : "";
    if (b.type === "button") return url ? `<table role="presentation" align="${align}" style="margin:20px 0"><tr><td bgcolor="${th.brand}" style="padding:14px 24px;border-radius:6px"><a href="${url}" style="font:700 16px ${f};color:#ffffff;text-decoration:none">${text}</a></td></tr></table><div style="clear:both"></div>` : "";
    if (b.type === "spacer") return '<div style="height:32px;line-height:32px">&nbsp;</div>';
    if (b.type === "columns") {
      const [l = "", r = ""] = b.text.split(/\n-{3,}\n/);
      const col = (t: string) => `<td width="50%" valign="top" style="padding:8px;font:15px/1.6 ${f};color:${th.text}">${linkify(personalize(t), th.brand).replace(/\n/g, "<br>")}</td>`;
      return `<table role="presentation" width="100%" style="margin:12px 0"><tr>${col(l)}${col(r)}</tr></table>`;
    }
    if (b.type === "social") {
      const links = b.text.split("\n").map((line) => { const [label, href] = line.split("|").map((s) => s.trim()); const safe = escapeEmailHtml(safeEmailUrl(href ?? "")); return label && safe ? `<a href="${safe}" style="display:inline-block;margin:0 8px;font:700 14px ${f};color:${th.brand};text-decoration:none">${escapeEmailHtml(label)}</a>` : ""; }).join("");
      return links ? `<div style="text-align:center;margin:20px 0">${links}</div>` : "";
    }
    return '<hr style="border:0;border-top:1px solid #dfe6e2;margin:28px 0">';
  }).join("");
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;background:${th.background}">${pre}<table role="presentation" width="100%" style="background:${th.background}"><tr><td align="center" style="padding:24px 8px"><table role="presentation" width="600" style="max-width:600px;width:100%;background:#ffffff"><tr><td style="padding:24px">${sections}<hr style="border:0;border-top:1px solid #dfe6e2;margin:32px 0">${footer(draft, unsubscribe, "#66756d", th.font)}</td></tr></table></td></tr></table></body></html>`;
}

/** Plain-text part sent alongside the HTML version. */
export function renderEmailText(draft: RenderDraft, unsubscribe: string, firstName = "") {
  if ((draft.content_mode ?? "design") === "plain") {
    return `${(draft.plain_body ?? "").replace(FIRST, firstName || "there")}\n\n${draft.from_name}\n${draft.postal_address}\nUnsubscribe: ${unsubscribe}`;
  }
  const text = htmlToText(renderEmail(draft, unsubscribe, firstName));
  return text.includes(unsubscribe) ? text : `${text}\n\nUnsubscribe: ${unsubscribe}`;
}

export function hasEmailContent(d: Pick<EmailDraft, "content_mode" | "blocks" | "plain_body" | "html_body">) {
  return d.content_mode === "plain" ? !!d.plain_body.trim() : d.content_mode === "html" ? !!d.html_body.trim() : d.blocks.length > 0;
}
