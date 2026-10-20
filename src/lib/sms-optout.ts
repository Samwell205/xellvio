/** Existing STOP wording is preserved verbatim; never duplicate the opt-out footer. */
export function withSmsOptOut(body: string, footer = "Reply STOP to unsubscribe."): string {
  return /\bstop\b/i.test(body) ? body : `${body}\n${footer}`;
}