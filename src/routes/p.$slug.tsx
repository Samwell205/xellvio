import { createFileRoute, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { getPublicLandingPage, submitSubscribe } from "@/lib/public-growth.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/p/$slug")({
  loader: async ({ params }) => {
    const page = await getPublicLandingPage({ data: { slug: params.slug } });
    if (!page) throw notFound();
    return page;
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: `${loaderData?.headline || loaderData?.name || "Sign up"} — Xellvio` },
      { name: "description", content: (loaderData?.subheadline || loaderData?.body || "Join our text list.").slice(0, 155) },
      { property: "og:title", content: loaderData?.headline || loaderData?.name || "Sign up" },
      { property: "og:description", content: (loaderData?.subheadline || "Join our text list.").slice(0, 155) },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LandingPageView,
});

function LandingPageView() {
  const page = Route.useLoaderData() as any;
  const dark = page.theme === "dark";
  const [phone, setPhone] = useState("");
  const [firstName, setFirstName] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await submitSubscribe({
        data: { sourceType: "landing_page", slug: page.slug, phone, firstName: firstName || null },
      });
      setDone(r.message);
    } catch (err: any) {
      setError(err?.message ?? "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={`${dark ? "dark bg-slate-950 text-slate-100" : "bg-background text-foreground"} min-h-screen`}>
      <div className="mx-auto grid max-w-5xl gap-10 px-6 py-16 md:grid-cols-2 md:items-center md:py-24">
        <div className="space-y-5">
          <h1 className="text-4xl font-extrabold leading-tight md:text-5xl">{page.headline || page.name}</h1>
          {page.subheadline && <p className="text-lg text-muted-foreground">{page.subheadline}</p>}
          {page.body && <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{page.body}</p>}
        </div>
        <div className="rounded-2xl border bg-card p-6 shadow-sm">
          {done ? (
            <div className="space-y-2 py-6 text-center">
              <div className="text-2xl font-bold">Youre in 🎉</div>
              <p className="text-sm text-muted-foreground">{done}</p>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-3">
              <Input placeholder="First name" value={firstName} onChange={(e) => setFirstName(e.target.value)} maxLength={60} />
              <Input
                placeholder="Phone number (e.g. +1 555 123 4567)"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                inputMode="tel"
                maxLength={24}
              />
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button
                type="submit"
                className="w-full"
                disabled={busy || phone.trim().length < 6}
                style={page.accent ? { backgroundColor: page.accent } : undefined}
              >
                {busy ? "Signing you up…" : page.cta_label || "Sign up"}
              </Button>
              <p className="text-xs text-muted-foreground">
                By signing up you agree to receive recurring marketing texts. Message and data rates may apply. Reply STOP to opt out.
              </p>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
