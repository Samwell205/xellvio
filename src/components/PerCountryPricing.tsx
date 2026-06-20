import { useState, useMemo } from "react";
import { ChevronDown, Globe, Search } from "lucide-react";

export type CountryRate = {
  country: string;
  code: string;
  dial: string;
  perSms: number;
  mmsMult: number;
  inbound: boolean;
  status: "Active" | "Inactive";
};

export const COUNTRY_RATES: CountryRate[] = [
  { country: "Australia", code: "AU", dial: "+61", perSms: 0.0728, mmsMult: 3, inbound: true, status: "Active" },
  { country: "Brazil", code: "BR", dial: "+55", perSms: 0.0476, mmsMult: 3, inbound: false, status: "Active" },
  { country: "Canada", code: "CA", dial: "+1", perSms: 0.0116, mmsMult: 3, inbound: true, status: "Active" },
  { country: "France", code: "FR", dial: "+33", perSms: 0.1050, mmsMult: 3, inbound: false, status: "Active" },
  { country: "Germany", code: "DE", dial: "+49", perSms: 0.1246, mmsMult: 3, inbound: false, status: "Active" },
  { country: "India", code: "IN", dial: "+91", perSms: 0.0090, mmsMult: 3, inbound: false, status: "Active" },
  { country: "Italy", code: "IT", dial: "+39", perSms: 0.1092, mmsMult: 3, inbound: false, status: "Active" },
  { country: "Netherlands", code: "NL", dial: "+31", perSms: 0.1176, mmsMult: 3, inbound: false, status: "Active" },
  { country: "Nigeria", code: "NG", dial: "+234", perSms: 0.0574, mmsMult: 3, inbound: false, status: "Active" },
  { country: "South Africa", code: "ZA", dial: "+27", perSms: 0.0483, mmsMult: 3, inbound: false, status: "Active" },
  { country: "Spain", code: "ES", dial: "+34", perSms: 0.0952, mmsMult: 3, inbound: false, status: "Active" },
  { country: "Sweden", code: "SE", dial: "+46", perSms: 0.1064, mmsMult: 3, inbound: false, status: "Active" },
  { country: "United Arab Emirates", code: "AE", dial: "+971", perSms: 0.0868, mmsMult: 3, inbound: false, status: "Active" },
  { country: "United Kingdom", code: "GB", dial: "+44", perSms: 0.0574, mmsMult: 3, inbound: true, status: "Active" },
  { country: "United States", code: "US", dial: "+1", perSms: 0.0116, mmsMult: 3, inbound: true, status: "Active" },
];

export function PerCountryPricing({ rates = COUNTRY_RATES }: { rates?: CountryRate[] }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return rates;
    return rates.filter(r =>
      r.country.toLowerCase().includes(t) ||
      r.code.toLowerCase().includes(t) ||
      r.dial.includes(t)
    );
  }, [q, rates]);

  return (
    <section className="bg-background py-16" id="per-country-pricing">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <button
            onClick={() => setOpen(o => !o)}
            className="w-full flex items-center justify-between px-6 py-5 text-left hover:bg-muted/50 transition-colors"
            aria-expanded={open}
          >
            <div className="flex items-center gap-3">
              <Globe className="size-5 text-muted-foreground" />
              <span className="font-bold text-foreground text-lg">Per-country pricing</span>
              <span className="text-sm text-muted-foreground hidden sm:inline">— {rates.length} countries</span>
            </div>
            <ChevronDown className={`size-5 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
          </button>

          {open && (
            <div className="border-t border-border">
              <div className="p-4 sm:p-6 border-b border-border">
                <div className="relative max-w-md ml-auto">
                  <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="search"
                    value={q}
                    onChange={e => setQ(e.target.value)}
                    placeholder="Search country or dial prefix"
                    className="w-full rounded-full border border-border bg-background pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/40 text-[11px] uppercase tracking-widest text-muted-foreground">
                      <th className="text-left px-6 py-3 font-medium">Country</th>
                      <th className="text-left px-4 py-3 font-medium">Dial</th>
                      <th className="text-left px-4 py-3 font-medium">Per SMS</th>
                      <th className="text-left px-4 py-3 font-medium">MMS ×</th>
                      <th className="text-left px-4 py-3 font-medium">Inbound</th>
                      <th className="text-left px-4 py-3 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(r => (
                      <tr key={r.code} className="border-t border-border">
                        <td className="px-6 py-4">
                          <div className="font-semibold text-foreground">{r.country}</div>
                          <div className="text-xs text-muted-foreground">{r.code}</div>
                        </td>
                        <td className="px-4 py-4 text-foreground">{r.dial}</td>
                        <td className="px-4 py-4 text-foreground">${r.perSms.toFixed(4)}</td>
                        <td className="px-4 py-4 text-muted-foreground">×{r.mmsMult.toFixed(1)}</td>
                        <td className="px-4 py-4">
                          <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${r.inbound ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground"}`}>
                            {r.inbound ? "Yes" : "No"}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          <span className="inline-flex items-center rounded-full bg-foreground text-background px-3 py-1 text-xs font-medium">
                            {r.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {rows.length === 0 && (
                      <tr><td colSpan={6} className="px-6 py-10 text-center text-muted-foreground">No matches</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
