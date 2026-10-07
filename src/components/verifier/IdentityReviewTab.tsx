import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { adminListIdentityChecks } from "@/lib/verifier-kyc.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function IdentityReviewTab() {
  const listFn = useServerFn(adminListIdentityChecks);
  const { data, isLoading } = useQuery({ queryKey: ["admin", "verifier-identity"], queryFn: () => listFn() });

  const flags = data?.flags ?? {};
  const flaggedNoId = Object.keys(flags).filter((v) => !(data?.identities ?? []).some((i) => i.verifier_id === v));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>Identity checks (automatic)</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
          {!isLoading && (data?.identities ?? []).length === 0 && (
            <div className="text-sm text-muted-foreground">No identity submissions yet.</div>
          )}
          {(data?.identities ?? []).map((i) => {
            const f = flags[i.verifier_id];
            return (
              <div key={i.verifier_id} className="border rounded-md p-3 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{i.name}</span>
                  <span className="text-xs text-muted-foreground">{i.email} · NIN ••••{i.nin_last4}</span>
                  <Badge variant={i.status === "approved" ? "default" : i.status === "rejected" ? "destructive" : "secondary"}>{i.status}</Badge>
                </div>
                {f && (
                  <div className="text-xs text-destructive">
                    {f.device.length > 0 && <div>Same device as: {f.device.join(", ")}</div>}
                    {f.ip.length > 0 && <div>Same internet connection as: {f.ip.join(", ")}</div>}
                  </div>
                )}
                <div className="flex gap-3">
                  {i.id_photo_url && <a href={i.id_photo_url} target="_blank" rel="noreferrer"><img src={i.id_photo_url} alt="ID" className="h-40 rounded border" /></a>}
                  {i.selfie_url && <a href={i.selfie_url} target="_blank" rel="noreferrer"><img src={i.selfie_url} alt="Selfie" className="h-40 rounded border" /></a>}
                </div>
                {i.admin_note && <div className="text-xs text-muted-foreground">Reason: {i.admin_note}</div>}
              </div>
            );
          })}
        </CardContent>
      </Card>
      {flaggedNoId.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Shared device or connection (no ID submitted yet)</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {flaggedNoId.map((v) => (
              <div key={v} className="border rounded-md p-2">
                <div className="text-xs text-muted-foreground">Verifier {v.slice(0, 8)}</div>
                {flags[v].device.length > 0 && <div className="text-xs">Same device as: {flags[v].device.join(", ")}</div>}
                {flags[v].ip.length > 0 && <div className="text-xs">Same connection as: {flags[v].ip.join(", ")}</div>}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
