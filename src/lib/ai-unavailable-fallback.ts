/**
 * Decision used when the AI safety review cannot run (e.g. AI credits exhausted).
 * Owner decision 2026-10-28: never wait for admin approval. The built-in keyword
 * rules (already run by the caller) decide: a rule hit is blocked with its
 * reason shown to the tenant; anything else sends normally.
 */
export type FallbackDecision = { risky: boolean; score: number; message: string };

export function aiUnavailableFallback(_body: string): FallbackDecision {
  return { risky: false, score: 0, message: "AI safety review unavailable; checked by built-in rules." };
}
