import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Filter, Plus, Trash2, Users } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/segments/")({
  head: () => ({ meta: [{ title: "Segments — Xellio" }] }),
  component: SegmentsPage,
});

type SegmentRow = { id: string; name: string; query: any; created_at: string };

function SegmentsPage() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["segments"],
    queryFn: async (): Promise<SegmentRow[]> => {
      const { data, error } = await supabase
        .from("segments").select("id, name, query, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("segments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Segment deleted"); qc.invalidateQueries({ queryKey: ["segments"] }); },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold flex items-center gap-2"><Filter className="size-6" />Segments</h1>
          <p className="text-sm text-muted-foreground">Saved audience filters used by campaigns.</p>
        </div>
        <Link to="/app/segments/new"><Button><Plus className="size-4 mr-1.5" />New segment</Button></Link>
      </div>

      <Card className="p-4">
        <div className="rounded-lg border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Filter</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {q.isLoading && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>}
              {!q.isLoading && (q.data?.length ?? 0) === 0 && (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-10">
                  No segments yet. Create one to target campaigns.
                </TableCell></TableRow>
              )}
              {q.data?.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell className="space-x-1">
                    {(s.query?.country_in ?? []).map((c: string) => <Badge key={c} variant="outline">{c}</Badge>)}
                    {(s.query?.consent_in ?? ["subscribed"]).map((c: string) => <Badge key={c} className="bg-primary/15 text-primary border-primary/30">{c}</Badge>)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{new Date(s.created_at).toLocaleDateString()}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => del.mutate(s.id)}><Trash2 className="size-4" /></Button>
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
