import { describe, expect, it, vi } from 'vitest';
import { blogImageInput, decodeBlogImage, MAX_BLOG_IMAGE, validateBlogImage } from './blog-image';
import { storeBlogImageBytes } from './blog-agent.server';

const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1kAAAAASUVORK5CYII=';
describe('blog image upload', () => {
  it('accepts PNG bytes and data URLs without external hosting', () => {
    expect(decodeBlogImage(png, 'image/png').bytes.length).toBe(68);
    expect(decodeBlogImage(`data:image/png;base64,${png}`).type).toBe('image/png');
  });
  it('rejects missing or conflicting upload sources', () => {
    expect(blogImageInput.safeParse({ name: 'Cover', alt: 'Cover' }).success).toBe(false);
    expect(blogImageInput.safeParse({ name: 'Cover', alt: 'Cover', image_base64: png, image_url: 'https://example.com/image.png' }).success).toBe(false);
  });
  it('rejects non-raster payloads and mismatched content types', () => {
    expect(() => decodeBlogImage(btoa('<svg onload="alert(1)"></svg>'), 'image/png')).toThrow('do not match');
    expect(() => decodeBlogImage(`data:image/png;base64,${png}`, 'image/jpeg')).toThrow('matching');
    expect(() => decodeBlogImage('not base64!', 'image/png')).toThrow('Invalid base64');
  });
  it('enforces the 10 MB byte limit before storing', () => {
    expect(MAX_BLOG_IMAGE).toBe(10485760);
    expect(() => validateBlogImage(new Uint8Array(10485761), 'image/png')).toThrow('under 10 MB');
  });
  it('stores a registered media image and returns its permanent URL', async () => {
    const upload = vi.fn().mockResolvedValue({ error: null });
    const single = vi.fn().mockResolvedValue({ data: { id: 'image-id' }, error: null });
    const insert = vi.fn(() => ({ select: () => ({ single }) }));
    const db = { storage: { from: () => ({ upload }) }, from: () => ({ insert }) };
    const image = decodeBlogImage(png, 'image/png');
    const saved = await storeBlogImageBytes({ db: db as never, userId: 'owner' }, image.bytes, image.type, 'Approved cover', 'Cover');
    expect(upload).toHaveBeenCalledOnce();
    expect(saved.url).toMatch(/^\/api\/public\/media\/owner\/blog\/[\w-]+\.png$/);
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ account_id: 'owner', blog_asset: true, alt_text: 'Approved cover', size: 68 }));
  });
  it('removes the uploaded file if media registration fails', async () => {
    const remove = vi.fn().mockResolvedValue({ error: null });
    const db = { storage: { from: () => ({ upload: async () => ({ error: null }), remove }) }, from: () => ({ insert: () => ({ select: () => ({ single: async () => ({ data: null, error: { message: 'failed' } }) }) }) }) };
    const image = decodeBlogImage(png, 'image/png');
    await expect(storeBlogImageBytes({ db: db as never, userId: 'owner' }, image.bytes, image.type, 'Cover')).rejects.toThrow('register');
    expect(remove).toHaveBeenCalledOnce();
  });
});