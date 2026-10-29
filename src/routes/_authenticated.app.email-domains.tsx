import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, Copy, Globe, Hourglass, Loader2, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { addEmailDomain, checkEmailDomain, listEmailDomains } from "@/lib/email-domains.functions";
import type { DnsRecord } from "@/lib/email-domain-rules";

export const Route = createFileRoute("/_authenticated/app/email-domains")({
  head: () => ({ meta: [{ title: "Email sending domain — Xellvio" }, { name: "description", content: "Connect and verify your business email sending domain in Xellvio." }, { property: "og:title", content: "Email sending domain — Xellvio" }, { property: "og:description", content: "Manage your business sender domain and verification records." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: EmailDomainsPage,
});

function copy(v: string) {
  navigator.clipboard.writeText(v).then(() => toast.success("Copied"));
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

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Email sending domain</h1>
        <p className="mt-1 text-muted-foreground">
          Send email from your own domain so it lands in inboxes, not spam. Add your domain, copy the records
          into the place you bought it (GoDaddy, Namecheap, Cloudflare…), then press Check.
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-3 pt-6 sm:flex-row">
          <Input placeholder="yourbusiness.com" value={domain} onChange={(e) => setDomain(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && domain) addM.mutate(); }} />
          <Button disabled={!domain || addM.isPending} onClick={() => addM.mutate()}>
            {addM.isPending ? <Loader2 className="size-4 animate-spin" /> : <Globe className="size-4" />} Add domain
          </Button>
        </CardContent>
      </Card>

      {q.isLoading && <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />}
      {q.data?.length === 0 && <p className="text-center text-sm text-muted-foreground">No domains yet.</p>}

      {q.data?.map((d) => {
        const records = (d.dns_records as unknown as DnsRecord[]) ?? [];
        const ok = d.status === "verified";
        return (
          <Card key={d.id} className="animate-in fade-in slide-in-from-bottom-2">
            <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
              <CardTitle className="flex items-center gap-2 text-lg">
                {d.domain}
                {ok ? <Badge className="gap-1"><CheckCircle2 className="size-3" />Connected</Badge>
                  : <Badge variant="secondary" className="gap-1"><Hourglass className="size-3" />Waiting for records</Badge>}
              </CardTitle>
              <Button variant="outline" size="sm" disabled={checkM.isPending} onClick={() => checkM.mutate(d.id)}>
                {checkM.isPending && checkM.variables === d.id ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} Check
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {!ok && <p className="text-sm text-muted-foreground">Add each record below. In most DNS settings, paste only the part before <b>.{d.domain}</b> in the Host/Name box.</p>}
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                    <tr><th className="p-2">Type</th><th className="p-2">Host / Name</th><th className="p-2">Value / Points to</th><th className="p-2">Status</th></tr>
                  </thead>
                  <tbody>
                    {records.map((r) => (
                      <tr key={r.host} className="border-t">
                        <td className="p-2 font-mono">{r.type}</td>
                        <td className="p-2"><button className="inline-flex items-center gap-1 font-mono hover:text-primary" onClick={() => copy(r.host)}>{r.host}<Copy className="size-3" /></button></td>
                        <td className="p-2"><button className="inline-flex items-center gap-1 break-all text-left font-mono hover:text-primary" onClick={() => copy(r.value)}>{r.value}<Copy className="size-3 shrink-0" /></button></td>
                        <td className="p-2">{r.valid ? <span className="text-primary">Found</span> : <span className="text-muted-foreground">Not found yet</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {d.last_checked_at && <p className="text-xs text-muted-foreground">Last checked {new Date(d.last_checked_at).toLocaleString()}</p>}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
