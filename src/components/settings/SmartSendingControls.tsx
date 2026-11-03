import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Clock, ShieldCheck, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SMART_SENDING_WINDOWS, SmartSendingSettingsSchema } from "@/lib/smart-sending";
import { getSmartSendingSettings, saveSmartSendingSettings } from "@/lib/smart-sending.functions";
import { getUploadScreeningSetting, saveUploadScreeningSetting } from "@/lib/line-type.functions";
import { LOOKUP_PRICE_PER_NUMBER } from "@/lib/line-type.shared";

export function SmartSendingWindow({ hours, onChange, disabled }: { hours: number; onChange: (hours: number) => void; disabled?: boolean }) {
  const [custom, setCustom] = useState(!SMART_SENDING_WINDOWS.some(w => w.hours === hours));
  useEffect(() => { if (!SMART_SENDING_WINDOWS.some(w => w.hours === hours)) setCustom(true); }, [hours]);
  return <div className="max-w-sm space-y-2">
    <Label>Skip numbers messaged within</Label>
    <Select value={custom ? "custom" : String(hours)} disabled={disabled} onValueChange={value => { setCustom(value === "custom"); if (value !== "custom") onChange(Number(value)); }}>
      <SelectTrigger aria-label="Smart Sending window"><SelectValue /></SelectTrigger>
      <SelectContent>{SMART_SENDING_WINDOWS.map(w => <SelectItem key={w.hours} value={String(w.hours)}>{w.label}</SelectItem>)}<SelectItem value="custom">Custom hours</SelectItem></SelectContent>
    </Select>
    {custom && <Input aria-label="Custom Smart Sending hours" type="number" min={1} max={8760} step={1} value={hours} disabled={disabled} onChange={e => onChange(Number(e.target.value))} />}
  </div>;
}

export function SmartSendingSettings() {
  const load = useServerFn(getSmartSendingSettings);
  const save = useServerFn(saveSmartSendingSettings);
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ["smart-sending-settings"], queryFn: () => load() });
  const [enabled, setEnabled] = useState(true);
  const [hours, setHours] = useState(24);
  useEffect(() => { if (query.data) { setEnabled(query.data.enabled); setHours(query.data.hours); } }, [query.data]);
  const mutation = useMutation({ mutationFn: () => save({ data: { enabled, hours } }), onSuccess: () => { qc.invalidateQueries({ queryKey: ["smart-sending-settings"] }); toast.success("Smart Sending settings saved"); }, onError: (error: Error) => toast.error(error.message) });
  if (query.isPending) return <div role="status">Loading sending settings…</div>;
  if (query.isError) return <div role="alert" className="text-destructive">{query.error.message}</div>;
  return <section className="space-y-5 border-b pb-6">
    <div className="flex items-center justify-between gap-4"><h3 className="flex items-center gap-2 font-semibold"><Clock className="size-4" />Smart Sending</h3><Switch aria-label="Enable Smart Sending" checked={enabled} onCheckedChange={setEnabled} disabled={!query.data?.canEdit} /></div>
    <SmartSendingWindow hours={hours} onChange={setHours} disabled={!enabled || !query.data?.canEdit} />
    <div className="flex items-center gap-2 text-sm text-muted-foreground"><ShieldCheck className="size-4 shrink-0" />Invalid-number and opt-out protection always active</div>
    <Button onClick={() => mutation.mutate()} disabled={!query.data?.canEdit || mutation.isPending || !SmartSendingSettingsSchema.safeParse({ enabled, hours }).success}>{mutation.isPending ? "Saving…" : "Save sending settings"}</Button>
  </section>;
}

export function UploadScreeningSettings() {
  const load = useServerFn(getUploadScreeningSetting);
  const save = useServerFn(saveUploadScreeningSetting);
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ["upload-screening"], queryFn: () => load() });
  const [enabled, setEnabled] = useState(false);
  useEffect(() => { if (query.data) setEnabled(query.data.enabled); }, [query.data]);
  const mutation = useMutation({ mutationFn: () => save({ data: { enabled } }), onSuccess: () => { qc.invalidateQueries({ queryKey: ["upload-screening"] }); toast.success("Phone checking settings saved"); }, onError: (error: Error) => toast.error(error.message) });
  if (query.isPending) return <div role="status">Loading phone checking settings…</div>;
  if (query.isError) return <div role="alert" className="text-destructive">{query.error.message}</div>;
  return <section className="space-y-3 border-b pb-6">
    <div className="flex items-center justify-between gap-4"><h3 className="flex items-center gap-2 font-semibold"><Smartphone className="size-4" />Check phone types on import</h3><Switch aria-label="Check phone types on import" checked={enabled} onCheckedChange={setEnabled} disabled={!query.data?.canEdit} /></div>
    <p className="text-sm text-muted-foreground">When on, every CSV upload is checked with the carrier: landlines and toll-free numbers are blocked before they can cost a send. ${'{'}LOOKUP_PRICE_PER_NUMBER.toFixed(2){'}'} per number not checked before; already-checked numbers are free.</p>
    <Button onClick={() => mutation.mutate()} disabled={!query.data?.canEdit || mutation.isPending}>{mutation.isPending ? "Saving…" : "Save phone checking"}</Button>
  </section>;
}