import { z } from 'zod';
import { marked } from 'marked';
import { blogPostSchema, cleanBlogHtml, validatePublishing, slugify, safeBlogUrl } from './blog-rules';
import { validateBlogImage, MAX_BLOG_IMAGE } from './blog-image';

const IMAGE_TYPES = ['image/png','image/jpeg','image/webp','image/gif','image/avif'];
const MAX_IMAGE = MAX_BLOG_IMAGE;

export async function hashAgentKey(raw: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}
export function newAgentKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return 'xv_blog_' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS' };
export const agentJson = (body: unknown, status = 200) => Response.json(body, { status, headers: cors });
export const agentOptions = () => new Response(null, { status: 204, headers: cors });

/** Verifies the bearer key; the key creator must still be an administrator. */
export async function verifyAgent(request: Request) {
  const raw = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!/^xv_blog_[a-f0-9]{64}$/.test(raw)) return null;
  const { supabaseAdmin: db } = await import('@/integrations/supabase/client.server');
  const { data: key } = await db.from('blog_agent_keys').select('id,created_by,revoked_at').eq('key_hash', await hashAgentKey(raw)).maybeSingle();
  if (!key || key.revoked_at) return null;
  const { data: role } = await db.from('user_roles').select('role').eq('user_id', key.created_by).eq('role', 'admin').maybeSingle();
  if (!role) return null;
  await db.from('blog_agent_keys').update({ last_used_at: new Date().toISOString() }).eq('id', key.id);
  return { db, userId: key.created_by as string };
}
type Agent = NonNullable<Awaited<ReturnType<typeof verifyAgent>>>;

const fileRef = z.object({ name: z.string().max(200).optional(), mime_type: z.string().max(60).optional(), download_link: z.string().url() });
export const agentPostInput = z.object({
  title: z.string().trim().min(1).max(250).optional(),
  content: z.string().max(500000).optional(),
  content_format: z.enum(['markdown', 'html']).default('markdown'),
  excerpt: z.string().max(1000).optional(),
  category: z.string().max(120).optional(),
  tags: z.array(z.string().trim().min(1).max(60)).max(30).optional(),
  slug: z.string().max(120).optional(),
  status: z.enum(['draft', 'published', 'scheduled']).optional(),
  scheduled_at: z.string().datetime({ offset: true }).optional(),
  featured: z.boolean().optional(),
  featured_image_url: z.string().url().optional(),
  featured_image_alt: z.string().max(500).optional(),
  openaiFileIdRefs: z.array(fileRef).max(1).optional(),
  seo_title: z.string().max(250).optional(),
  meta_description: z.string().max(1000).optional(),
  cta_label: z.string().max(150).optional(),
  cta_url: z.string().max(2000).refine(safeBlogUrl, 'Use an HTTPS URL or a local page path').optional(),
});
export type AgentPostInput = z.infer<typeof agentPostInput>;

export async function storeBlogImageBytes(agent: Agent, bytes: Uint8Array, type: string, alt: string, name = 'AI image') {
  validateBlogImage(bytes, type);
  const path = `${agent.userId}/blog/${crypto.randomUUID()}.${type.split('/')[1]}`;
  const { error } = await agent.db.storage.from('tenant-media').upload(path, bytes, { contentType: type });
  if (error) throw new Error('Image upload failed');
  const publicUrl = `/api/public/media/${path}`;
  const { data: asset, error: metadataError } = await agent.db.from('media_assets').insert({ account_id: agent.userId, created_by: agent.userId, name: name.slice(0, 200), alt_text: alt, kind: 'image', content_type: type, size: bytes.length, storage_path: path, url: publicUrl, blog_asset: true }).select('id').single();
  if (metadataError || !asset) {
    await agent.db.storage.from('tenant-media').remove([path]);
    throw new Error('Could not register the image');
  }
  return { id: asset.id, url: publicUrl, alt, content_type: type, size: bytes.length };
}

export async function storeImage(agent: Agent, url: string, alt: string, name = 'AI image') {
  if (!/^https:\/\//i.test(url)) throw new Error('Image links must use https');
  const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error('Could not download the image');
  const type = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!IMAGE_TYPES.includes(type)) throw new Error('The image must be PNG, JPEG, WebP, GIF or AVIF');
  if (Number(res.headers.get('content-length')) > MAX_IMAGE) throw new Error('The image must be under 10 MB');
  const reader = res.body?.getReader();
  if (!reader) throw new Error('Could not download the image');
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_IMAGE) { await reader.cancel(); throw new Error('The image must be under 10 MB'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return (await storeBlogImageBytes(agent, bytes, type, alt, name)).url;
}

export async function agentSavePost(agent: Agent, input: AgentPostInput, id?: string) {
  const { db } = agent;
  let existing: Record<string, unknown> | null = null;
  if (id) {
    const { data } = await db.from('content_posts').select('*').eq('id', id).maybeSingle();
    if (!data) throw new Error('Article not found');
    existing = data;
  } else if (!input.title || !input.content) throw new Error('A new article needs a title and content');

  const body = input.content !== undefined ? cleanBlogHtml(input.content_format === 'html' ? input.content : await marked.parse(input.content)) : undefined;
  const imageSource = input.openaiFileIdRefs?.[0]?.download_link || input.featured_image_url;
  const alt = input.featured_image_alt || input.title || (existing?.title as string) || 'Article image';
  const featured_image = imageSource ? await storeImage(agent, imageSource, alt) : undefined;
  const topic = input.category ? slugify(input.category) : undefined;
  if (topic) {
    const { data: cat } = await db.from('blog_categories').select('id,archived').eq('slug', topic).maybeSingle();
    if (!cat) await db.from('blog_categories').insert({ slug: topic, name: input.category?.trim() ?? topic });
    else if (cat.archived) throw new Error('That category is archived');
  }
  const merged = blogPostSchema.parse({
    ...(existing ?? {}),
    id: undefined, version: undefined,
    title: input.title ?? existing?.title,
    slug: slugify(input.slug || (existing?.slug as string) || input.title || '') || `article-${Date.now()}`,
    excerpt: input.excerpt ?? existing?.excerpt ?? '',
    body: body ?? existing?.body ?? '',
    status: input.status ?? (existing?.status === 'archived' ? 'draft' : existing?.status) ?? 'draft',
    topic: topic ?? existing?.topic ?? 'sms-marketing',
    tags: input.tags ?? existing?.tags ?? [],
    featured: input.featured ?? existing?.featured ?? false,
    featured_image: featured_image ?? existing?.featured_image ?? null,
    image_alt: featured_image ? alt : (input.featured_image_alt ?? existing?.image_alt ?? null),
    seo_title: input.seo_title ?? existing?.seo_title ?? null,
    meta_description: input.meta_description ?? existing?.meta_description ?? input.excerpt ?? null,
    cta_label: input.cta_label ?? existing?.cta_label ?? null,
    cta_url: input.cta_url ?? existing?.cta_url ?? null,
    scheduled_at: input.status === 'scheduled' ? input.scheduled_at ? new Date(input.scheduled_at).toISOString() : null : (input.status ? null : existing?.scheduled_at ?? null),
    author_id: existing?.author_id ?? null, indexable: existing?.indexable ?? true, visibility: existing?.visibility ?? 'public',
    canonical_url: existing?.canonical_url ?? null, og_image: existing?.og_image ?? null, og_title: existing?.og_title ?? null, og_description: existing?.og_description ?? null,
  });
  validatePublishing(merged);
  const { id: _i, version: _v, ...values } = merged;
  const { data: reserved } = await db.from('blog_redirects').select('post_id').eq('old_slug', values.slug).maybeSingle();
  if (reserved && reserved.post_id !== id) throw new Error('This URL belongs to a previous article');
  const patch = { ...values, ...(values.status === 'scheduled' ? { publish_attempts: 0, publish_error: null, publish_retry_at: null } : {}) };
  const q = id ? db.from('content_posts').update(patch).eq('id', id) : db.from('content_posts').insert({ ...patch, created_by: agent.userId });
  const { data: row, error } = await q.select('id,title,slug,status,published_at,scheduled_at,featured_image').single();
  if (error) throw new Error(error.code === '23505' ? 'That URL is already used by another article; choose a different slug' : 'The article could not be saved');
  await db.from('blog_audit').insert({ post_id: row.id, action: 'ai_assistant_save', actor_id: agent.userId, details: { status: row.status } });
  return row;
}

export function postLinks(origin: string, row: { id: string; slug: string; status: string }) {
  return { public_url: row.status === 'published' ? `${origin}/blog/${row.slug}` : null, edit_url: `${origin}/admin/blog/posts/${row.id}` };
}
