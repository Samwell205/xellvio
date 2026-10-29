import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { motion } from "framer-motion";
import { listEmailCampaigns, deleteEmailCampaigns } from "@/lib/email-campaigns.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/StatusBadge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { BarChart3, CalendarClock, ChevronRight, FileEdit, Mail, MessageSquare, Plus, RefreshCw, Search, Send, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/campaigns/")({
  head: () => ({ meta: [{ title: "SMS and email campaigns — Xellvio" }, { name: "description", content: "Manage and track your Xellvio SMS and email campaigns." }, { property: "og:title", content: "SMS and email campaigns — Xellvio" }, { property: "og:description", content: "Manage and track business campaigns in Xellvio." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: CampaignsPage,
});

type Row = { id: string; name: string; status: string; channel: "sms" | "email"; sub: string; when: string; created: string; total?: number };
const FILTERS = [["all", "All"], ["draft", "Drafts"], ["scheduled", "Scheduled"], ["active", "Sending"], ["sent", "Sent"]] as const;
const ACTIVE = ["queued", "sending", "running", "paused", "processing"];

function CampaignsPage() {
  const qc = useQueryClient();
  const [toDelete, setToDelete] = useState<{ id: string; name: string; channel: "sms" | "email" } | null>(null);
  const [confirmAllDrafts, setConfirmAllDrafts] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [channel, setChannel] = useState<"all" | "sms" | "email">("all");
  const [filter, setFilter] = useState<(typeof FILTERS)[number][0]>("all");
  const [search, setSearch] = useState("");
  const listEmails = useServerFn(listEmailCampaigns);
  const deleteEmails = useServerFn(deleteEmailCampaigns);
  const emails = useQuery({ queryKey: ["email-campaigns"], queryFn: () => listEmails(), refetchInterval: 10000 });
  const q = useQuery({
    queryKey: ["campaigns"],
    refetchInterval: 8_000,
    queryFn: async () =>
      (await supabase.from("campaigns").select("id,name,status,send_mode,schedule_at,created_at").order("created_at", { ascending: false })).data ?? [],
  });

  const rows = useMemo<Row[]>(() => {
    const sms: Row[] = (q.data ?? []).map((c) => ({ id: c.id, name: c.name, status: c.status, channel: "sms", sub: c.send_mode === "scheduled" ? "Scheduled send" : "Text message", when: c.schedule_at ?? "", created: c.created_at }));
    const em: Row[] = (emails.data ?? []).map((c) => ({ id: c.id, name: c.name, status: c.status, channel: "email", sub: c.subject || "No subject yet", when: "", created: c.created_at, total: c.total }));
    return [...sms, ...em].sort((a, b) => b.created.localeCompare(a.created));
  }, [q.data, emails.data]);

  const visible = rows.filter((r) => {
    if (channel !== "all" && r.channel !== channel) return false;
    if (search && !`${r.name} ${r.sub}`.toLowerCase().includes(search.toLowerCase())) return false;
    if (filter === "draft") return r.status === "draft";
    if (filter === "scheduled") return r.status === "scheduled" || !!r.when;
    if (filter === "active") return ACTIVE.includes(r.status);
    if (filter === "sent") return ["sent", "completed", "done"].includes(r.status);
    return true;
  });

  const stats = [
    { label: "Campaigns", value: rows.length, icon: Send },
    { label: "Drafts", value: rows.filter((r) => r.status === "draft").length, icon: FileEdit },
    { label: "Sending now", value: rows.filter((r) => ACTIVE.includes(r.status)).length, icon: RefreshCw },
    { label: "Email campaigns", value: rows.filter((r) => r.channel === "email").length, icon: Mail },
  ];

  const draftRows = rows.filter((r) => r.status === "draft" || r.status === "cancelled");

  async function handleDelete() {
    if (!toDelete) return;
    setDeleting(true);
    if (toDelete.channel === "email") {
      try {
        await deleteEmails({ data: { ids: [toDelete.id] } });
      } catch (e) {
        setDeleting(false);
        toast.error(e instanceof Error ? e.message : "Failed to delete campaign");
        return;
      }
    } else {
      const { error } = await supabase.from("campaigns").delete().eq("id", toDelete.id).in("status", ["draft", "cancelled"]);
      if (error) { setDeleting(false); toast.error(error.message ?? "Failed to delete campaign"); return; }
    }
    setDeleting(false);
    toast.success(`Deleted "${toDelete.name}"`);
    setToDelete(null);
    qc.invalidateQueries({ queryKey: ["campaigns"] });
    qc.invalidateQueries({ queryKey: ["email-campaigns"] });
  }

  async function handleDeleteAllDrafts() {
    if (draftRows.length === 0) return;
    setDeleting(true);
    const emailIds = draftRows.filter((r) => r.channel === "email").map((r) => r.id);
    const smsIds = draftRows.filter((r) => r.channel === "sms").map((r) => r.id);
    try {
      if (emailIds.length) await deleteEmails({ data: { ids: emailIds } });
      if (smsIds.length) {
        const { error } = await supabase.from("campaigns").delete().in("id", smsIds).in("status", ["draft", "cancelled"]);
        if (error) throw error;
      }
    } catch (e) {
      setDeleting(false);
      toast.error(e instanceof Error ? e.message : "Failed to delete drafts");
      return;
    }
    setDeleting(false);
    toast.success(`Deleted ${draftRows.length} draft${draftRows.length === 1 ? "" : "s"}`);
    setConfirmAllDrafts(false);
    qc.invalidateQueries({ queryKey: ["campaigns"] });
    qc.invalidateQueries({ queryKey: ["email-campaigns"] });
  }

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-3xl border bg-card p-6 md:p-8">
        <div className="pointer-events-none absolute -right-20 -top-24 size-72 rounded-full bg-brand-green/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-28 left-1/3 size-72 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-5">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-green">Campaigns</p>
            <h1 className="mt-2 text-3xl font-extrabold tracking-tight md:text-4xl">Reach your customers</h1>
            <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
              Create, schedule and track SMS and email campaigns.
              <span className="inline-flex items-center gap-1 text-xs"><RefreshCw className={`size-3 ${q.isFetching ? "animate-spin" : ""}`} />live</span>
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/app/campaigns/new"><Button size="lg" className="gap-2"><MessageSquare className="size-4" />New SMS</Button></Link>
            <Link to="/app/campaigns/email"><Button size="lg" variant="outline" className="gap-2 border-brand-green/40 hover:bg-brand-green/10"><Mail className="size-4 text-brand-green" />New email</Button></Link>
          </div>
        </div>
        <div className="relative mt-7 grid grid-cols-2 gap-3 md:grid-cols-4">
          {stats.map((s, i) => (
            <motion.div key={s.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="rounded-2xl border bg-background/60 p-4 backdrop-blur">
              <div className="flex items-center justify-between text-xs text-muted-foreground">{s.label}<s.icon className="size-4 text-brand-green" /></div>
              <div className="mt-2 text-2xl font-bold tabular-nums">{s.value}</div>
            </motion.div>
          ))}
        </div>
      </section>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-full border bg-muted/50 p-1">
            {([["all", "All channels", Send], ["sms", "SMS", MessageSquare], ["email", "Email", Mail]] as const).map(([v, l, I]) => (
              <button key={v} type="button" onClick={() => setChannel(v)} className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition ${channel === v ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}><I className="size-3.5" />{l}</button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1">
            {FILTERS.map(([v, l]) => (
              <button key={v} type="button" onClick={() => setFilter(v)} className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${filter === v ? "bg-brand-green/15 text-brand-green" : "text-muted-foreground hover:bg-muted"}`}>{l}</button>
            ))}
          </div>
        </div>
        <div className="flex w-full items-center gap-2 lg:w-auto">
          <div className="relative flex-1 lg:w-72">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search campaigns" className="rounded-full pl-9" aria-label="Search campaigns" />
          </div>
          {draftRows.length > 0 && (
            <Button variant="outline" size="sm" className="gap-1.5 rounded-full border-destructive/40 text-destructive hover:bg-destructive/10" onClick={() => setConfirmAllDrafts(true)}>
              <Trash2 className="size-3.5" />Delete drafts ({draftRows.length})
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-2">
        {visible.length === 0 && !q.isLoading && (
          <div className="rounded-3xl border border-dashed p-14 text-center">
            <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-brand-green/10"><Send className="size-6 text-brand-green" /></div>
            <div className="mt-4 font-semibold">No campaigns here yet</div>
            <p className="mt-1 text-sm text-muted-foreground">Start a new SMS or email campaign to reach your audience.</p>
          </div>
        )}
        {emails.error && channel !== "sms" && <p className="text-sm text-destructive">{emails.error.message}</p>}
        {visible.map((c, i) => {
          const isEmail = c.channel === "email";
          const open = isEmail
            ? <Link to="/app/campaigns/email" search={{ id: c.id }} className="truncate font-semibold hover:underline">{c.name}</Link>
            : c.status === "draft"
              ? <Link to="/app/campaigns/new" search={{ id: c.id }} className="truncate font-semibold hover:underline">{c.name}</Link>
              : <Link to="/app/campaigns/$id" params={{ id: c.id }} className="truncate font-semibold hover:underline">{c.name}</Link>;
          return (
            <motion.div key={`${c.channel}-${c.id}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 12) * 0.02 }}
              className="group grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 rounded-2xl border bg-card p-4 transition hover:border-brand-green/40 hover:shadow-md">
              <div className={`grid size-11 shrink-0 place-items-center rounded-xl ${isEmail ? "bg-brand-green/12 text-brand-green" : "bg-primary/10 text-primary"}`}>
                {isEmail ? <Mail className="size-5" /> : <MessageSquare className="size-5" />}
              </div>
              <div className="min-w-0">
                <div className="flex min-w-0 flex-wrap items-center gap-2">{open}<StatusBadge status={c.status} /></div>
                <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span className="truncate">{c.sub}</span>
                  {c.when && <span className="inline-flex items-center gap-1"><CalendarClock className="size-3" />{new Date(c.when).toLocaleString()}</span>}
                  {typeof c.total === "number" && c.total > 0 && <span>{c.total.toLocaleString()} recipients</span>}
                  <span>Created {new Date(c.created).toLocaleDateString()}</span>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {isEmail ? (
                  <Link to="/app/campaigns/email" search={{ id: c.id }}><Button variant="ghost" size="sm" className="gap-1">{c.status === "draft" ? <><FileEdit className="size-4" />Edit</> : <><BarChart3 className="size-4" />Report</>}</Button></Link>
                ) : c.status === "draft" ? (
                  <Link to="/app/campaigns/new" search={{ id: c.id }}><Button variant="ghost" size="sm" className="gap-1"><FileEdit className="size-4" />Edit</Button></Link>
                ) : (
                  <Link to="/app/campaigns/$id/report" params={{ id: c.id }}><Button variant="ghost" size="sm" className="gap-1"><BarChart3 className="size-4" /><span className="hidden sm:inline">Report</span></Button></Link>
                )}
                {(c.status === "draft" || c.status === "cancelled") && (
                  <Button variant="ghost" size="icon" className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive" onClick={() => setToDelete({ id: c.id, name: c.name, channel: c.channel })} aria-label={`Delete ${c.name}`}><Trash2 className="size-4" /></Button>
                )}
                <ChevronRight className="hidden size-4 text-muted-foreground transition group-hover:translate-x-0.5 sm:block" />
              </div>
            </motion.div>
          );
        })}
      </div>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this campaign?</AlertDialogTitle>
            <AlertDialogDescription>"{toDelete?.name}" and all of its message records will be permanently removed. This can't be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); handleDelete(); }} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting ? "Deleting…" : "Delete campaign"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
