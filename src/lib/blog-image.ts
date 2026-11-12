import { z } from 'zod';

export const MAX_BLOG_IMAGE = 10 * 1024 * 1024;
export const blogImageType = z.enum(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif']);
export const blogImageInput = z.object({
  name: z.string().trim().min(1).max(200),
  alt: z.string().trim().min(1).max(500),
  content_type: blogImageType.optional(),
  image_base64: z.string().min(1).max(4 * Math.ceil(MAX_BLOG_IMAGE / 3) + 100).optional(),
  image_url: z.string().url().max(4000).optional(),
}).refine(v => Boolean(v.image_base64) !== Boolean(v.image_url), 'Provide image_base64 or image_url, not both');

export function validateBlogImage(bytes: Uint8Array, type: string) {
  blogImageType.parse(type);
  if (!bytes.length || bytes.length > MAX_BLOG_IMAGE) throw new Error('The image must be under 10 MB');
  const text = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end));
  const valid = type === 'image/png' ? bytes.slice(0, 8).join(',') === '137,80,78,71,13,10,26,10'
    : type === 'image/jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
    : type === 'image/gif' ? ['GIF87a', 'GIF89a'].includes(text(0, 6))
    : type === 'image/webp' ? text(0, 4) === 'RIFF' && text(8, 12) === 'WEBP'
    : text(4, 8) === 'ftyp' && /avif|avis/.test(text(8, 32));
  if (!valid) throw new Error('Image bytes do not match the declared image type');
}

export function decodeBlogImage(value: string, declaredType?: string) {
  const match = value.match(/^data:(image\/[a-z]+);base64,([\s\S]+)$/);
  const type = match?.[1] ?? declaredType;
  if (!type || (declaredType && match && declaredType !== type)) throw new Error('Provide the matching image content_type');
  const base64 = (match?.[2] ?? value).replace(/\s/g, '');
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64)) throw new Error('Invalid base64 image');
  if (base64.length > 4 * Math.ceil(MAX_BLOG_IMAGE / 3)) throw new Error('The image must be under 10 MB');
  const bytes = Uint8Array.from(atob(base64), char => char.charCodeAt(0));
  validateBlogImage(bytes, type);
  return { bytes, type };
}