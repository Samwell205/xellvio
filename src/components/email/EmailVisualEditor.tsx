import { useCallback, useEffect, useRef, useState } from "react";
import { Bold, ImageIcon, Italic, Link2, Monitor, MousePointerClick, Plus, Redo2, Smartphone, Trash2, Type, Undo2, Underline } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MediaLibraryDialog } from "@/components/builder/MediaPicker";
import { sanitizeEmailHtml } from "@/lib/email-campaign-rules";

const EDIT_STYLE_ID = "xv-edit-style";
const EDIT_CSS = `
  html { cursor: text; }
  [data-xv-hover] { outline: 2px dashed rgba(22,163,74,.55) !important; outline-offset: 2px; }
  [data-xv-selected] { outline: 3px solid rgb(22,163,74) !important; outline-offset: 2px; }
  img { cursor: pointer; }
  a { cursor: pointer; }
`;

type Selection = { kind: "image"; el: HTMLImageElement } | { kind: "link"; el: HTMLAnchorElement } | null;

/**
 * Click-to-edit email canvas. The template is loaded without scripts; text is typed
 * directly on the email, pictures and links are changed from the side panel, and the
 * edited HTML is handed back (the sending pipeline sanitizes it again).
 */
export function EmailVisualEditor({ html, onChange }: { html: string; onChange: (html: string) => void }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [initial] = useState(() => sanitizeEmailHtml(html));
  const [sel, setSel] = useState<Selection>(null);
  const [mobile, setMobile] = useState(false);
  const [media, setMedia] = useState(false);
  const [, force] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const doc = () => frame.current?.contentDocument ?? null;

  const emit = useCallback(() => {
    const d = doc(); if (!d) return;
    const root = d.documentElement.cloneNode(true) as HTMLElement;
    root.querySelector(`#${EDIT_STYLE_ID}`)?.remove();
    root.querySelectorAll("[data-xv-hover],[data-xv-selected]").forEach((n) => { n.removeAttribute("data-xv-hover"); n.removeAttribute("data-xv-selected"); });
    onChangeRef.current(`<!DOCTYPE html>\n${root.outerHTML}`);
  }, []);
  const emitSoon = useCallback(() => { if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(emit, 400); }, [emit]);
  useEffect(() => () => { if (timer.current) { clearTimeout(timer.current); emit(); } }, [emit]);

  function select(next: Selection) {
    const d = doc(); d?.querySelectorAll("[data-xv-selected]").forEach((n) => n.removeAttribute("data-xv-selected"));
    next?.el.setAttribute("data-xv-selected", "");
    setSel(next);
  }

  function setup() {
    const d = doc(); if (!d) return;
    if (!d.getElementById(EDIT_STYLE_ID)) { const s = d.createElement("style"); s.id = EDIT_STYLE_ID; s.textContent = EDIT_CSS; d.head?.appendChild(s); }
    d.designMode = "on"; if (d.body) d.body.spellcheck = false;
    d.addEventListener("input", emitSoon);
    d.addEventListener("mouseover", (e) => { const t = e.target as HTMLElement; const el = t.closest?.("img,a"); if (el) el.setAttribute("data-xv-hover", ""); });
    d.addEventListener("mouseout", (e) => { (e.target as HTMLElement).closest?.("img,a")?.removeAttribute("data-xv-hover"); });
    d.addEventListener("click", (e) => {
      const t = e.target as HTMLElement;
      const img = t.closest?.("img") as HTMLImageElement | null;
      const link = t.closest?.("a") as HTMLAnchorElement | null;
      if (img || link) e.preventDefault();
      if (img) select({ kind: "image", el: img });
      else if (link) select({ kind: "link", el: link });
      else select(null);
    });
  }

  function cmd(name: string, value?: string) { const d = doc(); if (!d) return; frame.current?.contentWindow?.focus(); d.execCommand(name, false, value); emitSoon(); }
  function update(fn: () => void) { fn(); force((n) => n + 1); emitSoon(); }
  function removeSelected() { if (!sel) return; const target = sel.kind === "image" && sel.el.parentElement?.tagName === "A" ? sel.el.parentElement : sel.el; target.remove(); setSel(null); emitSoon(); }

  const href = sel?.kind === "link" ? sel.el.getAttribute("href") ?? "" : "";
  const isUnsub = /unsubscribe/i.test(href);

  return <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
    <aside className="space-y-5 rounded-3xl border bg-card p-4 xl:sticky xl:top-20 xl:max-h-[calc(100vh-6rem)] xl:overflow-y-auto">
      {!sel && <div className="space-y-4">
        <div><h3 className="font-semibold">Edit right on the email</h3><p className="mt-1 text-xs text-muted-foreground">Everything in this template can be changed.</p></div>
        <ul className="space-y-3 text-sm">
          <li className="flex gap-3"><span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand-green/12 text-brand-green"><Type className="size-4" /></span><span><span className="font-medium">Change words</span><span className="block text-xs text-muted-foreground">Click any text and start typing.</span></span></li>
          <li className="flex gap-3"><span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand-green/12 text-brand-green"><ImageIcon className="size-4" /></span><span><span className="font-medium">Swap pictures</span><span className="block text-xs text-muted-foreground">Click a picture to upload or choose your own.</span></span></li>
          <li className="flex gap-3"><span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand-green/12 text-brand-green"><MousePointerClick className="size-4" /></span><span><span className="font-medium">Update buttons & links</span><span className="block text-xs text-muted-foreground">Click a button to change its words and web address.</span></span></li>
        </ul>
      </div>}
      {sel?.kind === "image" && <div className="space-y-3">
        <div className="flex items-center justify-between"><h3 className="flex items-center gap-2 font-semibold"><ImageIcon className="size-4 text-brand-green" />Picture</h3><Button size="sm" variant="ghost" onClick={() => select(null)}>Done</Button></div>
        <div className="overflow-hidden rounded-xl border bg-muted"><img src={sel.el.getAttribute("src") ?? ""} alt="" className="max-h-40 w-full object-contain" /></div>
        <Button className="w-full" onClick={() => setMedia(true)}><ImageIcon className="size-4" />Replace picture</Button>
        <div className="space-y-1.5"><Label htmlFor="ve-img-url">Picture address</Label><Input id="ve-img-url" placeholder="https://" value={sel.el.getAttribute("src") ?? ""} onChange={(e) => update(() => sel.el.setAttribute("src", e.target.value))} /></div>
        <div className="space-y-1.5"><Label htmlFor="ve-img-alt">Description (for screen readers)</Label><Input id="ve-img-alt" value={sel.el.getAttribute("alt") ?? ""} onChange={(e) => update(() => sel.el.setAttribute("alt", e.target.value))} /></div>
        {sel.el.parentElement?.tagName === "A" && <div className="space-y-1.5"><Label htmlFor="ve-img-link">Opens when clicked</Label><Input id="ve-img-link" placeholder="https://" value={sel.el.parentElement.getAttribute("href") ?? ""} onChange={(e) => update(() => sel.el.parentElement?.setAttribute("href", e.target.value))} /></div>}
        <Button variant="ghost" className="w-full text-destructive" onClick={removeSelected}><Trash2 className="size-4" />Remove picture</Button>
      </div>}
      {sel?.kind === "link" && <div className="space-y-3">
        <div className="flex items-center justify-between"><h3 className="flex items-center gap-2 font-semibold"><Link2 className="size-4 text-brand-green" />Button or link</h3><Button size="sm" variant="ghost" onClick={() => select(null)}>Done</Button></div>
        <div className="space-y-1.5"><Label htmlFor="ve-link-text">Words</Label><Input id="ve-link-text" value={sel.el.textContent ?? ""} onChange={(e) => update(() => { if (sel.el.querySelector("img")) return; sel.el.textContent = e.target.value; })} disabled={!!sel.el.querySelector("img")} /></div>
        <div className="space-y-1.5"><Label htmlFor="ve-link-url">Web address</Label><Input id="ve-link-url" placeholder="https://yourwebsite.com" value={href} disabled={isUnsub} onChange={(e) => update(() => sel.el.setAttribute("href", e.target.value))} />
          <p className="text-xs text-muted-foreground">{isUnsub ? "This is the unsubscribe link — it is filled in automatically for every person." : "Use a full address starting with https://"}</p></div>
        {!isUnsub && <Button variant="ghost" className="w-full text-destructive" onClick={removeSelected}><Trash2 className="size-4" />Remove</Button>}
      </div>}
      <div className="space-y-2 border-t pt-4">
        <h3 className="text-sm font-semibold">Text style</h3>
        <div className="flex flex-wrap gap-1">
          <Button size="icon" variant="outline" title="Bold" onMouseDown={(e) => e.preventDefault()} onClick={() => cmd("bold")}><Bold className="size-4" /></Button>
          <Button size="icon" variant="outline" title="Italic" onMouseDown={(e) => e.preventDefault()} onClick={() => cmd("italic")}><Italic className="size-4" /></Button>
          <Button size="icon" variant="outline" title="Underline" onMouseDown={(e) => e.preventDefault()} onClick={() => cmd("underline")}><Underline className="size-4" /></Button>
          <Button size="icon" variant="outline" title="Undo" onMouseDown={(e) => e.preventDefault()} onClick={() => cmd("undo")}><Undo2 className="size-4" /></Button>
          <Button size="icon" variant="outline" title="Redo" onMouseDown={(e) => e.preventDefault()} onClick={() => cmd("redo")}><Redo2 className="size-4" /></Button>
        </div>
        <Button size="sm" variant="outline" onMouseDown={(e) => e.preventDefault()} onClick={() => cmd("insertText", "{{first_name}}")}><Plus className="size-3" />Insert first name</Button>
        <p className="text-xs text-muted-foreground">Place your cursor in the text first. First name is filled in for each person.</p>
      </div>
    </aside>
    <section className="min-w-0 rounded-3xl border bg-[radial-gradient(circle_at_top,var(--brand-green-soft),transparent_60%)] bg-muted/50 p-3 md:p-6">
      <div className="mb-4 flex items-center justify-between gap-2"><span className="flex items-center gap-2 text-xs font-semibold text-muted-foreground"><span className="size-2 animate-pulse rounded-full bg-brand-green" />EDITING — CLICK ANYTHING TO CHANGE IT</span><div className="flex gap-1"><Button size="icon" variant={mobile ? "ghost" : "secondary"} title="Desktop width" onClick={() => setMobile(false)}><Monitor className="size-4" /></Button><Button size="icon" variant={mobile ? "secondary" : "ghost"} title="Phone width" onClick={() => setMobile(true)}><Smartphone className="size-4" /></Button></div></div>
      <iframe ref={frame} title="Editable email" sandbox="allow-same-origin" srcDoc={initial} onLoad={setup} className={`mx-auto block h-[760px] w-full rounded-lg border-0 bg-card shadow-sm transition-all duration-300 ${mobile ? "max-w-[380px]" : "max-w-[680px]"}`} />
    </section>
    <MediaLibraryDialog open={media} onOpenChange={setMedia} onPick={(url) => { if (sel?.kind === "image") update(() => { sel.el.setAttribute("src", url); sel.el.removeAttribute("srcset"); }); }} />
  </div>;
}
