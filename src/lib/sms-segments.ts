// SMS segment calculation — GSM-7 vs Unicode.
// Reusable across campaign builder, calculator, and server dispatch.

// Most common GSM-7 default alphabet (subset is fine for our pricing estimator)
const GSM_REGEX = /^[\x00-\x7F€]*$/;

export type SegmentInfo = {
  encoding: "GSM-7" | "Unicode";
  charCount: number;
  segments: number;
};

export function calculateSegments(body: string): SegmentInfo {
  const charCount = body.length;
  const isGsm = GSM_REGEX.test(body);
  const encoding: "GSM-7" | "Unicode" = isGsm ? "GSM-7" : "Unicode";
  const single = isGsm ? 160 : 70;
  const multi = isGsm ? 153 : 67;
  if (charCount === 0) return { encoding, charCount, segments: 0 };
  const segments = charCount <= single ? 1 : Math.ceil(charCount / multi);
  return { encoding, charCount, segments };
}
