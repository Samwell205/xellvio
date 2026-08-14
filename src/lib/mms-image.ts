// Browser-side normalisation of MMS attachments.
//
// Carrier MMS gateways silently strip attachments that are too large or too
// large in pixel dimensions — the recipient then gets the text only. US/CA
// carriers are reliable up to roughly 500 KB, so we downscale and re-encode to
// stay well inside that. Animated GIFs are passed through untouched (canvas
// re-encoding would flatten them to a single frame).

const MAX_DIMENSION = 1200;
const TARGET_BYTES = 450 * 1024;

export async function prepareMmsImage(file: File): Promise<File> {
  if (file.type === "image/gif") return file;
  if (typeof document === "undefined") return file;

  let bitmap: ImageBitmap | HTMLImageElement;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }

  const width = (bitmap as any).width as number;
  const height = (bitmap as any).height as number;
  const scale = Math.min(1, MAX_DIMENSION / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));

  if (scale === 1 && file.size <= TARGET_BYTES) return file;

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  // White matte so transparent PNGs don't render as black on handsets.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap as any, 0, 0, w, h);

  const toBlob = (quality: number) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));

  let blob: Blob | null = null;
  for (const q of [0.85, 0.75, 0.65, 0.55, 0.45]) {
    blob = await toBlob(q);
    if (blob && blob.size <= TARGET_BYTES) break;
  }
  if (!blob) return file;
  if (blob.size >= file.size && file.size <= TARGET_BYTES) return file;

  const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
  return new File([blob], name, { type: "image/jpeg" });
}
