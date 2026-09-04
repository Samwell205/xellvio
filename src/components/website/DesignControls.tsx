import { FONT_LABELS, FONT_STACKS, LAYOUT_PRESETS, type Design, type FontKey } from "@/lib/website-design";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";

const SWATCHES = ["#111827", "#e11d48", "#ea580c", "#f59e0b", "#16a34a", "#0f766e", "#0ea5e9", "#1d4ed8", "#7c3aed", "#db2777"];

export function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <div className="flex items-center gap-2">
        <Input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="h-9 w-12 p-1" />
        <Input value={value} onChange={(e) => onChange(e.target.value)} className="h-9 font-mono text-xs" maxLength={20} />
      </div>
    </div>
  );
}

export function DesignControls({ design, onChange }: { design: Design; onChange: (d: Design) => void }) {
  const set = (patch: Partial<Design>) => onChange({ ...design, ...patch });

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">Layout presets</Label>
        <div className="grid gap-2 sm:grid-cols-2">
          {LAYOUT_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => set(p.design)}
              className="rounded-lg border p-3 text-left transition hover:border-primary"
            >
              <div className="flex items-center gap-2">
                <span
                  className="size-4 rounded-full border"
                  style={{ background: p.design.accent, borderColor: p.design.border }}
                />
                <span className="text-sm font-medium">{p.label}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{p.blurb}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <ColorField label="Button colour" value={design.accent} onChange={(accent) => set({ accent })} />
        <ColorField label="Button text" value={design.accentText} onChange={(accentText) => set({ accentText })} />
        <ColorField label="Page background" value={design.background} onChange={(background) => set({ background })} />
        <ColorField label="Card background" value={design.surface} onChange={(surface) => set({ surface })} />
        <ColorField label="Text" value={design.text} onChange={(text) => set({ text })} />
        <ColorField label="Secondary text" value={design.muted} onChange={(muted) => set({ muted })} />
        <ColorField label="Borders" value={design.border} onChange={(border) => set({ border })} />
      </div>

      <div className="space-y-2">
        <Label className="text-xs">Quick accent colours</Label>
        <div className="flex flex-wrap gap-2">
          {SWATCHES.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Use ${c}`}
              onClick={() => set({ accent: c })}
              className="size-7 rounded-full border shadow-sm"
              style={{ background: c }}
            />
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-xs">Body font</Label>
          <Select value={design.font} onValueChange={(v) => set({ font: v as FontKey })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(FONT_LABELS) as FontKey[]).map((k) => (
                <SelectItem key={k} value={k}>
                  <span style={{ fontFamily: FONT_STACKS[k] }}>{FONT_LABELS[k]}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Heading font</Label>
          <Select value={design.headingFont} onValueChange={(v) => set({ headingFont: v as FontKey })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(FONT_LABELS) as FontKey[]).map((k) => (
                <SelectItem key={k} value={k}>
                  <span style={{ fontFamily: FONT_STACKS[k] }}>{FONT_LABELS[k]}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Button shape</Label>
          <Select value={design.buttonStyle} onValueChange={(v) => set({ buttonStyle: v as Design["buttonStyle"] })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="solid">Solid</SelectItem>
              <SelectItem value="outline">Outline</SelectItem>
              <SelectItem value="pill">Pill</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Page width</Label>
          <Select value={design.width} onValueChange={(v) => set({ width: v as Design["width"] })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="narrow">Narrow</SelectItem>
              <SelectItem value="regular">Regular</SelectItem>
              <SelectItem value="wide">Wide</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <Label className="text-xs">Heading size</Label>
            <span className="text-muted-foreground">{Math.round(design.headingScale * 100)}%</span>
          </div>
          <Slider min={85} max={135} step={5} value={[Math.round(design.headingScale * 100)]} onValueChange={([v]) => set({ headingScale: (v ?? 100) / 100 })} />
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <Label className="text-xs">Corner rounding</Label>
            <span className="text-muted-foreground">{design.radius}px</span>
          </div>
          <Slider min={0} max={32} step={2} value={[design.radius]} onValueChange={([v]) => set({ radius: v ?? 16 })} />
        </div>
        <div className="flex items-center justify-between rounded-lg border p-3">
          <div>
            <div className="text-sm font-medium">Soft shadows</div>
            <p className="text-xs text-muted-foreground">Adds depth to cards and boxes.</p>
          </div>
          <Switch checked={design.shadow} onCheckedChange={(shadow) => set({ shadow })} />
        </div>
      </div>
    </div>
  );
}

export function ImageField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <div className="flex gap-2">
        <Input placeholder="https://…" value={value} onChange={(e) => onChange(e.target.value)} maxLength={600} />
        {value ? (
          <Button type="button" variant="outline" size="sm" onClick={() => onChange("")}>Clear</Button>
        ) : null}
      </div>
      {value ? (
        <img src={value} alt="" className="mt-1 h-16 rounded border object-contain p-1" />
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
