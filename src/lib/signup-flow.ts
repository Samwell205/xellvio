export function signupNeedsConfirmation(data: { session: unknown }): boolean {
  return !data.session;
}

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