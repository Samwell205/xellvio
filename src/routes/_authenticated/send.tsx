import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import Papa from "papaparse";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { sendSms, createCampaign, runCampaign } from "@/lib/sms.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Loader2, Upload } from "lucide-react";

export const Route = createFileRoute("/_authenticated/send")({
  head: () => ({ meta: [{ title: "Send SMS — Samwell Global SMS" }] }),
  component: SendPage,
});

function segCount(body: string) { return body.length === 0 ? 0 : body.length <= 160 ? 1 : Math.ceil(body.length / 153); }

function SendPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">Send SMS</h1>
        <p className="text-sm text-muted-foreground">Single message, bulk send, or schedule a campaign.</p>
      </div>
      <Tabs defaultValue="single">
        <TabsList>
          <TabsTrigger value="single">Single SMS</TabsTrigger>
          <TabsTrigger value="bulk">Bulk SMS</TabsTrigger>
          <TabsTrigger value="schedule">Schedule</TabsTrigger>
        </TabsList>
        <TabsContent value="single" className="mt-4"><SingleForm /></TabsContent>
        <TabsContent value="bulk" className="mt-4"><BulkForm /></TabsContent>
        <TabsContent value="schedule" className="mt-4"><ScheduleForm /></TabsContent>
      </Tabs>
    </div>
  );
}

function SingleForm() {
  const [to, setTo] = useState("");
  const [sender, setSender] = useState("");
  const [body, setBody] = useState("");
  const qc = useQueryClient();
  const send = useServerFn(sendSms);
  const mut = useMutation({
    mutationFn: () => send({ data: { to, body, sender_id: sender || undefined } }),
    onSuccess: (r) => {
      if (r.ok) toast.success(`Sent! ${r.segments} segment(s) · ${r.cost} credits`);
      else toast.error(`Failed: ${r.error}`);
      qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Card className="p-6">
      <div className="grid md:grid-cols-2 gap-5">
        <div className="space-y-1.5">
          <Label>Phone (E.164)</Label>
          <Input placeholder="+15558675310" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Sender ID</Label>
          <Input placeholder="Optional, e.g. SAMWELL or +1..." value={sender} onChange={(e) => setSender(e.target.value)} />
        </div>
      </div>
      <div className="mt-5 space-y-1.5">
        <Label>Message</Label>
        <Textarea rows={5} placeholder="Hi there! Your verification code is 1234" value={body} onChange={(e) => setBody(e.target.value)} />
        <div className="text-xs text-muted-foreground flex justify-between">
          <span>{body.length} characters · {segCount(body)} segment(s)</span>
          <span>Estimated cost: <strong className="text-foreground">{segCount(body)} credits</strong></span>
        </div>
      </div>
      <div className="mt-5 flex gap-2">
        <Button onClick={() => mut.mutate()} disabled={!to || !body || mut.isPending}>
          {mut.isPending && <Loader2 className="size-4 animate-spin mr-2" />}Send now
        </Button>
        <Button variant="outline" disabled>Save draft</Button>
      </div>
    </Card>
  );
}

type Recipient = { to: string; country?: string };

function BulkForm() {
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [sender, setSender] = useState("");
  const [rows, setRows] = useState<Recipient[]>([]);
  const create = useServerFn(createCampaign);
  const run = useServerFn(runCampaign);
  const qc = useQueryClient();

  const mut = useMutation({
    mutationFn: async () => {
      const c = await create({ data: { name, body, sender_id: sender || undefined, recipients: rows } });
      return run({ data: { campaign_id: c.id, recipients: rows } });
    },
    onSuccess: (r) => { toast.success(`Sent ${r.sent}, failed ${r.failed}`); qc.invalidateQueries(); },
    onError: (e: Error) => toast.error(e.message),
  });

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    Papa.parse(f, {
      header: true, skipEmptyLines: true,
      complete: (res) => {
        const parsed = (res.data as Record<string, string>[])
          .map((r) => ({ to: (r.phone || r.Phone || r.to || r.number || "").toString().trim(), country: r.country || r.Country }))
          .filter((r) => r.to.length >= 6);
        setRows(parsed);
        toast.success(`Loaded ${parsed.length} recipients`);
      },
    });
  }

  return (
    <Card className="p-6 space-y-5">
      <div className="grid md:grid-cols-2 gap-5">
        <div className="space-y-1.5">
          <Label>Campaign name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Black Friday Launch" />
        </div>
        <div className="space-y-1.5">
          <Label>Sender ID</Label>
          <Input value={sender} onChange={(e) => setSender(e.target.value)} placeholder="SAMWELL" />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Message</Label>
        <Textarea rows={4} value={body} onChange={(e) => setBody(e.target.value)} />
        <div className="text-xs text-muted-foreground">{body.length} chars · {segCount(body)} segment(s) · {rows.length} recipients · est {rows.length * segCount(body)} credits</div>
      </div>
      <div className="rounded-xl border-2 border-dashed p-6 text-center">
        <Upload className="size-6 mx-auto text-muted-foreground" />
        <p className="mt-2 text-sm">Upload CSV with column <code className="px-1 rounded bg-muted">phone</code> (and optional <code className="px-1 rounded bg-muted">country</code>)</p>
        <input type="file" accept=".csv" onChange={onFile} className="mt-3 mx-auto block text-sm" />
        {rows.length > 0 && <p className="mt-2 text-xs text-muted-foreground">{rows.length} valid recipients ready.</p>}
      </div>
      <Button onClick={() => mut.mutate()} disabled={!name || !body || rows.length === 0 || mut.isPending}>
        {mut.isPending && <Loader2 className="size-4 animate-spin mr-2" />}Send to {rows.length} recipients
      </Button>
    </Card>
  );
}

function ScheduleForm() {
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [when, setWhen] = useState("");
  const create = useServerFn(createCampaign);
  const mut = useMutation({
    mutationFn: () => create({ data: { name, body, recipients: [{ to: "+10000000000" }], schedule_at: new Date(when).toISOString() } }),
    onSuccess: () => toast.success("Scheduled — add recipients from Campaigns"),
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Card className="p-6 space-y-5">
      <div className="grid md:grid-cols-2 gap-5">
        <div className="space-y-1.5">
          <Label>Campaign name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Send at</Label>
          <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Message</Label>
        <Textarea rows={4} value={body} onChange={(e) => setBody(e.target.value)} />
      </div>
      <Button onClick={() => mut.mutate()} disabled={!name || !body || !when || mut.isPending}>Schedule</Button>
    </Card>
  );
}
