import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Papa from "papaparse";
import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";
import { supabase } from "@/integrations/supabase/client";
import { useAccountId } from "@/hooks/useAccountId";


import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Users, Upload, UserPlus, Search, ShieldOff, CheckCircle2, Clock, Download,
  AlertTriangle, Trash2, List as ListIcon, Plus, Pencil, X,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/audience")({
  head: () => ({ meta: [{ title: "Audience — Xellvio" }] }),
  component: AudiencePage,
});

type ProfileRow = {
  id: string;
  phone_e164: string;
  first_name: string | null;
  last_name: string | null;
  country_code: string | null;
  created_at: string;
  consent_status: "subscribed" | "unsubscribed" | "pending";
  list_ids: string[];
};

type ContactList = { id: string; name: string; description: string | null };

const PHONE_KEYS = ["phone", "phone_number", "phonenumber", "mobile", "mobile_number", "cell", "msisdn", "number", "tel", "telephone", "to"];
const FIRST_KEYS = ["first_name", "firstname", "fname", "given_name"];
const LAST_KEYS = ["last_name", "lastname", "lname", "surname", "family_name"];
const COUNTRY_KEYS = ["country", "country_code", "iso", "iso2"];
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const CSV_TEMPLATE = `phone,first_name,last_name,country
+15551234567,Ada,Lovelace,US
+447911123456,Alan,Turing,GB
+2348012345678,Chimamanda,Adichie,NG
`;

const sb = supabase as any;

function AudiencePage() {
  const qc = useQueryClient();
  const acctId = useAccountId();
  const [search, setSearch] = useState("");
  const [listFilter, setListFilter] = useState<string | "all">("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());



  const listsQ = useQuery({
    queryKey: ["contact-lists"],
    queryFn: async (): Promise<ContactList[]> => {
      const { data, error } = await sb.from("contact_lists").select("id,name,description").order("name");
      if (error) throw error;
      return (data ?? []) as ContactList[];
    },
  });

  const profilesQ = useQuery({
    queryKey: ["audience-profiles", listFilter],
    queryFn: async (): Promise<ProfileRow[]> => {
      // When filtering by a specific list, load ALL of that list's members
      // (paged through Supabase's 1000-row cap) so users see their full list.
      let listProfileIds: string[] | null = null;
      if (listFilter !== "all") {
        listProfileIds = [];
        const PAGE = 1000;
        for (let offset = 0; ; offset += PAGE) {
          const { data, error } = await sb
            .from("profile_list_members")
            .select("profile_id")
            .eq("list_id", listFilter)
            .range(offset, offset + PAGE - 1);
          if (error) throw error;
          const ids = (data ?? []).map((m: any) => m.profile_id);
          listProfileIds.push(...ids);
          if (ids.length < PAGE) break;
        }
        if (listProfileIds.length === 0) return [];
      }

      // Pull profiles (chunked when filtering by list; capped to most recent when "all")
      const profiles: any[] = [];
      if (listProfileIds) {
        const CHUNK = 500;
        for (let i = 0; i < listProfileIds.length; i += CHUNK) {
          const chunk = listProfileIds.slice(i, i + CHUNK);
          const { data, error } = await supabase
            .from("profiles")
            .select("id, phone_e164, first_name, last_name, country_code, created_at, consents(status, channel)")
            .in("id", chunk);
          if (error) throw error;
          profiles.push(...(data ?? []));
        }
      } else {
        const { data, error } = await supabase
          .from("profiles")
          .select("id, phone_e164, first_name, last_name, country_code, created_at, consents(status, channel)")
          .order("created_at", { ascending: false })
          .limit(1000);
        if (error) throw error;
        profiles.push(...(data ?? []));
      }

      const mapped: ProfileRow[] = profiles.map((p: any) => {
        const sms = (p.consents ?? []).find((c: any) => c.channel === "sms");
        return { ...p, consent_status: sms?.status ?? "pending", list_ids: [] as string[] } as ProfileRow;
      });

      // Hydrate list memberships for the visible profiles
      if (mapped.length > 0) {
        const ids = mapped.map((p) => p.id);
        const byProfile: Record<string, string[]> = {};
        const CHUNK = 500;
        for (let i = 0; i < ids.length; i += CHUNK) {
          const { data: mem } = await sb
            .from("profile_list_members")
            .select("profile_id,list_id")
            .in("profile_id", ids.slice(i, i + CHUNK));
          for (const m of (mem ?? []) as any[]) {
            (byProfile[m.profile_id] ||= []).push(m.list_id);
          }
        }
        for (const p of mapped) p.list_ids = byProfile[p.id] ?? [];
      }
      mapped.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
      return mapped;
    },
  });

  // Per-list totals (HEAD count) — independent of the loaded profile rows
  const listCountsQ = useQuery({
    queryKey: ["audience-list-counts", (listsQ.data ?? []).map((l) => l.id).join(",")],
    enabled: (listsQ.data ?? []).length > 0,
    queryFn: async (): Promise<Record<string, number>> => {
      const out: Record<string, number> = {};
      const all = listsQ.data ?? [];
      await Promise.all(all.map(async (l) => {
        const { count } = await sb
          .from("profile_list_members")
          .select("profile_id", { count: "exact", head: true })
          .eq("list_id", l.id);
        out[l.id] = count ?? 0;
      }));
      return out;
    },
  });

  const statsQ = useQuery({
    queryKey: ["audience-stats"],
    queryFn: async () => {
      const [{ count: total }, { count: subs }, { count: supp }] = await Promise.all([
        supabase.from("profiles").select("*", { count: "exact", head: true }),
        supabase.from("consents").select("*", { count: "exact", head: true }).eq("status", "subscribed").eq("channel", "sms"),
        supabase.from("suppressions").select("*", { count: "exact", head: true }),
      ]);
      return { total: total ?? 0, subs: subs ?? 0, supp: supp ?? 0 };
    },
  });


  const filtered = useMemo(() => {
    const rows = profilesQ.data ?? [];
    const s = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (listFilter !== "all" && !r.list_ids.includes(listFilter)) return false;
      if (!s) return true;
      return r.phone_e164.toLowerCase().includes(s) ||
        (r.first_name ?? "").toLowerCase().includes(s) ||
        (r.last_name ?? "").toLowerCase().includes(s);
    });
  }, [profilesQ.data, search, listFilter]);

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["audience-profiles"] });
    qc.invalidateQueries({ queryKey: ["audience-stats"] });
    qc.invalidateQueries({ queryKey: ["suppressions"] });
    qc.invalidateQueries({ queryKey: ["contact-lists"] });
    qc.invalidateQueries({ queryKey: ["audience-list-counts"] });
  };

  const toggleConsent = useMutation({
    mutationFn: async (row: ProfileRow) => {
      const next = row.consent_status === "subscribed" ? "unsubscribed" : "subscribed";
      const { data: u } = await supabase.auth.getUser();
      const accountId = acctId ?? u.user!.id;
      const { error: ce } = await supabase.from("consents").upsert(
        { profile_id: row.id, channel: "sms", status: next, source: "manual", consented_at: new Date().toISOString() },
        { onConflict: "profile_id,channel" },
      );
      if (ce) throw ce;
      if (next === "unsubscribed") {
        await supabase.from("suppressions").upsert(
          { account_id: accountId, phone_e164: row.phone_e164, reason: "manual_opt_out", source: "audience_ui" },
          { onConflict: "account_id,phone_e164" },
        );
      } else {
        await supabase.from("suppressions").delete().eq("account_id", accountId).eq("phone_e164", row.phone_e164);
      }
    },
    onSuccess: invalidateAll,
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  async function deleteAndOfferUndo(ids: string[]) {
    if (ids.length === 0) return;
    const all = profilesQ.data ?? [];
    const rows = all.filter((r) => ids.includes(r.id));
    if (rows.length === 0) return;
    const { data: u } = await supabase.auth.getUser();
    const accountId = acctId ?? u.user!.id;

    // Snapshot profile data, consents, list memberships
    const { data: consentSnap } = await supabase
      .from("consents").select("profile_id,channel,status,source,consented_at").in("profile_id", ids);
    const { data: memSnap } = await sb
      .from("profile_list_members").select("profile_id,list_id,account_id,added_at").in("profile_id", ids);

    // Remove suppressions, then profiles (cascades consents + memberships)
    await supabase.from("suppressions").delete()
      .eq("account_id", accountId).in("phone_e164", rows.map((r) => r.phone_e164));
    const { error } = await supabase.from("profiles").delete().in("id", ids);
    if (error) { toast.error(error.message); return; }

    setSelected(new Set());
    invalidateAll();

    toast.success(`${rows.length} contact${rows.length === 1 ? "" : "s"} deleted`, {
      duration: 8000,
      action: {
        label: "Undo",
        onClick: async () => {
          try {
            await supabase.from("profiles").insert(rows.map((r) => ({
              id: r.id, account_id: accountId, phone_e164: r.phone_e164,
              first_name: r.first_name, last_name: r.last_name, country_code: r.country_code,
              created_at: r.created_at,
            })));
            if (consentSnap?.length) {
              await supabase.from("consents").upsert(consentSnap as any[], { onConflict: "profile_id,channel" });
            }
            if (memSnap?.length) {
              await sb.from("profile_list_members").upsert(memSnap as any[], { onConflict: "list_id,profile_id" });
            }
            toast.success("Restored");
            invalidateAll();
          } catch (e: any) {
            toast.error(`Couldn't undo: ${e.message ?? e}`);
          }
        },
      },
    });
  }

  function downloadTemplate() {
    const blob = new Blob([CSV_TEMPLATE], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "xellvio-contacts-template.csv";
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  const allVisibleSelected = filtered.length > 0 && filtered.every((r) => selected.has(r.id));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold flex items-center gap-2"><Users className="size-6" />Audience</h1>
          <p className="text-sm text-muted-foreground">Contacts, lists, consents, and opt-outs.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <ManageListsDialog lists={listsQ.data ?? []} onDone={invalidateAll} />
          <Button variant="outline" onClick={downloadTemplate}><Download className="size-4 mr-1.5" />CSV template</Button>
          <AddContactDialog lists={listsQ.data ?? []} onDone={invalidateAll} />
          <ImportCsvDialog lists={listsQ.data ?? []} onDone={invalidateAll} onDownloadTemplate={downloadTemplate} />
        </div>
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        <Stat icon={Users} label="Total contacts" value={statsQ.data?.total ?? 0} />
        <Stat icon={CheckCircle2} label="Subscribed (SMS)" value={statsQ.data?.subs ?? 0} tone="success" />
        <Stat icon={ShieldOff} label="Suppressed" value={statsQ.data?.supp ?? 0} tone="danger" />
      </div>

      {/* List filter chips */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs uppercase text-muted-foreground tracking-wide flex items-center gap-1"><ListIcon className="size-3.5" /> Lists:</span>
        <button
          onClick={() => setListFilter("all")}
          className={`px-3 py-1 rounded-full text-xs border ${listFilter === "all" ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-muted"}`}
        >All ({statsQ.data?.total ?? 0})</button>
        {(listsQ.data ?? []).map((l) => {
          const count = listCountsQ.data?.[l.id] ?? 0;
          const on = listFilter === l.id;
          return (
            <button key={l.id} onClick={() => setListFilter(l.id)}
              className={`px-3 py-1 rounded-full text-xs border ${on ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-muted"}`}
            >{l.name} ({count})</button>
          );
        })}
        {(listsQ.data ?? []).length === 0 && (
          <span className="text-xs text-muted-foreground">No lists yet — create one to group your contacts.</span>
        )}
      </div>

      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 max-w-sm">
            <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search name or phone…" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="text-xs text-muted-foreground ml-auto">{filtered.length} shown</div>
        </div>

        {selected.size > 0 && (
          <div className="flex items-center justify-between gap-2 rounded-lg border border-primary/40 bg-primary/5 px-3 py-2">
            <div className="text-sm"><b>{selected.size}</b> selected</div>
            <div className="flex gap-2">
              <AssignToListBulk
                lists={listsQ.data ?? []}
                ids={Array.from(selected)}
                onDone={() => { setSelected(new Set()); invalidateAll(); }}
              />
              <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}><X className="size-4 mr-1" />Clear</Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  if (confirm(`Delete ${selected.size} contact${selected.size === 1 ? "" : "s"}? You'll have 8 seconds to undo.`)) {
                    deleteAndOfferUndo(Array.from(selected));
                  }
                }}
              ><Trash2 className="size-4 mr-1" />Delete selected</Button>
            </div>
          </div>
        )}

        <div className="rounded-lg border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={allVisibleSelected}
                    onCheckedChange={(v) => {
                      const next = new Set(selected);
                      if (v) filtered.forEach((r) => next.add(r.id));
                      else filtered.forEach((r) => next.delete(r.id));
                      setSelected(next);
                    }}
                  />
                </TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Country</TableHead>
                <TableHead>Lists</TableHead>
                <TableHead>Consent</TableHead>
                <TableHead>Added</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {profilesQ.isLoading && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>}
              {!profilesQ.isLoading && filtered.length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-10">
                  No contacts in this view. Add one manually or import a CSV.
                </TableCell></TableRow>
              )}
              {filtered.map((r) => {
                const checked = selected.has(r.id);
                return (
                  <TableRow key={r.id} className={checked ? "bg-primary/5" : ""}>
                    <TableCell>
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(v) => {
                          const next = new Set(selected);
                          if (v) next.add(r.id); else next.delete(r.id);
                          setSelected(next);
                        }}
                      />
                    </TableCell>
                    <TableCell className="font-mono text-sm">{r.phone_e164}</TableCell>
                    <TableCell>{[r.first_name, r.last_name].filter(Boolean).join(" ") || <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell>{r.country_code ?? "—"}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {r.list_ids.length === 0 && <span className="text-xs text-muted-foreground">—</span>}
                        {r.list_ids.map((lid) => {
                          const l = (listsQ.data ?? []).find((x) => x.id === lid);
                          return l ? <Badge key={lid} variant="outline" className="text-xs">{l.name}</Badge> : null;
                        })}
                      </div>
                    </TableCell>
                    <TableCell><ConsentBadge status={r.consent_status} /></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" disabled={toggleConsent.isPending} onClick={() => toggleConsent.mutate(r)}>
                          {r.consent_status === "subscribed" ? "Opt out" : "Resubscribe"}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => {
                            if (confirm(`Delete ${r.phone_e164}? You'll have 8 seconds to undo.`)) {
                              deleteAndOfferUndo([r.id]);
                            }
                          }}
                        ><Trash2 className="size-4" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}

function Stat({ icon: Icon, label, value, tone }: { icon: any; label: string; value: number | string; tone?: "success" | "danger" }) {
  const ring = tone === "success" ? "text-success bg-success/10" : tone === "danger" ? "text-destructive bg-destructive/10" : "text-primary bg-primary/10";
  return (
    <Card className="p-5">
      <div className={`size-10 rounded-lg grid place-items-center ${ring}`}><Icon className="size-5" /></div>
      <div className="mt-3 text-2xl font-extrabold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </Card>
  );
}

function ConsentBadge({ status }: { status: ProfileRow["consent_status"] }) {
  if (status === "subscribed") return <Badge className="bg-success/15 text-success border-success/30"><CheckCircle2 className="size-3 mr-1" />Subscribed</Badge>;
  if (status === "unsubscribed") return <Badge variant="outline" className="text-destructive border-destructive/30"><ShieldOff className="size-3 mr-1" />Opted out</Badge>;
  return <Badge variant="outline"><Clock className="size-3 mr-1" />Pending</Badge>;
}

/* ============================ Lists management ============================ */

function ManageListsDialog({ lists, onDone }: { lists: ContactList[]; onDone: () => void }) {
  const acctId = useAccountId();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);


  async function save() {
    if (!name.trim()) { toast.error("Name required"); return; }
    setBusy(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (editingId) {
        const { error } = await sb.from("contact_lists").update({ name: name.trim(), description: desc || null }).eq("id", editingId);
        if (error) throw error;
        toast.success("List updated");
      } else {
        const { error } = await sb.from("contact_lists").insert({ account_id: (acctId ?? u.user!.id), name: name.trim(), description: desc || null });
        if (error) throw error;
        toast.success("List created");
      }
      setName(""); setDesc(""); setEditingId(null);
      onDone();
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    } finally { setBusy(false); }
  }

  async function remove(id: string) {
    if (!confirm("Delete this list? Contacts will remain — only the grouping is removed.")) return;
    const { error } = await sb.from("contact_lists").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("List deleted");
    onDone();
  }

  async function removeWithContacts(id: string, name: string) {
    if (!confirm(`Delete list "${name}" AND every contact inside it? This cannot be undone.`)) return;
    setBusy(true);
    try {
      // Fetch all member profile ids (paginated)
      const profileIds: string[] = [];
      let from = 0;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { data, error } = await sb
          .from("profile_list_members")
          .select("profile_id")
          .eq("list_id", id)
          .range(from, from + 999);
        if (error) throw error;
        const rows = data ?? [];
        profileIds.push(...rows.map((r: any) => r.profile_id));
        if (rows.length < 1000) break;
        from += 1000;
      }
      // Delete profiles in chunks (cascades will clear memberships, consents, etc.)
      for (let i = 0; i < profileIds.length; i += 500) {
        const chunk = profileIds.slice(i, i + 500);
        if (chunk.length === 0) break;
        const { error } = await sb.from("profiles").delete().in("id", chunk);
        if (error) throw error;
      }
      const { error: lerr } = await sb.from("contact_lists").delete().eq("id", id);
      if (lerr) throw lerr;
      toast.success(`List and ${profileIds.length} contact${profileIds.length === 1 ? "" : "s"} deleted`);
      onDone();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to delete list with contacts");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline"><ListIcon className="size-4 mr-1.5" />Manage lists</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Contact lists</DialogTitle>
          <DialogDescription>Group contacts into named lists you can target with segments and campaigns.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-2">
            <Label>{editingId ? "Edit list" : "Create new list"}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Black Friday VIPs" />
            <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Description (optional)" rows={2} />
            <div className="flex gap-2 justify-end">
              {editingId && <Button variant="ghost" onClick={() => { setEditingId(null); setName(""); setDesc(""); }}>Cancel edit</Button>}
              <Button onClick={save} disabled={busy}><Plus className="size-4 mr-1" />{editingId ? "Save changes" : "Create list"}</Button>
            </div>
          </div>
          <div className="border-t pt-3">
            <div className="text-xs uppercase text-muted-foreground tracking-wide mb-2">Existing lists ({lists.length})</div>
            <div className="space-y-1 max-h-60 overflow-y-auto">
              {lists.length === 0 && <p className="text-sm text-muted-foreground">No lists yet.</p>}
              {lists.map((l) => (
                <div key={l.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                  <div>
                    <div className="font-medium">{l.name}</div>
                    {l.description && <div className="text-xs text-muted-foreground">{l.description}</div>}
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => { setEditingId(l.id); setName(l.name); setDesc(l.description ?? ""); }}><Pencil className="size-4" /></Button>
                    <Button variant="ghost" size="sm" className="text-destructive" title="Delete list only (keep contacts)" onClick={() => remove(l.id)}><Trash2 className="size-4" /></Button>
                    <Button variant="ghost" size="sm" className="text-destructive" title="Delete list AND all contacts in it" disabled={busy} onClick={() => removeWithContacts(l.id, l.name)}><Trash2 className="size-4" /><span className="ml-1 text-[10px] font-semibold">+ contacts</span></Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Done</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AssignToListBulk({ lists, ids, onDone }: { lists: ContactList[]; ids: string[]; onDone: () => void }) {
  const acctId = useAccountId();
  const [open, setOpen] = useState(false);
  const [listId, setListId] = useState<string>("");
  const [busy, setBusy] = useState(false);


  async function assign() {
    if (!listId) { toast.error("Pick a list"); return; }
    setBusy(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const rows = ids.map((pid) => ({ profile_id: pid, list_id: listId, account_id: (acctId ?? u.user!.id) }));
      const { error } = await sb.from("profile_list_members").upsert(rows, { onConflict: "list_id,profile_id" });
      if (error) throw error;
      toast.success(`Added ${ids.length} to list`);
      setOpen(false);
      onDone();
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    } finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm"><ListIcon className="size-4 mr-1" />Assign to list</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Assign {ids.length} to a list</DialogTitle></DialogHeader>
        {lists.length === 0 ? (
          <p className="text-sm text-muted-foreground">No lists yet. Create one from "Manage lists" first.</p>
        ) : (
          <Select value={listId} onValueChange={setListId}>
            <SelectTrigger><SelectValue placeholder="Pick a list…" /></SelectTrigger>
            <SelectContent>{lists.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}</SelectContent>
          </Select>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={assign} disabled={busy || !listId}>{busy ? "Assigning…" : "Assign"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ============================ Add / Import ============================ */

function AddContactDialog({ lists, onDone }: { lists: ContactList[]; onDone: () => void }) {
  const acctId = useAccountId();
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState("US");
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [listId, setListId] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);


  async function submit() {
    setSubmitting(true);
    try {
      const parsed = parsePhoneNumberFromString(phone, country as CountryCode);
      if (!parsed || !parsed.isValid()) { toast.error("Invalid phone number"); return; }
      const e164 = parsed.number;
      const { data: u } = await supabase.auth.getUser();
      const accountId = acctId ?? u.user!.id;
      const { data: prof, error } = await supabase.from("profiles").upsert(
        { account_id: accountId, phone_e164: e164, first_name: first || null, last_name: last || null, country_code: parsed.country ?? country },
        { onConflict: "account_id,phone_e164" },
      ).select("id").single();
      if (error) throw error;
      await supabase.from("consents").upsert(
        { profile_id: prof.id, channel: "sms", status: "subscribed", source: "manual", consented_at: new Date().toISOString() },
        { onConflict: "profile_id,channel" },
      );
      if (listId) {
        await sb.from("profile_list_members").upsert(
          { list_id: listId, profile_id: prof.id, account_id: accountId },
          { onConflict: "list_id,profile_id" },
        );
      }
      toast.success("Contact added");
      setOpen(false);
      setPhone(""); setFirst(""); setLast(""); setListId("");
      onDone();
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    } finally { setSubmitting(false); }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="outline"><UserPlus className="size-4 mr-1.5" />Add contact</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a contact</DialogTitle>
          <DialogDescription>You attest this person opted in to receive SMS from you.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-3 gap-2">
            <div><Label>Country</Label><Input value={country} onChange={(e) => setCountry(e.target.value.toUpperCase())} maxLength={2} /></div>
            <div className="col-span-2"><Label>Phone</Label><Input placeholder="+15551234567 or local" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>First name</Label><Input value={first} onChange={(e) => setFirst(e.target.value)} /></div>
            <div><Label>Last name</Label><Input value={last} onChange={(e) => setLast(e.target.value)} /></div>
          </div>
          {lists.length > 0 && (
            <div>
              <Label>Add to list (optional)</Label>
              <Select value={listId} onValueChange={setListId}>
                <SelectTrigger><SelectValue placeholder="No list" /></SelectTrigger>
                <SelectContent>{lists.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} disabled={submitting}>{submitting ? "Adding…" : "Add contact"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type Preview = {
  fileName: string;
  size: number;
  headers: string[];
  detected: { phone?: string; first?: string; last?: string; country?: string };
  rows: Record<string, string>[];
  rowsPreview: Record<string, string>[];
  parseErrors: string[];
};

type RowError = { row: number; reason: string; raw: string };

function detectField(headers: string[], aliases: string[]): string | undefined {
  for (const h of headers) if (aliases.includes(h)) return h;
  return undefined;
}

function ImportCsvDialog({ lists, onDone, onDownloadTemplate }: { lists: ContactList[]; onDone: () => void; onDownloadTemplate: () => void }) {
  const acctId = useAccountId();
  const [open, setOpen] = useState(false);
  const [defaultCountry, setDefaultCountry] = useState("US");
  const [busy, setBusy] = useState(false);

  const [preview, setPreview] = useState<Preview | null>(null);
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  const [excludedCols, setExcludedCols] = useState<Set<string>>(new Set());
  const [mapping, setMapping] = useState<{ phone?: string; first?: string; last?: string; country?: string }>({});
  const [result, setResult] = useState<{ inserted: number; invalid: number; duplicates: number; errors: RowError[] } | null>(null);
  const [listMode, setListMode] = useState<"none" | "existing" | "new">("none");
  const [existingListId, setExistingListId] = useState<string>("");
  const [newListName, setNewListName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<{
    phase: "validating" | "importing" | "attaching" | "done";
    processed: number;
    total: number;
    label: string;
  } | null>(null);

  function reset() {
    setPreview(null); setResult(null); setListMode("none"); setExistingListId(""); setNewListName("");
    setExcluded(new Set());
    setExcludedCols(new Set());
    setMapping({});
    setProgress(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handleFilePicked(file: File) {
    setResult(null);
    const name = file.name.toLowerCase();
    const okType = file.type === "text/csv" || file.type === "application/vnd.ms-excel" || name.endsWith(".csv");
    if (!okType) { toast.error("Only .csv files are allowed."); return; }
    if (file.size > MAX_FILE_SIZE) { toast.error(`File is ${(file.size / 1024 / 1024).toFixed(1)} MB — max is 10 MB.`); return; }
    if (file.size === 0) { toast.error("File is empty."); return; }
    try {
      const text = await file.text();
      const parsed = Papa.parse<Record<string, string>>(text, {
        header: true, skipEmptyLines: true,
        transformHeader: (h) => h.trim().toLowerCase().replace(/[\s\-]+/g, "_"),
      });
      const headers = parsed.meta.fields ?? [];
      const detected = {
        phone: detectField(headers, PHONE_KEYS),
        first: detectField(headers, FIRST_KEYS),
        last: detectField(headers, LAST_KEYS),
        country: detectField(headers, COUNTRY_KEYS),
      };
      const parseErrors = (parsed.errors ?? []).slice(0, 10).map((e) => `Row ${e.row ?? "?"}: ${e.message}`);
      setPreview({ fileName: file.name, size: file.size, headers, detected, rows: parsed.data, rowsPreview: parsed.data.slice(0, 5), parseErrors });
      setExcluded(new Set());
      setExcludedCols(new Set());
      setMapping({ phone: detected.phone, first: detected.first, last: detected.last, country: detected.country });
      // Default to file name as new list name
      if (listMode === "none" && lists.length === 0) {
        setListMode("new");
        setNewListName(file.name.replace(/\.csv$/i, "").slice(0, 60));
      }
    } catch (e: any) {
      toast.error(`Could not read file: ${e.message ?? e}`);
    }
  }

  async function runImport() {
    if (!preview) return;
    const effDetected = {
      phone: mapping.phone && !excludedCols.has(mapping.phone) ? mapping.phone : undefined,
      first: mapping.first && !excludedCols.has(mapping.first) ? mapping.first : undefined,
      last: mapping.last && !excludedCols.has(mapping.last) ? mapping.last : undefined,
      country: mapping.country && !excludedCols.has(mapping.country) ? mapping.country : undefined,
    };
    if (!effDetected.phone) { toast.error("Map a column to phone before importing."); return; }
    setBusy(true);
    setResult(null);
    const includedCount = preview.rows.length - excluded.size;
    setProgress({ phase: "validating", processed: 0, total: includedCount, label: "Validating phone numbers…" });
    try {
      const { data: u } = await supabase.auth.getUser();
      const accountId = acctId ?? u.user!.id;

      // Resolve target list
      let targetListId: string | null = null;
      if (listMode === "existing") {
        if (!existingListId) { toast.error("Pick a list"); setBusy(false); return; }
        targetListId = existingListId;
      } else if (listMode === "new") {
        if (!newListName.trim()) { toast.error("Enter a list name"); setBusy(false); return; }
        const { data: created, error: lerr } = await sb.from("contact_lists")
          .insert({ account_id: accountId, name: newListName.trim() })
          .select("id").single();
        if (lerr) {
          // If duplicate, fall back to existing one with same name
          const { data: existing } = await sb.from("contact_lists").select("id").eq("account_id", accountId).eq("name", newListName.trim()).maybeSingle();
          if (existing) targetListId = existing.id;
          else throw lerr;
        } else {
          targetListId = created.id;
        }
      }

      const fallbackCountries: CountryCode[] = (defaultCountry ? [defaultCountry as CountryCode] : []).concat(["US","GB","NG","CA","AU","ZA","KE","GH","DE","FR","IN"] as CountryCode[]);

      const seen = new Set<string>();
      const valid: { account_id: string; phone_e164: string; first_name: string | null; last_name: string | null; country_code: string }[] = [];
      const errors: RowError[] = [];
      let duplicates = 0;

      function pick(row: Record<string, string>, key?: string) {
        if (!key) return "";
        const v = row[key];
        return v == null ? "" : String(v).trim();
      }

      preview.rows.forEach((row, idx) => {
        if (excluded.has(idx)) return;
        const rowNum = idx + 2;
        let raw = pick(row, effDetected.phone);
        if (!raw) { errors.push({ row: rowNum, reason: "Missing phone", raw: JSON.stringify(row) }); return; }
        raw = raw.replace(/[\s\-()\u00A0]/g, "");
        const digitsOnly = raw.replace(/[^\d]/g, "");
        const rowCountry = pick(row, effDetected.country).toUpperCase().slice(0, 2) as CountryCode | "";

        const candidates: { value: string; country?: CountryCode }[] = [];
        if (raw.startsWith("+")) candidates.push({ value: raw });
        else if (digitsOnly.length >= 11) candidates.push({ value: "+" + digitsOnly });
        if (rowCountry) candidates.push({ value: raw, country: rowCountry });
        for (const cc of fallbackCountries) candidates.push({ value: raw, country: cc });

        let p: ReturnType<typeof parsePhoneNumberFromString> | undefined;
        for (const c of candidates) {
          const x = parsePhoneNumberFromString(c.value, c.country);
          if (x?.isValid()) { p = x; break; }
        }
        if (!p) { errors.push({ row: rowNum, reason: `Invalid phone "${raw}"`, raw }); return; }
        const e164 = p.number;
        if (seen.has(e164)) { duplicates++; return; }
        seen.add(e164);
        valid.push({
          account_id: accountId,
          phone_e164: e164,
          first_name: pick(row, effDetected.first) || null,
          last_name: pick(row, effDetected.last) || null,
          country_code: p.country ?? rowCountry ?? defaultCountry,
        });
      });

      setProgress({ phase: "importing", processed: 0, total: valid.length, label: `Importing 0 / ${valid.length} contacts…` });
      let inserted = 0;
      const insertedIds: string[] = [];
      for (let i = 0; i < valid.length; i += 500) {
        const chunk = valid.slice(i, i + 500);
        const { data, error } = await supabase
          .from("profiles")
          .upsert(chunk, { onConflict: "account_id,phone_e164", ignoreDuplicates: false })
          .select("id");
        if (error) throw new Error(`Database error on chunk ${i}: ${error.message}`);
        inserted += data?.length ?? 0;
        if (data?.length) {
          insertedIds.push(...data.map((d: any) => d.id));
          const consents = data.map((d: any) => ({
            profile_id: d.id, channel: "sms" as const, status: "subscribed" as const, source: "csv_import",
            consented_at: new Date().toISOString(),
          }));
          await supabase.from("consents").upsert(consents, { onConflict: "profile_id,channel" });
        }
        const processed = Math.min(i + 500, valid.length);
        setProgress({ phase: "importing", processed, total: valid.length, label: `Importing ${processed} / ${valid.length} contacts…` });
      }

      if (targetListId && insertedIds.length > 0) {
        setProgress({ phase: "attaching", processed: 0, total: insertedIds.length, label: `Adding to list 0 / ${insertedIds.length}…` });
        const members = insertedIds.map((pid) => ({ list_id: targetListId!, profile_id: pid, account_id: accountId }));
        for (let i = 0; i < members.length; i += 500) {
          await sb.from("profile_list_members").upsert(members.slice(i, i + 500), { onConflict: "list_id,profile_id" });
          const processed = Math.min(i + 500, members.length);
          setProgress({ phase: "attaching", processed, total: members.length, label: `Adding to list ${processed} / ${members.length}…` });
        }
      }
      setProgress({ phase: "done", processed: valid.length, total: valid.length, label: "Done" });

      setResult({ inserted, invalid: errors.length, duplicates, errors });
      if (inserted > 0) toast.success(`Imported ${inserted} contacts${targetListId ? " into list" : ""}`);
      else toast.error("No contacts imported. See row errors below.");
      onDone();
    } catch (e: any) {
      toast.error(e.message ?? "Import failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild><Button><Upload className="size-4 mr-1.5" />Import CSV</Button></DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import contacts from CSV</DialogTitle>
          <DialogDescription>
            Required header: <code className="text-xs">phone</code>. Optional: <code className="text-xs">first_name</code>, <code className="text-xs">last_name</code>, <code className="text-xs">country</code> (ISO-2).{" "}
            <button type="button" className="underline text-primary" onClick={onDownloadTemplate}>Download template</button>.
            <br />Max file size: 10 MB. Only <code className="text-xs">.csv</code> accepted.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label>Default country (used when row has no country)</Label>
            <Input value={defaultCountry} onChange={(e) => setDefaultCountry(e.target.value.toUpperCase())} maxLength={2} />
          </div>

          <Card className="p-3 space-y-2">
            <Label>Add imported contacts to a list</Label>
            <Select value={listMode} onValueChange={(v) => setListMode(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No list (just import)</SelectItem>
                <SelectItem value="existing" disabled={lists.length === 0}>Add to existing list</SelectItem>
                <SelectItem value="new">Create a new list</SelectItem>
              </SelectContent>
            </Select>
            {listMode === "existing" && (
              <Select value={existingListId} onValueChange={setExistingListId}>
                <SelectTrigger><SelectValue placeholder="Pick a list…" /></SelectTrigger>
                <SelectContent>{lists.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}</SelectContent>
              </Select>
            )}
            {listMode === "new" && (
              <Input value={newListName} onChange={(e) => setNewListName(e.target.value)} placeholder="New list name" />
            )}
          </Card>

          <Input ref={fileRef} type="file" accept=".csv,text/csv" disabled={busy}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFilePicked(f); }} />

          {preview && !result && (
            <Card className="p-3 space-y-2 text-sm">
              <div className="flex justify-between items-center">
                <div className="font-medium">{preview.fileName} <span className="text-muted-foreground text-xs">({(preview.size / 1024).toFixed(1)} KB · {preview.rows.length} rows)</span></div>
                <Button variant="ghost" size="sm" onClick={reset}>Choose different file</Button>
              </div>
              <div className="space-y-2">
                <div className="text-xs font-medium">Map columns <span className="text-muted-foreground font-normal">(these values feed personalization like {"{first_name}"})</span></div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {([
                    { key: "phone", label: "Phone *", required: true },
                    { key: "first", label: "First name", required: false },
                    { key: "last", label: "Last name", required: false },
                    { key: "country", label: "Country (ISO-2)", required: false },
                  ] as { key: "phone" | "first" | "last" | "country"; label: string; required: boolean }[]).map(({ key, label, required }) => (
                    <div key={key} className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">{label}</Label>
                      <Select
                        value={mapping[key] ?? "__none"}
                        onValueChange={(v) => setMapping((m) => ({ ...m, [key]: v === "__none" ? undefined : v }))}
                      >
                        <SelectTrigger className={"h-8 text-xs " + (required && !mapping.phone ? "border-destructive" : "")}>
                          <SelectValue placeholder="— none —" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none">— none —</SelectItem>
                          {preview.headers.map((h) => <SelectItem key={h} value={h} className="text-xs">{h}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
                {!mapping.phone && (
                  <div className="flex items-start gap-1 text-destructive text-xs"><AlertTriangle className="size-3.5 mt-0.5" />Select a phone column to enable import.</div>
                )}
                {preview.parseErrors.length > 0 && (
                  <div className="text-warning text-xs">
                    <div className="font-medium">Parser warnings:</div>
                    <ul className="list-disc ml-5">{preview.parseErrors.map((m, i) => <li key={i}>{m}</li>)}</ul>
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between text-xs">
                <div className="text-muted-foreground">
                  <b className="text-foreground">{preview.rows.length - excluded.size}</b> of {preview.rows.length} rows selected for import
                  {excluded.size > 0 && <> · <b className="text-foreground">{excluded.size}</b> excluded</>}
                </div>
                <div className="flex gap-2">
                  <button type="button" className="underline hover:text-foreground" onClick={() => setExcluded(new Set())}>Select all</button>
                  <button type="button" className="underline hover:text-foreground"
                    onClick={() => setExcluded(new Set(preview.rows.map((_, i) => i)))}>Deselect all</button>
                </div>
              </div>
              <div className="overflow-auto border rounded-md max-h-72">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs w-10">
                        <Checkbox
                          checked={excluded.size === 0}
                          onCheckedChange={(v) => {
                            if (v) setExcluded(new Set());
                            else setExcluded(new Set(preview.rows.map((_, i) => i)));
                          }}
                          aria-label="Toggle all rows"
                        />
                      </TableHead>
                      {preview.headers.map((h) => {
                        const colExcluded = excludedCols.has(h);
                        const mapped = preview.detected.phone === h ? "phone"
                          : preview.detected.first === h ? "first_name"
                          : preview.detected.last === h ? "last_name"
                          : preview.detected.country === h ? "country" : null;
                        return (
                          <TableHead key={h} className={"text-xs " + (colExcluded ? "opacity-40" : "")}>
                            <div className="flex items-center gap-1.5">
                              <Checkbox
                                checked={!colExcluded}
                                onCheckedChange={(v) => {
                                  setExcludedCols((prev) => {
                                    const next = new Set(prev);
                                    if (v) next.delete(h); else next.add(h);
                                    return next;
                                  });
                                }}
                                aria-label={`Toggle column ${h}`}
                              />
                              <span>{h}</span>
                              {mapped && <Badge variant="outline" className="text-[10px] px-1 py-0">{mapped}</Badge>}
                            </div>
                          </TableHead>
                        );
                      })}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.rows.map((r, i) => {
                      const isExcluded = excluded.has(i);
                      return (
                        <TableRow key={i} className={isExcluded ? "opacity-40" : ""}>
                          <TableCell className="text-xs">
                            <Checkbox
                              checked={!isExcluded}
                              onCheckedChange={(v) => {
                                setExcluded((prev) => {
                                  const next = new Set(prev);
                                  if (v) next.delete(i);
                                  else next.add(i);
                                  return next;
                                });
                              }}
                              aria-label={`Toggle row ${i + 1}`}
                            />
                          </TableCell>
                          {preview.headers.map((h) => <TableCell key={h} className={"text-xs " + (excludedCols.has(h) ? "opacity-40 line-through" : "")}>{r[h] ?? ""}</TableCell>)}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </Card>
          )}

          {busy && progress && (
            <Card className="p-3 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">{progress.label}</span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {progress.total > 0 ? Math.round((progress.processed / progress.total) * 100) : 0}%
                </span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${progress.total > 0 ? (progress.processed / progress.total) * 100 : 0}%` }}
                />
              </div>
              <div className="text-[11px] text-muted-foreground">
                {progress.phase === "validating" && "Parsing CSV and validating phone numbers."}
                {progress.phase === "importing" && "Saving contacts in batches of 500. Keep this window open."}
                {progress.phase === "attaching" && "Adding imported contacts to your list."}
                {progress.phase === "done" && "Wrapping up…"}
              </div>
            </Card>
          )}

          {result && (
            <Card className="p-3 text-sm space-y-2">
              <div>✅ Inserted/updated: <b>{result.inserted}</b></div>
              <div>⚠️ Invalid rows skipped: <b>{result.invalid}</b></div>
              <div>↩️ Duplicates in file: <b>{result.duplicates}</b></div>
              {result.errors.length > 0 && (
                <div className="border-t pt-2">
                  <div className="font-medium text-xs uppercase text-muted-foreground mb-1">Row errors (first 20)</div>
                  <ul className="text-xs space-y-0.5 max-h-40 overflow-y-auto">
                    {result.errors.slice(0, 20).map((e, i) => (
                      <li key={i}><span className="font-mono">Row {e.row}:</span> {e.reason}</li>
                    ))}
                  </ul>
                  {result.errors.length > 20 && <div className="text-xs text-muted-foreground mt-1">…and {result.errors.length - 20} more.</div>}
                </div>
              )}
            </Card>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => { setOpen(false); reset(); }}>Close</Button>
          {preview && !result && (
            <Button onClick={runImport} disabled={busy || !preview.detected.phone || (preview.detected.phone && excludedCols.has(preview.detected.phone)) || preview.rows.length - excluded.size === 0}>
              {busy ? "Importing…" : `Import ${preview.rows.length - excluded.size} row${preview.rows.length - excluded.size === 1 ? "" : "s"}`}
            </Button>
          )}
          {result && <Button variant="outline" onClick={reset}>Import another file</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
