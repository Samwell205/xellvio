import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { MapPin } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { suggestAddresses, getAddressDetails, type AddressParts } from "@/lib/address-autocomplete.functions";
import { Input } from "@/components/ui/input";

type Suggestion = { placeId: string; text: string };

export function AddressAutocomplete({ value, onChange, onPick, placeholder }: { value: string; onChange: (v: string) => void; onPick?: (p: AddressParts) => void; placeholder?: string }) {
  const suggest = useServerFn(suggestAddresses);
  const details = useServerFn(getAddressDetails);
  const [items, setItems] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const typed = useRef(false);
  const token = useRef<string>("");
  const reqId = useRef(0);

  useEffect(() => {
    if (!typed.current) return;
    const q = value.trim();
    if (q.length < 3) { setItems([]); return; }
    if (!token.current) token.current = crypto.randomUUID();
    const id = ++reqId.current;
    const t = setTimeout(async () => {
      try {
        const r = await suggest({ data: { input: q, sessionToken: token.current } });
        if (id !== reqId.current) return;
        setItems(r.suggestions); setOpen(r.suggestions.length > 0); setActive(-1);
      } catch { /* keep typing usable */ }
    }, 300);
    return () => clearTimeout(t);
  }, [value, suggest]);

  async function pick(s: Suggestion) {
    typed.current = false;
    setOpen(false); setItems([]);
    onChange(s.text);
    try {
      const r = await details({ data: { placeId: s.placeId, sessionToken: token.current } });
      if (onPick && r.parts) onPick(r.parts);
      else if (r.address) onChange(r.address);
    } catch { /* suggestion text is already filled */ }
    token.current = "";
  }

  return (
    <div className="relative">
      <Input
        className="h-11"
        value={value}
        autoComplete="off"
        placeholder={placeholder ?? "Start typing your address…"}
        onChange={(e) => { typed.current = true; onChange(e.target.value); }}
        onFocus={() => items.length && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (!open || !items.length) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => (a + 1) % items.length); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => (a <= 0 ? items.length - 1 : a - 1)); }
          else if (e.key === "Enter" && active >= 0) { e.preventDefault(); pick(items[active]!); }
          else if (e.key === "Escape") setOpen(false);
        }}
      />
      {open && (
        <ul className="absolute z-50 mt-1 w-full overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-lg">
          {items.map((s, i) => (
            <li key={s.placeId}>
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); pick(s); }}
                className={`flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-accent ${i === active ? "bg-accent" : ""}`}
              >
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <span>{s.text}</span>
              </button>
            </li>
          ))}
          <li className="px-3 py-1 text-right text-[10px] text-muted-foreground">Powered by Google</li>
        </ul>
      )}
    </div>
  );
}
