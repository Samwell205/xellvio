import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Papa from "papaparse";
import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Users, Upload, UserPlus, Search, ShieldOff, CheckCircle2, Clock } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/audience")({
  head: () => ({ meta: [{ title: "Audience — Samwell Global SMS" }] }),
  component: AudiencePage,
});

type ProfileRow = {
  id: string;
  phone_e164: string;
  first_name: string | null;
  last_name: string | null;
  country_code: string | null;
  created_at: string;
  consent_status: "subscribed" | "unsubscribed" | "pending";
};

function AudiencePage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");

  const profilesQ = useQuery({
    queryKey: ["audience-profiles"],
    queryFn: async (): Promise<ProfileRow[]> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, phone_e164, first_name, last_name, country_code, created_at, consents(status, channel)")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []).map((p: any) => {
        const sms = (p.consents ?? []).find((c: any) => c.channel === "sms");
        return { ...p, consent_status: sms?.status ?? "pending" } as ProfileRow;
      });
    },
  });

  const statsQ = useQuery({
    queryKey: ["audience-stats"],
    queryFn: async () => {
      const [{ count: total }, { count: subs }, { count: supp }] = await Promise.all([
        supabase.from("profiles").select("*", { count: "exact", head: true }),
        supabase.from("consents").select("*", { count: "exact", head: true }).eq("status", "subscribed").eq("channel", "sms"),
        supabase.from("suppressions").select("*", { count: "exact", head: true }),
      ]);
      return { total: total ?? 0, subs: subs ?? 0, supp: supp ?? 0 };
    },
  });

  const filtered = useMemo(() => {
    const rows = profilesQ.data ?? [];
    if (!search.trim()) return rows;
    const s = search.toLowerCase();
    return rows.filter((r) =>
      r.phone_e164.toLowerCase().includes(s) ||
      (r.first_name ?? "").toLowerCase().includes(s) ||
      (r.last_name ?? "").toLowerCase().includes(s),
    );
  }, [profilesQ.data, search]);

  const toggleConsent = useMutation({
    mutationFn: async (row: ProfileRow) => {
      const next = row.consent_status === "subscribed" ? "unsubscribed" : "subscribed";
      const { data: u } = await supabase.auth.getUser();
      const accountId = u.user!.id;
      // Upsert consent
      const { error: ce } = await supabase.from("consents").upsert(
        { profile_id: row.id, channel: "sms", status: next, source: "manual", consented_at: new Date().toISOString() },
        { onConflict: "profile_id,channel" },
      );
      if (ce) throw ce;
      if (next === "unsubscribed") {
        await supabase.from("suppressions").upsert(
          { account_id: accountId, phone_e164: row.phone_e164, reason: "manual_opt_out", source: "audience_ui" },
          { onConflict: "account_id,phone_e164" },
        );
      } else {
        await supabase.from("suppressions").delete()
          .eq("account_id", accountId).eq("phone_e164", row.phone_e164);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["audience-profiles"] });
      qc.invalidateQueries({ queryKey: ["audience-stats"] });
      qc.invalidateQueries({ queryKey: ["suppressions"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold flex items-center gap-2"><Users className="size-6" />Audience</h1>
          <p className="text-sm text-muted-foreground">Contacts, consents, and opt-outs.</p>
        </div>
        <div className="flex gap-2">
          <AddContactDialog onDone={() => { qc.invalidateQueries({ queryKey: ["audience-profiles"] }); qc.invalidateQueries({ queryKey: ["audience-stats"] }); }} />
          <ImportCsvDialog onDone={() => { qc.invalidateQueries({ queryKey: ["audience-profiles"] }); qc.invalidateQueries({ queryKey: ["audience-stats"] }); }} />
        </div>
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        <Stat icon={Users} label="Total contacts" value={statsQ.data?.total ?? 0} />
        <Stat icon={CheckCircle2} label="Subscribed (SMS)" value={statsQ.data?.subs ?? 0} tone="success" />
        <Stat icon={ShieldOff} label="Suppressed" value={statsQ.data?.supp ?? 0} tone="danger" />
      </div>

      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search name or phone…" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="text-xs text-muted-foreground ml-auto">{filtered.length} shown</div>
        </div>
        <div className="rounded-lg border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Phone</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Country</TableHead>
                <TableHead>Consent</TableHead>
                <TableHead>Added</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {profilesQ.isLoading && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>}
              {!profilesQ.isLoading && filtered.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-10">
                  No contacts yet. Add one manually or import a CSV.
                </TableCell></TableRow>
              )}
              {filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-sm">{r.phone_e164}</TableCell>
                  <TableCell>{[r.first_name, r.last_name].filter(Boolean).join(" ") || <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell>{r.country_code ?? "—"}</TableCell>
                  <TableCell><ConsentBadge status={r.consent_status} /></TableCell>
                  <TableCell className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" disabled={toggleConsent.isPending} onClick={() => toggleConsent.mutate(r)}>
                      {r.consent_status === "subscribed" ? "Opt out" : "Resubscribe"}
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

function Stat({ icon: Icon, label, value, tone }: { icon: any; label: string; value: number | string; tone?: "success" | "danger" }) {
  const ring = tone === "success" ? "text-success bg-success/10" : tone === "danger" ? "text-destructive bg-destructive/10" : "text-primary bg-primary/10";
  return (
    <Card className="p-5">
      <div className={`size-10 rounded-lg grid place-items-center ${ring}`}><Icon className="size-5" /></div>
      <div className="mt-3 text-2xl font-extrabold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </Card>
  );
}

function ConsentBadge({ status }: { status: ProfileRow["consent_status"] }) {
  if (status === "subscribed") return <Badge className="bg-success/15 text-success border-success/30"><CheckCircle2 className="size-3 mr-1" />Subscribed</Badge>;
  if (status === "unsubscribed") return <Badge variant="outline" className="text-destructive border-destructive/30"><ShieldOff className="size-3 mr-1" />Opted out</Badge>;
  return <Badge variant="outline"><Clock className="size-3 mr-1" />Pending</Badge>;
}

function AddContactDialog({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState("US");
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setSubmitting(true);
    try {
      const parsed = parsePhoneNumberFromString(phone, country as CountryCode);
      if (!parsed || !parsed.isValid()) {
        toast.error("Invalid phone number");
        return;
      }
      const e164 = parsed.number;
      const { data: u } = await supabase.auth.getUser();
      const accountId = u.user!.id;
      const { data: prof, error } = await supabase.from("profiles").upsert(
        { account_id: accountId, phone_e164: e164, first_name: first || null, last_name: last || null, country_code: parsed.country ?? country },
        { onConflict: "account_id,phone_e164" },
      ).select("id").single();
      if (error) throw error;
      await supabase.from("consents").upsert(
        { profile_id: prof.id, channel: "sms", status: "subscribed", source: "manual", consented_at: new Date().toISOString() },
        { onConflict: "profile_id,channel" },
      );
      toast.success("Contact added");
      setOpen(false);
      setPhone(""); setFirst(""); setLast("");
      onDone();
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline"><UserPlus className="size-4 mr-1.5" />Add contact</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a contact</DialogTitle>
          <DialogDescription>You attest this person opted in to receive SMS from you.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label>Country</Label>
              <Input value={country} onChange={(e) => setCountry(e.target.value.toUpperCase())} maxLength={2} />
            </div>
            <div className="col-span-2">
              <Label>Phone</Label>
              <Input placeholder="+15551234567 or local" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>First name</Label><Input value={first} onChange={(e) => setFirst(e.target.value)} /></div>
            <div><Label>Last name</Label><Input value={last} onChange={(e) => setLast(e.target.value)} /></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} disabled={submitting}>{submitting ? "Adding…" : "Add contact"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ImportCsvDialog({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [defaultCountry, setDefaultCountry] = useState("US");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ inserted: number; invalid: number; duplicates: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setBusy(true);
    setResult(null);
    try {
      const text = await file.text();
      const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
      const { data: u } = await supabase.auth.getUser();
      const accountId = u.user!.id;

      const seen = new Set<string>();
      const valid: { account_id: string; phone_e164: string; first_name: string | null; last_name: string | null; country_code: string }[] = [];
      let invalid = 0;
      let duplicates = 0;

      for (const row of parsed.data) {
        const rawPhone = row.phone ?? row.Phone ?? row.phone_number ?? row.mobile ?? row.PhoneNumber ?? "";
        const rawCountry = (row.country ?? row.Country ?? defaultCountry).toUpperCase().slice(0, 2);
        const p = parsePhoneNumberFromString(rawPhone, rawCountry as CountryCode);
        if (!p || !p.isValid()) { invalid++; continue; }
        const e164 = p.number;
        if (seen.has(e164)) { duplicates++; continue; }
        seen.add(e164);
        valid.push({
          account_id: accountId,
          phone_e164: e164,
          first_name: row.first_name ?? row.firstname ?? row.FirstName ?? null,
          last_name: row.last_name ?? row.lastname ?? row.LastName ?? null,
          country_code: p.country ?? rawCountry,
        });
      }

      let inserted = 0;
      // Chunk inserts
      for (let i = 0; i < valid.length; i += 500) {
        const chunk = valid.slice(i, i + 500);
        const { data, error } = await supabase
          .from("profiles")
          .upsert(chunk, { onConflict: "account_id,phone_e164", ignoreDuplicates: false })
          .select("id");
        if (error) throw error;
        inserted += data?.length ?? 0;
        // Consent rows
        if (data?.length) {
          const consents = data.map((d) => ({
            profile_id: d.id, channel: "sms" as const, status: "subscribed" as const, source: "csv_import",
            consented_at: new Date().toISOString(),
          }));
          await supabase.from("consents").upsert(consents, { onConflict: "profile_id,channel" });
        }
      }
      setResult({ inserted, invalid, duplicates });
      toast.success(`Imported ${inserted} contacts`);
      onDone();
    } catch (e: any) {
      toast.error(e.message ?? "Import failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setResult(null); }}>
      <DialogTrigger asChild>
        <Button><Upload className="size-4 mr-1.5" />Import CSV</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import contacts from CSV</DialogTitle>
          <DialogDescription>
            Expected columns: <code className="text-xs">phone</code>, <code className="text-xs">first_name</code>, <code className="text-xs">last_name</code>, <code className="text-xs">country</code> (ISO 2-letter, optional).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Default country (used when row has no country)</Label>
            <Input value={defaultCountry} onChange={(e) => setDefaultCountry(e.target.value.toUpperCase())} maxLength={2} />
          </div>
          <Input ref={fileRef} type="file" accept=".csv,text/csv" disabled={busy}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
          {busy && <p className="text-sm text-muted-foreground">Parsing and importing…</p>}
          {result && (
            <Card className="p-3 text-sm">
              <div>✅ Inserted/updated: <b>{result.inserted}</b></div>
              <div>⚠️ Invalid phone numbers skipped: <b>{result.invalid}</b></div>
              <div>↩️ Duplicates in file: <b>{result.duplicates}</b></div>
            </Card>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
