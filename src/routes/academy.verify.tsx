import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ShieldCheck, CheckCircle2, XCircle, ArrowLeft, GraduationCap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { verifyCertificate } from "@/lib/academy.functions";

export const Route = createFileRoute("/academy/verify")({
  head: () => ({
    meta: [
      { title: "Verify a Xellvio Academy certificate" },
      { name: "description", content: "Confirm the authenticity of a Xellvio Academy completion certificate by entering its code." },
    ],
  }),
  component: VerifyPage,
});

function VerifyPage() {
  const [code, setCode] = useState("");
  const mutation = useMutation({
    mutationFn: (c: string) => verifyCertificate(c),
  });

  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-6 py-12 md:py-16">
      <Link to="/academy" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="size-4" /> Xellvio Academy
      </Link>

      <div className="text-center mb-8">
        <div className="inline-flex size-14 rounded-full bg-primary/10 items-center justify-center mb-4">
          <ShieldCheck className="size-7 text-primary" />
        </div>
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Verify a certificate</h1>
        <p className="mt-2 text-muted-foreground">
          Enter a certificate code (e.g. <code className="text-xs bg-muted px-1.5 py-0.5 rounded">XA-XXXX-XXXXXXX</code>) to confirm it's authentic.
        </p>
      </div>

      <Card className="p-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (code.trim()) mutation.mutate(code.trim());
          }}
          className="flex flex-col sm:flex-row gap-2"
        >
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="XA-XXXX-XXXXXXX"
            className="font-mono uppercase"
            autoFocus
          />
          <Button type="submit" disabled={mutation.isPending || !code.trim()}>
            {mutation.isPending ? "Checking…" : "Verify"}
          </Button>
        </form>

        {mutation.isSuccess && (
          <div className="mt-6">
            {mutation.data ? (
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-5">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="size-6 text-emerald-500 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <div className="font-semibold text-emerald-700 dark:text-emerald-400">Certificate verified</div>
                    <p className="text-sm text-muted-foreground mt-1">
                      This is a valid Xellvio Academy certificate.
                    </p>
                    <div className="mt-4 space-y-2 text-sm">
                      <Row label="Certificate code" value={<code className="font-mono">{mutation.data.code}</code>} />
                      {mutation.data.course && (
                        <>
                          <Row label="Course" value={<span className="font-medium">{mutation.data.course.title}</span>} />
                          <Row
                            label="Category"
                            value={
                              <span className="inline-flex gap-1.5">
                                <Badge variant="secondary" className="capitalize">{mutation.data.course.category}</Badge>
                                <Badge variant="outline" className="capitalize">{mutation.data.course.level}</Badge>
                              </span>
                            }
                          />
                        </>
                      )}
                      <Row
                        label="Enrolled"
                        value={new Date(mutation.data.enrolled_at).toLocaleDateString(undefined, { dateStyle: "medium" })}
                      />
                      <Row
                        label="Completed"
                        value={
                          <span className="inline-flex items-center gap-1.5 text-emerald-600 font-medium">
                            <GraduationCap className="size-4" />
                            {new Date(mutation.data.completed_at!).toLocaleDateString(undefined, { dateStyle: "medium" })}
                          </span>
                        }
                      />
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-5">
                <div className="flex items-start gap-3">
                  <XCircle className="size-6 text-destructive shrink-0 mt-0.5" />
                  <div>
                    <div className="font-semibold text-destructive">Certificate not found</div>
                    <p className="text-sm text-muted-foreground mt-1">
                      No completed enrollment matches this code. Double-check the code and try again.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
        {mutation.isError && (
          <div className="mt-6 text-sm text-destructive">Something went wrong. Please try again.</div>
        )}
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5 border-b border-border/50 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}
