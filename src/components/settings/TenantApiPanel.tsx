import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Copy, ExternalLink, KeyRound, Plus, RefreshCw, Trash2, Webhook } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { API_SCOPES, WEBHOOK_EVENTS } from "@/lib/tenant-api.shared";
import { createTenantApiKey, createTenantWebhook, getTenantApiSettings, revokeTenantApiKey, updateTenantWebhook } from "@/lib/tenant-api.functions";

function SecretBox({ value, label }: { value: string; label: string }) {
  useEffect(() => { const timer = setTimeout(() => location.reload(), 120_000); return () => clearTimeout(timer); }, []);
  return <div className="rounded-md border border-primary/40 bg-primary/5 p-3"><p className="text-sm font-medium">Copy this {label} now. It is shown only once.</p><div className="mt-2 flex gap-2"><code className="min-w-0 flex-1 overflow-x-auto rounded bg-background px-3 py-2 text-xs">{value}</code><Button size="icon" variant="outline" aria-label={`Copy ${label}`} onClick={() => { void navigator.clipboard.writeText(value); toast.success("Copied"); }}><Copy className="size-4" /></Button></div></div>;
}

export function TenantApiPanel() {
  const qc = useQueryClient(); const load = useServerFn(getTenantApiSettings); const createKey = useServerFn(createTenantApiKey); const revokeKey = useServerFn(revokeTenantApiKey); const createHook = useServerFn(createTenantWebhook); const updateHook = useServerFn(updateTenantWebhook);
  const settings = useQuery({ queryKey: ["tenant-api-settings"], queryFn: () => load() });
  const [keyName, setKeyName] = useState("Production"); const [scopes, setScopes] = useState<string[]>([...API_SCOPES]); const [issuedKey, setIssuedKey] = useState<string | null>(null);
  const [hookName, setHookName] = useState("Production webhook"); const [hookUrl, setHookUrl] = useState(""); const [events, setEvents] = useState<string[]>([...WEBHOOK_EVENTS]); const [issuedSecret, setIssuedSecret] = useState<string | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["tenant-api-settings"] });
  const keyMutation = useMutation({ mutationFn: () => createKey({ data: { name: keyName, scopes: scopes as any, rateLimit: 120 } }), onSuccess: (r) => { setIssuedKey(r.key); void refresh(); }, onError: (e: Error) => toast.error(e.message) });
  const revokeMutation = useMutation({ mutationFn: (id: string) => revokeKey({ data: { id } }), onSuccess: () => { toast.success("API key revoked"); void refresh(); }, onError: (e: Error) => toast.error(e.message) });
  const hookMutation = useMutation({ mutationFn: () => createHook({ data: { name: hookName, url: hookUrl, events: events as any } }), onSuccess: (r) => { setIssuedSecret(r.secret); setHookUrl(""); void refresh(); }, onError: (e: Error) => toast.error(e.message) });
  const updateMutation = useMutation({ mutationFn: (data: { id: string; active?: boolean; rotateSecret?: boolean }) => updateHook({ data }), onSuccess: (r) => { if (r.secret) setIssuedSecret(r.secret); void refresh(); }, onError: (e: Error) => toast.error(e.message) });

  if (settings.isLoading) return <Skeleton className="h-80" />;
  return <div className="space-y-6">
    <Card className="space-y-4 p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="flex items-center gap-2 font-semibold"><KeyRound className="size-4" /> Workspace API keys</h3><p className="mt-1 text-sm text-muted-foreground">Use these keys only from your secure servers. Each request is isolated to this workspace.</p></div><Button asChild variant="outline" size="sm"><a href="/docs#api-reference" target="_blank">Open documentation <ExternalLink className="size-3.5" /></a></Button></div>
      <div className="rounded-md border bg-muted/30 p-3"><p className="text-xs text-muted-foreground">Base URL</p><code className="text-sm">{settings.data?.baseUrl}</code></div>
      {issuedKey && <SecretBox value={issuedKey} label="API key" />}
      <div className="grid gap-3 md:grid-cols-[minmax(0,240px)_1fr_auto]"><Input value={keyName} onChange={(e) => setKeyName(e.target.value)} placeholder="Key name" /><div className="flex flex-wrap gap-3">{API_SCOPES.map((scope) => <Label key={scope} className="flex items-center gap-2 text-xs"><Checkbox checked={scopes.includes(scope)} onCheckedChange={(checked) => setScopes(checked ? [...scopes, scope] : scopes.filter((x) => x !== scope))} />{scope}</Label>)}</div><Button disabled={keyMutation.isPending || scopes.length === 0 || keyName.trim().length < 2} onClick={() => keyMutation.mutate()}><Plus className="size-4" /> Create key</Button></div>
      <div className="divide-y rounded-md border">{(settings.data?.keys ?? []).map((key: any) => <div key={key.id} className="flex flex-wrap items-center gap-3 p-3 text-sm"><span className="font-medium">{key.name}</span><code className="rounded bg-muted px-2 py-0.5 text-xs">{key.key_prefix}…</code><Badge variant={key.revoked_at ? "secondary" : "default"}>{key.revoked_at ? "Revoked" : "Active"}</Badge><span className="text-xs text-muted-foreground">{key.last_used_at ? `Last used ${new Date(key.last_used_at).toLocaleString()}` : "Never used"}</span>{!key.revoked_at && <Button className="ml-auto" size="sm" variant="ghost" onClick={() => revokeMutation.mutate(key.id)}><Trash2 className="size-4" /> Revoke</Button>}</div>)}{!settings.data?.keys.length && <p className="p-4 text-sm text-muted-foreground">No API keys yet.</p>}</div>
    </Card>
    <Card className="space-y-4 p-6"><div><h3 className="flex items-center gap-2 font-semibold"><Webhook className="size-4" /> Signed webhooks</h3><p className="mt-1 text-sm text-muted-foreground">Receive replies, opt-outs, delivery updates, failures, and batch completion events.</p></div>
      {issuedSecret && <SecretBox value={issuedSecret} label="webhook signing secret" />}
      <div className="grid gap-3 md:grid-cols-2"><div className="space-y-1.5"><Label>Endpoint name</Label><Input value={hookName} onChange={(e) => setHookName(e.target.value)} /></div><div className="space-y-1.5"><Label>Public HTTPS URL</Label><Input value={hookUrl} onChange={(e) => setHookUrl(e.target.value)} placeholder="https://example.com/webhooks/xellvio" /></div></div>
      <div className="flex flex-wrap gap-3">{WEBHOOK_EVENTS.map((event) => <Label key={event} className="flex items-center gap-2 text-xs"><Checkbox checked={events.includes(event)} onCheckedChange={(checked) => setEvents(checked ? [...events, event] : events.filter((x) => x !== event))} />{event}</Label>)}</div><Button disabled={hookMutation.isPending || !hookUrl || events.length === 0} onClick={() => hookMutation.mutate()}><Plus className="size-4" /> Add endpoint</Button>
      <div className="space-y-2">{(settings.data?.endpoints ?? []).map((endpoint: any) => <div key={endpoint.id} className="flex flex-wrap items-center gap-3 rounded-md border p-3 text-sm"><div className="min-w-0 flex-1"><p className="font-medium">{endpoint.name}</p><p className="truncate text-xs text-muted-foreground">{endpoint.url}</p></div><Badge variant={endpoint.active ? "default" : "secondary"}>{endpoint.active ? "Active" : "Paused"}</Badge><Button size="sm" variant="outline" onClick={() => updateMutation.mutate({ id: endpoint.id, rotateSecret: true })}><RefreshCw className="size-3.5" /> Rotate secret</Button><Button size="sm" variant="outline" onClick={() => updateMutation.mutate({ id: endpoint.id, active: !endpoint.active })}>{endpoint.active ? "Pause" : "Resume"}</Button></div>)}</div>
      {!!settings.data?.events.length && <div><p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Recent deliveries</p><div className="divide-y rounded-md border">{settings.data.events.map((event: any) => <div key={event.id} className="flex items-center gap-3 p-3 text-xs"><span className="font-medium">{event.event_type}</span><Badge variant="outline">{event.status}</Badge><span className="ml-auto text-muted-foreground">{event.attempt_count} attempt{event.attempt_count === 1 ? "" : "s"}</span></div>)}</div></div>}
    </Card>
  </div>;
}
