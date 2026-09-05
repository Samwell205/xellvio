import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertCircle, BadgeCheck, ShieldOff } from "lucide-react";
import {
  adminListDevelopers,
  adminListMarketplaceApps,
  adminReviewApp,
  adminSetDeveloperStatus,
} from "@/lib/marketplace-admin.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/admin/apps")({
  component: AdminApps,
});

type Decision = "approve" | "publish" | "reject" | "request_changes" | "suspend" | "unpublish";

function AdminApps() {
  const listFn = useServerFn(adminListMarketplaceApps);
  const devsFn = useServerFn(adminListDevelopers);
  const reviewFn = useServerFn(adminReviewApp);
  const devStatusFn = useServerFn(adminSetDeveloperStatus);
  const qc = useQueryClient();

  const data = useQuery({ queryKey: ["admin-marketplace-apps"], queryFn: () => listFn() });
  const devs = useQuery({ queryKey: ["admin-marketplace-devs"], queryFn: () => devsFn() });

  const review = useMutation({
    mutationFn: (v: { appId: string; decision: Decision; notes?: string }) => reviewFn({ data: v }),
    onSuccess: () => {
      toast.success("Updated");
      qc.invalidateQueries({ queryKey: ["admin-marketplace-apps"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setDev = useMutation({
    mutationFn: (v: { developerId: string; verificationStatus?: "unverified" | "pending" | "verified"; developerStatus?: "active" | "suspended" }) =>
      devStatusFn({ data: v }),
    onSuccess: () => {
      toast.success("Developer updated");
      qc.invalidateQueries({ queryKey: ["admin-marketplace-devs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (data.isLoading) return <Skeleton className="h-72 rounded-2xl" />;

  const apps = data.data?.apps ?? [];
  const pending = apps.filter((a) => a.status === "in_review");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">App Marketplace</h1>
        <p className="text-sm text-muted-foreground">Review submissions, publish apps and monitor ecosystem health.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        {[
          { label: "Apps", value: apps.length },
          { label: "Pending review", value: pending.length },
          { label: "Installs", value: data.data?.metrics.totalInstalls ?? 0 },
          { label: "Connections", value: data.data?.metrics.totalConnections ?? 0 },
        ].map((m) => (
          <Card key={m.label}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{m.label}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{m.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="review">
        <TabsList>
          <TabsTrigger value="review">Review queue ({pending.length})</TabsTrigger>
          <TabsTrigger value="all">All apps</TabsTrigger>
          <TabsTrigger value="developers">Developers</TabsTrigger>
          <TabsTrigger value="errors">Errors</TabsTrigger>
        </TabsList>

        <TabsContent value="review" className="mt-4 space-y-3">
          {pending.map((a) => (
            <div key={a.id} className="rounded-xl border p-4">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium">{a.name}</p>
                <Badge variant="secondary">{a.categoryName ?? "Uncategorised"}</Badge>
                <span className="text-xs text-muted-foreground">
                  by {a.developerName} · submitted{" "}
                  {a.submittedAt ? new Date(a.submittedAt).toLocaleString() : "—"}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" onClick={() => review.mutate({ appId: a.id, decision: "publish" })}>
                  Approve & publish
                </Button>
                <Button size="sm" variant="outline" onClick={() => review.mutate({ appId: a.id, decision: "approve" })}>
                  Approve only
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    review.mutate({
                      appId: a.id,
                      decision: "request_changes",
                      notes: prompt("What needs to change?") ?? "",
                    })
                  }
                >
                  Request changes
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() =>
                    review.mutate({ appId: a.id, decision: "reject", notes: prompt("Reason for rejection?") ?? "" })
                  }
                >
                  Reject
                </Button>
              </div>
            </div>
          ))}
          {!pending.length && <p className="text-sm text-muted-foreground">Nothing waiting for review.</p>}
        </TabsContent>

        <TabsContent value="all" className="mt-4">
          <Card>
            <CardContent className="p-0">
              <div className="divide-y">
                {apps.map((a) => (
                  <div key={a.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
                    <span className="font-medium">{a.name}</span>
                    {a.firstParty && <Badge variant="secondary">First-party</Badge>}
                    {a.developerVerified && <BadgeCheck className="size-4 text-primary" />}
                    <Badge variant={a.status === "published" ? "default" : "outline"}>
                      {String(a.status).replace("_", " ")}
                    </Badge>
                    <span className="text-muted-foreground">{a.categoryName ?? "—"}</span>
                    <span className="tabular-nums text-muted-foreground">{a.installCount} installs</span>
                    <div className="ml-auto flex gap-2">
                      {a.status === "published" ? (
                        <>
                          <Button size="sm" variant="outline" onClick={() => review.mutate({ appId: a.id, decision: "unpublish" })}>
                            Unpublish
                          </Button>
                          <Button size="sm" variant="destructive" onClick={() => review.mutate({ appId: a.id, decision: "suspend" })}>
                            Suspend
                          </Button>
                        </>
                      ) : (
                        <Button size="sm" onClick={() => review.mutate({ appId: a.id, decision: "publish" })}>
                          Publish
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="developers" className="mt-4">
          <Card>
            <CardContent className="p-0">
              <div className="divide-y">
                {(devs.data ?? []).map((d: any) => (
                  <div key={d.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
                    <span className="font-medium">{d.company_name}</span>
                    <Badge variant={d.verification_status === "verified" ? "default" : "outline"}>
                      {d.verification_status}
                    </Badge>
                    <Badge variant={d.developer_status === "active" ? "secondary" : "destructive"}>
                      {d.developer_status}
                    </Badge>
                    <span className="text-muted-foreground">{d.website ?? "—"}</span>
                    <div className="ml-auto flex gap-2">
                      {d.verification_status !== "verified" && (
                        <Button size="sm" variant="outline" onClick={() => setDev.mutate({ developerId: d.id, verificationStatus: "verified" })}>
                          <BadgeCheck className="mr-1.5 size-4" /> Verify
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant={d.developer_status === "active" ? "destructive" : "outline"}
                        onClick={() =>
                          setDev.mutate({
                            developerId: d.id,
                            developerStatus: d.developer_status === "active" ? "suspended" : "active",
                          })
                        }
                      >
                        <ShieldOff className="mr-1.5 size-4" />
                        {d.developer_status === "active" ? "Suspend" : "Reactivate"}
                      </Button>
                    </div>
                  </div>
                ))}
                {!devs.data?.length && <div className="p-4 text-sm text-muted-foreground">No developers yet.</div>}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="errors" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent integration errors</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {(data.data?.errors ?? []).map((e) => (
                <div key={e.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-3 text-sm">
                  <AlertCircle className="size-4 text-destructive" />
                  <span className="font-medium">{e.appName}</span>
                  <span className="text-muted-foreground">
                    {e.eventType} · {e.action}
                  </span>
                  <span className="text-destructive">{e.error}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{new Date(e.createdAt).toLocaleString()}</span>
                </div>
              ))}
              {!data.data?.errors?.length && <p className="text-sm text-muted-foreground">No errors recorded.</p>}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
