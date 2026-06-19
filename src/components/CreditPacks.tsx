import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

const PACKS = [
  { name: "Starter", tag: "Great for testing", price: 5, credits: 5 },
  { name: "Basic", tag: "Light monthly sending", price: 10, credits: 10 },
  { name: "Growth", tag: "Most popular for SMBs", price: 25, credits: 25, popular: true },
  { name: "Pro", tag: "Active campaigns", price: 50, credits: 50 },
  { name: "Scale", tag: "High-volume senders", price: 100, credits: 100 },
  { name: "Business", tag: "Multi-country programs", price: 250, credits: 250 },
  { name: "Enterprise", tag: "Large monthly volume", price: 500, credits: 500 },
  { name: "Enterprise+", tag: "Bulk credits, best value", price: 1000, credits: 1050 },
];

export function CreditPacks() {
  return (
    <section className="bg-background py-16 border-t border-border">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="flex items-end justify-between gap-4 flex-wrap mb-8">
          <div className="flex items-center gap-2">
            <Sparkles className="size-5 text-primary" />
            <h2 className="text-2xl font-extrabold tracking-tight">Buy credits</h2>
          </div>
          <p className="text-sm text-muted-foreground">Priced in USD · paid securely via Paystack</p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {PACKS.map((p) => (
            <div
              key={p.name}
              className={`rounded-2xl border p-6 bg-card flex flex-col ${
                p.popular ? "border-primary ring-2 ring-primary/30 relative" : "border-border"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-bold text-foreground">{p.name} USD</div>
                  <div className="text-sm text-muted-foreground">{p.tag}</div>
                </div>
                {p.popular && (
                  <span className="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
                    Popular
                  </span>
                )}
              </div>
              <div className="mt-5 text-4xl font-extrabold tracking-tight">
                ${p.price.toFixed(2)}
              </div>
              <div className="mt-2 text-sm text-muted-foreground">
                ≈ ${p.credits.toFixed(2)} in credits
              </div>
              <Button className="mt-5 w-full">Pay with Paystack</Button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
