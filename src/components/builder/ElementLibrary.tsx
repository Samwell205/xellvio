import { useState } from "react";
import { Input } from "@/components/ui/input";
import { type Block, type BlockType, FIELD_KINDS, FIELD_LABELS, type FieldKind, makeBlock } from "@/lib/builder/schema";
import { Search } from "lucide-react";

export type NewBlockFactory = () => Block;

type Item = { key: string; label: string; make: NewBlockFactory };

const el = (type: BlockType, label: string, patch: Partial<Block> = {}): Item => ({
  key: `${type}-${label}`,
  label,
  make: () => makeBlock(type, patch),
});

const fieldItem = (kind: FieldKind): Item => ({
  key: `field-${kind}`,
  label: FIELD_LABELS[kind],
  make: () =>
    makeBlock("field", {
      content: {
        kind,
        label: FIELD_LABELS[kind],
        placeholder: kind === "email" ? "you@example.com" : kind === "phone" ? "+1 555 000 1234" : "",
        required: kind === "phone",
        help: "",
        options: kind === "select" || kind === "radio" ? ["Option one", "Option two"] : [],
      },
    }),
});

const LAYOUT: Item[] = [
  el("section", "Section"),
  { key: "columns-2", label: "2 columns", make: () => makeBlock("columns", { styles: { columns: 2, mobileColumns: 1, gap: 32 } }) },
  {
    key: "columns-3",
    label: "3 columns",
    make: () =>
      makeBlock("columns", {
        styles: { columns: 3, mobileColumns: 1, gap: 24 },
        children: [makeBlock("column"), makeBlock("column"), makeBlock("column")],
      }),
  },
  el("form", "Form"),
  el("spacer", "Spacer"),
  el("divider", "Divider"),
];

const CONTENT: Item[] = [
  el("heading", "Heading"),
  el("text", "Paragraph"),
  el("image", "Image"),
  el("logo", "Logo"),
  el("icon", "Icon"),
  el("video", "Video"),
  el("social", "Social links"),
  el("button", "Button"),
  el("html", "Custom HTML"),
];

const FIELDS: Item[] = FIELD_KINDS.map(fieldItem).concat([el("submit", "Submit button")]);

const MARKETING: Item[] = [
  el("features", "Feature cards"),
  el("testimonials", "Testimonials"),
  el("pricing", "Pricing cards"),
  el("faq", "FAQ accordion"),
  el("stats", "Stats row"),
  el("countdown", "Countdown timer"),
  {
    key: "cta-block",
    label: "CTA block",
    make: () =>
      makeBlock("section", {
        styles: { paddingY: 72, paddingX: 24, align: "center", background: "surface", maxWidth: 720 },
        children: [
          makeBlock("heading", { content: { text: "Ready to start?", level: 2 }, styles: { fontSize: 34, align: "center", marginBottom: 12 } }),
          makeBlock("text", { content: { text: "It takes less than a minute." }, styles: { align: "center", color: "muted", marginBottom: 20 } }),
          makeBlock("button", { content: { label: "Get started", url: "#" }, styles: { align: "center" } }),
        ],
      }),
  },
  {
    key: "hero-block",
    label: "Hero section",
    make: () =>
      makeBlock("section", {
        styles: { paddingY: 88, paddingX: 24 },
        children: [
          makeBlock("columns", {
            styles: { columns: 2, mobileColumns: 1, gap: 48 },
            children: [
              makeBlock("column", {
                children: [
                  makeBlock("heading", { content: { text: "A headline that sells", level: 1 }, styles: { fontSize: 50, marginBottom: 14 } }),
                  makeBlock("text", { content: { text: "One supporting sentence that makes the offer obvious." }, styles: { fontSize: 19, color: "muted", marginBottom: 24 } }),
                ],
              }),
              makeBlock("column", { children: [makeBlock("form")] }),
            ],
          }),
        ],
      }),
  },
];

const GROUPS = (kind: "form" | "page"): { title: string; items: Item[] }[] =>
  kind === "form"
    ? [
        { title: "Form fields", items: FIELDS },
        { title: "Content", items: CONTENT },
        { title: "Layout", items: LAYOUT },
      ]
    : [
        { title: "Sections & layout", items: LAYOUT.concat(MARKETING.filter((i) => i.key.endsWith("-block"))) },
        { title: "Content", items: CONTENT },
        { title: "Marketing", items: MARKETING.filter((i) => !i.key.endsWith("-block")) },
        { title: "Form fields", items: FIELDS },
      ];

export function ElementLibrary({
  kind,
  onDragItem,
  onDragEnd,
  onAdd,
}: {
  kind: "form" | "page";
  onDragItem: (make: NewBlockFactory) => void;
  onDragEnd: () => void;
  onAdd: (make: NewBlockFactory) => void;
}) {
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="relative p-3">
        <Search className="absolute left-6 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search elements" className="h-9 pl-8 text-sm" />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-6">
        {GROUPS(kind).map((g) => {
          const items = g.items.filter((i) => !query || i.label.toLowerCase().includes(query));
          if (!items.length) return null;
          return (
            <div key={g.title} className="mb-5">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{g.title}</p>
              <div className="grid grid-cols-2 gap-2">
                {items.map((i) => (
                  <button
                    key={i.key}
                    type="button"
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = "copy";
                      e.dataTransfer.setData("text/plain", "new");
                      onDragItem(i.make);
                    }}
                    onDragEnd={onDragEnd}
                    onClick={() => onAdd(i.make)}
                    className="cursor-grab rounded-lg border bg-card px-2.5 py-2 text-left text-xs font-medium transition hover:border-primary hover:bg-accent active:cursor-grabbing"
                  >
                    {i.label}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
        <p className="text-[11px] leading-relaxed text-muted-foreground">Drag onto the canvas, or click to add at the end.</p>
      </div>
    </div>
  );
}
