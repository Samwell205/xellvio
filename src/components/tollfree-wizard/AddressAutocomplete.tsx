import { useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { COUNTRIES } from "@/lib/countries";

export type PickedAddress = {
  line1: string;
  city: string;
  state: string;
  zip: string;
  country: string;
};

type Suggestion = PickedAddress & { label: string };

export function AddressAutocomplete({
  value,
  onChange,
  onPick,
}: {
  value: string;
  onChange: (v: string) => void;
  onPick: (a: PickedAddress) => void;
}) {
  const [items, setItems] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reqId = useRef(0);

  const search = (q: string) => {
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 4) {
      setItems([]);
      setOpen(false);
      return;
    }
    timer.current = setTimeout(async () => {
      const id = ++reqId.current;
      setLoading(true);
      try {
        const res = await fetch(
          `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=6&lang=en&layer=house&layer=street`,
        );
        const json = (await res.json()) as { features?: Array<{ properties: Record<string, string> }> };
        if (id !== reqId.current) return;
        const list = (json.features ?? [])
          .map((f) => {
            const p = f.properties;
            const street = [p.housenumber, p.street ?? p.name].filter(Boolean).join(" ");
            const city = p.city ?? p.town ?? p.village ?? p.district ?? p.county ?? "";
            return {
              label: [street, city, p.state, p.postcode, p.country].filter(Boolean).join(", "),
              line1: street,
              city,
              state: p.state ?? "",
              zip: p.postcode ?? "",
              country: (p.countrycode ?? "").toUpperCase(),
            };
          })
          .filter((s) => s.line1 && COUNTRIES.some((c) => c.iso === s.country));
        setItems(list);
        setOpen(list.length > 0);
      } catch {
        setItems([]);
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    }, 350);
  };

  return (
    <div className="relative">
      <Input
        value={value}
        autoComplete="off"
        onChange={(e) => {
          onChange(e.target.value);
          search(e.target.value);
        }}
        onFocus={() => items.length > 0 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Start typing your address…"
      />
      {loading && (
        <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
      )}
      {open && (
        <ul className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-md border bg-popover text-popover-foreground shadow-lg">
          {items.map((s, i) => (
            <li key={i}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onPick(s);
                  setOpen(false);
                }}
                className="w-full px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
              >
                {s.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
