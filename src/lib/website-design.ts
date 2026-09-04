// Shared design tokens + section model for hosted landing pages and sign-up forms.
// Used by the in-app editor (live preview) and by the public pages, so both
// always render identically.

export type FontKey = "sans" | "grotesk" | "serif" | "slab" | "rounded" | "mono";

export const FONT_STACKS: Record<FontKey, string> = {
  sans: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif',
  grotesk: '"Helvetica Neue", Helvetica, Arial, ui-sans-serif, system-ui, sans-serif',
  serif: 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif',
  slab: '"Rockwell", "Courier Bold", Georgia, ui-serif, serif',
  rounded: '"Avenir Next", "Trebuchet MS", ui-rounded, ui-sans-serif, system-ui, sans-serif',
  mono: 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
};

export const FONT_LABELS: Record<FontKey, string> = {
  sans: "Clean sans",
  grotesk: "Neutral grotesk",
  serif: "Classic serif",
  slab: "Bold slab",
  rounded: "Friendly rounded",
  mono: "Technical mono",
};

export type Design = {
  accent: string;
  accentText: string;
  background: string;
  surface: string;
  text: string;
  muted: string;
  border: string;
  font: FontKey;
  headingFont: FontKey;
  headingScale: number; // 0.85 – 1.35
  radius: number; // px
  width: "narrow" | "regular" | "wide";
  buttonStyle: "solid" | "outline" | "pill";
  shadow: boolean;
};

export const LIGHT_DESIGN: Design = {
  accent: "#111827",
  accentText: "#ffffff",
  background: "#f8fafc",
  surface: "#ffffff",
  text: "#0f172a",
  muted: "#64748b",
  border: "#e2e8f0",
  font: "sans",
  headingFont: "sans",
  headingScale: 1,
  radius: 16,
  width: "regular",
  buttonStyle: "solid",
  shadow: true,
};

export const DARK_DESIGN: Design = {
  ...LIGHT_DESIGN,
  accent: "#f59e0b",
  accentText: "#1c1917",
  background: "#0b1120",
  surface: "#111a2e",
  text: "#f8fafc",
  muted: "#94a3b8",
  border: "#1f2b45",
};

export type LayoutPreset = {
  id: string;
  label: string;
  blurb: string;
  design: Partial<Design>;
};

export const LAYOUT_PRESETS: LayoutPreset[] = [
  { id: "clean", label: "Clean light", blurb: "White cards, soft grey page.", design: { ...LIGHT_DESIGN } },
  { id: "midnight", label: "Midnight", blurb: "Dark page, warm accent.", design: { ...DARK_DESIGN } },
  {
    id: "editorial",
    label: "Editorial",
    blurb: "Serif headings, generous width.",
    design: { ...LIGHT_DESIGN, headingFont: "serif", headingScale: 1.15, width: "wide", radius: 6, shadow: false },
  },
  {
    id: "bold",
    label: "Bold retail",
    blurb: "Big type, pill buttons, hot accent.",
    design: { ...LIGHT_DESIGN, accent: "#e11d48", headingScale: 1.25, buttonStyle: "pill", radius: 24 },
  },
  {
    id: "boutique",
    label: "Boutique",
    blurb: "Warm cream with outline buttons.",
    design: {
      ...LIGHT_DESIGN,
      background: "#faf5ef",
      surface: "#fffdf9",
      accent: "#7c2d12",
      border: "#ead9c6",
      headingFont: "serif",
      buttonStyle: "outline",
      radius: 10,
    },
  },
  {
    id: "tech",
    label: "Tech mono",
    blurb: "Mono details on deep navy.",
    design: { ...DARK_DESIGN, accent: "#38bdf8", accentText: "#04121f", font: "mono", radius: 8, shadow: false },
  },
];

/* ---------------------------------- sections --------------------------------- */

export type SectionBase = { id: string };

export type Section =
  | (SectionBase & {
      type: "hero";
      headline: string;
      subheadline: string;
      body: string;
      imageUrl: string;
      align: "left" | "center";
      showForm: boolean;
    })
  | (SectionBase & { type: "text"; heading: string; body: string })
  | (SectionBase & { type: "image"; url: string; alt: string; caption: string })
  | (SectionBase & { type: "features"; heading: string; items: { title: string; body: string }[] })
  | (SectionBase & { type: "quote"; text: string; author: string })
  | (SectionBase & { type: "faq"; heading: string; items: { q: string; a: string }[] })
  | (SectionBase & { type: "signup"; heading: string; note: string })
  | (SectionBase & { type: "footer"; text: string });

export type SectionType = Section["type"];

export const SECTION_LABELS: Record<SectionType, string> = {
  hero: "Hero (headline + sign-up box)",
  text: "Text block",
  image: "Image",
  features: "Three benefits",
  quote: "Customer quote",
  faq: "Questions & answers",
  signup: "Sign-up box",
  footer: "Small print / footer",
};

export const newId = () => Math.random().toString(36).slice(2, 10);

export function blankSection(type: SectionType): Section {
  const id = newId();
  switch (type) {
    case "hero":
      return {
        id,
        type: "hero",
        headline: "Get 15% off your first order",
        subheadline: "Join our text list for early access to drops and deals.",
        body: "",
        imageUrl: "",
        align: "left",
        showForm: true,
      };
    case "text":
      return { id, type: "text", heading: "Why join?", body: "Tell people what they get and how often you'll text." };
    case "image":
      return { id, type: "image", url: "", alt: "", caption: "" };
    case "features":
      return {
        id,
        type: "features",
        heading: "What you get",
        items: [
          { title: "Early access", body: "Shop drops before anyone else." },
          { title: "Member pricing", body: "Text-only offers, every month." },
          { title: "No spam", body: "Two or three messages, that's it." },
        ],
      };
    case "quote":
      return { id, type: "quote", text: "I found out about the sale by text and saved £40.", author: "Happy customer" };
    case "faq":
      return {
        id,
        type: "faq",
        heading: "Questions",
        items: [
          { q: "How often will you text me?", a: "Two or three times a month." },
          { q: "How do I stop?", a: "Reply STOP to any message." },
        ],
      };
    case "signup":
      return { id, type: "signup", heading: "Join the list", note: "" };
    case "footer":
      return { id, type: "footer", text: "© Your brand. Reply STOP to opt out, HELP for help." };
  }
}

/* ---------------------------------- helpers ---------------------------------- */

export function mergeDesign(raw: unknown): Design {
  const d = (raw ?? {}) as Partial<Design>;
  return { ...LIGHT_DESIGN, ...d };
}

export function parseSections(raw: unknown): Section[] {
  return Array.isArray(raw) ? (raw as Section[]).filter((s) => s && typeof s === "object" && "type" in s) : [];
}

export const MAX_WIDTH: Record<Design["width"], string> = {
  narrow: "42rem",
  regular: "60rem",
  wide: "76rem",
};

export function designVars(d: Design): React.CSSProperties {
  return {
    background: d.background,
    color: d.text,
    fontFamily: FONT_STACKS[d.font] ?? FONT_STACKS.sans,
  };
}

export function buttonStyle(d: Design): React.CSSProperties {
  const radius = d.buttonStyle === "pill" ? 999 : Math.min(d.radius, 18);
  if (d.buttonStyle === "outline") {
    return { background: "transparent", color: d.accent, border: `2px solid ${d.accent}`, borderRadius: radius };
  }
  return { background: d.accent, color: d.accentText, border: "none", borderRadius: radius };
}

export function headingStyle(d: Design, base: number): React.CSSProperties {
  return { fontFamily: FONT_STACKS[d.headingFont] ?? FONT_STACKS.sans, fontSize: `${base * d.headingScale}rem`, lineHeight: 1.1 };
}
