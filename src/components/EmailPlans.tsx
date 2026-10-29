import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { CONTACT_STEPS, FIRST_MONTHS_DISCOUNT, FREE_PLAN, emailPlanFor } from "@/lib/email-plans";

const fmt = (n: number) => n.toLocaleString("en-US");
const money = (n: number) => `$${n.toFixed(2)}`;

export function EmailPlans() {
  const [idx, setIdx] = useState(1);
  const [promo, setPromo] = useState(true);
  const contacts = CONTACT_STEPS[idx];
  const plan = emailPlanFor(contacts);
  const price = (p: number) => (promo ? p * (1 - FIRST_MONTHS_DISCOUNT) : p);

  const cards = [
    {
      name: "Free", price: 0, old: null as number | null, cta: "Start free",
      note: "No cost. No credit card required.",
      features: [`${fmt(FREE_PLAN.emails)} emails / month`, `${fmt(FREE_PLAN.contacts)} contacts`, "Signup forms & popups", "Email templates", "24/7 support"],
    },
    {
      name: "Standard", price: plan.standard.price, old: plan.standard.price, cta: "Get Standard",
      note: "Billed monthly",
      features: [`${fmt(plan.standard.emails)} emails / month`, `${fmt(plan.standard.contacts)} contacts`, "Your own sending domain", "Automations & templates", "Email + SMS in one builder", "24/7 support"],
    },
    {
      name: "Pro", price: plan.pro.price, old: plan.pro.price, cta: "Get Pro", popular: true,
      note: "Billed monthly",
      features: ["Unlimited emails", `${fmt(plan.pro.contacts)} contacts`, "Advanced reporting", "Advanced segmentation", "AI-designed emails & forms", "Priority support"],
    },
  ];

  return (
    <section className="bg-muted/40 py-16">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-primary">Email marketing</p>
          <h2 className="mt-2 text-3xl md:text-4xl font-extrabold tracking-tight">Plans that grow with your list</h2>
        </div>

        <div className="mx-auto mt-8 max-w-2xl rounded-2xl border bg-card p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <span className="font-semibold">List size</span>
              <p className="text-sm text-muted-foreground">How many people are you sending to?</p>
            </div>
            <select
              aria-label="Choose list size"
              value={idx}
              onChange={(e) => setIdx(Number(e.target.value))}
              className="h-11 min-w-44 rounded-lg border bg-background px-3 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {CONTACT_STEPS.map((step, i) => (
                <option key={step} value={i}>
                  {i === 0 ? `0 - ${fmt(step)}` : `${fmt(CONTACT_STEPS[i - 1] + 1)} - ${fmt(step)}`}
                </option>
              ))}
            </select>
          </div>
          <Slider className="mt-5" min={0} max={CONTACT_STEPS.length - 1} step={1} value={[idx]} onValueChange={(v) => setIdx(v[0])} aria-label="Contacts" />
          <label className="mt-5 flex items-center justify-end gap-2 text-sm">
            <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">-30%</span>
            First 3 months discount
            <Switch checked={promo} onCheckedChange={setPromo} />
          </label>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {cards.map((c) => (
            <div key={c.name} className={`relative flex flex-col rounded-2xl border bg-card p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg ${c.popular ? "border-primary ring-1 ring-primary" : ""}`}>
              {c.popular && <span className="absolute -top-3 left-6 rounded-md bg-primary px-2 py-1 text-xs font-semibold text-primary-foreground">Most popular</span>}
              <h3 className="text-2xl font-bold">{c.name}</h3>
              <div className="mt-4 flex items-baseline gap-1">
                <span key={`${c.price}-${promo}`} className="text-4xl font-extrabold tabular-nums animate-in fade-in slide-in-from-bottom-1">{c.price === 0 ? "$0" : money(price(c.price))}</span>
                <span className="text-muted-foreground">/mo</span>
              </div>
              <p className="mt-1 min-h-5 text-xs text-muted-foreground">
                {c.old && promo ? <><span className="line-through">{money(c.old)}</span> for first 3 months, then {money(c.old)}/mo</> : c.note}
              </p>
              <Link to="/auth" search={{ mode: "signup" } as never} className={`mt-6 inline-flex h-11 items-center justify-center rounded-lg border font-medium transition-colors ${c.popular ? "bg-primary text-primary-foreground border-primary hover:opacity-90" : "border-foreground hover:bg-foreground hover:text-background"}`}>
                {c.cta}
              </Link>
              <ul className="mt-6 space-y-2 border-t pt-6 text-sm">
                {c.features.map((f) => (
                  <li key={f} className="flex items-start gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />{f}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="mt-6 text-center text-sm text-muted-foreground">Text messages are billed separately, pay as you go — see SMS pricing below.</p>
      </div>
    </section>
  );
}
