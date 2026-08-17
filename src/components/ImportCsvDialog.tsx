import { useEffect, useMemo, useRef, useState } from "react";
import Papa from "papaparse";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, Download, Upload, Zap, RotateCcw } from "lucide-react";
import { normalizePhone } from "@/lib/phone-normalize";
import {
  startImportJob, importProfilesBatch, finishImportJob, getActiveImportJob,
  type ImportJob, type ImportRow,
} from "@/lib/audience-import.functions";

type ContactList = { id: string; name: string; description: string | null };
type Mapping = { phone?: string; first?: string; last?: string; country?: string };
type RowError = { row: number; reason: string };

const PHONE_KEYS = ["phone", "phone_number", "phonenumber", "mobile", "mobile_number", "cell", "msisdn", "number", "tel", "telephone", "to"];
const FIRST_KEYS = ["first_name", "firstname", "fname", "given_name", "first"];
const LAST_KEYS = ["last_name", "lastname", "lname", "surname", "family_name", "last"];
const COUNTRY_KEYS = ["country", "country_code", "iso", "iso2"];
const PREVIEW_ROWS = 100;
const BATCH_ROWS = 5000;

function detect(headers: string[], aliases: string[]) {
  for (const h of headers) if (aliases.includes(h.trim().toLowerCase())) return h;
  return undefined;
}

function slugify(s: string) {
  return s.trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "field";
}

function fmtInt(n: number) { return n.toLocaleString(); }
function fmtEta(sec: number) {
  if (!isFinite(sec) || sec <= 0) return "—";
  if (sec < 60) return `${Math.ceil(sec)}s`;
  const m = Math.floor(sec / 60);
  return `${m}m ${Math.round(sec - m * 60)}s`;
}

export default function ImportCsvDialog({
  lists, onDone, onDownloadTemplate,
}: { lists: ContactList[]; onDone: () => void; onDownloadTemplate: () => void }) {
  const qc = useQueryClient();
  const startJob = useServerFn(startImportJob);
  const importBatch = useServerFn(importProfilesBatch);
  const finishJob = useServerFn(finishImportJob);
  const activeJobFn = useServerFn(getActiveImportJob);

  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [sample, setSample] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Mapping>({});
  const [customMap, setCustomMap] = useState<Record<string, string>>({});
  const [excludedCols, setExcludedCols] = useState<Set<string>>(new Set());
  const [excludedRows, setExcludedRows] = useState<Set<number>>(new Set());
  const [listId, setListId] = useState<string>("none");
  const [defaultCountry, setDefaultCountry] = useState("US");
  const [estimatedRows, setEstimatedRows] = useState(0);
  const [busy, setBusy] = useState(false);
  const [resumeJob, setResumeJob] = useState<ImportJob | null>(null);
  const [progress, setProgress] = useState<{ processed: number; total: number; inserted: number; invalid: number; dupes: number; rps: number; eta: number } | null>(null);
  const [result, setResult] = useState<{ inserted: number; invalid: number; duplicates: number; errors: RowError[] } | null>(null);
  const cancelRef = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    activeJobFn().then((j) => setResumeJob(j)).catch(() => {});
  }, [open]);

  function reset(keepResume = false) {
    setFile(null); setHeaders([]); setSample([]); setMapping({}); setCustomMap({});
    setExcludedCols(new Set()); setExcludedRows(new Set()); setEstimatedRows(0);
    setProgress(null); setResult(null); setBusy(false); cancelRef.current = false;
    if (!keepResume) setResumeJob(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function handleFile(f: File) {
    setResult(null); setProgress(null);
    setFile(f);
    Papa.parse<Record<string, string>>(f, {
      header: true, skipEmptyLines: true, preview: PREVIEW_ROWS,
      complete: (res) => {
        const hs = (res.meta.fields ?? []).filter(Boolean) as string[];
        setHeaders(hs);
        setSample(res.data.slice(0, PREVIEW_ROWS));
        setMapping({
          phone: detect(hs, PHONE_KEYS),
          first: detect(hs, FIRST_KEYS),
          last: detect(hs, LAST_KEYS),
          country: detect(hs, COUNTRY_KEYS),
        });
        // Estimate total rows from average sampled line length.
        const sampled = res.data.length || 1;
        const avgLen = res.data.reduce((a, r) => a + Object.values(r).join(",").length + 2, 0) / sampled;
        setEstimatedRows(Math.max(sampled, Math.round(f.size / Math.max(avgLen, 8))));
      },
      error: (e) => toast.error(e.message),
    });
  }

  const canImport = !!file && !!mapping.phone && !excludedCols.has(mapping.phone ?? "");

  async function runImport(resumeFrom = 0, jobIdIn?: string) {
    if (!file || !mapping.phone) return;
    setBusy(true); setResult(null); cancelRef.current = false;

    const targetList = listId === "none" ? null : listId;
    let job: ImportJob;
    try {
      if (jobIdIn) {
        job = { id: jobIdIn } as ImportJob;
      } else {
        job = await startJob({ data: {
          fileName: file.name, fileSize: file.size, totalRows: estimatedRows,
          listId: targetList, mapping: { ...mapping, custom: customMap },
        } });
        if (job.processed_rows > 0) resumeFrom = job.processed_rows;
      }
    } catch (e: any) {
      setBusy(false); toast.error(e.message ?? "Could not start import"); return;
    }

    const started = Date.now();
    let rowIndex = 0;          // data rows read from file
    let processed = 0;         // rows consumed (incl. skipped)
    let inserted = 0, invalid = 0, dupes = 0;
    const errors: RowError[] = [];
    const seen = new Set<string>();
    let buffer: ImportRow[] = [];

    const customEntries = Object.entries(customMap).filter(([h]) => !excludedCols.has(h));
    const phoneCol = mapping.phone!;
    const firstCol = mapping.first && !excludedCols.has(mapping.first) ? mapping.first : null;
    const lastCol = mapping.last && !excludedCols.has(mapping.last) ? mapping.last : null;
    const countryCol = mapping.country && !excludedCols.has(mapping.country) ? mapping.country : null;

    const flush = async (final: boolean) => {
      if (buffer.length === 0 && !final) return;
      const rows = buffer; buffer = [];
      const res = await importBatch({ data: {
        jobId: job.id, listId: targetList, rows,
        processedRows: processed, invalidCount: invalid, duplicateCount: dupes,
      } });
      inserted += res.upserted;
      const elapsed = (Date.now() - started) / 1000;
      const rps = processed / Math.max(elapsed, 0.001);
      const total = Math.max(estimatedRows, processed);
      setProgress({ processed, total, inserted, invalid, dupes, rps, eta: (total - processed) / Math.max(rps, 1) });
    };

    await new Promise<void>((resolve, reject) => {
      // NOTE: worker mode cannot pause/resume the parser, which silently ends
      // the stream before any row is saved. Stream on the main thread in small
      // chunks instead — pause/resume keeps memory flat and the UI responsive.
      Papa.parse<Record<string, string>>(file, {
        header: true, skipEmptyLines: true, chunkSize: 1024 * 256,
        chunk: (res, parser) => {
          parser.pause();
          (async () => {
            for (const row of res.data) {
              const idx = rowIndex++;
              if (idx < resumeFrom) { processed++; continue; }
              processed++;
              if (idx < PREVIEW_ROWS && excludedRows.has(idx)) continue;
              const rawPhone = (row[phoneCol] ?? "").trim();
              if (!rawPhone) { invalid++; if (errors.length < 50) errors.push({ row: idx + 2, reason: "Missing phone" }); continue; }
              const norm = normalizePhone(rawPhone, {
                rowCountry: countryCol ? (row[countryCol] ?? "").trim() : undefined,
                defaultCountry,
              });
              if ("error" in norm) { invalid++; if (errors.length < 50) errors.push({ row: idx + 2, reason: norm.error }); continue; }
              if (seen.has(norm.e164)) { dupes++; continue; }
              seen.add(norm.e164);
              const custom: Record<string, string> = {};
              for (const [h, key] of customEntries) {
                const v = (row[h] ?? "").trim();
                if (v) custom[key] = v;
              }
              buffer.push({
                phone_e164: norm.e164,
                first_name: firstCol ? (row[firstCol] ?? "").trim() || null : null,
                last_name: lastCol ? (row[lastCol] ?? "").trim() || null : null,
                country_code: norm.country || null,
                custom_fields: custom,
              });
              if (buffer.length >= BATCH_ROWS) await flush(false);
            }
          })().then(
            () => {
              if (cancelRef.current) { parser.abort(); resolve(); return; }
              parser.resume();
            },
            (e) => { parser.abort(); reject(e); },
          );
        },
        complete: () => resolve(),
        error: (e) => reject(e),
      });
    }).then(async () => {
      await flush(true);
      await finishJob({ data: { jobId: job.id, status: cancelRef.current ? "cancelled" : "completed" } });
    }).catch(async (e: any) => {
      toast.error(e?.message ?? "Import failed");
      await finishJob({ data: { jobId: job.id, status: "failed" } }).catch(() => {});
    });

    setBusy(false);
    setResumeJob(null);
    setResult({ inserted, invalid, duplicates: dupes, errors });
    qc.invalidateQueries({ queryKey: ["audience-profiles"] });
    onDone();
    if (!cancelRef.current) toast.success(`Imported ${fmtInt(inserted)} contacts`);
  }

  const selectableRows = useMemo(() => sample.length - excludedRows.size, [sample, excludedRows]);

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        <Button variant="outline"><Upload className="size-4 mr-1.5" />Import CSV</Button>
      </DialogTrigger>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Zap className="size-4 text-primary" />Fast CSV import</DialogTitle>
          <DialogDescription>
            Handles very large files (100k+ rows) — parsing runs in the background and saving happens in bulk.
            You attest every contact opted in to receive SMS from you.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label className="text-xs">CSV file</Label>
              <Input ref={fileRef} type="file" accept=".csv,text/csv" disabled={busy}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Add to list</Label>
              <Select value={listId} onValueChange={setListId} disabled={busy}>
                <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No list</SelectItem>
                  {lists.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Default country</Label>
              <Input className="w-24" maxLength={2} value={defaultCountry} disabled={busy}
                onChange={(e) => setDefaultCountry(e.target.value.toUpperCase())} />
            </div>
            <Button variant="ghost" size="sm" onClick={onDownloadTemplate}>
              <Download className="size-4 mr-1.5" />Template
            </Button>
          </div>

          {resumeJob && !busy && (
            <Card className="p-3 text-sm space-y-2 border-primary/40">
              <div className="flex items-center gap-2 font-medium"><RotateCcw className="size-4 text-primary" />Unfinished import found</div>
              <div className="text-xs text-muted-foreground">
                {resumeJob.file_name} — {fmtInt(resumeJob.processed_rows)} rows already processed
                ({fmtInt(resumeJob.inserted_count)} saved). Pick the same file above and resume where it stopped.
              </div>
              <div className="flex gap-2">
                <Button size="sm" disabled={!canImport}
                  onClick={() => runImport(resumeJob.processed_rows, resumeJob.id)}>Resume import</Button>
                <Button size="sm" variant="ghost"
                  onClick={async () => { await finishJob({ data: { jobId: resumeJob.id, status: "cancelled" } }); setResumeJob(null); }}>
                  Discard
                </Button>
              </div>
            </Card>
          )}

          {file && headers.length > 0 && !busy && !result && (
            <Card className="p-3 space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <div className="font-medium">
                  {file.name}{" "}
                  <span className="text-xs text-muted-foreground">
                    ({(file.size / 1024 / 1024).toFixed(2)} MB · ~{fmtInt(estimatedRows)} rows estimated)
                  </span>
                </div>
                <Button variant="ghost" size="sm" onClick={() => reset(true)}>Choose different file</Button>
              </div>

              <div className="space-y-2">
                <div className="text-xs font-medium">
                  Map columns <span className="text-muted-foreground font-normal">(feeds personalization like {"{first_name}"})</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {([
                    { key: "phone", label: "Phone *", required: true },
                    { key: "first", label: "First name", required: false },
                    { key: "last", label: "Last name", required: false },
                    { key: "country", label: "Country (ISO-2)", required: false },
                  ] as { key: keyof Mapping; label: string; required: boolean }[]).map(({ key, label, required }) => (
                    <div key={key} className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">{label}</Label>
                      <Select value={mapping[key] ?? "__none"}
                        onValueChange={(v) => setMapping((m) => ({ ...m, [key]: v === "__none" ? undefined : v }))}>
                        <SelectTrigger className={"h-8 text-xs " + (required && !mapping.phone ? "border-destructive" : "")}>
                          <SelectValue placeholder="— none —" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none">— none —</SelectItem>
                          {headers.map((h) => <SelectItem key={h} value={h} className="text-xs">{h}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
                {!mapping.phone && (
                  <div className="flex items-start gap-1 text-destructive text-xs">
                    <AlertTriangle className="size-3.5 mt-0.5" />Select a phone column to enable import.
                  </div>
                )}
              </div>

              <div className="text-xs text-muted-foreground">
                Preview of the first {fmtInt(sample.length)} rows — untick a row or column to leave it out.
                <b className="text-foreground"> {fmtInt(selectableRows)}</b> of {fmtInt(sample.length)} previewed rows selected.
                The rest of the file imports in full.
              </div>

              <div className="overflow-auto border rounded-md max-h-72">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10" />
                      {headers.map((h) => {
                        const colExcluded = excludedCols.has(h);
                        const builtin = mapping.phone === h ? "phone"
                          : mapping.first === h ? "first_name"
                          : mapping.last === h ? "last_name"
                          : mapping.country === h ? "country" : null;
                        const customKey = customMap[h];
                        const value = builtin ?? (customKey ? "__custom" : "__none");
                        const applyBuiltin = (v: string) => {
                          setMapping((m) => {
                            const next = { ...m };
                            (["phone", "first", "last", "country"] as const).forEach((k) => { if (next[k] === h) delete next[k]; });
                            if (v === "phone") next.phone = h;
                            else if (v === "first_name") next.first = h;
                            else if (v === "last_name") next.last = h;
                            else if (v === "country") next.country = h;
                            return next;
                          });
                          setCustomMap((cm) => { const n = { ...cm }; delete n[h]; return n; });
                        };
                        return (
                          <TableHead key={h} className={"text-xs align-top " + (colExcluded ? "opacity-40" : "")}>
                            <div className="flex flex-col gap-1 min-w-[150px] py-1">
                              <div className="flex items-center gap-1.5">
                                <Checkbox checked={!colExcluded} aria-label={`Toggle column ${h}`}
                                  onCheckedChange={(v) => setExcludedCols((prev) => {
                                    const next = new Set(prev);
                                    if (v) next.delete(h); else next.add(h);
                                    return next;
                                  })} />
                                <span className="truncate" title={h}>{h}</span>
                              </div>
                              <Select value={value} onValueChange={(v) => {
                                if (v === "__custom") {
                                  const name = window.prompt(`Custom field name for column "${h}"\n(use in messages as {{name}})`, customKey ?? slugify(h));
                                  if (!name) return;
                                  applyBuiltin("__none");
                                  setCustomMap((cm) => ({ ...cm, [h]: slugify(name) }));
                                } else {
                                  applyBuiltin(v);
                                }
                              }}>
                                <SelectTrigger className="h-7 text-[11px]"><SelectValue placeholder="— skip —" /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__none" className="text-xs">— skip —</SelectItem>
                                  <SelectItem value="phone" className="text-xs">Phone</SelectItem>
                                  <SelectItem value="first_name" className="text-xs">First name</SelectItem>
                                  <SelectItem value="last_name" className="text-xs">Last name</SelectItem>
                                  <SelectItem value="country" className="text-xs">Country (ISO-2)</SelectItem>
                                  <SelectItem value="__custom" className="text-xs">Custom field…</SelectItem>
                                </SelectContent>
                              </Select>
                              {customKey && !builtin && (
                                <div className="text-[10px] text-muted-foreground truncate">→ <code>{`{{${customKey}}}`}</code></div>
                              )}
                            </div>
                          </TableHead>
                        );
                      })}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sample.map((r, i) => {
                      const isExcluded = excludedRows.has(i);
                      return (
                        <TableRow key={i} className={isExcluded ? "opacity-40" : ""}>
                          <TableCell>
                            <Checkbox checked={!isExcluded} aria-label={`Toggle row ${i + 1}`}
                              onCheckedChange={(v) => setExcludedRows((prev) => {
                                const next = new Set(prev);
                                if (v) next.delete(i); else next.add(i);
                                return next;
                              })} />
                          </TableCell>
                          {headers.map((h) => (
                            <TableCell key={h} className={"text-xs " + (excludedCols.has(h) ? "opacity-40 line-through" : "")}>
                              {r[h] ?? ""}
                            </TableCell>
                          ))}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </Card>
          )}

          {busy && (
            <Card className="p-3 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">Importing contacts…</span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {progress && progress.total > 0 ? Math.min(99, Math.round((progress.processed / progress.total) * 100)) : 0}%
                </span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-primary transition-all"
                  style={{ width: `${progress && progress.total > 0 ? Math.min(99, (progress.processed / progress.total) * 100) : 2}%` }} />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px] text-muted-foreground">
                <div>Saved: <b className="text-foreground">{fmtInt(progress?.inserted ?? 0)}</b></div>
                <div>Read: <b className="text-foreground">{fmtInt(progress?.processed ?? 0)}</b></div>
                <div>Speed: <b className="text-foreground">{fmtInt(Math.round(progress?.rps ?? 0))}/s</b></div>
                <div>Time left: <b className="text-foreground">{fmtEta(progress?.eta ?? 0)}</b></div>
              </div>
              <div className="text-[11px] text-muted-foreground">
                Safe to leave this open. If the page reloads, reopen this dialog and resume from where it stopped.
              </div>
              <Button size="sm" variant="outline" onClick={() => { cancelRef.current = true; toast.info("Stopping after the current batch…"); }}>
                Stop import
              </Button>
            </Card>
          )}

          {result && (
            <Card className="p-3 text-sm space-y-2">
              <div>✅ Saved contacts: <b>{fmtInt(result.inserted)}</b></div>
              <div>⚠️ Invalid rows skipped: <b>{fmtInt(result.invalid)}</b></div>
              <div>↩️ Duplicates in file: <b>{fmtInt(result.duplicates)}</b></div>
              {result.errors.length > 0 && (
                <div className="border-t pt-2">
                  <div className="font-medium text-xs uppercase text-muted-foreground mb-1">Row errors (first 20)</div>
                  <ul className="text-xs space-y-0.5 max-h-40 overflow-y-auto">
                    {result.errors.slice(0, 20).map((e, i) => (
                      <li key={i}><span className="font-mono">Row {e.row}:</span> {e.reason}</li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" disabled={busy} onClick={() => { setOpen(false); reset(); }}>Close</Button>
          {result
            ? <Button variant="outline" onClick={() => reset()}>Import another file</Button>
            : <Button onClick={() => runImport()} disabled={busy || !canImport}>
                {busy ? "Importing…" : "Start import"}
              </Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
