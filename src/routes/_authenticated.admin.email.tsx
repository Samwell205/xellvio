import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Mail, Send, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  adminListEmailRecipients,
  adminSendTenantNotice,
  adminRecentNotices,
} from "@/lib/admin-email.functions";

export const Route = createFileRoute("/_authenticated/admin/email")({
  head: () => ({
    meta: [
      { title: "Tenant notices — Xellvio Admin" },
      {
        name: "description",
        content:
          "Send operational service notices to one tenant or every tenant on Xellvio and review delivery status.",
      },
      { property: "og:title", content: "Tenant notices — Xellvio Admin" },
      {
        property: "og:description",
        content: "Send operational service notices to Xellvio tenants and review delivery status.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminEmailPage,
});

function AdminEmailPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(adminListEmailRecipients);
  const sendFn = useServerFn(adminSendTenantNotice);
  const logFn = useServerFn(adminRecentNotices);

  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [subject, setSubject] = useState("");
  const [heading, setHeading] = useState("");
  const [body, setBody] = useState("");
  const [ctaText, setCtaText] = useState("");
  const [ctaUrl, setCtaUrl] = useState("");

  const recipients = useQuery({ queryKey: ["admin-email-recipients"], queryFn: () => listFn() });
  const log = useQuery({ queryKey: ["admin-email-log"], queryFn: () => logFn() });

  const rows = recipients.data ?? [];
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) => r.email.toLowerCase().includes(q) || r.name.toLowerCase().includes(q),
    );
  }, [rows, search]);

  const selectedIds = Object.keys(selected).filter((id) => selected[id]);
  const allFilteredSelected = filtered.length > 0 && filtered.every((r) => selected[r.id]);

  function toggleAllFiltered(next: boolean) {
    setSelected((prev) => {
      const copy = { ...prev };
      for (const r of filtered) {
        if (next && !r.suppressed) copy[r.id] = true;
        else delete copy[r.id];
      }
      return copy;
    });
  }

  const send = useMutation({
    mutationFn: () =>
      sendFn({
        data: {
          accountIds: selectedIds,
          subject: subject.trim(),
          heading: heading.trim(),
          body: body.trim(),
          ...(ctaText.trim() && ctaUrl.trim()
            ? { ctaText: ctaText.trim(), ctaUrl: ctaUrl.trim() }
            : {}),
        },
      }),
    onSuccess: (res) => {
      toast.success(`Queued ${res.queued} email${res.queued === 1 ? "" : "s"}`, {
        description: res.failed
          ? `${res.failed} could not be queued.`
          : "Delivery starts within a minute.",
      });
      qc.invalidateQueries({ queryKey: ["admin-email-log"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not send notice"),
  });

  const canSend =
    selectedIds.length > 0 &&
    subject.trim().length >= 3 &&
    heading.trim().length >= 3 &&
    body.trim().length >= 10 &&
    !send.isPending;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Mail className="size-5 text-primary" />
        <h1 className="text-xl font-semibold tracking-tight">Tenant notices</h1>
        <Badge variant="outline">Service email</Badge>
      </div>
      <p className="text-sm text-muted-foreground max-w-2xl">
        Send an operational notice to one tenant or every tenant — maintenance windows, pricing or
        policy changes, account actions. Each tenant gets their own email. Use{" "}
        <code className="px-1 rounded bg-muted">{"{{name}}"}</code> to insert their first name. This
        is not for marketing or promotional campaigns.
      </p>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Message</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="subject">Subject</Label>
              <Input
                id="subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Scheduled maintenance on Saturday"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="heading">Heading</Label>
              <Input
                id="heading"
                value={heading}
                onChange={(e) => setHeading(e.target.value)}
                placeholder="Scheduled maintenance"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="body">Body</Label>
              <Textarea
                id="body"
                rows={9}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={"Hi {{name}},\n\nWe will be performing maintenance..."}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="ctaText">Button label (optional)</Label>
                <Input
                  id="ctaText"
                  value={ctaText}
                  onChange={(e) => setCtaText(e.target.value)}
                  placeholder="Open dashboard"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ctaUrl">Button link (optional)</Label>
                <Input
                  id="ctaUrl"
                  value={ctaUrl}
                  onChange={(e) => setCtaUrl(e.target.value)}
                  placeholder="https://www.xellvio.com/app"
                />
              </div>
            </div>
            <Button className="w-full" disabled={!canSend} onClick={() => send.mutate()}>
              <Send className="size-4 mr-2" />
              {send.isPending
                ? "Sending…"
                : `Send to ${selectedIds.length} tenant${selectedIds.length === 1 ? "" : "s"}`}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="space-y-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="size-4" /> Recipients
              <Badge variant="secondary">{selectedIds.length} selected</Badge>
            </CardTitle>
            <div className="flex items-center gap-2">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name or email"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => toggleAllFiltered(!allFilteredSelected)}
              >
                {allFilteredSelected ? "Clear" : "Select all"}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="max-h-[420px] overflow-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10" />
                    <TableHead>Tenant</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recipients.isLoading && (
                    <TableRow>
                      <TableCell colSpan={3} className="text-muted-foreground">
                        Loading tenants…
                      </TableCell>
                    </TableRow>
                  )}
                  {filtered.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <Checkbox
                          checked={!!selected[r.id]}
                          disabled={r.suppressed}
                          onCheckedChange={(v) =>
                            setSelected((prev) => {
                              const copy = { ...prev };
                              if (v) copy[r.id] = true;
                              else delete copy[r.id];
                              return copy;
                            })
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <div className="text-sm font-medium">{r.name || "—"}</div>
                        <div className="text-xs text-muted-foreground">{r.email}</div>
                        {r.suppressed && (
                          <Badge variant="destructive" className="mt-1">
                            Unsubscribed
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        ${r.credit_balance.toFixed(2)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent email activity</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-h-[380px] overflow-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Template</TableHead>
                  <TableHead>Recipient</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>When</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(log.data ?? []).map((row: any) => (
                  <TableRow key={row.message_id}>
                    <TableCell className="text-sm">{row.template_name}</TableCell>
                    <TableCell className="text-sm">{row.recipient_email}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          row.status === "sent"
                            ? "default"
                            : row.status === "pending"
                              ? "secondary"
                              : "destructive"
                        }
                      >
                        {row.status}
                      </Badge>
                      {row.error_message && (
                        <div className="text-xs text-muted-foreground mt-1 max-w-[280px] truncate">
                          {row.error_message}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(row.created_at).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
