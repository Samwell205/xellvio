import { useCallback, useEffect, useRef, useState } from "react";
import { type BuilderDoc, type SaveState } from "./VisualBuilder";
import { type Block, type Theme, findFormBlock, mergeTheme, normalizeBlocks, walk } from "@/lib/builder/schema";

export type StartMode = "scratch" | "templates" | "ai";

/** Derives the legacy summary columns (used by list views and old public pages). */
export function legacyFieldsFromDoc(doc: BuilderDoc) {
  let headline = "";
  let sub = "";
  let cta = "";
  walk(doc.blocks, (b) => {
    if (b.type === "heading" && !headline) headline = String(b.content.text ?? "");
    else if (b.type === "text" && headline && !sub) sub = String(b.content.text ?? "");
    if ((b.type === "submit" || b.type === "button") && !cta) cta = String(b.content.label ?? "");
  });
  const form = findFormBlock(doc.blocks);
  return {
    headline: headline.slice(0, 160),
    sub: sub.slice(0, 240),
    cta: (cta || "Sign up").slice(0, 40),
    successMessage: String(form?.content?.successMessage ?? "Thanks — you are subscribed!").slice(0, 200),
    consentText: String(form?.content?.consentText ?? "").slice(0, 400) || null,
  };
}

/** Reads a stored row into a builder document, migrating older designs if needed. */
export function docFromRow(row: any, fallback: { blocks: Block[]; theme: Theme }): BuilderDoc {
  const blocks = normalizeBlocks(row?.blocks);
  return {
    id: row?.id,
    slug: row?.slug,
    name: row?.name ?? "",
    blocks: blocks.length ? blocks : fallback.blocks,
    theme: row?.builder_theme ? mergeTheme(row.builder_theme) : fallback.theme,
    seo_title: row?.seo_title ?? "",
    seo_description: row?.seo_description ?? "",
    og_image_url: row?.og_image_url ?? "",
    list_id: row?.list_id ?? null,
    published: row?.published ?? true,
    last_published_at: row?.last_published_at ?? null,
  };
}

/**
 * Holds the open design, autosaves it 1.5s after the last change and reports
 * the save state for the toolbar.
 */
export function useBuilderDoc(save: (doc: BuilderDoc) => Promise<{ id?: string; slug?: string }>) {
  const [doc, setDoc] = useState<BuilderDoc | null>(null);
  const [startMode, setStartMode] = useState<StartMode>("scratch");
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<BuilderDoc | null>(null);
  const dirty = useRef(false);

  latest.current = doc;

  const flush = useCallback(async () => {
    const current = latest.current;
    if (!current || !current.name.trim()) return;
    setSaveState("saving");
    try {
      const r = await save(current);
      dirty.current = false;
      setSaveState("saved");
      if (r?.id && latest.current && !latest.current.id) {
        setDoc((d) => (d ? { ...d, id: r.id, slug: r.slug ?? d.slug } : d));
      }
    } catch {
      setSaveState("dirty");
    }
  }, [save]);

  const change = useCallback(
    (next: BuilderDoc) => {
      setDoc(next);
      dirty.current = true;
      setSaveState("dirty");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), 1500);
    },
    [flush],
  );

  const open = useCallback((next: BuilderDoc, mode: StartMode = "scratch") => {
    setStartMode(mode);
    setDoc(next);
    setSaveState(next.id ? "saved" : "dirty");
  }, []);

  const close = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    if (dirty.current) void flush();
    setDoc(null);
  }, [flush]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return { doc, startMode, saveState, change, open, close, saveNow: flush };
}
