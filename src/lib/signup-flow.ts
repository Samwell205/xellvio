export function signupNeedsConfirmation(data: { session: unknown }): boolean {
  return !data.session;
}

/**
 * When the email already belongs to an account, the auth service hides that fact:
 * it returns success with no session, a user with zero identities, and sends NO
 * email. Detect it so the page never claims a code was emailed.
 */
export function signupEmailAlreadyRegistered(data: {
  session: unknown;
  user?: { identities?: unknown[] | null } | null;
}): boolean {
  return !data.session && Array.isArray(data.user?.identities) && data.user!.identities!.length === 0;
}

export const EXISTING_ACCOUNT_MESSAGE =
  "An account with this email already exists, so no new code was sent. Sign in instead, or use “Forgot password” to reset it.";

export function authCooldownSeconds(error: unknown): number {
  if (!error || typeof error !== "object") return 0;
  const value = error as { message?: string; code?: string; status?: number };
  const message = value.message ?? "";
  const seconds = message.match(/after\s+(\d+)\s+seconds?/i)?.[1];
  if (seconds) return Math.max(1, Number(seconds));
  if (value.status === 429 || value.code === "over_email_send_rate_limit") return 60;
  return 0;
}

export const EMAIL_CONFIRMATION_MESSAGE =
  "We emailed you a verification code. Check your inbox and spam folder, then type the code below.";