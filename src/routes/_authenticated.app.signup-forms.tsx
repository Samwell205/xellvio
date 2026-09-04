import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { deleteSignupForm, listRecentSubmissions, listSignupForms, saveSignupForm } from "@/lib/growth.functions";
import { listAudienceContactLists } from "@/lib/audience.functions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Code2, Copy, ExternalLink, FormInput, Plus, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/signup-forms")({
  head: () => ({
    meta: [
      { title: "Sign-up forms — Xellvio" },
      { name: "description", content: "Create embeddable SMS sign-up forms that add subscribers to your lists automatically." },
      { property: "og:title", content: "Sign-up forms — Xellvio" },
      { property: "og:description", content: "Create embeddable SMS sign-up forms that add subscribers to your lists automatically." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SignupFormsPage,
});

type Draft = {
  id?: string;
  name: string;
  headline: string;
  description: string;
  cta_label: string;
  success_message: string;
  collect_name: boolean;
  consent_text: string;
  theme: "light" | "dark";
  accent: string;
  list_id: string | null;
  published: boolean;
};

const EMPTY: Draft = {
  name: "",
  headline: "Get exclusive offers by text",
  description: "Be first to know about new drops and sales.",
  cta_label: "Subscribe",
  success_message: "You are on the list!",
  collect_name: true,
  consent_text: "By subscribing you agree to receive recurring marketing texts. Message and data rates may apply. Reply STOP to opt out.",
  theme: "light",
  accent: "#111827",
  list_id: null,
  published: true,
};

function SignupFormsPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listSignupForms);
  const saveFn = useServerFn(saveSignupForm);
  const delFn = useServerFn(deleteSignupForm);
  const subsFn = useServerFn(listRecentSubmissions);
  const listsFn = useServerFn(listAudienceContactLists);

  const formsQ = useQuery({ queryKey: ["signup-forms"], queryFn: () => listFn() });
  const subsQ = useQuery({ queryKey: ["signup-submissions"], queryFn: () => subsFn(), refetchInterval: 30_000 });
  const listsQ = useQuery({ queryKey: ["contact-lists"], queryFn: () => listsFn() });
  const [draft, setDraft] = useState<Draft | null>(null);

  const save = useMutation({
    mutationFn: async (d: Draft) => saveFn({ data: d }),
    onSuccess: () => {
      toast.success("Form saved");
      setDraft(null);
      qc.invalidateQueries({ queryKey: ["signup-forms"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Could not save"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["signup-forms"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Could not delete"),
  });

  const forms = formsQ.data ?? [];
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight">Sign-up forms</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Collect phone numbers on your own website — share the link or paste the embed code anywhere.
          </p>
        </div>
        <Button onClick={() => setDraft({ ...EMPTY })}><Plus className="mr-2 size-4" />Create form</Button>
      </div>

      {forms.length === 0 ? (
        <Card className="flex flex-col items-center gap-4 p-14 text-center">
          <FormInput className="size-10 text-primary" />
          <div className="space-y-1">
            <h2 className="text-xl font-semibold">Turn visitors into subscribers</h2>
            <p className="mx-auto max-w-md text-sm text-muted-foreground">
              Start from a ready-made form, choose the list it feeds, and paste it on your site in one line of code.
            </p>
          </div>
          <Button onClick={() => setDraft({ ...EMPTY })}>Create blank form</Button>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {forms.map((f: any) => (
            <Card key={f.id} className="space-y-3 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold">{f.name}</h3>
                  <p className="text-xs text-muted-foreground">{f.headline}</p>
                </div>
                <Badge variant={f.published ? "default" : "outline"}>{f.published ? "Live" : "Draft"}</Badge>
              </div>
              <div className="flex gap-4 text-xs text-muted-foreground">
                <span>{f.views ?? 0} views</span>
                <span>{f.submissions ?? 0} signups</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(`${origin}/f/${f.slug}`); toast.success("Link copied"); }}>
                  <Copy className="mr-1 size-3" />Copy link
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(
                      `<iframe src="${origin}/f/${f.slug}" style="border:0;width:100%;max-width:480px;height:520px" title="${f.name}"></iframe>`,
                    );
                    toast.success("Embed code copied");
                  }}
                >
                  <Code2 className="mr-1 size-3" />Copy embed code
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <a href={`/f/${f.slug}`} target="_blank" rel="noreferrer"><ExternalLink className="mr-1 size-3" />Preview</a>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setDraft({
                      id: f.id,
                      name: f.name,
                      headline: f.headline ?? "",
                      description: f.description ?? "",
                      cta_label: f.cta_label ?? "Subscribe",
                      success_message: f.success_message ?? "",
                      collect_name: !!f.collect_name,
                      consent_text: f.consent_text ?? EMPTY.consent_text,
                      theme: f.theme === "dark" ? "dark" : "light",
                      accent: f.accent ?? "#111827",
                      list_id: f.list_id ?? null,
                      published: !!f.published,
                    })
                  }
                >
                  Edit
                </Button>
                <Button variant="ghost" size="icon" onClick={() => remove.mutate(f.id)}>
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {(subsQ.data?.length ?? 0) > 0 && (
        <Card className="p-5">
          <h3 className="font-semibold">Latest signups</h3>
          <div className="mt-3 space-y-2 text-sm">
            {subsQ.data!.slice(0, 10).map((s: any) => (
              <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 border-b pb-2 last:border-0">
                <span className="font-mono text-xs">{s.phone_e164}</span>
                <span>{s.first_name ?? "—"}</span>
                <span className="text-xs capitalize text-muted-foreground">{String(s.source_type).replace("_", " ")}</span>
                <span className="text-xs text-muted-foreground">{new Date(s.created_at).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Edit form" : "New sign-up form"}</DialogTitle>
            <DialogDescription>Choose the wording, the list, and where signups should land.</DialogDescription>
          </DialogHeader>
          {draft && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div><Label>Internal name</Label><Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></div>
                <div>
                  <Label>Add signups to</Label>
                  <Select value={draft.list_id ?? "none"} onValueChange={(v) => setDraft({ ...draft, list_id: v === "none" ? null : v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No list (contacts only)</SelectItem>
                      {(listsQ.data ?? []).map((l: any) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div><Label>Headline</Label><Input value={draft.headline} onChange={(e) => setDraft({ ...draft, headline: e.target.value })} maxLength={160} /></div>
              <div><Label>Description</Label><Textarea rows={2} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} maxLength={400} /></div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div><Label>Button text</Label><Input value={draft.cta_label} onChange={(e) => setDraft({ ...draft, cta_label: e.target.value })} maxLength={40} /></div>
                <div>
                  <Label>Look</Label>
                  <Select value={draft.theme} onValueChange={(v) => setDraft({ ...draft, theme: v as "light" | "dark" })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="light">Light</SelectItem><SelectItem value="dark">Dark</SelectItem></SelectContent>
                  </Select>
                </div>
                <div><Label>Button colour</Label><Input type="color" value={draft.accent} onChange={(e) => setDraft({ ...draft, accent: e.target.value })} /></div>
              </div>
              <div><Label>Consent wording (required by carriers)</Label><Textarea rows={2} value={draft.consent_text} onChange={(e) => setDraft({ ...draft, consent_text: e.target.value })} maxLength={400} /></div>
              <div><Label>Thank-you message</Label><Input value={draft.success_message} onChange={(e) => setDraft({ ...draft, success_message: e.target.value })} maxLength={200} /></div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div><div className="text-sm font-medium">Ask for a first name</div><p className="text-xs text-muted-foreground">Lets you personalise your texts.</p></div>
                <Switch checked={draft.collect_name} onCheckedChange={(v) => setDraft({ ...draft, collect_name: v })} />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div><div className="text-sm font-medium">Publish this form</div><p className="text-xs text-muted-foreground">Turn on to accept signups.</p></div>
                <Switch checked={draft.published} onCheckedChange={(v) => setDraft({ ...draft, published: v })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>Cancel</Button>
            <Button disabled={!draft?.name.trim() || save.isPending} onClick={() => draft && save.mutate(draft)}>
              {save.isPending ? "Saving…" : "Save form"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
