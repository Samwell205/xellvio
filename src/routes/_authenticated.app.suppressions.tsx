import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { ShieldOff, Plus, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/suppressions")({
  head: () => ({ meta: [{ title: "Suppressions — SAMWELL SMS HUB" }] }),
  component: SuppressionsPage,
});

function SuppressionsPage() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["suppressions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("suppressions")
        .select("id, phone_e164, reason, source, created_at")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  const removeOne = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("suppressions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Removed from suppression list");
      qc.invalidateQueries({ queryKey: ["suppressions"] });
      qc.invalidateQueries({ queryKey: ["audience-stats"] });
      qc.invalidateQueries({ queryKey: ["audience-profiles"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold flex items-center gap-2"><ShieldOff className="size-6" />Suppressions</h1>
          <p className="text-sm text-muted-foreground">Globally opted-out numbers — never messaged again.</p>
        </div>
        <AddSuppressionDialog onDone={() => qc.invalidateQueries({ queryKey: ["suppressions"] })} />
      </div>

      <Card className="p-4">
        <div className="rounded-lg border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Phone</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Added</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {q.isLoading && <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>}
              {!q.isLoading && (q.data?.length ?? 0) === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center py-10 text-muted-foreground">No suppressions.</TableCell></TableRow>
              )}
              {q.data?.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-sm">{r.phone_e164}</TableCell>
                  <TableCell>{r.reason ?? "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{r.source ?? "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => removeOne.mutate(r.id)}>
                      <Trash2 className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}

function AddSuppressionDialog({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState("US");
  const [reason, setReason] = useState("manual");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      const p = parsePhoneNumberFromString(phone, country as CountryCode);
      if (!p || !p.isValid()) { toast.error("Invalid phone number"); return; }
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("suppressions").upsert(
        { account_id: u.user!.id, phone_e164: p.number, reason, source: "manual" },
        { onConflict: "account_id,phone_e164" },
      );
      if (error) throw error;
      toast.success("Added to suppression list");
      setOpen(false); setPhone("");
      onDone();
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    } finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><Plus className="size-4 mr-1.5" />Add suppression</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add to suppression list</DialogTitle>
          <DialogDescription>This number will never receive messages from any campaign.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-3 gap-2">
            <div><Label>Country</Label><Input value={country} onChange={(e) => setCountry(e.target.value.toUpperCase())} maxLength={2} /></div>
            <div className="col-span-2"><Label>Phone</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
          </div>
          <div><Label>Reason</Label><Input value={reason} onChange={(e) => setReason(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>{busy ? "Adding…" : "Add"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
