import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PRODUCT_PAGES } from "./product-pages";
import { templateCount, PUBLIC_TEMPLATES } from "@/lib/marketing/template-catalog";

const statFor = (page: string, label: string) => PRODUCT_PAGES[page].stats.find((s) => s.label === label)?.value;

describe("displayed template totals follow the published catalogue", () => {
  it("landing pages stat, feature copy match the catalogue", () => {
    const n = PUBLIC_TEMPLATES.filter((t) => t.category === "landing-pages").length;
    expect(statFor("landing-pages", "landing page templates")).toBe(String(n));
    expect(PRODUCT_PAGES["landing-pages"].features.some((f) => f.text.startsWith(`${n} real multi-section pages`))).toBe(true);
  });
  it("sign-up forms stat and SEO description match the catalogue", () => {
    const n = PUBLIC_TEMPLATES.filter((t) => t.category === "sign-up-forms").length;
    expect(statFor("signup-forms", "form templates")).toBe(String(n));
    expect(PRODUCT_PAGES["signup-forms"].seoDescription).toContain(`${n} templates`);
  });
  it("automations stat matches the catalogue", () => {
    expect(statFor("automations", "ready-made automation templates")).toBe(String(templateCount("automations")));
  });
  it("no public page hardcodes a template total", () => {
    const files = [
      ...readdirSync("src/routes").filter((f) => !f.includes("_authenticated") && f.endsWith(".tsx")).map((f) => join("src/routes", f)),
      ...readdirSync("src/components/marketing").filter((f) => /\.tsx?$/.test(f) && !f.endsWith(".test.ts")).map((f) => join("src/components/marketing", f)),
    ];
    const bad = /(["'`>]\s*\d+\+?\s*(real |ready-made )?(landing page |form |automation |sign-up form )?templates)|value:\s*"\d+",\s*label:\s*"[^"]*templates"/i;
    const hits = files.filter((f) => bad.test(readFileSync(f, "utf8")));
    expect(hits).toEqual([]);
  });
});
