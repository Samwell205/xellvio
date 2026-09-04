import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ArrowLeft,
  Copy,
  ExternalLink,
  LayoutGrid,
  Monitor,
  Redo2,
  Settings,
  Smartphone,
  Sparkles,
  Tablet,
  Undo2,
  Eye,
  Rocket,
} from "lucide-react";
import { toast } from "sonner";
import {
  type Block,
  type Theme,
  BLOCK_LABELS,
  cloneBlock,
  duplicateBlockInTree,
  findBlock,
  findParent,
  insertBlock,
  isContainer,
  moveBlock,
  removeBlock,
  updateBlock,
} from "@/lib/builder/schema";
import { BlockCanvas, type Device } from "./BlockRenderer";
import { ElementLibrary, type NewBlockFactory } from "./ElementLibrary";
import { PropertiesPanel } from "./PropertiesPanel";
import { AiDesignPanel, type AiTurn } from "./AiDesignPanel";
import { TemplateBrowser } from "./TemplateBrowser";
import { PublishDialog } from "./PublishDialog";
import { MediaField } from "./MediaPicker";

export type BuilderDoc = {
  id?: string;
  slug?: string;
  name: string;
  blocks: Block[];
  theme: Theme;
  seo_title: string;
  seo_description: string;
  og_image_url: string;
  list_id: string | null;
  published: boolean;
  last_published_at?: string | null;
};

export type SaveState = "saved" | "saving" | "dirty";

const DEVICE_WIDTH: Record<Device, number> = { desktop: 1200, tablet: 834, mobile: 390 };

export function VisualBuilder({
  kind,
  doc,
  onChange,
  onClose,
  onSave,
  saveState,
  lists,
  publicUrl,
  embedCode,
  startMode = "scratch",
}: {
  kind: "form" | "page";
  doc: BuilderDoc;
  onChange: (d: BuilderDoc) => void;
  onClose: () => void;
  onSave: () => void;
  saveState: SaveState;
  lists: { id: string; name: string }[];
  publicUrl?: string;
  embedCode?: string;
  startMode?: "scratch" | "templates" | "ai";
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [device, setDevice] = useState<Device>("desktop");
  const [preview, setPreview] = useState(false);
  const [ai, setAi] = useState(startMode === "ai");
  const [templates, setTemplates] = useState(startMode === "templates");
  const [settings, setSettings] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [turns, setTurns] = useState<AiTurn[]>([]);
  const [aiSnapshot, setAiSnapshot] = useState<{ blocks: Block[]; theme: Theme } | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragPayload = useRef<{ make?: NewBlockFactory; blockId?: string } | null>(null);

  /* ------------------------------- undo / redo ------------------------------ */
  const touched = useRef(false);
  const past = useRef<{ blocks: Block[]; theme: Theme }[]>([]);
  const future = useRef<{ blocks: Block[]; theme: Theme }[]>([]);
  const [stamp, setStamp] = useState(0);

  const commit = useCallback(
    (next: { blocks?: Block[]; theme?: Theme }) => {
      touched.current = true;
      past.current = [...past.current.slice(-49), { blocks: doc.blocks, theme: doc.theme }];
      future.current = [];
      setStamp((s) => s + 1);
      onChange({ ...doc, blocks: next.blocks ?? doc.blocks, theme: next.theme ?? doc.theme });
    },
    [doc, onChange],
  );

  const undo = useCallback(() => {
    const prev = past.current.pop();
    if (!prev) return;
    future.current = [...future.current, { blocks: doc.blocks, theme: doc.theme }];
    setStamp((s) => s + 1);
    onChange({ ...doc, ...prev });
  }, [doc, onChange]);

  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next) return;
    past.current = [...past.current, { blocks: doc.blocks, theme: doc.theme }];
    setStamp((s) => s + 1);
    onChange({ ...doc, ...next });
  }, [doc, onChange]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod || e.key.toLowerCase() !== "z") return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  /* --------------------------------- editing -------------------------------- */

  const selected = selectedId ? findBlock(doc.blocks, selectedId) : null;

  const patchSelected = (patch: (b: Block) => Block) => {
    if (!selectedId) return;
    commit({ blocks: updateBlock(doc.blocks, selectedId, patch) });
  };

  const deleteSelected = () => {
    if (!selectedId) return;
    commit({ blocks: removeBlock(doc.blocks, selectedId) });
    setSelectedId(null);
  };

  const duplicateSelected = () => {
    if (!selectedId) return;
    commit({ blocks: duplicateBlockInTree(doc.blocks, selectedId) });
  };

  const addAtEnd = (make: NewBlockFactory) => {
    const block = make();
    const target = pickDefaultParent(doc.blocks, block);
    commit({ blocks: insertBlock(doc.blocks, target.parentId, target.index, block) });
    setSelectedId(block.id);
  };

  const handleDrop = (parentId: string | null, index: number) => {
    const payload = dragPayload.current;
    setDragging(false);
    dragPayload.current = null;
    if (!payload) return;
    if (payload.make) {
      const block = payload.make();
      if (parentId === null && !isTopLevelOk(block)) {
        // wrap loose elements dropped on the page background in a section
        const section = wrapInSection(block);
        commit({ blocks: insertBlock(doc.blocks, null, index, section) });
        setSelectedId(block.id);
        return;
      }
      commit({ blocks: insertBlock(doc.blocks, parentId, index, block) });
      setSelectedId(block.id);
      return;
    }
    if (payload.blockId) {
      if (parentId === null) {
        const moving = findBlock(doc.blocks, payload.blockId);
        if (moving && !isTopLevelOk(moving)) {
          commit({ blocks: insertBlock(removeBlock(doc.blocks, payload.blockId), null, index, wrapInSection(cloneBlock(moving))) });
          return;
        }
      }
      commit({ blocks: moveBlock(doc.blocks, payload.blockId, parentId, index) });
    }
  };

  const dnd = useMemo(
    () => ({
      dragging,
      onDropAt: handleDrop,
      onDragBlock: (id: string) => {
        dragPayload.current = { blockId: id };
        setDragging(true);
        setSelectedId(id);
      },
      onDragEnd: () => {
        setDragging(false);
        dragPayload.current = null;
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dragging, doc.blocks, doc.theme],
  );

  const pageContext = useMemo(() => describeDesign(doc, kind), [doc, kind]);

  const applyAi = (blocks: Block[], theme: Theme) => {
    setAiSnapshot({ blocks: doc.blocks, theme: doc.theme });
    commit({ blocks, theme });
    setSelectedId(null);
  };

  const saveLabel = saveState === "saving" ? "Saving…" : saveState === "dirty" ? "Unsaved changes" : "Saved just now";

  const canvasWidth = DEVICE_WIDTH[device];

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex h-[97vh] max-w-[99vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-[99vw]">
        <DialogTitle className="sr-only">{kind === "form" ? "Sign-up form builder" : "Landing page builder"}</DialogTitle>

        {/* toolbar */}
        <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b px-3 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <Button variant="ghost" size="icon" className="size-8 shrink-0" onClick={onClose} aria-label="Back"><ArrowLeft className="size-4" /></Button>
            <Input className="h-8 max-w-56 text-sm" value={doc.name} placeholder={kind === "form" ? "Form name" : "Page name"} onChange={(e) => onChange({ ...doc, name: e.target.value })} />
            <span className="hidden shrink-0 text-[11px] text-muted-foreground sm:inline">{saveLabel}</span>
            <Badge variant={doc.published ? "default" : "outline"} className="hidden shrink-0 text-[10px] sm:inline-flex">{doc.published ? "Live" : "Draft"}</Badge>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <div className="hidden rounded-md border p-0.5 sm:flex">
              <Button variant="ghost" size="icon" className="size-7" disabled={!past.current.length} onClick={undo} aria-label="Undo"><Undo2 className="size-4" /></Button>
              <Button variant="ghost" size="icon" className="size-7" disabled={!future.current.length} onClick={redo} aria-label="Redo"><Redo2 className="size-4" /></Button>
            </div>
            <div className="flex rounded-md border p-0.5">
              {([["desktop", Monitor], ["tablet", Tablet], ["mobile", Smartphone]] as const).map(([d, Icon]) => (
                <Button key={d} variant={device === d ? "secondary" : "ghost"} size="icon" className="size-7" onClick={() => setDevice(d)} aria-label={d}>
                  <Icon className="size-4" />
                </Button>
              ))}
            </div>
            <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => setTemplates(true)}><LayoutGrid className="size-4" /><span className="hidden md:inline">Templates</span></Button>
            <Button variant={ai ? "secondary" : "outline"} size="sm" className="h-8 gap-1.5" onClick={() => setAi((v) => !v)}><Sparkles className="size-4" /><span className="hidden md:inline">Design with AI</span></Button>
            <Button variant={preview ? "secondary" : "outline"} size="sm" className="h-8 gap-1.5" onClick={() => setPreview((v) => !v)}><Eye className="size-4" /><span className="hidden md:inline">Preview</span></Button>
            <Button variant="outline" size="icon" className="size-8" onClick={() => setSettings(true)} aria-label="Settings"><Settings className="size-4" /></Button>
            <Button variant="outline" size="sm" className="h-8" disabled={!doc.name.trim() || saveState === "saving"} onClick={onSave}>Save</Button>
            <Button size="sm" className="h-8 gap-1.5" disabled={!doc.id} onClick={() => setPublishOpen(true)}>
              <Rocket className="size-4" /><span className="hidden md:inline">Publish</span>
            </Button>
          </div>
        </header>

        {/* body */}
        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[228px_minmax(0,1fr)_300px]">
          {!preview ? (
            <aside className="hidden min-h-0 border-r lg:block">
              <ElementLibrary
                kind={kind}
                onAdd={addAtEnd}
                onDragItem={(make) => {
                  dragPayload.current = { make };
                  setDragging(true);
                }}
                onDragEnd={() => {
                  setDragging(false);
                  dragPayload.current = null;
                }}
              />
            </aside>
          ) : null}

          <div className="min-h-0 overflow-y-auto bg-muted/40 p-4" onClick={() => setSelectedId(null)}>
            <div
              className="mx-auto overflow-hidden rounded-xl border bg-background shadow-sm transition-[width]"
              style={{ width: Math.min(canvasWidth, 1400), maxWidth: "100%" }}
            >
              <BlockCanvas
                key={preview ? `p-${stamp}` : `e-${stamp}`}
                blocks={doc.blocks}
                theme={doc.theme}
                device={device}
                interactive={preview}
                selectedId={preview ? null : selectedId}
                onSelect={preview ? undefined : setSelectedId}
                dnd={preview ? undefined : dnd}
                onSubmit={preview ? async () => "This is a preview — no one was subscribed." : undefined}
              />
            </div>
            {preview ? <p className="mt-3 text-center text-xs text-muted-foreground">Preview mode — this is exactly what visitors see.</p> : null}
          </div>

          {ai ? (
            <div className="hidden min-h-0 lg:block">
              <AiDesignPanel
                kind={kind}
                blocks={doc.blocks}
                theme={doc.theme}
                focusId={selectedId}
                focusLabel={selected ? BLOCK_LABELS[selected.type] : null}
                turns={turns}
                setTurns={setTurns}
                onApply={applyAi}
                onClose={() => setAi(false)}
                canUndoAi={!!aiSnapshot}
                onUndoAi={() => {
                  if (!aiSnapshot) return;
                  commit(aiSnapshot);
                  setAiSnapshot(null);
                  toast.success("AI changes undone");
                }}
              />
            </div>
          ) : !preview ? (
            <aside className="hidden min-h-0 border-l lg:block">
              <PropertiesPanel
                block={selected}
                theme={doc.theme}
                kind={kind}
                pageContext={pageContext}
                onChangeBlock={patchSelected}
                onChangeTheme={(theme) => commit({ theme })}
                onDelete={deleteSelected}
                onDuplicate={duplicateSelected}
              />
            </aside>
          ) : null}
        </div>

        {templates ? (
          <TemplateBrowser
            kind={kind}
            hasContent={touched.current || !!doc.id}
            onClose={() => setTemplates(false)}
            onAi={() => {
              setTemplates(false);
              setAi(true);
            }}
            onUse={(blocks, theme, name) => {
              commit({ blocks, theme });
              if (!doc.name.trim()) onChange({ ...doc, blocks, theme, name });
              setTemplates(false);
              setSelectedId(null);
              toast.success("Template applied — edit anything you like");
            }}
          />
        ) : null}

        {publishOpen ? (
          <PublishDialog
            kind={kind}
            id={doc.id}
            slug={doc.slug}
            published={doc.published}
            lastPublishedAt={doc.last_published_at ?? null}
            publicUrl={publicUrl}
            onClose={() => setPublishOpen(false)}
            onSlugChange={(slug) => onChange({ ...doc, slug })}
            onPublishedChange={(published) => onChange({ ...doc, published })}
            onRestore={(blocks, theme) => {
              commit({ blocks, theme });
              setSelectedId(null);
            }}
          />
        ) : null}

        {settings ? (
          <SettingsDialog
            kind={kind}
            doc={doc}
            lists={lists}
            publicUrl={publicUrl}
            embedCode={embedCode}
            onChange={onChange}
            onClose={() => setSettings(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/* --------------------------------- helpers -------------------------------- */

function isTopLevelOk(b: Block) {
  return b.type === "section";
}

function wrapInSection(child: Block): Block {
  return {
    id: Math.random().toString(36).slice(2, 10),
    type: "section",
    content: {},
    styles: { paddingY: 56, paddingX: 24 },
    settings: {},
    children: [child],
  };
}

/** Where a click-to-add element should land: inside the last section if there is one. */
function pickDefaultParent(blocks: Block[], block: Block): { parentId: string | null; index: number } {
  if (isTopLevelOk(block)) return { parentId: null, index: blocks.length };
  const lastSection = [...blocks].reverse().find((b) => b.type === "section");
  if (!lastSection) return { parentId: null, index: blocks.length };
  if (block.type === "field" || block.type === "submit") {
    let formId: string | null = null;
    const scan = (list: Block[]) => {
      for (const b of list) {
        if (b.type === "form" && !formId) formId = b.id;
        if (b.children) scan(b.children);
      }
    };
    scan(blocks);
    if (formId) {
      const form = findBlock(blocks, formId)!;
      const index = block.type === "submit" ? (form.children?.length ?? 0) : Math.max(0, (form.children?.length ?? 1) - 1);
      return { parentId: formId, index };
    }
  }
  return { parentId: lastSection.id, index: lastSection.children?.length ?? 0 };
}

function describeDesign(doc: BuilderDoc, kind: "form" | "page") {
  const texts: string[] = [];
  const walk = (list: Block[]) => {
    for (const b of list) {
      if (b.type === "heading" || b.type === "text") texts.push(String(b.content.text ?? ""));
      if (b.children) walk(b.children);
    }
  };
  walk(doc.blocks);
  return `This is an SMS ${kind === "form" ? "sign-up form" : "landing page"} named "${doc.name}". Existing copy: ${texts.slice(0, 8).join(" | ").slice(0, 800)}`;
}

function SettingsDialog({
  kind,
  doc,
  lists,
  publicUrl,
  embedCode,
  onChange,
  onClose,
}: {
  kind: "form" | "page";
  doc: BuilderDoc;
  lists: { id: string; name: string }[];
  publicUrl?: string;
  embedCode?: string;
  onChange: (d: BuilderDoc) => void;
  onClose: () => void;
}) {
  const set = (p: Partial<BuilderDoc>) => onChange({ ...doc, ...p });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[88vh] max-w-lg overflow-y-auto">
        <DialogTitle>{kind === "form" ? "Form settings" : "Page settings"}</DialogTitle>
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">Published</p>
              <p className="text-xs text-muted-foreground">Turn on to make the public link work.</p>
            </div>
            <Switch checked={doc.published} onCheckedChange={(published) => set({ published })} />
          </div>

          {publicUrl && doc.id ? (
            <div className="space-y-2 rounded-lg border p-3">
              <p className="text-xs font-medium">Public link</p>
              <div className="flex items-center gap-2">
                <Input readOnly value={publicUrl} className="h-8 text-xs" />
                <Button variant="outline" size="icon" className="size-8" onClick={() => { void navigator.clipboard.writeText(publicUrl); toast.success("Link copied"); }}><Copy className="size-3.5" /></Button>
                <a href={publicUrl} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground"><ExternalLink className="size-4" /></a>
              </div>
              {embedCode ? (
                <>
                  <p className="pt-1 text-xs font-medium">Embed code</p>
                  <Textarea readOnly rows={3} className="font-mono text-[11px]" value={embedCode} />
                </>
              ) : null}
            </div>
          ) : null}

          <div>
            <Label className="text-xs">Add subscribers to list</Label>
            <Select value={doc.list_id ?? "none"} onValueChange={(v) => set({ list_id: v === "none" ? null : v })}>
              <SelectTrigger className="h-9"><SelectValue placeholder="No list" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No list</SelectItem>
                {lists.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs">Search title</Label>
            <Input maxLength={70} value={doc.seo_title} onChange={(e) => set({ seo_title: e.target.value })} />
          </div>
          <div>
            <Label className="text-xs">Search description</Label>
            <Textarea rows={3} maxLength={160} value={doc.seo_description} onChange={(e) => set({ seo_description: e.target.value })} />
          </div>
          <MediaField label="Social share image (1200 × 630)" value={doc.og_image_url} onChange={(og_image_url) => set({ og_image_url })} />
          <Button className="w-full" onClick={onClose}>Done</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
