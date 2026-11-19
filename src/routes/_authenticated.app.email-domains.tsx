import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertCircle, ArrowRight, Check, CheckCircle2, Copy, Globe, Hourglass, Loader2, Mail, Plus, RefreshCw, ShieldCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { addEmailDomain, checkEmailDomain, listEmailDomains } from "@/lib/email-domains.functions";
import type { DnsRecord } from "@/lib/email-domain-rules";

export const Route = createFileRoute("/_authenticated/app/email-domains")({
  head: () => ({ meta: [{ title: "Email sending domain — Xellvio" }, { name: "description", content: "Connect and verify your business email sending domain in Xellvio." }, { property: "og:title", content: "Email sending domain — Xellvio" }, { property: "og:description", content: "Manage your business sender domain and verification records." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: EmailDomainsPage,
});

function CopyValue({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return <div className="flex min-w-0 items-start gap-2 rounded-md border bg-background px-3 py-2.5">
    <code className="min-w-0 flex-1 break-all text-sm leading-6">{value}</code>
    <Button variant="ghost" size="icon" className="size-8 shrink-0" aria-label={`Copy ${label}`} title={`Copy ${label}`} onClick={async () => {
      try { await navigator.clipboard.writeText(value); setCopied(true); toast.success("Copied"); setTimeout(() => setCopied(false), 2000); }
      catch { toast.error("Could not copy. Select and copy the value instead."); }
    }}>{copied ? <Check className="size-4 text-primary" /> : <Copy className="size-4" />}</Button>
  </div>;
}

function EmailDomainsPage() {
  const qc = useQueryClient();
  const list = useServerFn(listEmailDomains);
  const add = useServerFn(addEmailDomain);
  const check = useServerFn(checkEmailDomain);
  const [domain, setDomain] = useState("");
  const q = useQuery({ queryKey: ["email-domains"], queryFn: () => list() });

  const addM = useMutation({
    mutationFn: () => add({ data: { domain } }),
    onSuccess: () => { setDomain(""); qc.invalidateQueries({ queryKey: ["email-domains"] }); toast.success("Domain added. Now add the records below."); },
    onError: (e: any) => toast.error(e.message),
  });
  const checkM = useMutation({
    mutationFn: (id: string) => check({ data: { id } }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["email-domains"] });
      if (r.verified) toast.success("Your domain is connected. You can send email from it.");
      else toast.message(`Not yet: ${r.missing} record${r.missing === 1 ? "" : "s"} not found. Records can take up to a few hours to show up.`);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const connected = q.data?.filter(d => d.status === "verified").length ?? 0;
  return <div className="mx-auto max-w-6xl py-4 md:px-4 md:py-8">
    <header className="flex flex-wrap items-start justify-between gap-6 border-b pb-8">
      <div className="max-w-2xl"><div className="mb-4 flex items-center gap-2 text-sm font-medium text-primary"><Mail className="size-4" /> EMAIL / SENDER SETUP</div>
        <h1 className="text-3xl font-semibold sm:text-4xl">Email sending domain</h1>
        <p className="mt-3 text-base leading-7 text-muted-foreground">Your business. Your sender address. Connect a domain you own to authenticate your emails.</p></div>
      <div className="flex items-center gap-3 rounded-md bg-primary/10 px-4 py-3"><ShieldCheck className="size-5 text-primary" /><div><p className="text-lg font-semibold">{connected} connected</p><p className="text-sm text-muted-foreground">{q.data?.length ?? 0} total domains</p></div></div>
    </header>
    <div className="grid gap-10 pt-8 lg:grid-cols-[minmax(0,1fr)_260px]">
      <div className="min-w-0 space-y-8">
        <section aria-labelledby="add-domain-title">
          <h2 id="add-domain-title" className="text-xl font-semibold">Connect a domain</h2>
          <form className="mt-5" onSubmit={e => { e.preventDefault(); if (domain.trim() && !addM.isPending) addM.mutate(); }}>
            <Label htmlFor="sending-domain" className="text-sm">Business domain</Label>
            <div className="mt-2 flex flex-col gap-3 sm:flex-row"><div className="relative min-w-0 flex-1"><Globe className="pointer-events-none absolute left-3 top-3.5 size-5 text-muted-foreground" /><Input id="sending-domain" autoCapitalize="none" autoCorrect="off" placeholder="yourbusiness.com" className="h-12 pl-11 text-base" value={domain} onChange={e => setDomain(e.target.value)} /></div>
              <Button type="submit" className="h-12" disabled={!domain.trim() || addM.isPending}>{addM.isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}Add domain</Button></div>
          </form>
        </section>
        <section aria-labelledby="domains-title" className="border-t pt-7">
          <div className="mb-5 flex items-center justify-between gap-3"><h2 id="domains-title" className="text-xl font-semibold">Your domains</h2><Badge variant="outline">{q.data?.length ?? 0}</Badge></div>
          {q.isLoading && <div role="status" className="flex items-center gap-3 py-12 text-muted-foreground"><Loader2 className="size-5 animate-spin" />Loading domains…</div>}
          {q.isError && <div role="alert" className="flex flex-wrap items-center gap-3 py-8"><AlertCircle className="size-5 text-destructive" /><span>Could not load your domains.</span><Button variant="outline" onClick={() => q.refetch()}><RefreshCw className="size-4" />Try again</Button></div>}
          {q.data?.length === 0 && <div className="border-y border-dashed py-12 text-center"><Globe className="mx-auto mb-4 size-8 text-muted-foreground" /><h3 className="text-lg font-medium">No sending domains yet</h3><p className="mt-2 text-muted-foreground">Your connected domains will appear here.</p></div>}
          <div className="space-y-5">{q.data?.map(d => {
            const records = (d.dns_records as unknown as DnsRecord[]) ?? [];
            const ok = d.status === "verified";
            const found = records.filter(r => r.valid).length;
            return <Card key={d.id} className="overflow-hidden rounded-lg shadow-none">
              <CardContent className="p-0">
                <div className="flex flex-wrap items-start justify-between gap-4 border-b p-5 sm:p-6"><div className="min-w-0"><div className="flex flex-wrap items-center gap-3"><h3 className="break-all text-xl font-semibold">{d.domain}</h3><Badge variant={ok ? "default" : "secondary"} className="gap-1.5">{ok ? <CheckCircle2 className="size-3.5" /> : <Hourglass className="size-3.5" />}{ok ? "Connected" : "Awaiting verification"}</Badge></div><p className="mt-2 text-sm text-muted-foreground">{ok ? "Authenticated and ready for email campaigns." : `${found} of ${records.length} records found`}</p></div>
                  <Button variant="outline" disabled={checkM.isPending} onClick={() => checkM.mutate(d.id)}>{checkM.isPending && checkM.variables === d.id ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}Check records</Button></div>
                <div className="space-y-5 p-5 sm:p-6">{records.map((r, i) => <div key={`${r.type}-${r.host}`} className={i > 0 ? "border-t pt-5" : ""}>
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><span className="text-sm text-muted-foreground">Record {i + 1}</span><Badge variant="outline" className="font-mono">{r.type}</Badge></div><span className={`inline-flex items-center gap-1.5 text-sm ${r.valid ? "text-primary" : "text-muted-foreground"}`}>{r.valid ? <CheckCircle2 className="size-4" /> : <Hourglass className="size-4" />}{r.valid ? "Found" : "Not found yet"}</span></div>
                  <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]"><div className="min-w-0"><p className="mb-2 text-sm font-medium">Host / Name</p><CopyValue value={r.host} label={`record ${i + 1} host`} /></div><div className="min-w-0"><p className="mb-2 text-sm font-medium">Value / Points to</p><CopyValue value={r.value} label={`record ${i + 1} value`} /></div></div>
                </div>)}{records.length === 0 && <p className="text-muted-foreground">No records available. Check records to refresh the domain status.</p>}</div>
                <div className="border-t bg-muted/30 px-5 py-3 text-sm text-muted-foreground sm:px-6">{d.last_checked_at ? `Last checked ${new Date(d.last_checked_at).toLocaleString()}` : "Not checked yet"}</div>
              </CardContent>
            </Card>;
          })}</div>
        </section>
      </div>
      <aside className="border-t pt-6 lg:border-l lg:border-t-0 lg:pl-7 lg:pt-0">
        <h2 className="text-lg font-semibold">Domain connection</h2><ol className="mt-6 space-y-6">{["Add your business domain", "Add the DNS records", "Check your connection"].map((step, i) => <li key={step} className="flex items-center gap-3"><span className="grid size-7 shrink-0 place-items-center rounded-full border text-sm font-medium">{i + 1}</span><span className="text-sm font-medium">{step}</span></li>)}</ol>
        <div className="mt-8 border-t pt-6"><h3 className="font-medium">Adding your records</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">Open DNS settings where your domain is managed. Some hosts add your domain automatically — in that case, enter only the part before your domain in Host / Name.</p><p className="mt-4 text-sm leading-6 text-muted-foreground">Records can take a few hours to appear. Email sending stays unavailable until verification is complete.</p></div>
      </aside>
    </div>
  </div>;
}
