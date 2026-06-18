import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { toast } from "sonner";
import { Copy, Plus, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/api")({
  head: () => ({ meta: [{ title: "API — Samwell Global SMS" }] }),
  component: ApiPage,
});

function ApiPage() {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [newKey, setNewKey] = useState<string | null>(null);

  const keys = useQuery({
    queryKey: ["api_keys"],
    queryFn: async () => (await supabase.from("api_keys").select("*").order("created_at", { ascending: false })).data ?? [],
  });

  const create = useMutation({
    mutationFn: async () => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error("Not signed in");
      const raw = "sk_" + crypto.randomUUID().replaceAll("-", "");
      const prefix = raw.slice(0, 8);
      const hashBuf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
      const hash = Array.from(new Uint8Array(hashBuf)).map((b) => b.toString(16).padStart(2, "0")).join("");
      const { error } = await supabase.from("api_keys").insert({ user_id: user.user.id, name, key_prefix: prefix, key_hash: hash });
      if (error) throw error;
      return raw;
    },
    onSuccess: (raw) => { setNewKey(raw); setName(""); qc.invalidateQueries({ queryKey: ["api_keys"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => { await supabase.from("api_keys").update({ revoked: true }).eq("id", id); },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["api_keys"] }),
  });

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-extrabold">API & Developers</h1><p className="text-sm text-muted-foreground">Manage keys, view endpoints, and test the API.</p></div>

      <Card className="p-6">
        <h3 className="font-semibold">Create API key</h3>
        <div className="mt-3 flex gap-2">
          <Input placeholder="Key name (e.g. Production)" value={name} onChange={(e) => setName(e.target.value)} />
          <Button onClick={() => create.mutate()} disabled={!name || create.isPending}><Plus className="size-4 mr-1" /> Create</Button>
        </div>
        {newKey && (
          <div className="mt-4 rounded-lg border bg-warning/10 border-warning/30 p-4">
            <div className="text-sm font-semibold">Copy this key — you won't see it again.</div>
            <div className="mt-2 flex items-center gap-2">
              <code className="flex-1 font-mono text-sm bg-background border rounded px-3 py-2 overflow-x-auto">{newKey}</code>
              <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(newKey); toast.success("Copied"); }}><Copy className="size-4" /></Button>
            </div>
          </div>
        )}
      </Card>

      <Card className="p-5">
        <h3 className="font-semibold mb-3">Your keys</h3>
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground uppercase border-b"><tr><th className="text-left py-2">Name</th><th className="text-left py-2">Prefix</th><th className="text-left py-2">Status</th><th className="text-left py-2">Created</th><th></th></tr></thead>
          <tbody>
            {(keys.data ?? []).length === 0 && <tr><td colSpan={5} className="py-6 text-center text-muted-foreground">No keys yet.</td></tr>}
            {(keys.data ?? []).map((k) => (
              <tr key={k.id} className="border-b">
                <td className="py-2.5 font-medium">{k.name}</td>
                <td className="py-2.5 font-mono text-muted-foreground">{k.key_prefix}…</td>
                <td className="py-2.5">{k.revoked ? <span className="text-destructive">Revoked</span> : <span className="text-success">Active</span>}</td>
                <td className="py-2.5 text-muted-foreground">{new Date(k.created_at).toLocaleDateString()}</td>
                <td className="py-2.5 text-right">{!k.revoked && <button onClick={() => del.mutate(k.id)} className="p-1 text-muted-foreground hover:text-destructive"><Trash2 className="size-4" /></button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card className="p-6">
        <h3 className="font-semibold">Endpoints</h3>
        <ul className="mt-3 space-y-2 font-mono text-sm">
          <li><span className="inline-block w-16 text-primary font-bold">POST</span> /api/messages/send</li>
          <li><span className="inline-block w-16 text-primary font-bold">POST</span> /api/campaign/create</li>
          <li><span className="inline-block w-16 text-success font-bold">GET</span> /api/messages/status/:id</li>
          <li><span className="inline-block w-16 text-success font-bold">GET</span> /api/wallet</li>
        </ul>
        <p className="mt-4 text-sm text-muted-foreground">Authenticate with header <code className="px-1 rounded bg-muted">Authorization: Bearer YOUR_KEY</code>.</p>
      </Card>
    </div>
  );
}
