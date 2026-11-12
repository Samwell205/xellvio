import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { Copy, KeyRound, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { createAgentKey, listAgentKeys, revokeAgentKey } from '@/lib/blog-agent.functions';
import { AGENT_INSTRUCTIONS } from '@/lib/blog-agent-spec';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const SITE = 'https://xellvio.com';
const SPEC_URL = `${SITE}/api/public/blog/agent/openapi.json`;
const copy = (text: string, label: string) => navigator.clipboard.writeText(text).then(() => toast.success(`${label} copied`));

export function BlogAiPublishing() {
  const list = useServerFn(listAgentKeys); const create = useServerFn(createAgentKey); const revoke = useServerFn(revokeAgentKey);
  const qc = useQueryClient(); const q = useQuery({ queryKey: ['blog-agent-keys'], queryFn: () => list() });
  const [name, setName] = useState('ChatGPT Blog Writer'); const [newKey, setNewKey] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ id: string; name: string } | null>(null); const [busy, setBusy] = useState(false);
  const act = async (fn: () => Promise<unknown>, ok: string) => { setBusy(true); try { await fn(); await qc.invalidateQueries({ queryKey: ['blog-agent-keys'] }); toast.success(ok); } catch (e) { toast.error(e instanceof Error ? e.message : 'Something went wrong'); } finally { setBusy(false); } };
  const steps = ['In ChatGPT, open Explore GPTs → Create, then the Configure tab.', 'Name it "Xellvio Blog Writer" and paste the instructions below into Instructions. Turn on Image Generation.', 'Under Actions, choose Create new action → Import from URL and paste the setup link.', 'Set Authentication to API Key, Auth type Bearer, and paste your publishing key.', 'Save the GPT as "Only me". Then just chat: describe the article, approve it, and say "publish".'];
  return <section className="space-y-6 border-t border-border pt-7">
    <div className="flex items-start gap-3"><Sparkles className="mt-1 size-5 text-primary" /><div><h2 className="text-xl">Publish from ChatGPT</h2><p className="text-sm text-muted-foreground">Write, design and publish articles by chatting with your own ChatGPT assistant. Only someone holding a key can post.</p></div></div>
    <ol className="list-decimal space-y-2 pl-5 text-sm">{steps.map(s => <li key={s}>{s}</li>)}</ol>
    <div className="space-y-2"><Label>Setup link</Label><div className="flex gap-2"><Input readOnly value={SPEC_URL} /><Button variant="outline" onClick={() => copy(SPEC_URL, 'Setup link')}><Copy className="size-4" />Copy</Button></div></div>
    <div className="space-y-2"><div className="flex items-center justify-between"><Label>Assistant instructions</Label><Button size="sm" variant="outline" onClick={() => copy(AGENT_INSTRUCTIONS, 'Instructions')}><Copy className="size-4" />Copy</Button></div><pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-muted p-3 text-xs">{AGENT_INSTRUCTIONS}</pre></div>
    <form className="flex flex-wrap items-end gap-3" onSubmit={e => { e.preventDefault(); act(async () => { const r = await create({ data: { name } }); setNewKey(r.key); }, 'Publishing key created'); }}>
      <div className="flex-1 space-y-2"><Label htmlFor="agent-key-name">Key name</Label><Input id="agent-key-name" value={name} onChange={e => setName(e.target.value)} /></div>
      <Button disabled={busy || !name.trim()}><KeyRound className="size-4" />Create publishing key</Button></form>
    {q.error && <p role="alert" className="text-destructive">{q.error.message}</p>}
    <div className="divide-y divide-border">{q.data?.map(k => <div key={k.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"><div><p className="font-semibold">{k.name} <span className="text-muted-foreground">…{k.key_hint}</span></p><p className="text-xs text-muted-foreground">Created {new Date(k.created_at).toLocaleDateString()} · {k.last_used_at ? `last used ${new Date(k.last_used_at).toLocaleString()}` : 'never used'}</p></div>{k.revoked_at ? <span className="text-xs text-muted-foreground">Revoked</span> : <Button size="sm" variant="outline" onClick={() => setConfirm({ id: k.id, name: k.name })}>Revoke</Button>}</div>)}</div>
    <Dialog open={!!newKey} onOpenChange={o => { if (!o) setNewKey(null); }}><DialogContent><DialogHeader><DialogTitle>Copy your publishing key now</DialogTitle></DialogHeader><p className="text-sm text-muted-foreground">It will not be shown again. Anyone with it can publish to your blog, so paste it only into your private ChatGPT.</p><Input readOnly value={newKey ?? ''} className="font-mono text-xs" /><div className="flex justify-end"><Button onClick={() => newKey && copy(newKey, 'Key')}><Copy className="size-4" />Copy key</Button></div></DialogContent></Dialog>
    <Dialog open={!!confirm} onOpenChange={o => { if (!o) setConfirm(null); }}><DialogContent><DialogHeader><DialogTitle>Revoke {confirm?.name}?</DialogTitle></DialogHeader><p className="text-sm">The assistant using this key will immediately stop being able to post.</p><div className="flex justify-end gap-3"><Button variant="outline" onClick={() => setConfirm(null)}>Cancel</Button><Button variant="destructive" disabled={busy} onClick={() => confirm && act(async () => { await revoke({ data: { id: confirm.id } }); setConfirm(null); }, 'Key revoked')}>Revoke key</Button></div></DialogContent></Dialog>
  </section>;
}
