import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { toast } from "sonner";
import { Trash2, Upload, Plus, Users, Star } from "lucide-react";
import { ImportContactsDialog } from "@/components/ImportContactsDialog";

export const Route = createFileRoute("/_authenticated/app/contacts")({
  head: () => ({ meta: [{ title: "Contacts — Samwell Global SMS" }] }),
  component: ContactsPage,
});

function ContactsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [importGroupId, setImportGroupId] = useState<string | null>(null);
  const [newListOpen, setNewListOpen] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [activeListId, setActiveListId] = useState<string | "all">("all");

  const groupsQ = useQuery({
    queryKey: ["contact_groups"],
    queryFn: async () => {
      const { data } = await supabase.from("contact_groups").select("*").order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const contactsQ = useQuery({
    queryKey: ["contacts", activeListId],
    queryFn: async () => {
      let q = supabase.from("contacts").select("*").order("created_at", { ascending: false }).limit(500);
      if (activeListId !== "all") q = q.eq("group_id", activeListId);
      const { data } = await q;
      return data ?? [];
    },
  });

  const countsQ = useQuery({
    queryKey: ["contact_group_counts"],
    queryFn: async () => {
      const { data } = await supabase.from("contacts").select("group_id");
      const counts: Record<string, number> = { all: data?.length ?? 0 };
      (data ?? []).forEach((c: { group_id: string | null }) => {
        if (c.group_id) counts[c.group_id] = (counts[c.group_id] ?? 0) + 1;
      });
      return counts;
    },
  });

  const filtered = (contactsQ.data ?? []).filter((c) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      c.phone?.toLowerCase().includes(s) ||
      c.email?.toLowerCase().includes(s) ||
      c.name?.toLowerCase().includes(s) ||
      c.first_name?.toLowerCase().includes(s) ||
      c.last_name?.toLowerCase().includes(s)
    );
  });

  const del = useMutation({
    mutationFn: async (id: string) => { await supabase.from("contacts").delete().eq("id", id); },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contacts"] });
      qc.invalidateQueries({ queryKey: ["contact_group_counts"] });
      toast.success("Deleted");
    },
  });

  async function createList() {
    if (!newListName.trim()) return;
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { error } = await supabase.from("contact_groups").insert({ user_id: u.user.id, name: newListName.trim() });
    if (error) { toast.error(error.message); return; }
    toast.success("List created");
    setNewListName("");
    setNewListOpen(false);
    qc.invalidateQueries({ queryKey: ["contact_groups"] });
  }

  async function deleteList(id: string) {
    if (!confirm("Delete this list? Contacts in it won't be deleted, just unassigned.")) return;
    const { error } = await supabase.from("contact_groups").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("List deleted");
    qc.invalidateQueries({ queryKey: ["contact_groups"] });
    qc.invalidateQueries({ queryKey: ["contacts"] });
    if (activeListId === id) setActiveListId("all");
  }

  function refreshAll() {
    qc.invalidateQueries({ queryKey: ["contacts"] });
    qc.invalidateQueries({ queryKey: ["contact_group_counts"] });
  }

  const totalCount = countsQ.data?.all ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Lists & contacts</h1>
          <p className="text-sm text-muted-foreground">{totalCount.toLocaleString()} total contacts</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setNewListOpen(true)}><Plus className="size-4 mr-1" /> New list</Button>
          <Button onClick={() => { setImportGroupId(activeListId === "all" ? null : activeListId); setImportOpen(true); }}>
            <Upload className="size-4 mr-1" /> Upload contacts
          </Button>
        </div>
      </div>

      <Tabs value="lists">
        <TabsList>
          <TabsTrigger value="lists">Lists & contacts</TabsTrigger>
        </TabsList>
        <TabsContent value="lists" className="mt-4">
          <div className="grid lg:grid-cols-[260px_1fr] gap-4">
            {/* Sidebar lists */}
            <Card className="p-2 h-fit">
              <button
                onClick={() => setActiveListId("all")}
                className={`w-full text-left rounded-md px-3 py-2 text-sm flex items-center justify-between ${activeListId === "all" ? "bg-accent font-medium" : "hover:bg-muted/50"}`}
              >
                <span className="flex items-center gap-2"><Users className="size-4" /> All contacts</span>
                <span className="text-xs text-muted-foreground">{(countsQ.data?.all ?? 0).toLocaleString()}</span>
              </button>
              <div className="my-2 h-px bg-border" />
              <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">Lists</div>
              {(groupsQ.data ?? []).length === 0 && <div className="px-3 py-4 text-xs text-muted-foreground">No lists yet.</div>}
              {(groupsQ.data ?? []).map((g) => (
                <div key={g.id} className="group flex items-center">
                  <button
                    onClick={() => setActiveListId(g.id)}
                    className={`flex-1 text-left rounded-md px-3 py-2 text-sm flex items-center justify-between ${activeListId === g.id ? "bg-accent font-medium" : "hover:bg-muted/50"}`}
                  >
                    <span className="flex items-center gap-2 truncate"><Star className="size-3.5 text-amber-500 fill-amber-500" /> <span className="truncate">{g.name}</span></span>
                    <span className="text-xs text-muted-foreground ml-2 shrink-0">{(countsQ.data?.[g.id] ?? 0).toLocaleString()}</span>
                  </button>
                  <button onClick={() => deleteList(g.id)} className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-destructive">
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))}
            </Card>

            {/* Contacts table */}
            <Card className="p-4">
              <div className="flex items-center justify-between gap-3 mb-4">
                <Input placeholder="Search by name, email, or phone…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
                <div className="text-sm text-muted-foreground">
                  {activeListId === "all" ? "All contacts" : (groupsQ.data ?? []).find((g) => g.id === activeListId)?.name} ·{" "}
                  <Badge variant="secondary">{filtered.length} shown</Badge>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground uppercase border-b">
                    <tr>
                      <th className="text-left py-2 px-2">Name</th>
                      <th className="text-left py-2 px-2">Email</th>
                      <th className="text-left py-2 px-2">Phone</th>
                      <th className="text-left py-2 px-2">Country</th>
                      <th className="text-left py-2 px-2">Added</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {contactsQ.isLoading && <tr><td colSpan={6} className="py-10 text-center text-muted-foreground">Loading…</td></tr>}
                    {!contactsQ.isLoading && filtered.length === 0 && (
                      <tr><td colSpan={6} className="py-12 text-center text-muted-foreground">
                        No contacts yet. Click <strong>Upload contacts</strong> to import a CSV.
                      </td></tr>
                    )}
                    {filtered.map((c) => (
                      <tr key={c.id} className="border-b hover:bg-muted/30">
                        <td className="py-2.5 px-2 font-medium">{c.name || [c.first_name, c.last_name].filter(Boolean).join(" ") || "—"}</td>
                        <td className="py-2.5 px-2">{c.email || "—"}</td>
                        <td className="py-2.5 px-2 font-mono text-xs">{c.phone || "—"}</td>
                        <td className="py-2.5 px-2">{c.country || "—"}</td>
                        <td className="py-2.5 px-2 text-muted-foreground">{new Date(c.created_at).toLocaleDateString()}</td>
                        <td className="py-2.5 px-2 text-right">
                          <button onClick={() => del.mutate(c.id)} className="text-muted-foreground hover:text-destructive p-1"><Trash2 className="size-4" /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      <ImportContactsDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        groups={groupsQ.data ?? []}
        defaultGroupId={importGroupId}
        onImported={refreshAll}
      />

      <Dialog open={newListOpen} onOpenChange={setNewListOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create list</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="list-name">Name</Label>
            <Input id="list-name" placeholder="e.g. VIP customers" value={newListName} onChange={(e) => setNewListName(e.target.value)} autoFocus />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewListOpen(false)}>Cancel</Button>
            <Button onClick={createList} disabled={!newListName.trim()}>Create list</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
