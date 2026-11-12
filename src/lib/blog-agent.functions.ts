import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

async function requireAdmin(db: { rpc: (n: 'blog_role') => PromiseLike<{ data: unknown }> }) {
  const { data } = await db.rpc('blog_role');
  if (data !== 'admin') throw new Error('Administrator access required');
}
export const listAgentKeys = createServerFn({ method: 'GET' }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  await requireAdmin(context.supabase);
  const { data, error } = await context.supabase.from('blog_agent_keys').select('id,name,key_hint,created_at,last_used_at,revoked_at').order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
});
export const createAgentKey = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ name: z.string().trim().min(1).max(80) }).parse(i))
  .handler(async ({ context, data }) => {
    await requireAdmin(context.supabase);
    const { newAgentKey, hashAgentKey } = await import('./blog-agent.server');
    const raw = newAgentKey();
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { error } = await supabaseAdmin.from('blog_agent_keys').insert({ name: data.name, key_hash: await hashAgentKey(raw), key_hint: raw.slice(-4), created_by: context.userId });
    if (error) throw new Error('Could not create the key');
    return { key: raw };
  });
export const revokeAgentKey = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ context, data }) => {
    await requireAdmin(context.supabase);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { error } = await supabaseAdmin.from('blog_agent_keys').update({ revoked_at: new Date().toISOString() }).eq('id', data.id).is('revoked_at', null);
    if (error) throw new Error('Could not revoke the key');
    return { ok: true };
  });
