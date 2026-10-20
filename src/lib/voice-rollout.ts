export const VOICE_PILOT_EMAIL = "samueldurosinmi69@gmail.com";
export const VOICE_COMING_SOON = "AI voice is coming soon for your business.";
export function isVoicePilotIdentity(user: { email?: string; email_confirmed_at?: string } | null | undefined): boolean {
  return Boolean(user?.email_confirmed_at && user.email?.trim().toLowerCase() === VOICE_PILOT_EMAIL);
}