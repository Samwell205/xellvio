import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Copy, KeyRound, Loader2, PlugZap, RefreshCw, Send } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  createWorkspaceKey,
  listWorkspaceKeys,
  revokeWorkspaceKey,
  sendViaConnection,
  syncConnection,
  testConnection,
} from "@/lib/marketplace-integrations.functions";
import { specFor, type ProviderSpec } from "@/lib/marketplace/provider-fields";

/** Live tools for a connected app: test, import, send. */
export function IntegrationTools({
  installationId,
  slug,
  authType,
  appName,
  lastSyncedAt,
  lastError,
}: {
  installationId: string;
  slug: string;
  authType: string;
  appName: string;
  lastSyncedAt?: string | null;
  lastError?: string | null;
}) {
  const spec: ProviderSpec = specFor(slug, authType, appName);
  const qc = useQueryClient();
  const testFn = useServerFn(testConnection);
  const syncFn = useServerFn(syncConnection);
  const sendFn = useServerFn(sendViaConnection);
  const [to, setTo] = useState("");
  const [text, setText] = useState("");

  const test = useMutation({
    mutationFn: () => testFn({ data: { installationId } }),
    onSuccess: (r: any) => {
      toast.success(r?.message ?? "Connection is working.");
      qc.invalidateQueries({ queryKey: ["my-installations"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sync = useMutation({
    mutationFn: () => syncFn({ data: { installationId } }),
    onSuccess: (r: any) => {
      toast.success(r?.message ?? "Import finished.");
      qc.invalidateQueries({ queryKey: ["my-installations"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const send = useMutation({
    mutationFn: () => sendFn({ data: { installationId, to: to || undefined, text } }),
    onSuccess: () => {
      toast.success("Message sent.");
      setText("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Live connection</CardTitle>
          <CardDescription>
            {spec.capabilities.verified
              ? `Xellvio talks to ${appName} directly using your stored credentials.`
              : `${appName} credentials are stored securely for use in automations.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {spec.capabilities.verified && (
              <Button variant="outline" onClick={() => test.mutate()} disabled={test.isPending}>
                {test.isPending ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <PlugZap className="mr-1.5 size-4" />}
                Test connection
              </Button>
            )}
            {spec.capabilities.sync && (
              <Button onClick={() => sync.mutate()} disabled={sync.isPending}>
                {sync.isPending ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <RefreshCw className="mr-1.5 size-4" />}
                {spec.syncLabel ?? "Import contacts"}
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {lastSyncedAt ? `Last activity ${new Date(lastSyncedAt).toLocaleString()}.` : "No activity yet."}
          </p>
          {lastError && (
            <p className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">{lastError}</p>
          )}
        </CardContent>
      </Card>

      {spec.capabilities.send && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Send a message</CardTitle>
            <CardDescription>
              {slug === "xellvio-sms"
                ? "Sends a real text from your connected number. Normal country rates apply."
                : `Posts a message through ${appName}.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {slug === "xellvio-sms" && (
              <div className="space-y-1.5">
                <Label htmlFor="send-to">Send to</Label>
                <Input id="send-to" placeholder="+1 555 010 2233" value={to} onChange={(e) => setTo(e.target.value)} />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="send-text">Message</Label>
              <Textarea id="send-text" rows={3} value={text} onChange={(e) => setText(e.target.value)} />
            </div>
            <Button onClick={() => send.mutate()} disabled={send.isPending || !text.trim()}>
              {send.isPending ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <Send className="mr-1.5 size-4" />}
              Send
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/** Workspace keys other Xellvio workspaces use to link to this one. */
export function WorkspaceKeysCard() {
  const qc = useQueryClient();
  const listFn = useServerFn(listWorkspaceKeys);
  const createFn = useServerFn(createWorkspaceKey);
  const revokeFn = useServerFn(revokeWorkspaceKey);
  const [name, setName] = useState("");
  const [fresh, setFresh] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const keys = useQuery({ queryKey: ["workspace-keys"], queryFn: () => listFn() });

  const create = useMutation({
    mutationFn: () => createFn({ data: { name: name.trim() || "Workspace key" } }),
    onSuccess: (r: any) => {
      setFresh(r.key);
      setName("");
      qc.invalidateQueries({ queryKey: ["workspace-keys"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const revoke = useMutation({
    mutationFn: (id: string) => revokeFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Key revoked");
      qc.invalidateQueries({ queryKey: ["workspace-keys"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <KeyRound className="size-4 text-primary" /> Keys for linking this workspace
        </CardTitle>
        <CardDescription>
          Create a key here, then paste it in the other Xellvio workspace to let it pull contacts from this one.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Input
            placeholder="Key name, e.g. Agency workspace"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="max-w-xs"
          />
          <Button onClick={() => create.mutate()} disabled={create.isPending}>
            {create.isPending && <Loader2 className="mr-1.5 size-4 animate-spin" />}
            Create key
          </Button>
        </div>

        {fresh && (
          <div className="space-y-2 rounded-lg border bg-muted/40 p-3">
            <p className="text-xs text-muted-foreground">Copy this now — it is only shown once.</p>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded bg-background px-2 py-1 text-xs">{fresh}</code>
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  await navigator.clipboard.writeText(fresh);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
              >
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              </Button>
            </div>
          </div>
        )}

        <div className="space-y-2">
          {(keys.data ?? []).map((k: any) => (
            <div key={k.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm">
              <div className="min-w-0">
                <p className="truncate font-medium">{k.name}</p>
                <p className="text-xs text-muted-foreground">
                  {k.prefix}…{k.lastUsedAt ? ` · used ${new Date(k.lastUsedAt).toLocaleDateString()}` : " · never used"}
                </p>
              </div>
              {k.revokedAt ? (
                <Badge variant="secondary">Revoked</Badge>
              ) : (
                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => revoke.mutate(k.id)}>
                  Revoke
                </Button>
              )}
            </div>
          ))}
          {!keys.isLoading && (keys.data ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">No keys yet.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
