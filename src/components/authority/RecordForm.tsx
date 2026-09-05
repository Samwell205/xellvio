import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import type { Field } from "@/lib/authority/fields";

export type RecordValues = Record<string, any>;

function toFormValue(field: Field, raw: any) {
  if (raw === null || raw === undefined) return field.type === "switch" ? false : "";
  if (field.type === "list") return Array.isArray(raw) ? raw.join("\n") : String(raw);
  if (field.type === "date" && typeof raw === "string") return raw.slice(0, 10);
  return raw;
}

function fromFormValue(field: Field, raw: any) {
  if (field.type === "list") {
    return String(raw ?? "")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
  }
  if (field.type === "number") return raw === "" || raw === null ? null : Number(raw);
  if (field.type === "switch") return Boolean(raw);
  return raw === "" ? null : raw;
}

/**
 * Field-driven editor used for every authority record type.
 * All AI or system suggestions land in these same inputs so a human always
 * reviews and can change them before anything is saved.
 */
export function RecordForm({
  open,
  onOpenChange,
  title,
  description,
  fields,
  initial,
  onSubmit,
  saving,
  extra,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description?: string;
  fields: Field[];
  initial?: RecordValues | null;
  onSubmit: (values: RecordValues) => void;
  saving?: boolean;
  /** Rendered above the fields, e.g. the relevance checklist. */
  extra?: React.ReactNode;
}) {
  const [values, setValues] = useState<RecordValues>({});

  useEffect(() => {
    if (!open) return;
    const next: RecordValues = {};
    for (const f of fields) next[f.name] = toFormValue(f, initial?.[f.name]);
    setValues(next);
  }, [open, initial, fields]);

  const set = (name: string, v: any) => setValues((p) => ({ ...p, [name]: v }));

  function submit() {
    const out: RecordValues = {};
    for (const f of fields) out[f.name] = fromFormValue(f, values[f.name]);
    onSubmit(out);
  }

  const missing = fields.filter((f) => f.required && !values[f.name]).map((f) => f.label);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>

        {extra}

        <div className="grid gap-4 sm:grid-cols-2">
          {fields.map((f) => (
            <div key={f.name} className={f.wide || f.type === "textarea" || f.type === "list" ? "sm:col-span-2 space-y-1.5" : "space-y-1.5"}>
              {f.type === "switch" ? (
                <div className="flex items-start justify-between gap-3 rounded-lg border border-border p-3">
                  <div>
                    <Label className="text-sm">{f.label}</Label>
                    {f.help ? <p className="text-xs text-muted-foreground mt-1">{f.help}</p> : null}
                  </div>
                  <Switch checked={Boolean(values[f.name])} onCheckedChange={(v) => set(f.name, v)} />
                </div>
              ) : (
                <>
                  <Label htmlFor={f.name} className="text-sm">
                    {f.label}
                    {f.required ? <span className="text-destructive"> *</span> : null}
                  </Label>
                  {f.type === "textarea" || f.type === "list" ? (
                    <Textarea
                      id={f.name}
                      rows={f.type === "list" ? 4 : 3}
                      value={values[f.name] ?? ""}
                      placeholder={f.placeholder}
                      onChange={(e) => set(f.name, e.target.value)}
                    />
                  ) : f.type === "select" ? (
                    <Select value={values[f.name] || undefined} onValueChange={(v) => set(f.name, v)}>
                      <SelectTrigger id={f.name}>
                        <SelectValue placeholder="Select…" />
                      </SelectTrigger>
                      <SelectContent>
                        {(f.options ?? []).map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      id={f.name}
                      type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
                      value={values[f.name] ?? ""}
                      placeholder={f.placeholder}
                      onChange={(e) => set(f.name, e.target.value)}
                    />
                  )}
                  {f.help ? <p className="text-xs text-muted-foreground">{f.help}</p> : null}
                </>
              )}
            </div>
          ))}
        </div>

        <DialogFooter className="gap-2">
          {missing.length ? (
            <p className="text-xs text-destructive mr-auto">Still needed: {missing.join(", ")}</p>
          ) : null}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving || missing.length > 0}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
