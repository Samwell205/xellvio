import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { motion } from "framer-motion";
import cafe from "@/assets/gallery-cafe.jpg";
import { LANDING_DEMO, FORM_DEMO } from "@/lib/marketing/demo-designs";
import { CATEGORY_META, templateCount, templatesInCategory, type TemplateCategory } from "@/lib/marketing/template-catalog";
import { BrowserFrame, DesignRender, PhoneFrame } from "./DesignRender";
import { TemplatePreview } from "./TemplatePreview";
import { reveal } from "./ProductKit";

function Caption({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{children}</p>;
}

/* ------------------------------- Landing pages ------------------------------- */

export function LandingHeroVisual() {
  return (
    <figure>
      <div className="relative">
        <BrowserFrame url="maisonrow.example/autumn-edit">
          <DesignRender
            blocks={LANDING_DEMO.blocks}
            theme={LANDING_DEMO.theme}
            renderWidth={1100}
            clipHeight={760}
            label="Finished landing page for a sample boutique: autumn sale headline, sign-up form for a 15% code and a street-style shopping photo"
          />
        </BrowserFrame>
        <PhoneFrame className="absolute -bottom-8 -right-2 hidden w-[150px] md:block xl:-right-6">
          <DesignRender blocks={LANDING_DEMO.blocks} theme={LANDING_DEMO.theme} device="mobile" renderWidth={390} clipHeight={720} label="The same page on a phone" />
        </PhoneFrame>
      </div>
      <figcaption className="mt-10 text-xs text-muted-foreground">
        Customized example based on the{" "}
        <Link to="/templates/$category/$slug" params={{ category: "landing-pages", slug: LANDING_DEMO.basedOn.slug }} className="font-semibold text-foreground underline">
          {LANDING_DEMO.basedOn.label} template
        </Link>
        . Sample business and copy, drawn by the Xellvio page renderer.
      </figcaption>
    </figure>
  );
}

const LANDING_POINTS = [
  { t: "Sections stack on phones", d: "Columns fold into one readable column automatically." },
  { t: "Your photos, your colours", d: "Image blocks and brand settings restyle the whole page." },
  { t: "The form is built in", d: "Each sign-up arrives in Xellvio as a contact." },
];

export function LandingExperience() {
  return (
    <section id="experience" className="scroll-mt-32 bg-ink py-20 text-ink-foreground">
      <div className="mx-auto grid max-w-[1200px] items-center gap-12 px-5 sm:px-8 md:grid-cols-[minmax(0,320px)_1fr] lg:gap-20">
        <motion.figure {...reveal} className="mx-auto w-full max-w-[300px]">
          <PhoneFrame className="border-ink-foreground/20">
            <DesignRender blocks={LANDING_DEMO.blocks} theme={LANDING_DEMO.theme} device="mobile" renderWidth={390} clipHeight={1180} label="Mobile design preview of the boutique page: headline, form, photo and delivery benefits" />
          </PhoneFrame>
          <figcaption className="mt-3 text-center text-xs text-ink-foreground/70">Design preview at phone width, same example page</figcaption>
        </motion.figure>
        <motion.div {...reveal}>
          <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">One design. Every screen.</h2>
          <p className="mt-5 max-w-xl leading-relaxed text-ink-foreground/75">
            You build the page once in the visual builder. Xellvio publishes it on a shareable link and reflows it for phones, where most text-message visitors land.
          </p>
          <dl className="mt-10 space-y-6">
            {LANDING_POINTS.map((x) => (
              <div key={x.t} className="border-l-2 border-lime pl-4">
                <dt className="font-bold">{x.t}</dt>
                <dd className="mt-1 text-sm text-ink-foreground/70">{x.d}</dd>
              </div>
            ))}
          </dl>
        </motion.div>
      </div>
    </section>
  );
}

/* ------------------------------- Sign-up forms ------------------------------- */

export function FormHeroVisual() {
  return (
    <figure>
      <div className="relative grid gap-4 sm:grid-cols-[1fr_1fr] sm:items-center">
        <div className="relative overflow-hidden rounded-[28px]">
          <img src={cafe} alt="Barista smiling behind a café counter" className="aspect-[4/3] w-full object-cover object-[50%_25%] sm:aspect-[3/4]" />
          <span className="absolute left-3 top-3 rounded-full bg-background/90 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-foreground">Illustrative setting</span>
        </div>
        <div className="sm:-ml-16 lg:-ml-20">
          <div className="overflow-hidden rounded-2xl border border-border shadow-2xl">
            <DesignRender
              blocks={FORM_DEMO.blocks}
              theme={FORM_DEMO.theme}
              device="mobile"
              renderWidth={400}
              clipHeight={560}
              label="Café coffee-club sign-up form with first name and mobile number fields, a Join the coffee club button and text-message consent wording"
            />
          </div>
        </div>
      </div>
      <figcaption className="mt-4 text-xs text-muted-foreground">
        Customized example based on the{" "}
        <Link to="/templates/$category/$slug" params={{ category: "sign-up-forms", slug: FORM_DEMO.basedOn.slug }} className="font-semibold text-foreground underline">
          {FORM_DEMO.basedOn.label} template
        </Link>
        . Sample café; the photo shows context, not a customer website.
      </figcaption>
    </figure>
  );
}

const FORM_POINTS = [
  { t: "Fields", d: "Name, phone, email, dates, dropdowns, checkboxes and more." },
  { t: "Styling", d: "Fonts, colours, corners and button style follow your brand." },
  { t: "Consent wording", d: "Edit the wording shown under the button to match your programme." },
  { t: "Mobile", d: "Every form is sized for a phone first." },
];

export function FormExperience() {
  return (
    <section id="experience" className="scroll-mt-32 border-y border-border bg-sand py-20">
      <div className="mx-auto max-w-[1200px] px-5 sm:px-8">
        <motion.div {...reveal} className="max-w-2xl">
          <h2 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">Same form, your style</h2>
          <p className="mt-5 leading-relaxed text-muted-foreground">
            The café form from above, restyled with two built-in brand settings. Fields and consent wording stay the same; only the look changes.
          </p>
        </motion.div>
        <div className="mt-12 grid items-start gap-10 lg:grid-cols-[1fr_1fr_0.9fr]">
          {[
            { theme: FORM_DEMO.theme, name: "Boutique cream" },
            { theme: FORM_DEMO.altTheme, name: "Dark, serif headings" },
          ].map((v) => (
            <motion.figure key={v.name} {...reveal} className="mx-auto w-full max-w-[340px]">
              <PhoneFrame>
                <DesignRender blocks={FORM_DEMO.blocks} theme={v.theme} device="mobile" renderWidth={390} clipHeight={620} label={`Coffee-club form styled as ${v.name}`} />
              </PhoneFrame>
              <figcaption className="mt-3 text-center text-xs text-muted-foreground">Design preview · {v.name}</figcaption>
            </motion.figure>
          ))}
          <motion.dl {...reveal} className="grid gap-6 sm:grid-cols-2 lg:grid-cols-1">
            {FORM_POINTS.map((x) => (
              <div key={x.t} className="border-l-2 border-primary pl-4">
                <dt className="font-bold text-foreground">{x.t}</dt>
                <dd className="mt-1 text-sm text-muted-foreground">{x.d}</dd>
              </div>
            ))}
          </motion.dl>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------ Template trio ------------------------------- */

export function TemplateTrio({ category, slugs }: { category: TemplateCategory; slugs: string[] }) {
  const all = templatesInCategory(category);
  const picks = slugs.map((s) => all.find((t) => t.slug === s)).filter((t): t is NonNullable<typeof t> => !!t);
  const meta = CATEGORY_META[category];
  return (
    <section id="templates" className="scroll-mt-32 bg-background py-20">
      <div className="mx-auto max-w-[1400px] px-5 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">Start from a template</h2>
            <p className="mt-3 max-w-xl text-muted-foreground">Unchanged previews of published templates. Each opens in the builder ready to edit.</p>
          </div>
          <Link to={meta.path} className="inline-flex items-center gap-1.5 font-semibold text-foreground underline">
            Browse all {templateCount(category)} templates <ArrowRight className="size-4" />
          </Link>
        </div>
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {picks.map((t) => (
            <div key={t.slug} className="rounded-2xl border border-border bg-card p-3">
              <TemplatePreview category={category} slug={t.slug} label={t.label} />
              <div className="flex items-center justify-between gap-3 px-1 pb-1 pt-4">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Template preview</p>
                  <h3 className="font-bold text-foreground">{t.label}</h3>
                </div>
                <Link
                  to="/templates/$category/$slug"
                  params={{ category, slug: t.slug }}
                  className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border px-3 py-1.5 text-sm font-semibold text-foreground hover:bg-muted"
                >
                  Preview template <span className="sr-only">{t.label}</span>
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
