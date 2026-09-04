import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAccountId } from "@/hooks/useAccountId";
import { deleteContactList, getAudienceListCounts, listAudienceContactLists } from "@/lib/audience.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { MoreHorizontal, Plus, Search, Star, Trash2, Upload, Users } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/lists")({
  head: () => ({
    meta: [
      { title: "Lists & segments — Xellvio" },
      { name: "description", content: "Create and manage the contact lists and segments you send SMS campaigns to." },
      { property: "og:title", content: "Lists & segments — Xellvio" },
      { property: "og:description", content: "Create and manage the contact lists and segments you send SMS campaigns to." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ListsPage,
});

type Row = {
  id: string;
  name: string;
  description: string | null;
  type: "List" | "Segment";
  members: number | null;
  created_at: string;
  is_favorite: boolean;
};

const sb = supabase as any;

function ListsPage() {
  const qc = useQueryClient();
  const acctId = useAccountId();
  const listsFn = useServerFn(listAudienceContactLists);
  const countsFn = useServerFn(getAudienceListCounts);
  const deleteFn = useServerFn(deleteContactList);

  const [tab, setTab] = useState<"all" | "List" | "Segment">("all");
  const [search, setSearch] = useState("");
  const [showFavourites, setShowFavourites] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newList, setNewList] = useState({ name: "", description: "" });
  const [confirmDelete, setConfirmDelete] = useState<Row | null>(null);
  const [deleteContacts, setDeleteContacts] = useState(false);

  const listsQ = useQuery({
    queryKey: ["lists-page-lists", acctId],
    queryFn: async () => {
      const lists = await listsFn();
      const { data: extra } = await sb.from("contact_lists").select("id,is_favorite,created_at");
      const map = new Map<string, any>((extra ?? []).map((e: any) => [e.id, e]));
      return (lists ?? []).map((l: any) => ({
        ...l,
        is_favorite: !!map.get(l.id)?.is_favorite,
        created_at: map.get(l.id)?.created_at ?? new Date().toISOString(),
      }));
    },
  });

  const countsQ = useQuery({
    queryKey: ["lists-page-counts", acctId],
    queryFn: async () => countsFn(),
  });

  const segmentsQ = useQuery({
    queryKey: ["lists-page-segments", acctId],
    queryFn: async () => (await sb.from("segments").select("id,name,description,created_at")).data ?? [],
  });

  const rows: Row[] = useMemo(() => {
    const lists: Row[] = (listsQ.data ?? []).map((l: any) => ({
      id: l.id,
      name: l.name,
      description: l.description,
      type: "List",
      members: countsQ.data?.[l.id] ?? null,
      created_at: l.created_at,
      is_favorite: l.is_favorite,
    }));
    const segs: Row[] = (segmentsQ.data ?? []).map((s: any) => ({
      id: s.id,
      name: s.name,
      description: s.description ?? null,
      type: "Segment",
      members: null,
      created_at: s.created_at,
      is_favorite: false,
    }));
    return [...lists, ...segs];
  }, [listsQ.data, countsQ.data, segmentsQ.data]);

  const filtered = rows
    .filter((r) => (tab === "all" ? true : r.type === tab))
    .filter((r) => (showFavourites ? r.is_favorite : true))
    .filter((r) => (search.trim() ? r.name.toLowerCase().includes(search.trim().toLowerCase()) : true))
    .sort((a, b) => Number(b.is_favorite) - Number(a.is_favorite) || a.name.localeCompare(b.name));

  const createList = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const accountId = acctId ?? u.user!.id;
      const { error } = await sb.from("contact_lists").insert({
        account_id: accountId,
        name: newList.name.trim(),
        description: newList.description.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("List created");
      setCreateOpen(false);
      setNewList({ name: "", description: "" });
      qc.invalidateQueries({ queryKey: ["lists-page-lists"] });
      qc.invalidateQueries({ queryKey: ["contact-lists"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Could not create list"),
  });

  const toggleFav = useMutation({
    mutationFn: async (row: Row) => {
      const { error } = await sb.from("contact_lists").update({ is_favorite: !row.is_favorite }).eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["lists-page-lists"] }),
    onError: (e: any) => toast.error(e.message ?? "Could not update"),
  });

  const removeRow = useMutation({
    mutationFn: async (row: Row) => {
      if (row.type === "Segment") {
        const { error } = await sb.from("segments").delete().eq("id", row.id);
        if (error) throw error;
        return;
      }
      await deleteFn({ data: { listId: row.id, withContacts: deleteContacts } });
    },
    onSuccess: () => {
      toast.success("Deleted");
      setConfirmDelete(null);
      setDeleteContacts(false);
      qc.invalidateQueries({ queryKey: ["lists-page-lists"] });
      qc.invalidateQueries({ queryKey: ["lists-page-segments"] });
      qc.invalidateQueries({ queryKey: ["lists-page-counts"] });
      qc.invalidateQueries({ queryKey: ["contact-lists"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Could not delete"),
  });

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight">Lists &amp; segments</h1>
          <p className="text-sm text-muted-foreground">
            Lists are the groups you upload or collect. Segments update themselves based on rules.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" asChild>
            <Link to="/app/audience"><Upload className="mr-2 size-4" />Import contacts</Link>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button><Plus className="mr-2 size-4" />Create new</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setCreateOpen(true)}>Create list</DropdownMenuItem>
              <DropdownMenuItem asChild><Link to="/app/segments/new">Create segment</Link></DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="rounded-xl border bg-card">
        <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
          {(["all", "List", "Segment"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-full px-3 py-1.5 text-sm transition-colors ${
                tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {t === "all" ? "All" : t === "List" ? "Lists" : "Segments"}
            </button>
          ))}
          <div className="relative ml-auto w-full max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search by name" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Button variant={showFavourites ? "default" : "outline"} size="sm" onClick={() => setShowFavourites((v) => !v)}>
            <Star className="mr-2 size-4" />Favourites
          </Button>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10" />
              <TableHead>Name</TableHead>
              <TableHead className="w-28">Type</TableHead>
              <TableHead className="w-32 text-right">Members</TableHead>
              <TableHead className="w-40">Created</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-16 text-center text-sm text-muted-foreground">
                  Nothing here yet. Create a list or import contacts to get started.
                </TableCell>
              </TableRow>
            )}
            {filtered.map((r) => (
              <TableRow key={`${r.type}-${r.id}`} className="h-14">
                <TableCell>
                  {r.type === "List" && (
                    <button onClick={() => toggleFav.mutate(r)} aria-label="Toggle favourite">
                      <Star className={`size-4 ${r.is_favorite ? "fill-yellow-400 text-yellow-500" : "text-muted-foreground"}`} />
                    </button>
                  )}
                </TableCell>
                <TableCell>
                  <div className="font-medium">{r.name}</div>
                  {r.description && <div className="text-xs text-muted-foreground">{r.description}</div>}
                </TableCell>
                <TableCell><Badge variant="outline">{r.type}</Badge></TableCell>
                <TableCell className="text-right tabular-nums">
                  {r.members == null ? "—" : r.members.toLocaleString()}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {new Date(r.created_at).toLocaleDateString()}
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon"><MoreHorizontal className="size-4" /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem asChild>
                        <Link to="/app/audience"><Users className="mr-2 size-4" />View contacts</Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link to="/app/campaigns/new">Send a campaign</Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem className="text-destructive" onClick={() => setConfirmDelete(r)}>
                        <Trash2 className="mr-2 size-4" />Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create a list</DialogTitle>
            <DialogDescription>Give it a clear name so your team knows who is inside.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>List name</Label>
              <Input value={newList.name} onChange={(e) => setNewList({ ...newList, name: e.target.value })} maxLength={120} />
            </div>
            <div>
              <Label>Description (optional)</Label>
              <Textarea value={newList.description} onChange={(e) => setNewList({ ...newList, description: e.target.value })} maxLength={300} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button disabled={!newList.name.trim() || createList.isPending} onClick={() => createList.mutate()}>
              Create list
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete “{confirmDelete?.name}”?</DialogTitle>
            <DialogDescription>This cannot be undone.</DialogDescription>
          </DialogHeader>
          {confirmDelete?.type === "List" && (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={deleteContacts} onCheckedChange={(v) => setDeleteContacts(!!v)} />
              Also delete the contacts inside this list
            </label>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={removeRow.isPending}
              onClick={() => confirmDelete && removeRow.mutate(confirmDelete)}
            >
              {removeRow.isPending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
