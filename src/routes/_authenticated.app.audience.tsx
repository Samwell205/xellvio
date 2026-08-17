import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";
import { supabase } from "@/integrations/supabase/client";
import { useAccountId } from "@/hooks/useAccountId";
import ImportCsvDialog from "@/components/ImportCsvDialog";
import { getAudienceListCounts, getAudienceStats, listAudienceContactLists, listAudienceProfiles } from "@/lib/audience.functions";


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

const CSV_TEMPLATE = `phone,first_name,last_name,country
+15551234567,Ada,Lovelace,US
+447911123456,Alan,Turing,GB
+2348012345678,Chimamanda,Adichie,NG
`;

const sb = supabase as any;

function AudiencePage() {
  const qc = useQueryClient();
  const acctId = useAccountId();
  const listContactListsFn = useServerFn(listAudienceContactLists);
  const listProfilesFn = useServerFn(listAudienceProfiles);
  const getStatsFn = useServerFn(getAudienceStats);
  const getListCountsFn = useServerFn(getAudienceListCounts);
  const [search, setSearch] = useState("");
  const [listFilter, setListFilter] = useState<string | "all">("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());



  const listsQ = useQuery({
    queryKey: ["contact-lists", acctId],
    queryFn: async (): Promise<ContactList[]> => listContactListsFn(),
  });

  const profilesQ = useQuery({
    queryKey: ["audience-profiles", acctId, listFilter],
    queryFn: async (): Promise<ProfileRow[]> => listProfilesFn({ data: { listId: listFilter === "all" ? null : listFilter } }),
  });

  // Per-list totals (HEAD count) — independent of the loaded profile rows
  const listCountsQ = useQuery({
    queryKey: ["audience-list-counts", acctId, (listsQ.data ?? []).map((l) => l.id).join(",")],
    enabled: (listsQ.data ?? []).length > 0,
    queryFn: async (): Promise<Record<string, number>> => getListCountsFn(),
  });

  const statsQ = useQuery({
    queryKey: ["audience-stats", acctId],
    queryFn: async () => getStatsFn(),
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
