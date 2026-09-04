import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Check, ChevronRight, Loader2, RotateCcw, Sparkles, X } from "lucide-react";
import { type Block, type Theme, mergeTheme, normalizeBlocks } from "@/lib/builder/schema";
import { generateBuilderDesign } from "@/lib/builder-ai.functions";

export type AiTurn = { role: "user" | "assistant"; text: string; summary?: string[] };

type Pending = { blocks: Block[]; theme: Theme; summary: string[] };

const MODES: { id: string; label: string; hint: string }[] = [
  { id: "create", label: "Create from description", hint: "Build a complete new design" },
  { id: "improve", label: "Improve design", hint: "Better looking, same content" },
  { id: "professional", label: "Make more professional", hint: "Typography, spacing, hierarchy" },
  { id: "convert", label: "Increase conversions", hint: "Stronger CTA and copy" },
  { id: "mobile", label: "Make mobile-friendly", hint: "Single column, tighter type" },
  { id: "simplify", label: "Simplify", hint: "Remove the clutter" },
  { id: "animate", label: "Add motion & depth", hint: "Tasteful animation on scroll and hover" },
];

const PLACEHOLDER =
  "Create a high-converting signup form for a free marketing course. Use a clean professional design with a strong headline, short description, name and email fields, and an orange CTA button.";

export function AiDesignPanel({
  kind,
  blocks,
  theme,
  onApply,
  onClose,
  turns,
  setTurns,
  onUndoAi,
  canUndoAi,
  focusId,
  focusLabel,
}: {
  kind: "form" | "page";
  blocks: Block[];
  theme: Theme;
  focusId?: string | null;
  focusLabel?: string | null;
  onApply: (blocks: Block[], theme: Theme, summary: string[]) => void;
  onClose: () => void;
  turns: AiTurn[];
  setTurns: (t: AiTurn[]) => void;
  onUndoAi: () => void;
  canUndoAi: boolean;
}) {
  const gen = useServerFn(generateBuilderDesign);
  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState("create");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  const run = async (usedMode = mode, text = prompt) => {
    if (busy) return;
    if ((usedMode === "create" || usedMode === "edit") && !text.trim()) {
      toast.info("Tell the AI what you want to create first.");
      return;
    }
    setBusy(true);
    const nextTurns: AiTurn[] = [
      ...turns,
      { role: "user", text: text.trim() || MODES.find((m) => m.id === usedMode)?.label || "Update the design" },
    ];
    setTurns(nextTurns);
    setPrompt("");
    try {
      const r = await gen({
        data: {
          kind,
          mode: usedMode as any,
          prompt: text.trim(),
          blocks: blocks as any,
          theme: theme as any,
          ...(focusId ? { focusId, focusLabel: focusLabel ?? "element" } : {}),
          history: turns.slice(-8).map((t) => ({ role: t.role, text: t.text.slice(0, 2000) })),
        },
      });
      const nextBlocks = normalizeBlocks(r.blocks);
      if (!nextBlocks.length) throw new Error("The AI design could not be read. Try again.");
      const nextTheme = r.theme ? mergeTheme({ ...theme, ...r.theme }) : theme;
      setPending({ blocks: nextBlocks, theme: nextTheme, summary: r.summary });
      setTurns([...nextTurns, { role: "assistant", text: r.summary.join(" · "), summary: r.summary }]);
      requestAnimationFrame(() => scroller.current?.scrollTo({ top: 9e9 }));
    } catch (e: any) {
      setTurns([...nextTurns, { role: "assistant", text: e?.message ?? "That did not work. Please try again." }]);
      toast.error(e?.message ?? "AI could not generate a design");
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside className="flex h-full min-h-0 w-full flex-col border-l bg-card">
      <header className="flex items-center gap-2 border-b px-3 py-2.5">
        <Sparkles className="size-4 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">Create with AI</p>
          <p className="truncate text-[11px] text-muted-foreground">Describe what you want and AI will build it for you.</p>
        </div>
        <Button variant="ghost" size="icon" className="size-7" onClick={onClose}><X className="size-4" /></Button>
      </header>

      <div ref={scroller} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {turns.length === 0 ? (
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Generation modes</p>
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  setMode(m.id);
                  if (m.id !== "create") void run(m.id, "");
                }}
                className={`flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition hover:border-primary ${mode === m.id ? "border-primary bg-accent" : ""}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold">{m.label}</div>
                  <div className="text-[10.5px] text-muted-foreground">{m.hint}</div>
                </div>
                <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
              </button>
            ))}
          </div>
        ) : null}

        {turns.map((t, i) => (
          <div key={i} className={`rounded-lg px-3 py-2 text-xs ${t.role === "user" ? "ml-6 bg-primary/10" : "mr-2 border bg-background"}`}>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{t.role === "user" ? "You" : "Xellvio AI"}</p>
            {t.summary?.length ? (
              <ul className="space-y-1">
                {t.summary.map((s, j) => (
                  <li key={j} className="flex gap-1.5"><Check className="mt-0.5 size-3 shrink-0 text-primary" />{s}</li>
                ))}
              </ul>
            ) : (
              <p className="whitespace-pre-wrap leading-relaxed">{t.text}</p>
            )}
          </div>
        ))}

        {busy ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="size-3.5 animate-spin" />Designing…</div>
        ) : null}

        {pending ? (
          <div className="space-y-2 rounded-lg border border-primary/40 bg-primary/5 p-3">
            <p className="text-xs font-semibold">AI made these changes</p>
            <ul className="space-y-1 text-xs">
              {pending.summary.map((s, i) => (
                <li key={i} className="flex gap-1.5"><Check className="mt-0.5 size-3 shrink-0 text-primary" />{s}</li>
              ))}
            </ul>
            <p className="text-[11px] text-muted-foreground">Preview it on the canvas, then keep or discard.</p>
            <div className="flex gap-2">
              <Button
                size="sm"
                className="h-7 flex-1 text-xs"
                onClick={() => {
                  onApply(pending.blocks, pending.theme, pending.summary);
                  setPending(null);
                  toast.success("AI design applied");
                }}
              >
                Apply
              </Button>
              <Button size="sm" variant="outline" className="h-7 flex-1 text-xs" onClick={() => setPending(null)}>Discard</Button>
            </div>
          </div>
        ) : null}

        {canUndoAi && !pending ? (
          <Button variant="outline" size="sm" className="h-7 w-full gap-1 text-xs" onClick={onUndoAi}>
            <RotateCcw className="size-3" />Undo AI changes
          </Button>
        ) : null}
      </div>

      <div className="space-y-2 border-t p-3">
        {turns.length ? (
          <div className="flex flex-wrap gap-1">
            {MODES.filter((m) => m.id !== "create").map((m) => (
              <Badge
                key={m.id}
                variant="outline"
                className="cursor-pointer text-[10px] hover:bg-accent"
                onClick={() => void run(m.id, "")}
              >
                {m.label}
              </Badge>
            ))}
          </div>
        ) : null}
        {focusId ? (
          <p className="rounded-md bg-accent px-2 py-1 text-[10.5px] text-muted-foreground">
            Editing the selected <span className="font-semibold">{focusLabel ?? "element"}</span> — click empty space on the canvas to work on the whole design.
          </p>
        ) : null}
        <Textarea
          rows={4}
          value={prompt}
          placeholder={turns.length ? "What would you like to change?" : PLACEHOLDER}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void run(blocks.length ? "edit" : "create", prompt);
          }}
          className="text-xs"
        />
        <Button className="w-full gap-1.5" disabled={busy} onClick={() => void run(blocks.length ? "edit" : mode, prompt)}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          {turns.length ? "Send" : "Generate design"}
        </Button>
      </div>
    </aside>
  );
}
