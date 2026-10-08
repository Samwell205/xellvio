import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Clock, ShieldCheck, Copy, ExternalLink, KeyRound, Plus, RefreshCw, Trash2, Webhook } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { API_SCOPES, WEBHOOK_EVENTS } from "@/lib/tenant-api.shared";
import { getApiAccessStatus, requestApiAccess, createTenantApiKey, createTenantWebhook, getTenantApiSettings, revokeTenantApiKey, updateTenantWebhook } from "@/lib/tenant-api.functions";

function SecretBox({ value, label }: { value: string; label: string }) {
  useEffect(() => { const timer = setTimeout(() => location.reload(), 120_000); return () => clearTimeout(timer); }, []);
  return <div className="rounded-md border border-primary/40 bg-primary/5 p-3"><p className="text-sm font-medium">Copy this {label} now. It is shown only once.</p><div className="mt-2 flex gap-2"><code className="min-w-0 flex-1 overflow-x-auto rounded bg-background px-3 py-2 text-xs">{value}</code><Button size="icon" variant="outline" aria-label={`Copy ${label}`} onClick={() => { void navigator.clipboard.writeText(value); toast.success("Copied"); }}><Copy className="size-4" /></Button></div></div>;
}

export function TenantApiPanel() {
  const loadStatus = useServerFn(getApiAccessStatus);
  const status = useQuery({ queryKey: ["api-access-status"], queryFn: () => loadStatus() });
  if (status.isLoading) return <Skeleton className="h-80" />;
  if (status.error) return <Card className="p-6 text-sm text-muted-foreground">{(status.error as Error).message}</Card>;
  if (status.data?.request?.status !== "approved") return <ApiAccessRequest request={status.data?.request ?? null} />;
  return <ApprovedApiPanel />;
}

function ApiAccessRequest({ request }: { request: any }) {
  const qc = useQueryClient(); const submit = useServerFn(requestApiAccess);
  const [company, setCompany] = useState(""); const [website, setWebsite] = useState(""); const [useCase, setUseCase] = useState(""); const [reason, setReason] = useState(""); const [volume, setVolume] = useState("");
  const m = useMutation({ mutationFn: () => submit({ data: { companyName: company, website, useCase, reason, expectedMonthlyVolume: volume ? Number(volume) : undefined } }), onSuccess: () => { toast.success("Request sent for review"); void qc.invalidateQueries({ queryKey: ["api-access-status"] }); }, onError: (e: Error) => toast.error(e.message) });
  if (request?.status === "pending") return <Card className="space-y-2 p-6"><h3 className="flex items-center gap-2 font-semibold"><Clock className="size-4" /> API access request under review</h3><p className="text-sm text-muted-foreground">We received your request on {new Date(request.created_at).toLocaleDateString()}. Our team will review it and API keys and webhooks will appear here once approved.</p></Card>;
  return <Card className="space-y-4 p-6">
    <div><h3 className="flex items-center gap-2 font-semibold"><ShieldCheck className="size-4" /> Request API access</h3><p className="mt-1 text-sm text-muted-foreground">API access lets your own software send SMS through your verified numbers using your Xellvio credit. Tell us how you plan to use it — our team reviews every request.</p></div>
    {request && (request.status === "rejected" || request.status === "revoked") && <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">Your previous request was {request.status === "revoked" ? "revoked" : "not approved"}.{request.admin_note ? ` Reason: ${request.admin_note}` : ""} You can submit a new request.</div>}
    <div className="grid gap-3 md:grid-cols-2"><div className="space-y-1.5"><Label>Company / platform name</Label><Input value={company} onChange={(e) => setCompany(e.target.value)} maxLength={120} /></div><div className="space-y-1.5"><Label>Website (optional)</Label><Input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://" maxLength={300} /></div></div>
    <div className="space-y-1.5"><Label>What will you send through the API?</Label><Textarea value={useCase} onChange={(e) => setUseCase(e.target.value)} placeholder="e.g. order confirmations and delivery updates from our store platform" maxLength={1000} /></div>
    <div className="space-y-1.5"><Label>Why do you need API access?</Label><Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. we want to send from our own CRM instead of the dashboard" maxLength={1000} /></div>
    <div className="space-y-1.5 md:w-64"><Label>Expected messages per month</Label><Input type="number" min={0} value={volume} onChange={(e) => setVolume(e.target.value)} /></div>
    <Button disabled={m.isPending || company.trim().length < 2 || useCase.trim().length < 10 || reason.trim().length < 10} onClick={() => m.mutate()}>Submit request</Button>
  </Card>;
}

function ApprovedApiPanel() {
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
