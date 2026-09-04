/**
 * Structured design schema shared by the visual builder, templates, the AI
 * design assistant and the public hosted pages. Designs are stored as JSON —
 * never as markup or screenshots — so every element stays editable forever.
 *
 *  page/form
 *   ├── theme (global styles)
 *   └── blocks[]  (sections)
 *        └── children[]  (columns / elements)
 *             └── children[]
 */
import { type FontKey, FONT_STACKS } from "@/lib/website-design";

export type { FontKey };
export { FONT_STACKS };

/* ---------------------------------- theme ---------------------------------- */

export type Theme = {
  primary: string;
  primaryText: string;
  secondary: string;
  background: string;
  surface: string;
  text: string;
  heading: string;
  muted: string;
  border: string;
  headingFont: FontKey;
  bodyFont: FontKey;
  baseFontSize: number;
  radius: number;
  inputRadius: number;
  buttonRadius: number;
  spacing: number;
  shadow: boolean;
  buttonStyle: "solid" | "outline" | "pill" | "soft";
  maxWidth: number;
};

export const LIGHT_THEME: Theme = {
  primary: "#111827",
  primaryText: "#ffffff",
  secondary: "#2563eb",
  background: "#f6f7f9",
  surface: "#ffffff",
  text: "#334155",
  heading: "#0f172a",
  muted: "#64748b",
  border: "#e2e8f0",
  headingFont: "sans",
  bodyFont: "sans",
  baseFontSize: 16,
  radius: 18,
  inputRadius: 12,
  buttonRadius: 12,
  spacing: 1,
  shadow: true,
  buttonStyle: "solid",
  maxWidth: 1100,
};

export const DARK_THEME: Theme = {
  ...LIGHT_THEME,
  primary: "#f97316",
  primaryText: "#0b0b0c",
  secondary: "#f59e0b",
  background: "#08090c",
  surface: "#12141a",
  text: "#cbd5e1",
  heading: "#f8fafc",
  muted: "#94a3b8",
  border: "#232733",
};

export type BrandPreset = { id: string; label: string; blurb: string; theme: Theme };

export const BRAND_PRESETS: BrandPreset[] = [
  { id: "clean", label: "Clean light", blurb: "Neutral, high contrast.", theme: LIGHT_THEME },
  { id: "midnight", label: "Midnight orange", blurb: "Black canvas, orange CTA.", theme: DARK_THEME },
  {
    id: "saas",
    label: "Modern SaaS",
    blurb: "Indigo accents, soft cards.",
    theme: { ...LIGHT_THEME, primary: "#4f46e5", secondary: "#0ea5e9", background: "#f8faff", radius: 22, buttonRadius: 14 },
  },
  {
    id: "editorial",
    label: "Editorial",
    blurb: "Serif headings, tight radius.",
    theme: { ...LIGHT_THEME, headingFont: "serif", radius: 6, inputRadius: 4, buttonRadius: 4, shadow: false, primary: "#0f172a" },
  },
  {
    id: "retail",
    label: "Bold retail",
    blurb: "Pill buttons, hot pink accent.",
    theme: { ...LIGHT_THEME, primary: "#e11d48", buttonStyle: "pill", radius: 26, buttonRadius: 999 },
  },
  {
    id: "boutique",
    label: "Boutique cream",
    blurb: "Warm cream, outline buttons.",
    theme: {
      ...LIGHT_THEME,
      background: "#faf5ef",
      surface: "#fffdf9",
      primary: "#7c2d12",
      border: "#ead9c6",
      headingFont: "serif",
      buttonStyle: "outline",
      radius: 12,
    },
  },
];

/* ---------------------------------- blocks ---------------------------------- */

export type Styles = {
  align?: "left" | "center" | "right";
  fontSize?: number;
  mobileFontSize?: number;
  fontWeight?: number;
  lineHeight?: number;
  letterSpacing?: number;
  textTransform?: "none" | "uppercase";
  color?: string;
  background?: string;
  backgroundImage?: string;
  paddingY?: number;
  paddingX?: number;
  marginTop?: number;
  marginBottom?: number;
  radius?: number;
  borderWidth?: number;
  borderColor?: string;
  shadow?: boolean;
  width?: "auto" | "full";
  maxWidth?: number;
  columns?: number;
  mobileColumns?: number;
  gap?: number;
  minHeight?: number;
  hideOnMobile?: boolean;
  hoverBackground?: string;
  hoverColor?: string;
  opacity?: number;
};

export type BlockType =
  // structure
  | "section"
  | "columns"
  | "column"
  | "form"
  // content
  | "heading"
  | "text"
  | "image"
  | "logo"
  | "icon"
  | "divider"
  | "spacer"
  | "video"
  | "html"
  | "social"
  | "button"
  | "submit"
  // fields
  | "field"
  // marketing
  | "features"
  | "testimonials"
  | "pricing"
  | "faq"
  | "stats"
  | "countdown";

export type Block = {
  id: string;
  type: BlockType;
  content: Record<string, any>;
  styles: Styles;
  settings: Record<string, any>;
  children?: Block[];
};

export const FIELD_KINDS = [
  "firstName",
  "lastName",
  "fullName",
  "email",
  "phone",
  "company",
  "website",
  "address",
  "city",
  "state",
  "country",
  "date",
  "number",
  "select",
  "checkbox",
  "radio",
  "textarea",
  "hidden",
] as const;
export type FieldKind = (typeof FIELD_KINDS)[number];

export const FIELD_LABELS: Record<FieldKind, string> = {
  firstName: "First name",
  lastName: "Last name",
  fullName: "Full name",
  email: "Email",
  phone: "Phone",
  company: "Company",
  website: "Website",
  address: "Address",
  city: "City",
  state: "State",
  country: "Country",
  date: "Date",
  number: "Number",
  select: "Dropdown",
  checkbox: "Checkbox",
  radio: "Radio buttons",
  textarea: "Text area",
  hidden: "Hidden field",
};

export const BLOCK_LABELS: Record<BlockType, string> = {
  section: "Section",
  columns: "Columns",
  column: "Column",
  form: "Form",
  heading: "Heading",
  text: "Paragraph",
  image: "Image",
  logo: "Logo",
  icon: "Icon",
  divider: "Divider",
  spacer: "Spacer",
  video: "Video",
  html: "Custom HTML",
  social: "Social links",
  button: "Button",
  submit: "Submit button",
  field: "Form field",
  features: "Feature cards",
  testimonials: "Testimonials",
  pricing: "Pricing cards",
  faq: "FAQ accordion",
  stats: "Stats row",
  countdown: "Countdown timer",
};

export const CONTAINER_TYPES: BlockType[] = ["section", "columns", "column", "form"];
export const isContainer = (t: BlockType) => CONTAINER_TYPES.includes(t);

export const uid = () => Math.random().toString(36).slice(2, 10);

/* ------------------------------- block factory ------------------------------ */

export function makeBlock(type: BlockType, patch: Partial<Block> = {}): Block {
  const base: Block = { id: uid(), type, content: {}, styles: {}, settings: {} };
  switch (type) {
    case "section":
      base.styles = { paddingY: 64, paddingX: 24, align: "left" };
      base.children = [];
      break;
    case "columns":
      base.styles = { columns: 2, mobileColumns: 1, gap: 32 };
      base.children = [makeBlock("column"), makeBlock("column")];
      break;
    case "column":
      base.children = [];
      break;
    case "form":
      base.content = {
        successMessage: "Thanks! You're officially registered.",
        successMode: "message",
        redirectUrl: "",
        consentText:
          "By signing up you agree to receive recurring marketing texts. Message and data rates may apply. Reply STOP to opt out.",
      };
      base.styles = { columns: 1, gap: 12, paddingY: 24, paddingX: 24, background: "surface", radius: 0, shadow: true };
      base.children = [
        makeBlock("field", { content: { kind: "firstName", label: "First name", placeholder: "Jane", required: false } }),
        makeBlock("field", { content: { kind: "phone", label: "Phone number", placeholder: "+1 555 000 1234", required: true } }),
        makeBlock("submit", { content: { label: "Sign up" } }),
      ];
      break;
    case "heading":
      base.content = { text: "A headline that sells", level: 2 };
      base.styles = { fontSize: 40, fontWeight: 800, lineHeight: 1.1, marginBottom: 12 };
      break;
    case "text":
      base.content = { text: "Add a short, specific sentence about what people get when they sign up." };
      base.styles = { fontSize: 17, lineHeight: 1.6, marginBottom: 12 };
      break;
    case "image":
      base.content = { url: "", alt: "" };
      base.styles = { radius: 18, marginBottom: 12 };
      break;
    case "logo":
      base.content = { url: "", alt: "Logo" };
      base.styles = { maxWidth: 140, marginBottom: 16 };
      break;
    case "icon":
      base.content = { glyph: "★" };
      base.styles = { fontSize: 28, marginBottom: 8 };
      break;
    case "divider":
      base.styles = { marginTop: 16, marginBottom: 16, borderWidth: 1 };
      break;
    case "spacer":
      base.styles = { minHeight: 32 };
      break;
    case "video":
      base.content = { url: "" };
      base.styles = { radius: 16, marginBottom: 12 };
      break;
    case "html":
      base.content = { html: "<p>Custom HTML</p>" };
      break;
    case "social":
      base.content = {
        items: [
          { label: "Instagram", url: "#" },
          { label: "X", url: "#" },
          { label: "TikTok", url: "#" },
        ],
      };
      base.styles = { gap: 14, fontSize: 14 };
      break;
    case "button":
      base.content = { label: "Get started", url: "#" };
      base.styles = { fontSize: 16, fontWeight: 700, paddingY: 14, paddingX: 26, width: "auto" };
      break;
    case "submit":
      base.content = { label: "Sign up" };
      base.styles = { fontSize: 16, fontWeight: 700, paddingY: 14, paddingX: 26, width: "full" };
      break;
    case "field":
      base.content = { kind: "email", label: "Email", placeholder: "you@example.com", required: true, help: "", options: [] };
      base.styles = { fontSize: 15, width: "full" };
      break;
    case "features":
      base.content = {
        items: [
          { icon: "⚡", title: "Instant delivery", body: "Messages land in seconds, not minutes." },
          { icon: "🎯", title: "Better targeting", body: "Reach the right list at the right time." },
          { icon: "🔒", title: "Compliant by default", body: "Opt-outs and consent handled for you." },
        ],
      };
      base.styles = { columns: 3, mobileColumns: 1, gap: 24 };
      break;
    case "testimonials":
      base.content = {
        items: [
          { quote: "We recovered 3x more carts in the first week.", author: "Amara O.", role: "Founder, Lumo" },
          { quote: "Setup took ten minutes and it just works.", author: "Dan P.", role: "Growth, Northside" },
        ],
      };
      base.styles = { columns: 2, mobileColumns: 1, gap: 24 };
      break;
    case "pricing":
      base.content = {
        items: [
          { name: "Starter", price: "$29", period: "/mo", features: ["2,000 messages", "1 sender", "Email support"], cta: "Choose Starter", featured: false },
          { name: "Growth", price: "$99", period: "/mo", features: ["10,000 messages", "3 senders", "Priority support"], cta: "Choose Growth", featured: true },
        ],
      };
      base.styles = { columns: 2, mobileColumns: 1, gap: 24 };
      break;
    case "faq":
      base.content = {
        items: [
          { q: "How often will you text me?", a: "Two or three times a month — never more." },
          { q: "How do I stop?", a: "Reply STOP to any message and you're removed instantly." },
        ],
      };
      base.styles = { gap: 12 };
      break;
    case "stats":
      base.content = {
        items: [
          { value: "12k+", label: "Subscribers" },
          { value: "38%", label: "Click rate" },
          { value: "4.9/5", label: "Customer rating" },
        ],
      };
      base.styles = { columns: 3, mobileColumns: 3, gap: 16 };
      break;
    case "countdown":
      base.content = { label: "Offer ends in", endsAt: "" };
      base.styles = { fontSize: 28, fontWeight: 800, marginBottom: 12 };
      break;
  }
  return {
    ...base,
    ...patch,
    content: { ...base.content, ...(patch.content ?? {}) },
    styles: { ...base.styles, ...(patch.styles ?? {}) },
    settings: { ...base.settings, ...(patch.settings ?? {}) },
    children: patch.children ?? base.children,
    id: patch.id ?? base.id,
  };
}

/* ------------------------------ tree operations ----------------------------- */

export function walk(blocks: Block[], fn: (b: Block, parent: Block | null) => void, parent: Block | null = null) {
  for (const b of blocks) {
    fn(b, parent);
    if (b.children) walk(b.children, fn, b);
  }
}

export function findBlock(blocks: Block[], id: string): Block | null {
  let found: Block | null = null;
  walk(blocks, (b) => {
    if (b.id === id) found = b;
  });
  return found;
}

export function findParent(blocks: Block[], id: string): Block | null {
  let found: Block | null = null;
  walk(blocks, (b, parent) => {
    if (b.id === id) found = parent;
  });
  return found;
}

export function updateBlock(blocks: Block[], id: string, patch: (b: Block) => Block): Block[] {
  return blocks.map((b) => {
    if (b.id === id) return patch(b);
    if (b.children) return { ...b, children: updateBlock(b.children, id, patch) };
    return b;
  });
}

export function removeBlock(blocks: Block[], id: string): Block[] {
  return blocks
    .filter((b) => b.id !== id)
    .map((b) => (b.children ? { ...b, children: removeBlock(b.children, id) } : b));
}

export function cloneBlock(b: Block): Block {
  return {
    ...b,
    id: uid(),
    content: JSON.parse(JSON.stringify(b.content ?? {})),
    styles: { ...(b.styles ?? {}) },
    settings: { ...(b.settings ?? {}) },
    children: b.children?.map(cloneBlock),
  };
}

/** Insert `block` inside `parentId` (root when null) at `index`. */
export function insertBlock(blocks: Block[], parentId: string | null, index: number, block: Block): Block[] {
  if (parentId === null) {
    const next = [...blocks];
    next.splice(Math.max(0, Math.min(index, next.length)), 0, block);
    return next;
  }
  return blocks.map((b) => {
    if (b.id === parentId) {
      const kids = [...(b.children ?? [])];
      kids.splice(Math.max(0, Math.min(index, kids.length)), 0, block);
      return { ...b, children: kids };
    }
    return b.children ? { ...b, children: insertBlock(b.children, parentId, index, block) } : b;
  });
}

export function duplicateBlockInTree(blocks: Block[], id: string): Block[] {
  const parent = findParent(blocks, id);
  const list = parent ? parent.children ?? [] : blocks;
  const index = list.findIndex((b) => b.id === id);
  const source = list[index];
  if (!source) return blocks;
  return insertBlock(blocks, parent ? parent.id : null, index + 1, cloneBlock(source));
}

export function moveBlock(blocks: Block[], id: string, parentId: string | null, index: number): Block[] {
  const source = findBlock(blocks, id);
  if (!source) return blocks;
  if (parentId && (parentId === id || isDescendant(source, parentId))) return blocks;
  const currentParent = findParent(blocks, id);
  const sameParent = (currentParent?.id ?? null) === parentId;
  const siblings = currentParent ? currentParent.children ?? [] : blocks;
  const from = siblings.findIndex((b) => b.id === id);
  const target = sameParent && from > -1 && from < index ? index - 1 : index;
  return insertBlock(removeBlock(blocks, id), parentId, target, source);
}

function isDescendant(block: Block, id: string): boolean {
  let hit = false;
  walk(block.children ?? [], (b) => {
    if (b.id === id) hit = true;
  });
  return hit;
}

/* -------------------------------- normalising ------------------------------- */

export function mergeTheme(raw: unknown): Theme {
  const t = (raw ?? {}) as Partial<Theme>;
  return { ...LIGHT_THEME, ...t };
}

const VALID_TYPES = new Set<string>(Object.keys(BLOCK_LABELS));

/** Defensive parse used for stored designs and for AI output. */
export function normalizeBlocks(raw: unknown, depth = 0): Block[] {
  if (!Array.isArray(raw) || depth > 6) return [];
  const out: Block[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const type = (item as any).type;
    if (!VALID_TYPES.has(type)) continue;
    const built = makeBlock(type as BlockType, {
      id: typeof (item as any).id === "string" && (item as any).id ? (item as any).id : uid(),
      content: typeof (item as any).content === "object" && (item as any).content ? (item as any).content : {},
      styles: typeof (item as any).styles === "object" && (item as any).styles ? (item as any).styles : {},
      settings: typeof (item as any).settings === "object" && (item as any).settings ? (item as any).settings : {},
    });
    if (isContainer(type)) {
      const kids = normalizeBlocks((item as any).children, depth + 1);
      built.children = kids.length || Array.isArray((item as any).children) ? kids : built.children;
    } else {
      delete built.children;
    }
    out.push(built);
  }
  return out;
}

export function findFormBlock(blocks: Block[]): Block | null {
  let form: Block | null = null;
  walk(blocks, (b) => {
    if (b.type === "form" && !form) form = b;
  });
  return form;
}

export function countBlocks(blocks: Block[]): number {
  let n = 0;
  walk(blocks, () => n++);
  return n;
}

/* ------------------------------ resolved styling ---------------------------- */

/** Style values may reference theme tokens, e.g. background: "surface". */
export function resolveColor(theme: Theme, value?: string): string | undefined {
  if (!value) return undefined;
  const tokens: Record<string, string> = {
    primary: theme.primary,
    primaryText: theme.primaryText,
    secondary: theme.secondary,
    background: theme.background,
    surface: theme.surface,
    text: theme.text,
    heading: theme.heading,
    muted: theme.muted,
    border: theme.border,
    transparent: "transparent",
  };
  return tokens[value] ?? value;
}

export function themeButtonStyle(theme: Theme, styles: Styles = {}): React.CSSProperties {
  const radius = theme.buttonStyle === "pill" ? 999 : (styles.radius ?? theme.buttonRadius);
  const bg = resolveColor(theme, styles.background) ?? theme.primary;
  const fg = resolveColor(theme, styles.color) ?? theme.primaryText;
  const common: React.CSSProperties = {
    borderRadius: radius,
    padding: `${styles.paddingY ?? 14}px ${styles.paddingX ?? 26}px`,
    fontSize: styles.fontSize ?? 16,
    fontWeight: styles.fontWeight ?? 700,
    cursor: "pointer",
    width: styles.width === "full" ? "100%" : undefined,
    fontFamily: FONT_STACKS[theme.bodyFont],
    transition: "transform .12s ease, opacity .12s ease",
  };
  if (theme.buttonStyle === "outline") return { ...common, background: "transparent", color: bg, border: `2px solid ${bg}` };
  if (theme.buttonStyle === "soft")
    return { ...common, background: `${bg}1f`, color: bg, border: `1px solid ${bg}55` };
  return { ...common, background: bg, color: fg, border: "none" };
}

export function inputStyle(theme: Theme): React.CSSProperties {
  return {
    width: "100%",
    padding: "12px 14px",
    borderRadius: theme.inputRadius,
    border: `1px solid ${theme.border}`,
    background: theme.surface,
    color: theme.heading,
    fontSize: 15,
    fontFamily: FONT_STACKS[theme.bodyFont],
    outline: "none",
  };
}
