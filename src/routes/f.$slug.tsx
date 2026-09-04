import { createFileRoute, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { getPublicSignupForm, submitSubscribe } from "@/lib/public-growth.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/f/$slug")({
  loader: async ({ params }) => {
    const form = await getPublicSignupForm({ data: { slug: params.slug } });
    if (!form) throw notFound();
    return form;
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: `${loaderData?.headline || "Sign up"} — Xellvio` },
      { name: "description", content: (loaderData?.description || "Join our text list.").slice(0, 155) },
      { property: "og:title", content: loaderData?.headline || "Sign up" },
      { property: "og:description", content: (loaderData?.description || "Join our text list.").slice(0, 155) },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SignupFormView,
});

function SignupFormView() {
  const form = Route.useLoaderData() as any;
  const dark = form.theme === "dark";
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
        data: { sourceType: "signup_form", slug: form.slug, phone, firstName: firstName || null },
      });
      setDone(r.message);
    } catch (err: any) {
      setError(err?.message ?? "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={`${dark ? "dark bg-slate-950 text-slate-100" : "bg-background text-foreground"} min-h-screen p-6`}>
      <div className="mx-auto max-w-md rounded-2xl border bg-card p-6 shadow-sm">
        <h1 className="text-xl font-bold">{form.headline}</h1>
        {form.description && <p className="mt-1 text-sm text-muted-foreground">{form.description}</p>}
        {done ? (
          <p className="mt-6 text-sm font-medium">{done}</p>
        ) : (
          <form onSubmit={submit} className="mt-4 space-y-3">
            {form.collect_name && (
              <Input placeholder="First name" value={firstName} onChange={(e) => setFirstName(e.target.value)} maxLength={60} />
            )}
            <Input
              placeholder="Phone number with country code"
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
              style={form.accent ? { backgroundColor: form.accent } : undefined}
            >
              {busy ? "Subscribing…" : form.cta_label}
            </Button>
            <p className="text-xs text-muted-foreground">{form.consent_text}</p>
          </form>
        )}
      </div>
    </main>
  );
}
