import { useMemo, useState } from "react";
import Papa from "papaparse";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Upload, FileText, AlertTriangle, CheckCircle2, Loader2, Download } from "lucide-react";

const TEMPLATE_CSV = `Email,Phone Number,First Name,Last Name,Country,External ID
jane@example.com,+15555550100,Jane,Doe,US,
john@example.com,+447700900123,John,Smith,GB,cust_001
,+233555000111,Ama,Mensah,GH,
`;

function downloadTemplate() {
  const blob = new Blob([TEMPLATE_CSV], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "contacts-template.csv";
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

const ALLOWED_EXT = [".csv", ".txt"];
const MAX_BYTES = 20 * 1024 * 1024; // 20 MB

function validateFile(f: File): string | null {
  const name = f.name.toLowerCase();
  const okExt = ALLOWED_EXT.some((e) => name.endsWith(e));
  const okMime = !f.type || f.type.includes("csv") || f.type.includes("text") || f.type.includes("excel");
  if (!okExt) return `Unsupported file type. Upload a .csv file (got "${f.name}").`;
  if (!okMime) return `Unsupported file type "${f.type}". Use CSV.`;
  if (f.size > MAX_BYTES) return `File too large (${(f.size / 1024 / 1024).toFixed(1)} MB). Max 20 MB.`;
  if (f.size === 0) return "File is empty.";
  return null;
}

type ImportProps = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  groups: { id: string; name: string }[];
  defaultGroupId?: string | null;
  onImported?: () => void;
};

type Row = {
  email: string | null;
  phone: string | null;
  external_id: string | null;
  first_name: string | null;
  last_name: string | null;
  name: string | null;
  country: string | null;
};

type Step = "upload" | "review" | "importing" | "done";

const FIELD_MAP: Record<string, keyof Row> = {
  email: "email", "email address": "email", "e-mail": "email",
  phone: "phone", "phone number": "phone", mobile: "phone", "mobile number": "phone", msisdn: "phone",
  "external id": "external_id", "external_id": "external_id", externalid: "external_id", id: "external_id",
  "first name": "first_name", firstname: "first_name", "given name": "first_name",
  "last name": "last_name", lastname: "last_name", surname: "last_name",
  name: "name", "full name": "name",
  country: "country", "country code": "country",
};

const BATCH_SIZE = 500;

function mapHeader(h: string): keyof Row | null {
  return FIELD_MAP[h.trim().toLowerCase()] ?? null;
}

function normalizeRow(raw: Record<string, string>): Row {
  const out: Row = { email: null, phone: null, external_id: null, first_name: null, last_name: null, name: null, country: null };
  for (const [k, v] of Object.entries(raw)) {
    const field = mapHeader(k);
    const val = (v ?? "").toString().trim();
    if (!field || !val) continue;
    out[field] = val;
  }
  if (!out.name && (out.first_name || out.last_name)) {
    out.name = [out.first_name, out.last_name].filter(Boolean).join(" ");
  }
  if (out.email) out.email = out.email.toLowerCase();
  if (out.phone) out.phone = out.phone.replace(/[^\d+]/g, "");
  return out;
}

function validate(rows: Row[]) {
  const valid: Row[] = [];
  const errors: { row: number; reason: string }[] = [];
  rows.forEach((r, i) => {
    if (!r.email && !r.phone && !r.external_id) {
      errors.push({ row: i + 2, reason: "Missing email, phone, and external ID" });
      return;
    }
    if (r.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email)) {
      errors.push({ row: i + 2, reason: `Invalid email: ${r.email}` });
      return;
    }
    if (r.phone && r.phone.replace(/\D/g, "").length < 6) {
      errors.push({ row: i + 2, reason: `Phone too short: ${r.phone}` });
      return;
    }
    valid.push(r);
  });
  return { valid, errors };
}

export function ImportContactsDialog({ open, onOpenChange, groups, defaultGroupId, onImported }: ImportProps) {
  const [mode, setMode] = useState<"file" | "paste">("file");
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [errors, setErrors] = useState<{ row: number; reason: string }[]>([]);
  const [step, setStep] = useState<Step>("upload");
  const [groupId, setGroupId] = useState<string>(defaultGroupId ?? "__none__");
  const [progress, setProgress] = useState(0);
  const [inserted, setInserted] = useState(0);

  const detectedFields = useMemo(() => {
    const set = new Set<keyof Row>();
    rows.forEach((r) => (Object.keys(r) as (keyof Row)[]).forEach((k) => { if (r[k]) set.add(k); }));
    return Array.from(set);
  }, [rows]);

  function reset() {
    setText(""); setFileName(null); setRows([]); setErrors([]); setStep("upload");
    setProgress(0); setInserted(0); setMode("file");
  }

  function parseCsvText(csv: string) {
    const result = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true });
    if (!result.data?.length) {
      toast.error("No rows found in CSV.");
      return;
    }
    const normalized = result.data.map(normalizeRow);
    const { valid, errors } = validate(normalized);
    setRows(valid);
    setErrors(errors);
    setStep("review");
    if (valid.length === 0) toast.error("No valid rows. Check your column headers (Email, Phone Number, etc).");
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    const err = validateFile(f);
    if (err) { toast.error(err); e.target.value = ""; return; }
    setFileName(f.name);
    const reader = new FileReader();
    reader.onload = () => parseCsvText(String(reader.result ?? ""));
    reader.onerror = () => toast.error("Could not read file.");
    reader.readAsText(f);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0]; if (!f) return;
    const err = validateFile(f);
    if (err) { toast.error(err); return; }
    setFileName(f.name);
    const reader = new FileReader();
    reader.onload = () => parseCsvText(String(reader.result ?? ""));
    reader.readAsText(f);
  }

  async function runImport() {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) { toast.error("Not signed in."); return; }
    setStep("importing"); setProgress(0); setInserted(0);
    const gid = groupId && groupId !== "__none__" ? groupId : null;

    let done = 0;
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE).map((r) => ({
        user_id: u.user!.id,
        group_id: gid,
        email: r.email,
        phone: r.phone,
        external_id: r.external_id,
        first_name: r.first_name,
        last_name: r.last_name,
        name: r.name,
        country: r.country,
      }));

      // Try upsert on phone first, fallback to email, then external_id.
      // Split batch by which identifier each row primarily uses.
      const byPhone = batch.filter((r) => r.phone);
      const byEmail = batch.filter((r) => !r.phone && r.email);
      const byExt = batch.filter((r) => !r.phone && !r.email && r.external_id);

      for (const [chunk, conflict] of [
        [byPhone, "user_id,phone"] as const,
        [byEmail, "user_id,email"] as const,
        [byExt, "user_id,external_id"] as const,
      ]) {
        if (!chunk.length) continue;
        const { error } = await supabase.from("contacts").upsert(chunk, { onConflict: conflict, ignoreDuplicates: false });
        if (error) {
          console.error("Import batch failed:", error);
          toast.error(`Import error: ${error.message}`);
          setStep("review");
          return;
        }
      }

      done += batch.length;
      setInserted(done);
      setProgress(Math.round((done / rows.length) * 100));
    }
    setStep("done");
    toast.success(`Imported ${done.toLocaleString()} contacts`);
    onImported?.();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import contacts</DialogTitle>
          <DialogDescription>
            Each contact must include an <Badge variant="secondary">Email</Badge>,{" "}
            <Badge variant="secondary">Phone Number</Badge>, or <Badge variant="secondary">External ID</Badge>{" "}
            along with any additional fields. Phone numbers should be E.164 (e.g. +17823746561).
          </DialogDescription>
        </DialogHeader>

        {step === "upload" && (
          <div className="space-y-4">
            <div className="flex gap-2 text-sm">
              <button onClick={() => setMode("file")} className={`px-3 py-1.5 rounded-md border ${mode === "file" ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent"}`}>Upload CSV</button>
              <button onClick={() => setMode("paste")} className={`px-3 py-1.5 rounded-md border ${mode === "paste" ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent"}`}>Paste CSV</button>
            </div>

            {mode === "file" ? (
              <label
                onDrop={onDrop}
                onDragOver={(e) => e.preventDefault()}
                className="block border-2 border-dashed rounded-lg p-8 text-center cursor-pointer bg-muted/30 hover:bg-muted/50 transition"
              >
                <Upload className="size-8 mx-auto text-muted-foreground" />
                <div className="mt-3 font-semibold">Drag and drop or upload CSV</div>
                <div className="text-xs text-muted-foreground mt-1">Accepts .csv file type · Max 50 MB</div>
                {fileName && <div className="mt-3 text-xs inline-flex items-center gap-1.5 bg-background border rounded px-2 py-1"><FileText className="size-3" />{fileName}</div>}
                <input type="file" accept=".csv,text/csv" onChange={onFile} className="hidden" />
              </label>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="csv-paste">Paste your CSV</Label>
                <Textarea
                  id="csv-paste"
                  rows={10}
                  placeholder={"Email,Phone Number,First Name,Last Name\nsomeone@example.com,+15555550100,George,Washington"}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  className="font-mono text-xs"
                />
                <Button onClick={() => parseCsvText(text)} disabled={!text.trim()}>Parse CSV</Button>
              </div>
            )}

            <div className="text-xs text-muted-foreground border-t pt-3">
              <strong>Supported headers:</strong> Email, Phone Number, External ID, First Name, Last Name, Name, Country
            </div>
          </div>
        )}

        {step === "review" && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-md border p-3">
                <div className="text-xs text-muted-foreground">Valid rows</div>
                <div className="text-2xl font-bold text-emerald-600">{rows.length.toLocaleString()}</div>
              </div>
              <div className="rounded-md border p-3">
                <div className="text-xs text-muted-foreground">Errors</div>
                <div className="text-2xl font-bold text-destructive">{errors.length.toLocaleString()}</div>
              </div>
              <div className="rounded-md border p-3">
                <div className="text-xs text-muted-foreground">Detected fields</div>
                <div className="text-xs mt-1 flex flex-wrap gap-1">{detectedFields.map((f) => <Badge key={f} variant="secondary" className="text-[10px]">{f}</Badge>)}</div>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Add to list (optional)</Label>
              <Select value={groupId} onValueChange={setGroupId}>
                <SelectTrigger><SelectValue placeholder="No list — All contacts" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No list — All contacts</SelectItem>
                  {groups.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {errors.length > 0 && (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3">
                <div className="flex items-center gap-2 text-sm font-medium text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="size-4" /> {errors.length} row{errors.length > 1 ? "s" : ""} will be skipped
                </div>
                <div className="mt-2 max-h-32 overflow-auto text-xs space-y-0.5 font-mono">
                  {errors.slice(0, 20).map((e, i) => <div key={i}>Row {e.row}: {e.reason}</div>)}
                  {errors.length > 20 && <div className="text-muted-foreground">…and {errors.length - 20} more</div>}
                </div>
              </div>
            )}
          </div>
        )}

        {step === "importing" && (
          <div className="space-y-3 py-4">
            <div className="flex items-center gap-2 text-sm"><Loader2 className="size-4 animate-spin" /> Importing {inserted.toLocaleString()} / {rows.length.toLocaleString()}…</div>
            <Progress value={progress} />
            <p className="text-xs text-muted-foreground">Uploading in batches of {BATCH_SIZE}. Existing contacts will be updated, not duplicated.</p>
          </div>
        )}

        {step === "done" && (
          <div className="py-6 text-center space-y-2">
            <CheckCircle2 className="size-10 mx-auto text-emerald-600" />
            <div className="font-semibold">Import complete</div>
            <p className="text-sm text-muted-foreground">{inserted.toLocaleString()} contacts added or updated.</p>
          </div>
        )}

        <DialogFooter>
          {step === "review" && (
            <>
              <Button variant="outline" onClick={() => setStep("upload")}>Back</Button>
              <Button onClick={runImport} disabled={rows.length === 0}>Import {rows.length.toLocaleString()} contacts</Button>
            </>
          )}
          {step === "done" && <Button onClick={() => { reset(); onOpenChange(false); }}>Done</Button>}
          {step === "upload" && <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
