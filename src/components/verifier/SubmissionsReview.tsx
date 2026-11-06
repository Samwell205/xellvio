import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { RefreshCw, CheckCircle2, XCircle, Clock, Send, Globe, Building2, User, MessageSquare, ShieldCheck, ExternalLink } from "lucide-react";
import { adminListTfns, adminSyncTfnsFromCarrier } from "@/lib/admin-verifiers.functions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Filter = "pending_verification" | "verified" | "rejected" | "all";
const FILTERS: { v: Filter; label: string }[] = [
  { v: "pending_verification", label: "In review" },
  { v: "verified", label: "Approved" },
  { v: "rejected", label: "Rejected" },
  { v: "all", label: "All" },
];

const STATUS: Record<string, { label: string; cls: string; Icon: any }> = {
  pending_verification: { label: "In review at carrier", cls: "bg-accent text-accent-foreground", Icon: Clock },
  verified: { label: "Approved by carrier", cls: "bg-primary/15 text-primary", Icon: CheckCircle2 },
  rejected: { label: "Rejected by carrier", cls: "bg-destructive/15 text-destructive", Icon: XCircle },
  sold: { label: "Sold", cls: "bg-muted text-muted-foreground", Icon: CheckCircle2 },
};

function parseNotes(notes: unknown): Record<string, any> | null {
  if (typeof notes !== "string" || !notes.trim().startsWith("{")) return null;
  try { return JSON.parse(notes); } catch { return null; }
}
const fmt = (d?: string | null) => (d ? new Date(d).toLocaleString() : null);

export function SubmissionsReview() {
  const listFn = useServerFn(adminListTfns);
  const syncFn = useServerFn(adminSyncTfnsFromCarrier);
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Filter>("pending_verification");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data, isFetching } = useQuery({ queryKey: ["admin", "tfns", filter], queryFn: () => listFn({ data: { status: filter } }) });

  const rows = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (data ?? []).filter((t: any) => !s || [t.phone_number, t.verifiers?.full_name, t.verifiers?.email, parseNotes(t.notes)?.legalEntityName].some((x) => String(x ?? "").toLowerCase().includes(s)));
  }, [data, search]);
  useEffect(() => {
    if (!rows.find((r: any) => r.id === selectedId)) setSelectedId(rows[0]?.id ?? null);
  }, [rows, selectedId]);
  const selected: any = rows.find((r: any) => r.id === selectedId);

  const sync = useMutation({
    mutationFn: (tfn_id?: string) => syncFn({ data: tfn_id ? { tfn_id } : {} }),
    onSuccess: (r) => {
      toast.success(r.checked === 0 ? "Nothing waiting on the carrier." : `Checked ${r.checked} with Twilio · ${r.updated} updated${r.failed ? ` · ${r.failed} couldn't be checked` : ""}`);
      qc.invalidateQueries({ queryKey: ["admin", "tfns"] });
      qc.invalidateQueries({ queryKey: ["admin", "verifiers"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
        <div>
          <h3 className="font-semibold">Submissions</h3>
          <p className="text-xs text-muted-foreground">Twilio approves or rejects each number. You can see every detail and the latest carrier update here.</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => sync.mutate(undefined)} disabled={sync.isPending}>
          <RefreshCw className={`size-3.5 mr-1.5 ${sync.isPending ? "animate-spin" : ""}`} /> Get latest from Twilio
        </Button>
      </div>
      <div className="grid md:grid-cols-[320px_minmax(0,1fr)] min-h-[560px]">
        <aside className="border-b md:border-b-0 md:border-r flex flex-col">
          <div className="p-3 space-y-2 border-b">
            <div className="flex flex-wrap gap-1">
              {FILTERS.map((f) => (
                <Button key={f.v} size="sm" variant={filter === f.v ? "default" : "ghost"} className="h-7 px-2.5 text-xs" onClick={() => setFilter(f.v)}>{f.label}</Button>
              ))}
            </div>
            <Input placeholder="Search number, business, verifier" value={search} onChange={(e) => setSearch(e.target.value)} className="h-8" />
          </div>
          <div className="flex-1 overflow-y-auto max-h-[640px]">
            {rows.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">{isFetching ? "Loading…" : "Nothing here."}</p>
            ) : rows.map((t: any) => {
              const st = STATUS[t.status] ?? STATUS.pending_verification;
              const n = parseNotes(t.notes);
              return (
                <button key={t.id} onClick={() => setSelectedId(t.id)} className={`w-full text-left px-4 py-3 border-b transition-colors hover:bg-muted/50 ${selectedId === t.id ? "bg-muted" : ""}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-sm">{t.phone_number}</span>
                    <st.Icon className={`size-3.5 ${st.cls.split(" ").find((c) => c.startsWith("text-"))}`} />
                  </div>
                  <div className="text-xs text-muted-foreground truncate">{n?.legalEntityName || "—"} · {t.verifiers?.full_name}</div>
                </button>
              );
            })}
          </div>
        </aside>
        <section className="p-5 min-w-0">
          {selected ? <Detail t={selected} onRefresh={() => sync.mutate(selected.id)} refreshing={sync.isPending} /> : <p className="text-sm text-muted-foreground">Select a submission to see its details.</p>}
        </section>
      </div>
    </Card>
  );
}

function Detail({ t, onRefresh, refreshing }: { t: any; onRefresh: () => void; refreshing: boolean }) {
  const st = STATUS[t.status] ?? STATUS.pending_verification;
  const n = parseNotes(t.notes);
  const timeline = [
    { label: "Submitted to Twilio", at: t.submitted_at ?? t.created_at, Icon: Send },
    { label: "Carrier review started", at: t.in_review_at, Icon: Clock },
    { label: "Approved", at: t.verified_at, Icon: CheckCircle2 },
    { label: "Rejected", at: t.rejected_at, Icon: XCircle },
  ].filter((x) => x.at);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-mono text-2xl font-bold">{t.phone_number}</div>
          <div className="text-sm text-muted-foreground">{t.verifiers?.full_name} · {t.verifiers?.email}</div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${st.cls}`}><st.Icon className="size-3.5" />{st.label}</span>
          <Button size="sm" variant="ghost" onClick={onRefresh} disabled={refreshing}><RefreshCw className={`size-3.5 ${refreshing ? "animate-spin" : ""}`} /></Button>
        </div>
      </div>

      {t.rejection_reason && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
          <div className="font-medium text-destructive">Carrier's reason</div>
          <div className="mt-1">{t.rejection_reason}</div>
        </div>
      )}

      <div>
        <h4 className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Carrier updates</h4>
        <ol className="space-y-2">
          {timeline.map((x) => (
            <li key={x.label} className="flex items-center gap-2 text-sm"><x.Icon className="size-4 text-muted-foreground" /><span className="font-medium">{x.label}</span><span className="text-muted-foreground">{fmt(x.at)}</span></li>
          ))}
          {t.updated_at && <li className="text-xs text-muted-foreground">Last checked {fmt(t.updated_at)}</li>}
        </ol>
      </div>

      {n ? (
        <div className="grid lg:grid-cols-2 gap-4">
          <Section Icon={Building2} title="Business">
            <Row k="Legal name" v={n.legalEntityName} />
            <Row k="Brand / DBA" v={n.businessDba} />
            <Row k="Business type" v={n.businessType} />
            <Row k="Registration no." v={n.businessRegistrationNumber} />
            <Row k="Address" v={[n.addressLine1, n.addressLine2, n.city, n.state, n.zip].filter(Boolean).join(", ")} />
            <Row k="Website" v={n.websiteUrl} link />
          </Section>
          <Section Icon={User} title="Contact">
            <Row k="Name" v={[n.contactFirstName, n.contactLastName].filter(Boolean).join(" ")} />
            <Row k="Email" v={n.contactEmail} />
            <Row k="Phone" v={n.contactPhone} />
            <Row k="Status emails" v={n.notificationEmail} />
          </Section>
          <Section Icon={ShieldCheck} title="Consent">
            <Row k="Opt-in type" v={n.optInType} />
            <Row k="Opt-in proof" v={n.proofOfOptInUrl} link />
            <Row k="Keywords" v={n.optInKeywords} />
            <Row k="Monthly volume" v={n.monthlyVolume} />
            <Row k="Use case" v={Array.isArray(n.useCaseCategories) ? n.useCaseCategories.join(", ") : n.useCaseCategories} />
            <Row k="Privacy policy" v={n.privacyPolicyUrl} link />
            <Row k="Terms" v={n.termsUrl} link />
          </Section>
          <Section Icon={MessageSquare} title="Messages">
            <Quote k="Use case description" v={n.useCaseDescription} />
            <Quote k="Sample message" v={n.sampleMessage} />
            <Quote k="Opt-in confirmation" v={n.optInConfirmationMessage} />
            <Quote k="HELP reply" v={n.helpMessageSample} />
            {n.additionalInformation && <Quote k="Additional info" v={n.additionalInformation} />}
          </Section>
        </div>
      ) : t.notes ? (
        <Section Icon={Globe} title="Notes"><p className="text-sm whitespace-pre-wrap break-words">{t.notes}</p></Section>
      ) : null}
    </div>
  );
}

function Section({ Icon, title, children }: { Icon: any; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border p-4">
      <h4 className="flex items-center gap-2 text-sm font-semibold mb-3"><Icon className="size-4 text-primary" />{title}</h4>
      <dl className="space-y-2">{children}</dl>
    </div>
  );
}
function Row({ k, v, link }: { k: string; v: any; link?: boolean }) {
  if (v === undefined || v === null || v === "") return null;
  const s = String(v);
  return (
    <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-2 text-sm">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="break-words">{link && /^https?:\/\//i.test(s) ? <a href={s} target="_blank" rel="noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">{s}<ExternalLink className="size-3 shrink-0" /></a> : s}</dd>
    </div>
  );
}
function Quote({ k, v }: { k: string; v: any }) {
  if (!v) return null;
  return (
    <div className="text-sm">
      <dt className="text-muted-foreground text-xs mb-1">{k}</dt>
      <dd className="rounded-md bg-muted px-3 py-2 break-words">{String(v)}</dd>
    </div>
  );
}
