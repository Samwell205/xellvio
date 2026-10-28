/**
 * Decision used when the AI safety review cannot run (e.g. AI credits exhausted).
 * Owner decision 2026-10-28: the built-in keyword rules (already passed by the
 * caller) decide. Plain messages send; messages with links or phone numbers —
 * the main phishing vectors — wait for admin review instead of being sent unchecked.
 */
const URL_RE = /\b(?:https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(?:com|net|org|io|co|uk|info|biz|xyz|link|ly|me|app|site|online|shop)\b/i;
const PHONE_RE = /(?:\+?\d[\s().-]?){7,}/;

export type FallbackDecision = { risky: boolean; score: number; message: string };

export function aiUnavailableFallback(body: string): FallbackDecision {
  const text = body ?? "";
  const risky = URL_RE.test(text) || PHONE_RE.test(text);
  return risky
    ? {
        risky: true,
        score: 55,
        message:
          "AI safety review is temporarily unavailable. Messages with links or phone numbers wait for a quick manual review.",
      }
    : { risky: false, score: 0, message: "AI safety review unavailable; checked by built-in rules." };
}
