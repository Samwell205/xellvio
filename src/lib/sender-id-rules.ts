/**
 * Shared alphanumeric Sender ID rule (UI + every server save path).
 * Carriers (e.g. UK) refuse sender names that are, or look like, phone numbers.
 */
export const SENDER_ID_HINT =
  "Use 3–11 letters, numbers or spaces, with at least 2 letters (e.g. your brand). A phone number can't be used as a sender name.";

export function senderIdError(raw: string): string | null {
  const v = (raw ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9 ]{3,11}$/.test(v)) return SENDER_ID_HINT;
  const letters = (v.match(/[A-Z]/g) ?? []).length;
  if (letters < 2) return SENDER_ID_HINT;
  // Catch numbers typed with look-alike letters, e.g. "O7401028795".
  const asDigits = v.replace(/\s/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");
  const digitCount = (asDigits.match(/\d/g) ?? []).length;
  if (digitCount >= 7) return SENDER_ID_HINT;
  return null;
}

export const isValidSenderId = (raw: string) => senderIdError(raw) === null;
