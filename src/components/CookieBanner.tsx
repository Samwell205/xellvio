import { useEffect, useState } from "react";

const KEY = "xellvio-cookie-consent-v1";

export function CookieBanner() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const v = localStorage.getItem(KEY);
      if (!v) setOpen(true);
    } catch {
      // ignore (private mode / SSR)
    }
  }, []);

  function decide(choice: "accepted" | "rejected") {
    try {
      localStorage.setItem(KEY, JSON.stringify({ choice, ts: new Date().toISOString() }));
    } catch {
      // ignore
    }
    setOpen(false);
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label="Cookie preferences"
      className="fixed bottom-4 left-4 right-4 z-[100] mx-auto max-w-3xl rounded-2xl border border-border bg-card text-card-foreground shadow-2xl pointer-events-auto"
    >
      <div className="p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex-1 text-sm">
          <p className="font-semibold mb-1">We use cookies</p>
          <p className="text-muted-foreground">
            Strictly necessary cookies keep you signed in. We'd also like to set optional analytics
            cookies to improve the Service. Read our{" "}
            <a href="/cookies" className="text-primary hover:underline">Cookie Policy</a>.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            type="button"
            onClick={() => decide("rejected")}
            className="rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent"
          >
            Reject non-essential
          </button>
          <button
            type="button"
            onClick={() => decide("accepted")}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            Accept all
          </button>
        </div>
      </div>
    </div>
  );
}
