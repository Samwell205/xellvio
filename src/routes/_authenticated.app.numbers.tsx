import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Loader2, Phone, Search, ShieldCheck, Trash2, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  searchTollFree, purchaseTollFree, startPhoneVerification, checkPhoneVerification,
  deletePhoneNumber, requestSenderId,
} from "@/lib/numbers.functions";

export const Route = createFileRoute("/_authenticated/app/numbers")({
  head: () => ({ meta: [{ title: "Numbers & Sender IDs — Samwell Global SMS" }] }),
  component: NumbersPage,
});

function NumbersPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">Numbers & Sender IDs</h1>
        <p className="text-sm text-muted-foreground">
          Provision a toll-free number for US/Canada, verify your personal phone, and request alphanumeric Sender IDs for international SMS.
        </p>
      </div>
      <Tabs defaultValue="numbers">
        <TabsList>
          <TabsTrigger value="numbers">My numbers</TabsTrigger>
          <TabsTrigger value="tollfree">Get toll-free</TabsTrigger>
          <TabsTrigger value="verify">Verify personal #</TabsTrigger>
          <TabsTrigger value="sender">Sender IDs</TabsTrigger>
        </TabsList>
        <TabsContent value="numbers" className="mt-4"><MyNumbers /></TabsContent>
        <TabsContent value="tollfree" className="mt-4"><TollFreeSearch /></TabsContent>
        <TabsContent value="verify" className="mt-4"><VerifyPersonal /></TabsContent>
        <TabsContent value="sender" className="mt-4"><SenderIds /></TabsContent>
      </Tabs>
    </div>
  );
}

function MyNumbers() {
  const qc = useQueryClient();
  const del = useServerFn(deletePhoneNumber);
  const q = useQuery({
    queryKey: ["my-numbers"],
    queryFn: async () => (await supabase.from("phone_numbers").select("*").order("created_at", { ascending: false })).data ?? [],
  });
  const mut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => { toast.success("Removed"); qc.invalidateQueries({ queryKey: ["my-numbers"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (q.isLoading) return <Card className="p-6">Loading…</Card>;
  if (!q.data?.length) return <Card className="p-6 text-sm text-muted-foreground">No numbers yet. Use “Get toll-free” or “Verify personal #” to add one.</Card>;

  return (
    <div className="grid md:grid-cols-2 gap-4">
      {q.data.map((n) => (
        <Card key={n.id} className="p-4 flex items-center gap-3">
          <div className="size-10 rounded-lg bg-primary/10 text-primary grid place-items-center"><Phone className="size-5" /></div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold">{n.e164}</div>
            <div className="text-xs text-muted-foreground flex items-center gap-2">
              <span>{n.label}</span>·
              <Badge variant="secondary" className="capitalize">{n.type.replace("_", " ")}</Badge>
              <Badge variant="outline">{n.country}</Badge>
            </div>
          </div>
          <Button size="icon" variant="ghost" onClick={() => mut.mutate(n.id)} disabled={mut.isPending}>
            <Trash2 className="size-4" />
          </Button>
        </Card>
      ))}
    </div>
  );
}

function TollFreeSearch() {
  const [country, setCountry] = useState<"US" | "CA">("US");
  const [contains, setContains] = useState("");
  const search = useServerFn(searchTollFree);
  const purchase = useServerFn(purchaseTollFree);
  const qc = useQueryClient();

  const sQ = useMutation({
    mutationFn: () => search({ data: { country, contains: contains || undefined } }),
    onError: (e: Error) => toast.error(e.message),
  });
  const pMut = useMutation({
    mutationFn: (phone_number: string) => purchase({ data: { phone_number, country } }),
    onSuccess: () => { toast.success("Number provisioned"); qc.invalidateQueries({ queryKey: ["my-numbers"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card className="p-6 space-y-4">
      <div className="grid md:grid-cols-[140px_1fr_auto] gap-3 items-end">
        <div className="space-y-1.5">
          <Label>Country</Label>
          <Select value={country} onValueChange={(v) => setCountry(v as "US" | "CA")}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="US">United States</SelectItem>
              <SelectItem value="CA">Canada</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Contains digits (optional)</Label>
          <Input placeholder="e.g. 777 or 1800" value={contains} onChange={(e) => setContains(e.target.value)} />
        </div>
        <Button onClick={() => sQ.mutate()} disabled={sQ.isPending}>
          {sQ.isPending ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
          <span className="ml-2">Search</span>
        </Button>
      </div>

      {sQ.data?.items && (
        <div className="divide-y border rounded-lg">
          {sQ.data.items.length === 0 && <div className="p-4 text-sm text-muted-foreground">No numbers found.</div>}
          {sQ.data.items.map((n: { phone_number: string; friendly_name: string; locality: string | null; region: string | null }) => (
            <div key={n.phone_number} className="flex items-center gap-3 p-3">
              <div className="flex-1">
                <div className="font-mono font-medium">{n.phone_number}</div>
                <div className="text-xs text-muted-foreground">{[n.locality, n.region].filter(Boolean).join(", ") || n.friendly_name}</div>
              </div>
              <Button size="sm" onClick={() => pMut.mutate(n.phone_number)} disabled={pMut.isPending}>
                {pMut.isPending ? <Loader2 className="size-4 animate-spin" /> : "Provision"}
              </Button>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Toll-free numbers must complete Twilio's Toll-Free Verification before high-volume sending is unblocked. We provision the number now;
        verification is filed separately.
      </p>
    </Card>
  );
}

function VerifyPersonal() {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const [stage, setStage] = useState<"enter" | "code">("enter");
  const start = useServerFn(startPhoneVerification);
  const check = useServerFn(checkPhoneVerification);
  const qc = useQueryClient();

  const sMut = useMutation({
    mutationFn: () => start({ data: { e164: phone } }),
    onSuccess: () => { toast.success("Code sent — check your phone"); setStage("code"); },
    onError: (e: Error) => toast.error(e.message),
  });
  const cMut = useMutation({
    mutationFn: () => check({ data: { e164: phone, code, label: label || undefined } }),
    onSuccess: () => {
      toast.success("Number verified and added");
      qc.invalidateQueries({ queryKey: ["my-numbers"] });
      setPhone(""); setCode(""); setLabel(""); setStage("enter");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card className="p-6 space-y-4 max-w-xl">
      <p className="text-sm text-muted-foreground">
        Verify ownership of your personal phone. Verified numbers are stored on your account as caller ID / reply-to — outgoing SMS still goes
        from your toll-free number or approved Sender ID.
      </p>
      <div className="space-y-1.5">
        <Label>Phone (E.164)</Label>
        <Input placeholder="+15558675310" value={phone} onChange={(e) => setPhone(e.target.value)} disabled={stage === "code"} />
      </div>
      <div className="space-y-1.5">
        <Label>Label (optional)</Label>
        <Input placeholder="My mobile" value={label} onChange={(e) => setLabel(e.target.value)} />
      </div>
      {stage === "enter" ? (
        <Button onClick={() => sMut.mutate()} disabled={!phone || sMut.isPending}>
          {sMut.isPending && <Loader2 className="size-4 animate-spin mr-2" />}Send code
        </Button>
      ) : (
        <>
          <div className="space-y-1.5">
            <Label>6-digit code</Label>
            <Input inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
          </div>
          <div className="flex gap-2">
            <Button onClick={() => cMut.mutate()} disabled={code.length !== 6 || cMut.isPending}>
              {cMut.isPending && <Loader2 className="size-4 animate-spin mr-2" />}Confirm
            </Button>
            <Button variant="outline" onClick={() => setStage("enter")}>Change number</Button>
          </div>
        </>
      )}
    </Card>
  );
}

function SenderIds() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["my-sender-ids"],
    queryFn: async () => (await supabase.from("sender_ids").select("*").order("created_at", { ascending: false })).data ?? [],
  });
  const req = useServerFn(requestSenderId);
  const [open, setOpen] = useState(false);
  const [sender, setSender] = useState("");
  const [countries, setCountries] = useState("");
  const [useCase, setUseCase] = useState("");

  const mut = useMutation({
    mutationFn: () => req({ data: {
      sender_id: sender,
      countries: countries.split(",").map((c) => c.trim().toUpperCase()).filter((c) => c.length === 2),
      use_case: useCase || undefined,
    } }),
    onSuccess: () => {
      toast.success("Request submitted — awaiting admin approval");
      setOpen(false); setSender(""); setCountries(""); setUseCase("");
      qc.invalidateQueries({ queryKey: ["my-sender-ids"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Alphanumeric Sender IDs (e.g. <code className="px-1 rounded bg-muted">SAMWELL</code>) are used as the From on international SMS.
          Each one requires admin approval before it can be used.
        </p>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="size-4 mr-2" />Request Sender ID</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Request a Sender ID</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5"><Label>Sender ID (max 11 chars, letters/digits)</Label>
                <Input maxLength={11} value={sender} onChange={(e) => setSender(e.target.value)} placeholder="SAMWELL" /></div>
              <div className="space-y-1.5"><Label>Countries (comma-separated ISO codes)</Label>
                <Input value={countries} onChange={(e) => setCountries(e.target.value)} placeholder="GB, NG, ZA, KE" /></div>
              <div className="space-y-1.5"><Label>Use case</Label>
                <Textarea rows={3} value={useCase} onChange={(e) => setUseCase(e.target.value)}
                  placeholder="Transactional OTPs to customers who signed up for our service." /></div>
            </div>
            <DialogFooter>
              <Button onClick={() => mut.mutate()} disabled={!sender || mut.isPending}>
                {mut.isPending && <Loader2 className="size-4 animate-spin mr-2" />}Submit
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {q.isLoading && <Card className="p-6">Loading…</Card>}
      {q.data?.length === 0 && <Card className="p-6 text-sm text-muted-foreground">No Sender IDs requested yet.</Card>}

      <div className="grid md:grid-cols-2 gap-4">
        {q.data?.map((s) => (
          <Card key={s.id} className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div className="font-semibold flex items-center gap-2"><ShieldCheck className="size-4 text-primary" /> {s.sender_id}</div>
              <Badge variant={s.status === "approved" ? "default" : s.status === "rejected" ? "destructive" : "secondary"}>{s.status}</Badge>
            </div>
            <div className="text-xs text-muted-foreground">{s.countries?.length ? `Countries: ${s.countries.join(", ")}` : "All countries"}</div>
            {s.use_case && <div className="text-xs">{s.use_case}</div>}
            {s.review_note && <div className="text-xs italic text-muted-foreground">Admin: {s.review_note}</div>}
          </Card>
        ))}
      </div>
    </div>
  );
}
