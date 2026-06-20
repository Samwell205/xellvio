import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { COUNTRY_RATES, type CountryRate } from "./PerCountryPricing";

const GSM_REGEX = /^[A-Za-z0-9 \r\n@£$¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ!"#¤%&'()*+,\-./:;<=>?¡ÄÖÑÜ§¿äöñüà^{}\\\[~\]|€]*$/;

function segmentInfo(text: string) {
  const isGsm = GSM_REGEX.test(text);
  const len = text.length;
  const single = isGsm ? 160 : 70;
  const multi = isGsm ? 153 : 67;
  if (len === 0) return { parts: 1, used: 0, cap: single, isGsm };
  if (len <= single) return { parts: 1, used: len, cap: single, isGsm };
  const parts = Math.ceil(len / multi);
  return { parts, used: len, cap: parts * multi, isGsm };
}

const TEMPLATES: Record<string, string> = {
  "Order confirmation": "Hi {name}, your order #{order} has been confirmed! We'll text you when it ships.",
  "Shipping confirmation": "Good news {name} — order #{order} just shipped. Track it here: {link}",
  "Cart abandonment": "Hey {name}, you left something behind! Complete your order now: {link}",
  "Welcome message": "Welcome to {brand}! Reply STOP to opt out. Enjoy 10% off with code WELCOME10.",
  "Booking confirmation": "Hi {name}, your booking on {date} is confirmed. See you soon!",
};

export function SmsCalculator({ rates = COUNTRY_RATES }: { rates?: CountryRate[] }) {
  const [country, setCountry] = useState("US");
  const [text, setText] = useState("");
  const [contacts, setContacts] = useState(1);

  const rate = rates.find(c => c.code === country) ?? rates[0] ?? COUNTRY_RATES[0];
  const seg = useMemo(() => segmentInfo(text), [text]);
  const costPer = seg.parts * rate.perSms;
  const total = costPer * Math.max(0, contacts || 0);

  return (
    <section className="bg-muted py-20" id="sms-calculator">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="text-center max-w-3xl mx-auto">
          <h2 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-foreground">SMS length & pricing calculator</h2>
          <p className="mt-4 text-muted-foreground text-lg">
            Count the characters in your text message, estimate the sending costs, and preview your SMS campaign.
          </p>
        </div>

        <div className="mt-12 grid lg:grid-cols-[1.4fr_1fr] gap-6">
          <div className="bg-card rounded-2xl border border-border p-6 sm:p-8">
            <label className="block font-bold text-foreground mb-3">Message</label>
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="Copy and paste your text, or write it here"
              rows={7}
              className="w-full rounded-xl border border-border bg-background p-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 resize-y"
            />
            <div className="mt-3 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                Characters: <span className="font-semibold text-foreground">{seg.used}/{seg.cap}</span>
                <span className="ml-2 text-xs">({seg.isGsm ? "GSM-7" : "Unicode"})</span>
              </span>
              <span className="rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-semibold">
                Parts: {seg.parts}
              </span>
            </div>

            <div className="mt-8">
              <div className="font-bold text-foreground mb-3">Choose a template</div>
              <div className="flex flex-wrap gap-2">
                {Object.keys(TEMPLATES).map(name => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => setText(TEMPLATES[name])}
                    className="rounded-lg border border-border bg-background hover:bg-muted px-4 py-2 text-sm text-foreground transition-colors"
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-primary/10 rounded-2xl p-6 sm:p-8 flex flex-col">
            <select
              value={country}
              onChange={e => setCountry(e.target.value)}
              className="w-full rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              {rates.map(c => (
                <option key={c.code} value={c.code}>{c.country}</option>
              ))}
            </select>

            <div className="mt-8 text-center">
              <div className="text-sm font-semibold text-foreground">Cost to send SMS</div>
              <div className="mt-3 text-5xl sm:text-6xl font-extrabold text-foreground tracking-tight">
                ${costPer.toFixed(3)}
              </div>
              <div className="mt-2 text-xs text-muted-foreground">
                {rate.dial} · ${rate.perSms.toFixed(4)} per segment
              </div>
            </div>

            <div className="mt-6 pt-6 border-t border-border/60 space-y-3">
              <label className="flex items-center justify-between gap-3 text-sm">
                <span className="text-foreground">Number of contacts</span>
                <input
                  type="number"
                  min={1}
                  value={contacts}
                  onChange={e => setContacts(parseInt(e.target.value || "0", 10))}
                  className="w-24 rounded-md border border-border bg-card px-3 py-1.5 text-right text-foreground"
                />
              </label>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Total campaign cost</span>
                <span className="font-bold text-foreground">${total.toFixed(3)}</span>
              </div>
            </div>

            <Link
              to="/auth"
              className="mt-6 w-full inline-flex items-center justify-center bg-foreground text-background hover:bg-foreground/90 rounded-xl px-5 py-3 font-semibold transition-colors"
            >
              Start free
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
