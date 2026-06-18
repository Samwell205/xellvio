import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import Papa from "papaparse";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { sendSms, createCampaign, runCampaign } from "@/lib/sms.functions";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, Upload } from "lucide-react";

function useSenderOptions() {
  const numbers = useQuery({
    queryKey: ["my-numbers"],
    queryFn: async () => (await supabase.from("phone_numbers").select("e164,label,type,country").eq("status", "active").eq("type", "toll_free")).data ?? [],
  });
  const senderIds = useQuery({
    queryKey: ["approved-sender-ids"],
    queryFn: async () => (await supabase.from("sender_ids").select("sender_id").eq("status", "approved")).data ?? [],
  });
  const options: { value: string; label: string }[] = [
    ...(numbers.data ?? []).map((n) => ({ value: n.e164, label: `${n.e164} · ${n.label ?? n.type}` })),
    ...(senderIds.data ?? []).map((s) => ({ value: s.sender_id, label: `${s.sender_id} (Sender ID)` })),
  ];
  return options;
}

function SenderPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const options = useSenderOptions();
  if (options.length === 0) {
    return (
      <div className="text-xs text-muted-foreground">
        No senders yet — <Link to="/app/numbers" className="text-primary underline">add a number or request a Sender ID</Link>.
      </div>
    );
  }
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger><SelectValue placeholder="Select sender" /></SelectTrigger>
      <SelectContent>
        {options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}


export const Route = createFileRoute("/_authenticated/app/send")({
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
          <Label>From</Label>
          <SenderPicker value={sender} onChange={setSender} />
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
  const [source, setSource] = useState<"list" | "csv">("list");
  const [listId, setListId] = useState<string>("all");
  const [rows, setRows] = useState<Recipient[]>([]);
  const create = useServerFn(createCampaign);
  const run = useServerFn(runCampaign);
  const qc = useQueryClient();

  const groupsQ = useQuery({
    queryKey: ["contact_groups"],
    queryFn: async () => (await supabase.from("contact_groups").select("id,name").order("created_at", { ascending: false })).data ?? [],
  });

  const listContactsQ = useQuery({
    queryKey: ["list_contacts", listId],
    enabled: source === "list",
    queryFn: async () => {
      let q = supabase.from("contacts").select("phone,country").not("phone", "is", null).limit(10000);
      if (listId !== "all") q = q.eq("group_id", listId);
      const { data } = await q;
      return (data ?? [])
        .filter((c) => c.phone && c.phone.length >= 6)
        .map((c) => ({ to: c.phone as string, country: c.country ?? undefined }));
    },
  });

  const recipients: Recipient[] = source === "list" ? (listContactsQ.data ?? []) : rows;

  const mut = useMutation({
    mutationFn: async () => {
      if (recipients.length === 0) throw new Error("No recipients selected.");
      const c = await create({ data: { name, body, sender_id: sender || undefined, recipients } });
      return run({ data: { campaign_id: c.id, recipients } });
    },
    onSuccess: (r) => { toast.success(`Sent ${r.sent}, failed ${r.failed}`); qc.invalidateQueries(); },
    onError: (e: Error) => toast.error(e.message),
  });

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    if (!/\.(csv|txt)$/i.test(f.name)) { toast.error("Upload a .csv file."); return; }
    if (f.size > 20 * 1024 * 1024) { toast.error("Max file size is 20 MB."); return; }
    Papa.parse(f, {
      header: true, skipEmptyLines: true,
      complete: (res) => {
        const parsed = (res.data as Record<string, string>[])
          .map((r) => ({ to: (r.phone || r.Phone || r["Phone Number"] || r.to || r.number || "").toString().trim().replace(/[^\d+]/g, ""), country: r.country || r.Country }))
          .filter((r) => r.to.length >= 6);
        setRows(parsed);
        if (parsed.length === 0) toast.error("No valid phone numbers found. Make sure the CSV has a 'phone' column.");
        else toast.success(`Loaded ${parsed.length} recipients`);
      },
      error: (err) => toast.error(`CSV parse failed: ${err.message}`),
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
          <Label>From</Label>
          <SenderPicker value={sender} onChange={setSender} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Message</Label>
        <Textarea rows={4} value={body} onChange={(e) => setBody(e.target.value)} />
        <div className="text-xs text-muted-foreground">{body.length} chars · {segCount(body)} segment(s) · {recipients.length} recipients · est {recipients.length * segCount(body)} credits</div>
      </div>

      <div className="space-y-2">
        <Label>Recipients</Label>
        <div className="flex gap-2 text-sm">
          <button type="button" onClick={() => setSource("list")} className={`px-3 py-1.5 rounded-md border ${source === "list" ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent"}`}>From contact list</button>
          <button type="button" onClick={() => setSource("csv")} className={`px-3 py-1.5 rounded-md border ${source === "csv" ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent"}`}>Upload CSV</button>
        </div>

        {source === "list" ? (
          <div className="rounded-xl border p-4 space-y-2">
            <Select value={listId} onValueChange={setListId}>
              <SelectTrigger><SelectValue placeholder="Select a list" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All contacts</SelectItem>
                {(groupsQ.data ?? []).map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {listContactsQ.isLoading ? "Loading recipients…" : `${recipients.length} contact${recipients.length === 1 ? "" : "s"} with a phone number in this list.`}
              {recipients.length === 0 && !listContactsQ.isLoading && <> Import contacts on the <Link to="/app/contacts" className="text-primary underline">Contacts page</Link>.</>}
            </p>
          </div>
        ) : (
          <div className="rounded-xl border-2 border-dashed p-6 text-center">
            <Upload className="size-6 mx-auto text-muted-foreground" />
            <p className="mt-2 text-sm">Upload CSV with column <code className="px-1 rounded bg-muted">phone</code> (and optional <code className="px-1 rounded bg-muted">country</code>)</p>
            <input type="file" accept=".csv,.txt" onChange={onFile} className="mt-3 mx-auto block text-sm" />
            {rows.length > 0 && <p className="mt-2 text-xs text-muted-foreground">{rows.length} valid recipients ready.</p>}
          </div>
        )}
      </div>

      <Button onClick={() => mut.mutate()} disabled={!name || !body || recipients.length === 0 || mut.isPending}>
        {mut.isPending && <Loader2 className="size-4 animate-spin mr-2" />}Send to {recipients.length} recipients
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
