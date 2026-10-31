const TEMPLATES: Record<string, string> = {
  verification_pending: "tollfree-submitted",
  active: "tollfree-approved",
  rejected: "tollfree-rejected",
};

/** Which email (if any) a status change should send; never repeats the same status. */
export function tollfreeEmailFor(status: string | null | undefined, notified: string | null | undefined): string | null {
  if (!status || status === notified) return null;
  return TEMPLATES[status] ?? null;
}
