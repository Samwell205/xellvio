import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import Papa from "papaparse";
import { toast } from "sonner";
import { Trash2, Upload, Plus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/contacts")({
  head: () => ({ meta: [{ title: "Contacts — Samwell Global SMS" }] }),
  component: ContactsPage,
});

function ContactsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const list = useQuery({
    queryKey: ["contacts"],
    queryFn: async () => {
      const { data } = await supabase.from("contacts").select("*").order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const filtered = (list.data ?? []).filter((c) =>
    !search || c.phone?.includes(search) || c.name?.toLowerCase().includes(search.toLowerCase())
  );

  const del = useMutation({
    mutationFn: async (id: string) => { await supabase.from("contacts").delete().eq("id", id); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["contacts"] }); toast.success("Deleted"); },
  });

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    Papa.parse(f, {
      header: true, skipEmptyLines: true,
      complete: async (res) => {
        const { data: user } = await supabase.auth.getUser();
        if (!user.user) return;
        const rows = (res.data as Record<string, string>[]).map((r) => ({
          user_id: user.user!.id,
          name: r.name || r.Name || null,
          phone: (r.phone || r.Phone || "").toString().trim(),
          country: r.country || r.Country || null,
        })).filter((r) => r.phone.length >= 6);
        if (rows.length === 0) { toast.error("No valid rows found"); return; }
        const { error } = await supabase.from("contacts").insert(rows);
        if (error) toast.error(error.message);
        else { toast.success(`Imported ${rows.length} contacts`); qc.invalidateQueries({ queryKey: ["contacts"] }); }
      },
    });
  }

  async function quickAdd() {
    const phone = prompt("Phone (E.164)");
    if (!phone) return;
    const name = prompt("Name (optional)") || null;
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) return;
    const { error } = await supabase.from("contacts").insert({ user_id: user.user.id, phone, name });
    if (error) toast.error(error.message);
    else { qc.invalidateQueries({ queryKey: ["contacts"] }); toast.success("Added"); }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Contacts</h1>
          <p className="text-sm text-muted-foreground">{(list.data ?? []).length} total</p>
        </div>
        <div className="flex gap-2">
          <label className="inline-flex items-center gap-2 cursor-pointer rounded-md border bg-background px-3 py-1.5 text-sm hover:bg-accent">
            <Upload className="size-4" /> Import CSV
            <input type="file" accept=".csv" onChange={onFile} className="hidden" />
          </label>
          <Button onClick={quickAdd}><Plus className="size-4 mr-1" /> Add contact</Button>
        </div>
      </div>
      <Card className="p-4">
        <Input placeholder="Search by phone or name…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground uppercase border-b">
              <tr><th className="text-left py-2 px-2">Name</th><th className="text-left py-2 px-2">Phone</th><th className="text-left py-2 px-2">Country</th><th className="text-left py-2 px-2">Added</th><th></th></tr>
            </thead>
            <tbody>
              {filtered.length === 0 && <tr><td colSpan={5} className="py-10 text-center text-muted-foreground">No contacts yet. Import a CSV or add one above.</td></tr>}
              {filtered.map((c) => (
                <tr key={c.id} className="border-b hover:bg-muted/30">
                  <td className="py-2.5 px-2 font-medium">{c.name || "—"}</td>
                  <td className="py-2.5 px-2 font-mono">{c.phone}</td>
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
  );
}
