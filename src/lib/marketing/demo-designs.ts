/**
 * Marketing-only demonstration designs. These are CUSTOMIZED COPIES built with
 * the real block schema and rendered by the real BlockCanvas. They never touch
 * the published template catalogue, saved customer designs or any backend, and
 * are always rendered non-interactive (no submissions, no links).
 */
import { BRAND_PRESETS, DARK_THEME, LIGHT_THEME, makeBlock, type Block, type Theme } from "@/lib/builder/schema";
import shopper from "@/assets/demo-retail-shopper.jpg.asset.json";

const preset = (id: string): Theme => BRAND_PRESETS.find((p) => p.id === id)?.theme ?? LIGHT_THEME;
const eyebrow = (t: string) =>
  makeBlock("text", { content: { text: t }, styles: { fontSize: 13, letterSpacing: 1.4, textTransform: "uppercase", color: "primary", fontWeight: 700, marginBottom: 12 } });
const h = (t: string, size: number, extra: Partial<Block["styles"]> = {}) =>
  makeBlock("heading", { content: { text: t, level: 1 }, styles: { fontSize: size, fontWeight: 800, marginBottom: 14, ...extra } });
const p = (t: string, extra: Partial<Block["styles"]> = {}) =>
  makeBlock("text", { content: { text: t }, styles: { fontSize: 17, marginBottom: 18, color: "muted", ...extra } });
const field = (kind: string, label: string, placeholder: string, required = false) =>
  makeBlock("field", { content: { kind, label, placeholder, required, help: "", options: [] } });
const form = (fields: Block[], cta: string, consentText: string, flat = false) =>
  makeBlock("form", {
    content: { successMessage: "Thanks!", successMode: "message", redirectUrl: "", consentText },
    styles: { columns: 1, mobileColumns: 1, gap: 12, paddingY: flat ? 0 : 24, paddingX: flat ? 0 : 24, background: flat ? "transparent" : "surface", shadow: !flat },
    children: [...fields, makeBlock("submit", { content: { label: cta }, styles: { width: "full", marginTop: 6 } })],
  });
const section = (children: Block[], styles: Partial<Block["styles"]> = {}) =>
  makeBlock("section", { styles: { paddingY: 64, paddingX: 28, ...styles }, children });

/* ------------------------- Landing page demonstration ------------------------ */

export const LANDING_DEMO = {
  basedOn: { slug: "product-promo", label: "Product promotion" },
  business: "Maison Row (sample boutique)",
  theme: { ...preset("retail"), primary: "#1f2937", buttonStyle: "pill", background: "#fbf8f4", surface: "#ffffff", border: "#ece5dc" } as Theme,
  blocks: [
    section(
      [
        makeBlock("columns", {
          styles: { columns: 2, mobileColumns: 1, gap: 40 },
          children: [
            makeBlock("column", {
              children: [
                eyebrow("Maison Row · 48 hours only"),
                h("The autumn edit, up to 40% off", 50, { lineHeight: 1.05 }),
                p("Coats, knitwear and leather goods from the new season. Text subscribers get an extra 15% at checkout.", { fontSize: 18 }),
                form(
                  [field("firstName", "First name", "Jane"), field("phone", "Mobile number", "+1 555 000 1234", true)],
                  "Text me my 15% code",
                  "By signing up you agree to receive recurring marketing texts from Maison Row. Consent is not a condition of purchase. Msg & data rates may apply. Reply STOP to opt out.",
                ),
              ],
            }),
            makeBlock("column", {
              children: [makeBlock("image", { content: { url: shopper.url, alt: "Shopper carrying bags along a boutique street" }, styles: { radius: 22, shadow: true } })],
            }),
          ],
        }),
      ],
      { paddingY: 56 },
    ),
    section(
      [
        h("Why shop the edit", 30, { align: "center", marginBottom: 26 }),
        makeBlock("features", {
          content: {
            items: [
              { icon: "🚚", title: "Free delivery", body: "On every order during the sale." },
              { icon: "↩️", title: "60-day returns", body: "Change your mind, send it back." },
              { icon: "🧥", title: "New-season stock", body: "Restocks texted to members first." },
            ],
          },
          styles: { columns: 3, mobileColumns: 1, gap: 22 },
        }),
      ],
      { paddingY: 56, background: "surface" },
    ),
    section(
      [
        h("Sale ends Sunday at midnight", 34, { align: "center", color: "#ffffff" }),
        p("Your 15% code arrives by text in seconds.", { align: "center", color: "#d1d5db" }),
        makeBlock("button", { content: { label: "Get my code", url: "#" }, styles: { align: "center" } }),
      ],
      { paddingY: 60, background: "#111827", align: "center" },
    ),
  ] as Block[],
};

/* ------------------------- Sign-up form demonstration ------------------------ */

const CAFE_CONSENT =
  "By joining you agree to receive recurring marketing texts from Corner Café at this number. Consent is not a condition of purchase. Msg & data rates may apply. Reply STOP to opt out, HELP for help.";

function cafeForm(): Block[] {
  return [
    section(
      [
        eyebrow("Corner Café coffee club"),
        h("Your tenth coffee is on us", 34, { lineHeight: 1.1 }),
        p("Join by text for a free drink after nine visits, plus first word on seasonal menus.", { fontSize: 16 }),
        form([field("firstName", "First name", "Jane"), field("phone", "Mobile number", "+1 555 000 1234", true)], "Join the coffee club", CAFE_CONSENT),
      ],
      { paddingY: 32, paddingX: 26 },
    ),
  ];
}

export const FORM_DEMO = {
  basedOn: { slug: "newsletter", label: "Newsletter signup" },
  business: "Corner Café (sample business)",
  theme: preset("boutique"),
  altTheme: { ...DARK_THEME, primary: "#d6a36a", primaryText: "#1a120b", background: "#15110d", surface: "#211a14", border: "#3a2e24", headingFont: "serif", buttonStyle: "pill", buttonRadius: 999 } as Theme,
  blocks: cafeForm(),
};
