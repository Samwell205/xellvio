/**
 * Renders the structured block tree. Used by the builder canvas (editable
 * selection chrome), the preview modes and the public hosted pages, so what a
 * user designs is exactly what a visitor sees.
 */
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  type Block,
  type Theme,
  FONT_STACKS,
  findFormBlock,
  inputStyle,
  resolveColor,
  themeButtonStyle,
} from "@/lib/builder/schema";

export type Device = "desktop" | "tablet" | "mobile";

export type SubmitPayload = {
  phone: string;
  firstName: string;
  lastName: string;
  email: string;
  extra: Record<string, string>;
};

export type Dnd = {
  dragging: boolean;
  onDropAt: (parentId: string | null, index: number) => void;
  onDragBlock: (id: string) => void;
  onDragEnd: () => void;
};

type Ctx = {
  theme: Theme;
  device: Device;
  interactive: boolean;
  onSubmit?: (v: SubmitPayload) => Promise<string>;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  dnd?: Dnd;
};


const RenderCtx = createContext<Ctx | null>(null);
const useCtx = () => useContext(RenderCtx)!;

/* --------------------------------- form state -------------------------------- */

type FormState = {
  values: Record<string, string>;
  set: (key: string, value: string) => void;
  submit: () => void;
  busy: boolean;
  done: string | null;
  error: string | null;
};
const FormCtx = createContext<FormState | null>(null);

function FormProvider({ block, children }: { block: Block; children: React.ReactNode }) {
  const { interactive, onSubmit } = useCtx();
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const state: FormState = {
    values,
    set: (key, value) => setValues((v) => ({ ...v, [key]: value })),
    busy,
    done,
    error,
    submit: () => {
      if (!interactive || !onSubmit || busy) return;
      const { phone = "", firstName = "", lastName = "", fullName = "", email = "", ...extra } = values;
      const [first, ...rest] = fullName.trim().split(/\s+/);
      const payload: SubmitPayload = {
        phone,
        firstName: firstName || first || "",
        lastName: lastName || rest.join(" "),
        email,
        extra: extra as Record<string, string>,
      };
      if (!payload.phone.trim()) {
        setError("Please enter your phone number.");
        return;
      }
      setBusy(true);
      setError(null);
      onSubmit(payload)
        .then((msg) => {
          const mode = block.content.successMode;
          const url = String(block.content.redirectUrl ?? "");
          if (mode === "redirect" && url) {
            window.location.href = url;
            return;
          }
          setDone(block.content.successMessage || msg || "Thanks!");
        })
        .catch((e: any) => setError(e?.message ?? "Something went wrong."))
        .finally(() => setBusy(false));
    },
  };
  return <FormCtx.Provider value={state}>{children}</FormCtx.Provider>;
}

/* --------------------------------- utilities -------------------------------- */

const scale = (device: Device) => (device === "mobile" ? 0.82 : device === "tablet" ? 0.92 : 1);

function fontSizeFor(styles: Block["styles"], device: Device, fallback: number) {
  const base = styles.fontSize ?? fallback;
  if (device === "mobile") return styles.mobileFontSize ?? Math.max(14, Math.round(base * 0.8));
  if (device === "tablet") return Math.round(base * 0.92);
  return base;
}

function boxStyle(b: Block, theme: Theme, device: Device): React.CSSProperties {
  const s = b.styles ?? {};
  const k = scale(device);
  return {
    marginTop: (s.marginTop ?? 0) * k,
    marginBottom: (s.marginBottom ?? 0) * k,
    textAlign: s.align,
    opacity: s.opacity,
    ...(s.borderWidth ? { border: `${s.borderWidth}px solid ${resolveColor(theme, s.borderColor) ?? theme.border}` } : {}),
  };
}

function columnsFor(b: Block, device: Device) {
  const s = b.styles ?? {};
  if (device === "mobile") return s.mobileColumns ?? 1;
  if (device === "tablet") return Math.min(s.columns ?? 1, 2);
  return s.columns ?? 1;
}

/* -------------------------------- entry point ------------------------------- */

export function BlockCanvas({
  blocks,
  theme,
  device = "desktop",
  interactive = false,
  onSubmit,
  selectedId,
  onSelect,
  dnd,
}: {
  blocks: Block[];
  theme: Theme;
  device?: Device;
  interactive?: boolean;
  onSubmit?: (v: SubmitPayload) => Promise<string>;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  dnd?: Dnd;
}) {
  const ctx = useMemo<Ctx>(
    () => ({ theme, device, interactive, onSubmit, selectedId, onSelect, dnd }),
    [theme, device, interactive, onSubmit, selectedId, onSelect, dnd],
  );
  return (
    <RenderCtx.Provider value={ctx}>
      <div
        style={{
          background: theme.background,
          color: theme.text,
          fontFamily: FONT_STACKS[theme.bodyFont],
          fontSize: theme.baseFontSize,
          minHeight: "100%",
        }}
      >
        <BlockList blocks={blocks} parentId={null} />
      </div>
    </RenderCtx.Provider>
  );
}

function BlockList({ blocks, parentId }: { blocks: Block[]; parentId: string | null }) {
  const { dnd } = useCtx();
  if (!dnd)
    return (
      <>
        {blocks.map((b) => (
          <BlockView key={b.id} block={b} />
        ))}
      </>
    );
  return (
    <>
      <DropLine parentId={parentId} index={0} />
      {blocks.map((b, i) => (
        <div key={b.id}>
          <BlockView block={b} />
          <DropLine parentId={parentId} index={i + 1} />
        </div>
      ))}
    </>
  );
}

function DropLine({ parentId, index }: { parentId: string | null; index: number }) {
  const { dnd, theme } = useCtx();
  const [over, setOver] = useState(false);
  if (!dnd?.dragging) return null;
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setOver(false);
        dnd.onDropAt(parentId, index);
      }}
      style={{
        height: over ? 26 : 12,
        margin: "-4px 0",
        borderRadius: 8,
        background: over ? theme.secondary : "transparent",
        border: over ? "none" : `1px dashed ${theme.border}`,
        transition: "height .12s ease, background .12s ease",
      }}
    />
  );
}

/* -------------------------------- block views ------------------------------- */

export function BlockView({ block }: { block: Block }) {
  const { theme, device, selectedId, onSelect, dnd } = useCtx();
  const s = block.styles ?? {};
  if (s.hideOnMobile && device === "mobile") return null;

  const selectable = !!onSelect;
  const selected = selectedId === block.id;

  const inner = <BlockBody block={block} />;

  if (!selectable) return inner;

  return (
    <div
      role="presentation"
      draggable={!!dnd}
      onDragStart={(e) => {
        e.stopPropagation();
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", block.id);
        dnd?.onDragBlock(block.id);
      }}
      onDragEnd={() => dnd?.onDragEnd()}
      onClick={(e) => {
        e.stopPropagation();
        onSelect?.(block.id);
      }}
      style={{
        position: "relative",
        outline: selected ? `2px solid ${theme.secondary}` : undefined,
        outlineOffset: selected ? -2 : undefined,
        cursor: "pointer",
      }}
      data-block-id={block.id}
      className="group/blk"
    >
      {inner}
    </div>
  );
}


function BlockBody({ block }: { block: Block }) {
  const { theme, device } = useCtx();
  const s = block.styles ?? {};
  const k = scale(device);

  switch (block.type) {
    case "section": {
      const bg = resolveColor(theme, s.background);
      return (
        <section
          style={{
            background: s.backgroundImage
              ? `linear-gradient(0deg, ${bg ?? "transparent"}, ${bg ?? "transparent"}), url(${s.backgroundImage}) center/cover no-repeat`
              : bg,
            padding: `${(s.paddingY ?? 64) * k}px ${(s.paddingX ?? 24) * k}px`,
            minHeight: s.minHeight ? s.minHeight * k : undefined,
            textAlign: s.align,
            color: resolveColor(theme, s.color),
          }}
        >
          <div style={{ maxWidth: s.maxWidth ?? theme.maxWidth, margin: "0 auto" }}>
            <Children block={block} />
          </div>
        </section>
      );
    }
    case "columns":
      return (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${columnsFor(block, device)}, minmax(0,1fr))`,
            gap: (s.gap ?? 32) * k,
            alignItems: "start",
            ...boxStyle(block, theme, device),
          }}
        >
          <Children block={block} />
        </div>
      );
    case "column":
      return (
        <div style={{ minWidth: 0, textAlign: s.align, ...boxStyle(block, theme, device) }}>
          <Children block={block} />
        </div>
      );
    case "form":
      return <FormBlock block={block} />;
    case "heading": {
      const Tag = (`h${Math.min(4, Math.max(1, Number(block.content.level ?? 2)))}` as unknown) as "h2";
      return (
        <Tag
          style={{
            ...boxStyle(block, theme, device),
            fontFamily: FONT_STACKS[theme.headingFont],
            fontSize: fontSizeFor(s, device, 36),
            fontWeight: s.fontWeight ?? 800,
            lineHeight: s.lineHeight ?? 1.12,
            letterSpacing: s.letterSpacing,
            textTransform: s.textTransform,
            color: resolveColor(theme, s.color) ?? theme.heading,
            margin: 0,
            marginTop: (s.marginTop ?? 0) * k,
            marginBottom: (s.marginBottom ?? 12) * k,
          }}
        >
          {block.content.text}
        </Tag>
      );
    }
    case "text":
      return (
        <p
          style={{
            ...boxStyle(block, theme, device),
            fontSize: fontSizeFor(s, device, 17),
            lineHeight: s.lineHeight ?? 1.6,
            color: resolveColor(theme, s.color) ?? theme.text,
            margin: 0,
            marginTop: (s.marginTop ?? 0) * k,
            marginBottom: (s.marginBottom ?? 12) * k,
            whiteSpace: "pre-wrap",
          }}
        >
          {block.content.text}
        </p>
      );
    case "image":
    case "logo": {
      const url = String(block.content.url ?? "");
      if (!url)
        return (
          <div
            style={{
              ...boxStyle(block, theme, device),
              border: `1px dashed ${theme.border}`,
              borderRadius: s.radius ?? 14,
              padding: 24,
              color: theme.muted,
              fontSize: 13,
              textAlign: "center",
            }}
          >
            {block.type === "logo" ? "Add your logo" : "Add an image"}
          </div>
        );
      return (
        <img
          src={url}
          alt={String(block.content.alt ?? "")}
          loading="lazy"
          style={{
            ...boxStyle(block, theme, device),
            display: s.align === "center" ? "block" : undefined,
            marginLeft: s.align === "center" ? "auto" : undefined,
            marginRight: s.align === "center" ? "auto" : undefined,
            width: s.maxWidth ? undefined : "100%",
            maxWidth: s.maxWidth,
            borderRadius: s.radius ?? 16,
            boxShadow: s.shadow ? "0 30px 60px -30px rgba(2,6,23,.45)" : undefined,
          }}
        />
      );
    }
    case "icon":
      return (
        <div style={{ ...boxStyle(block, theme, device), fontSize: fontSizeFor(s, device, 28), lineHeight: 1 }}>
          {block.content.glyph}
        </div>
      );
    case "divider":
      return (
        <hr
          style={{
            border: "none",
            borderTop: `${s.borderWidth ?? 1}px solid ${resolveColor(theme, s.borderColor) ?? theme.border}`,
            marginTop: (s.marginTop ?? 16) * k,
            marginBottom: (s.marginBottom ?? 16) * k,
          }}
        />
      );
    case "spacer":
      return <div style={{ height: (s.minHeight ?? 32) * k }} />;
    case "video": {
      const url = String(block.content.url ?? "");
      const embed = toEmbedUrl(url);
      if (!embed)
        return (
          <div style={{ border: `1px dashed ${theme.border}`, borderRadius: 14, padding: 28, color: theme.muted, fontSize: 13, textAlign: "center" }}>
            Paste a YouTube or Vimeo link
          </div>
        );
      return (
        <div style={{ ...boxStyle(block, theme, device), position: "relative", paddingTop: "56.25%", borderRadius: s.radius ?? 16, overflow: "hidden" }}>
          <iframe
            src={embed}
            title="Video"
            allowFullScreen
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: "none" }}
          />
        </div>
      );
    }
    case "html":
      return <div style={boxStyle(block, theme, device)} dangerouslySetInnerHTML={{ __html: String(block.content.html ?? "") }} />;
    case "social":
      return (
        <div style={{ ...boxStyle(block, theme, device), display: "flex", flexWrap: "wrap", gap: s.gap ?? 14, justifyContent: s.align === "center" ? "center" : s.align === "right" ? "flex-end" : "flex-start" }}>
          {(block.content.items ?? []).map((it: any, i: number) => (
            <a key={i} href={it.url || "#"} style={{ color: resolveColor(theme, s.color) ?? theme.muted, fontSize: s.fontSize ?? 14, textDecoration: "none" }}>
              {it.label}
            </a>
          ))}
        </div>
      );
    case "button":
      return (
        <div style={{ ...boxStyle(block, theme, device), display: "flex", justifyContent: s.align === "center" ? "center" : s.align === "right" ? "flex-end" : "flex-start" }}>
          <a href={String(block.content.url ?? "#")} style={{ ...themeButtonStyle(theme, s), textDecoration: "none", display: "inline-block" }}>
            {block.content.label}
          </a>
        </div>
      );
    case "submit":
      return <SubmitButton block={block} />;
    case "field":
      return <FieldBlock block={block} />;
    case "features":
      return (
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${columnsFor(block, device)}, minmax(0,1fr))`, gap: (s.gap ?? 24) * k, ...boxStyle(block, theme, device) }}>
          {(block.content.items ?? []).map((it: any, i: number) => (
            <div key={i} style={{ background: resolveColor(theme, s.background) ?? theme.surface, border: `1px solid ${theme.border}`, borderRadius: theme.radius, padding: 24 * k, textAlign: s.align }}>
              {it.icon ? <div style={{ fontSize: 24, marginBottom: 10 }}>{it.icon}</div> : null}
              <div style={{ fontFamily: FONT_STACKS[theme.headingFont], fontWeight: 750, fontSize: 18, color: theme.heading, marginBottom: 6 }}>{it.title}</div>
              <div style={{ fontSize: 15, lineHeight: 1.6, color: theme.muted }}>{it.body}</div>
            </div>
          ))}
        </div>
      );
    case "testimonials":
      return (
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${columnsFor(block, device)}, minmax(0,1fr))`, gap: (s.gap ?? 24) * k, ...boxStyle(block, theme, device) }}>
          {(block.content.items ?? []).map((it: any, i: number) => (
            <figure key={i} style={{ margin: 0, background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: theme.radius, padding: 26 * k }}>
              <blockquote style={{ margin: 0, fontFamily: FONT_STACKS[theme.headingFont], fontSize: 19, lineHeight: 1.45, color: theme.heading }}>
                “{it.quote}”
              </blockquote>
              <figcaption style={{ marginTop: 14, fontSize: 14, color: theme.muted }}>
                {it.author}
                {it.role ? ` — ${it.role}` : ""}
              </figcaption>
            </figure>
          ))}
        </div>
      );
    case "pricing":
      return (
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${columnsFor(block, device)}, minmax(0,1fr))`, gap: (s.gap ?? 24) * k, ...boxStyle(block, theme, device) }}>
          {(block.content.items ?? []).map((it: any, i: number) => (
            <div
              key={i}
              style={{
                background: it.featured ? theme.heading : theme.surface,
                color: it.featured ? theme.surface : theme.text,
                border: `1px solid ${it.featured ? theme.heading : theme.border}`,
                borderRadius: theme.radius,
                padding: 28 * k,
              }}
            >
              <div style={{ fontSize: 14, textTransform: "uppercase", letterSpacing: 1, color: it.featured ? theme.surface : theme.muted }}>{it.name}</div>
              <div style={{ fontFamily: FONT_STACKS[theme.headingFont], fontSize: 40, fontWeight: 800, color: it.featured ? theme.surface : theme.heading, marginTop: 8 }}>
                {it.price}
                <span style={{ fontSize: 15, fontWeight: 500, color: it.featured ? theme.surface : theme.muted }}>{it.period}</span>
              </div>
              <ul style={{ listStyle: "none", padding: 0, margin: "18px 0", display: "grid", gap: 8, fontSize: 15 }}>
                {(it.features ?? []).map((f: string, j: number) => (
                  <li key={j}>✓ {f}</li>
                ))}
              </ul>
              <div style={{ ...themeButtonStyle(theme, { width: "full" }), textAlign: "center" }}>{it.cta}</div>
            </div>
          ))}
        </div>
      );
    case "faq":
      return <Faq block={block} />;
    case "stats":
      return (
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${columnsFor(block, device)}, minmax(0,1fr))`, gap: (s.gap ?? 16) * k, ...boxStyle(block, theme, device) }}>
          {(block.content.items ?? []).map((it: any, i: number) => (
            <div key={i} style={{ textAlign: s.align ?? "center" }}>
              <div style={{ fontFamily: FONT_STACKS[theme.headingFont], fontSize: 30, fontWeight: 800, color: theme.heading }}>{it.value}</div>
              <div style={{ fontSize: 13, color: theme.muted, textTransform: "uppercase", letterSpacing: 1 }}>{it.label}</div>
            </div>
          ))}
        </div>
      );
    case "countdown":
      return <Countdown block={block} />;
    default:
      return null;
  }
}

function Children({ block }: { block: Block }) {
  const { theme, dnd } = useCtx();
  const kids = block.children ?? [];
  if (kids.length === 0)
    return (
      <div
        onDragOver={(e) => dnd && (e.preventDefault(), e.stopPropagation())}
        onDrop={(e) => {
          if (!dnd) return;
          e.preventDefault();
          e.stopPropagation();
          dnd.onDropAt(block.id, 0);
        }}
        style={{ border: `1px dashed ${theme.border}`, borderRadius: 12, padding: 20, fontSize: 13, color: theme.muted, textAlign: "center" }}
      >
        Drop elements here
      </div>
    );
  return <BlockList blocks={kids} parentId={block.id} />;
}


function toEmbedUrl(url: string): string | null {
  const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]{6,})/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
  const vim = url.match(/vimeo\.com\/(\d+)/);
  if (vim) return `https://player.vimeo.com/video/${vim[1]}`;
  return null;
}

/* ----------------------------------- form ---------------------------------- */

function FormBlock({ block }: { block: Block }) {
  const { theme, device } = useCtx();
  const s = block.styles ?? {};
  const k = scale(device);
  return (
    <FormProvider block={block}>
      <FormShell block={block}>
        <div
          style={{
            background: s.background === "transparent" ? "transparent" : resolveColor(theme, s.background) ?? theme.surface,
            border: s.background === "transparent" ? "none" : `1px solid ${theme.border}`,
            borderRadius: s.radius ?? theme.radius,
            padding: `${(s.paddingY ?? 24) * k}px ${(s.paddingX ?? 24) * k}px`,
            boxShadow: s.shadow && theme.shadow ? "0 30px 60px -35px rgba(2,6,23,.5)" : undefined,
            display: "grid",
            gridTemplateColumns: `repeat(${columnsFor(block, device)}, minmax(0,1fr))`,
            gap: s.gap ?? 12,
            textAlign: s.align,
            ...boxStyle(block, theme, device),
          }}
        >
          <Children block={block} />
        </div>
      </FormShell>
    </FormProvider>
  );
}

function FormShell({ block, children }: { block: Block; children: React.ReactNode }) {
  const { theme } = useCtx();
  const form = useContext(FormCtx)!;
  if (form.done)
    return (
      <div style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: theme.radius, padding: 40, textAlign: "center" }}>
        <div style={{ fontFamily: FONT_STACKS[theme.headingFont], fontSize: 26, fontWeight: 800, color: theme.heading }}>You're in 🎉</div>
        <p style={{ color: theme.muted, marginTop: 10 }}>{form.done}</p>
      </div>
    );
  return (
    <div>
      {children}
      {form.error ? <p style={{ color: "#dc2626", fontSize: 13, marginTop: 8 }}>{form.error}</p> : null}
      {block.content.consentText ? (
        <p style={{ color: theme.muted, fontSize: 11.5, lineHeight: 1.5, marginTop: 10 }}>{block.content.consentText}</p>
      ) : null}
    </div>
  );
}

function FieldBlock({ block }: { block: Block }) {
  const { theme, interactive } = useCtx();
  const form = useContext(FormCtx);
  const c = block.content ?? {};
  const kind = String(c.kind ?? "email");
  const key = kind === "select" || kind === "radio" || kind === "checkbox" || kind === "textarea" || kind === "hidden" ? `${kind}_${block.id}` : kind;
  if (kind === "hidden") return null;
  const value = form?.values[key] ?? "";
  const set = (v: string) => form?.set(key, v);
  const base = inputStyle(theme);
  const wrap: React.CSSProperties = { gridColumn: block.styles?.width === "auto" ? undefined : "1 / -1", textAlign: "left" };

  const label = (
    <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: theme.heading, marginBottom: 6 }}>
      {c.label}
      {c.required ? <span style={{ color: theme.primary }}> *</span> : null}
    </label>
  );
  const help = c.help ? <p style={{ fontSize: 11.5, color: theme.muted, marginTop: 5 }}>{c.help}</p> : null;

  if (kind === "checkbox")
    return (
      <div style={wrap}>
        <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 13.5, color: theme.text }}>
          <input type="checkbox" checked={value === "yes"} onChange={(e) => set(e.target.checked ? "yes" : "")} disabled={!interactive} />
          <span>{c.label}</span>
        </label>
        {help}
      </div>
    );

  if (kind === "radio")
    return (
      <div style={wrap}>
        {label}
        <div style={{ display: "grid", gap: 6 }}>
          {(c.options?.length ? c.options : ["Option one", "Option two"]).map((o: string, i: number) => (
            <label key={i} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14, color: theme.text }}>
              <input type="radio" name={`r_${block.id}`} checked={value === o} onChange={() => set(o)} disabled={!interactive} />
              {o}
            </label>
          ))}
        </div>
        {help}
      </div>
    );

  if (kind === "select")
    return (
      <div style={wrap}>
        {label}
        <select style={base} value={value} onChange={(e) => set(e.target.value)} disabled={!interactive}>
          <option value="">Please choose…</option>
          {(c.options?.length ? c.options : ["Option one", "Option two"]).map((o: string, i: number) => (
            <option key={i} value={o}>
              {o}
            </option>
          ))}
        </select>
        {help}
      </div>
    );

  if (kind === "textarea")
    return (
      <div style={wrap}>
        {label}
        <textarea rows={4} style={{ ...base, resize: "vertical" }} placeholder={c.placeholder} value={value} onChange={(e) => set(e.target.value)} readOnly={!interactive} />
        {help}
      </div>
    );

  const type = kind === "email" ? "email" : kind === "phone" ? "tel" : kind === "date" ? "date" : kind === "number" ? "number" : kind === "website" ? "url" : "text";
  return (
    <div style={wrap}>
      {label}
      <input
        type={type}
        style={base}
        placeholder={c.placeholder}
        value={value}
        onChange={(e) => set(e.target.value)}
        readOnly={!interactive}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            form?.submit();
          }
        }}
      />
      {help}
    </div>
  );
}

function SubmitButton({ block }: { block: Block }) {
  const { theme } = useCtx();
  const form = useContext(FormCtx);
  const s = block.styles ?? {};
  return (
    <div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: s.align === "center" ? "center" : s.align === "right" ? "flex-end" : "stretch" }}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          form?.submit();
        }}
        disabled={form?.busy}
        style={{ ...themeButtonStyle(theme, s), opacity: form?.busy ? 0.7 : 1 }}
      >
        {form?.busy ? "Sending…" : block.content.label}
      </button>
    </div>
  );
}

function Faq({ block }: { block: Block }) {
  const { theme } = useCtx();
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div style={{ display: "grid", gap: block.styles?.gap ?? 12 }}>
      {(block.content.items ?? []).map((it: any, i: number) => (
        <div key={i} style={{ border: `1px solid ${theme.border}`, borderRadius: theme.radius, background: theme.surface, overflow: "hidden" }}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(open === i ? null : i);
            }}
            style={{
              width: "100%",
              textAlign: "left",
              padding: "16px 20px",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              fontFamily: FONT_STACKS[theme.headingFont],
              fontSize: 16.5,
              fontWeight: 700,
              color: theme.heading,
            }}
          >
            {it.q}
          </button>
          {open === i ? <div style={{ padding: "0 20px 18px", fontSize: 15, lineHeight: 1.6, color: theme.muted }}>{it.a}</div> : null}
        </div>
      ))}
    </div>
  );
}

function Countdown({ block }: { block: Block }) {
  const { theme } = useCtx();
  const target = block.content.endsAt ? new Date(block.content.endsAt).getTime() : 0;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const left = Math.max(0, target - now);
  const parts = [
    { v: Math.floor(left / 86400000), l: "days" },
    { v: Math.floor((left / 3600000) % 24), l: "hrs" },
    { v: Math.floor((left / 60000) % 60), l: "min" },
    { v: Math.floor((left / 1000) % 60), l: "sec" },
  ];
  return (
    <div style={{ textAlign: block.styles?.align ?? "center", marginBottom: block.styles?.marginBottom ?? 12 }}>
      {block.content.label ? <div style={{ fontSize: 13, letterSpacing: 1, textTransform: "uppercase", color: theme.muted, marginBottom: 8 }}>{block.content.label}</div> : null}
      <div style={{ display: "inline-flex", gap: 14 }}>
        {parts.map((p) => (
          <div key={p.l} style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: theme.radius, padding: "10px 16px", minWidth: 74 }}>
            <div style={{ fontFamily: FONT_STACKS[theme.headingFont], fontSize: block.styles?.fontSize ?? 28, fontWeight: 800, color: theme.heading }}>
              {String(p.v).padStart(2, "0")}
            </div>
            <div style={{ fontSize: 11, textTransform: "uppercase", color: theme.muted }}>{p.l}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
