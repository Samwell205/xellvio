import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Filter, Users, X } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/segments/new")({
  head: () => ({ meta: [{ title: "New segment — Samwell Global SMS" }] }),
  component: NewSegmentPage,
});

const CONSENT_OPTS = ["subscribed", "pending", "unsubscribed"] as const;

function NewSegmentPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [consent, setConsent] = useState<string[]>(["subscribed"]);
  const [countryInput, setCountryInput] = useState("");
  const [countries, setCountries] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // Load distinct countries to suggest
  const countryListQ = useQuery({
    queryKey: ["segment-countries"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("country_code").not("country_code", "is", null).limit(1000);
      const set = new Set<string>();
      (data ?? []).forEach((r: any) => r.country_code && set.add(r.country_code));
      return Array.from(set).sort();
    },
  });

  const query = useMemo(() => {
    const q: Record<string, any> = { consent_in: consent };
    if (countries.length) q.country_in = countries;
    return q;
  }, [consent, countries]);

  // Live estimated count via the helper SQL function
  const estimateQ = useQuery({
    queryKey: ["segment-estimate", query],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { data, error } = await supabase.rpc("profiles_match_query", {
        _account_id: u.user!.id,
        _query: query as any,
      });
      if (error) throw error;
      return (data as any[])?.length ?? 0;
    },
  });

  function addCountry() {
    const v = countryInput.trim().toUpperCase().slice(0, 2);
    if (v && !countries.includes(v)) setCountries([...countries, v]);
    setCountryInput("");
  }

  async function save() {
    if (!name.trim()) { toast.error("Name required"); return; }
    setSaving(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("segments").insert({
        account_id: u.user!.id, name: name.trim(), query: query as any,
      });
      if (error) throw error;
      toast.success("Segment saved");
      navigate({ to: "/app/segments" });
    } catch (e: any) { toast.error(e.message ?? "Failed"); }
    finally { setSaving(false); }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-extrabold flex items-center gap-2"><Filter className="size-6" />New segment</h1>
        <p className="text-sm text-muted-foreground">Define a saved filter. Campaigns target one or more segments.</p>
      </div>

      <Card className="p-5 space-y-4">
        <div>
          <Label>Segment name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. US subscribers" />
        </div>

        <div>
          <Label>Consent status</Label>
          <div className="flex flex-wrap gap-3 mt-2">
            {CONSENT_OPTS.map((opt) => (
              <label key={opt} className="flex items-center gap-2 text-sm">
                <Checkbox checked={consent.includes(opt)} onCheckedChange={(v) => {
                  setConsent((prev) => v ? [...prev, opt] : prev.filter((x) => x !== opt));
                }} />
                {opt}
              </label>
            ))}
          </div>
        </div>

        <div>
          <Label>Countries (ISO 2-letter)</Label>
          <div className="flex gap-2 mt-1">
            <Input value={countryInput} onChange={(e) => setCountryInput(e.target.value)}
              placeholder="US" maxLength={2}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCountry(); } }} />
            <Button type="button" variant="outline" onClick={addCountry}>Add</Button>
          </div>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {countries.map((c) => (
              <Badge key={c} variant="outline" className="gap-1">
                {c}
                <button onClick={() => setCountries(countries.filter((x) => x !== c))} className="hover:text-destructive"><X className="size-3" /></button>
              </Badge>
            ))}
            {countries.length === 0 && <span className="text-xs text-muted-foreground">No country filter — all countries included.</span>}
          </div>
          {countryListQ.data && countryListQ.data.length > 0 && (
            <div className="text-xs text-muted-foreground mt-2">
              Suggestions: {countryListQ.data.slice(0, 8).map((c) => (
                <button key={c} className="underline mr-2" onClick={() => !countries.includes(c) && setCountries([...countries, c])}>{c}</button>
              ))}
            </div>
          )}
        </div>
      </Card>

      <Card className="p-5 flex items-center justify-between bg-primary/5 border-primary/30">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-lg bg-primary/15 text-primary grid place-items-center"><Users className="size-5" /></div>
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Estimated audience</div>
            <div className="text-2xl font-extrabold">{estimateQ.isFetching ? "…" : (estimateQ.data ?? 0)}</div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => history.back()}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save segment"}</Button>
        </div>
      </Card>

      <Card className="p-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Filter (JSON)</div>
        <pre className="text-xs bg-muted/40 p-3 rounded-md overflow-x-auto">{JSON.stringify(query, null, 2)}</pre>
      </Card>
    </div>
  );
}
