import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Mail, MessageSquare, Phone, MapPin, Send, Loader2 } from "lucide-react";
import { z } from "zod";
import { toast } from "sonner";
import { MarketingNav } from "@/components/MarketingNav";
import { MarketingFooter } from "@/components/MarketingFooter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact Support — Xellio" },
      { name: "description", content: "Reach the Xellio team for sales, technical support, billing, or sender ID approvals." },
      { property: "og:title", content: "Contact Support — Xellio" },
      { property: "og:description", content: "Get in touch with our team for help with SMS, contacts, billing, or your account." },
    ],
  }),
  component: ContactPage,
});

const schema = z.object({
  name: z.string().trim().min(2, "Please enter your name").max(80),
  email: z.string().trim().email("Enter a valid email").max(200),
  topic: z.string().trim().min(2).max(80),
  message: z.string().trim().min(10, "Add a bit more detail").max(2000),
});

const SUPPORT_EMAIL = "sam@samwellagency.com";
const SUPPORT_PHONE_DISPLAY = "+1 (725) 316-6070";
const SUPPORT_PHONE_HREF = "+17253166070";

function ContactPage() {
  const [form, setForm] = useState({ name: "", email: "", topic: "General question", message: "" });
  const [sending, setSending] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Please check the form");
      return;
    }
    setSending(true);
    try {
      const { error } = await supabase.from("contact_messages").insert({
        name: parsed.data.name,
        email: parsed.data.email,
        topic: parsed.data.topic,
        message: parsed.data.message,
        user_agent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 500) : null,
      });
      if (error) throw error;
      toast.success("Message sent — we'll get back to you within one business day.");
      setForm({ name: "", email: "", topic: "General question", message: "" });
    } catch (err: any) {
      toast.error(err?.message ?? "Could not send your message. Please try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <MarketingNav />
      <main className="flex-1">
        <section className="hero-gradient border-b">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 py-20 md:py-24">
            <Badge variant="outline" className="bg-background/70"><MessageSquare className="mr-1 size-3" /> Contact</Badge>
            <h1 className="mt-5 max-w-3xl text-4xl md:text-6xl font-extrabold tracking-tight leading-[1.05]">
              We're here to help you send better SMS
            </h1>
            <p className="mt-5 max-w-2xl text-lg text-muted-foreground">
              Questions about pricing, sender approvals, deliverability, or your account? Send us a message and a real human will get back to you.
            </p>
          </div>
        </section>

        <section className="py-16">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 grid gap-8 lg:grid-cols-[1fr_1.2fr]">
            <div className="space-y-4">
              <InfoCard icon={Mail} title="Email" value={SUPPORT_EMAIL} href={`mailto:${SUPPORT_EMAIL}`} hint="We reply within one business day." />
              <InfoCard icon={Phone} title="Phone" value={SUPPORT_PHONE_DISPLAY} href={`tel:${SUPPORT_PHONE_HREF}`} hint="Mon–Fri, 9am–6pm." />
              <InfoCard icon={MapPin} title="Office" value="Global remote team" hint="Serving customers in 180+ countries." />
              <Card className="p-6 bg-secondary text-secondary-foreground">
                <h3 className="text-base font-semibold">Need an instant answer?</h3>
                <p className="mt-2 text-sm opacity-80">
                  Click the chat bubble in the bottom-right corner to talk to our AI assistant — it can walk you through signup, contacts, sender verification, and sending your first SMS.
                </p>
              </Card>
            </div>

            <Card className="p-6 md:p-8">
              <h2 className="text-xl font-semibold">Send us a message</h2>
              <p className="mt-1 text-sm text-muted-foreground">Tell us a bit about what you need and we'll route you to the right team.</p>
              <form onSubmit={submit} className="mt-6 grid gap-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Your name" id="name">
                    <Input id="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Jane Doe" autoComplete="name" />
                  </Field>
                  <Field label="Email" id="email">
                    <Input id="email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="jane@company.com" autoComplete="email" />
                  </Field>
                </div>
                <Field label="Topic" id="topic">
                  <select
                    id="topic"
                    value={form.topic}
                    onChange={(e) => setForm({ ...form, topic: e.target.value })}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option>General question</option>
                    <option>Technical support</option>
                    <option>Billing</option>
                    <option>Sender ID approval</option>
                    <option>Sales</option>
                    <option>Partnership</option>
                  </select>
                </Field>
                <Field label="Message" id="message">
                  <Textarea id="message" rows={6} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} placeholder="How can we help?" />
                </Field>
                <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                  <p className="text-xs text-muted-foreground">By contacting us you agree to our privacy policy.</p>
                  <Button type="submit" disabled={sending}>
                    {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                    Send message
                  </Button>
                </div>
              </form>
            </Card>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}

function Field({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

function InfoCard({ icon: Icon, title, value, href, hint }: { icon: typeof Mail; title: string; value: string; href?: string; hint?: string }) {
  const content = (
    <Card className="p-5 transition hover:border-primary/40">
      <div className="flex items-start gap-3">
        <div className="size-10 rounded-lg bg-primary/10 text-primary grid place-items-center"><Icon className="size-5" /></div>
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">{title}</div>
          <div className="text-sm font-semibold">{value}</div>
          {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
        </div>
      </div>
    </Card>
  );
  return href ? <a href={href}>{content}</a> : content;
}
