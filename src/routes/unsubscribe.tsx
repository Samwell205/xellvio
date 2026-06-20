import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/unsubscribe")({
  head: () => ({ meta: [{ title: "Unsubscribe — Xellvio" }] }),
  component: UnsubscribePage,
});

type State =
  | { kind: "loading" }
  | { kind: "ready" }
  | { kind: "already" }
  | { kind: "invalid" }
  | { kind: "submitting" }
  | { kind: "success" }
  | { kind: "error"; message: string };

function UnsubscribePage() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const token =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("token")
      : null;

  useEffect(() => {
    if (!token) {
      setState({ kind: "invalid" });
      return;
    }
    fetch(`/email/unsubscribe?token=${encodeURIComponent(token)}`)
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) {
          setState({ kind: "invalid" });
          return;
        }
        if (j.valid === true) setState({ kind: "ready" });
        else if (j.reason === "already_unsubscribed") setState({ kind: "already" });
        else setState({ kind: "invalid" });
      })
      .catch(() => setState({ kind: "invalid" }));
  }, [token]);

  async function confirm() {
    if (!token) return;
    setState({ kind: "submitting" });
    try {
      const r = await fetch("/email/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const j = await r.json().catch(() => ({}));
      if (j.success) setState({ kind: "success" });
      else if (j.reason === "already_unsubscribed") setState({ kind: "already" });
      else setState({ kind: "error", message: j.error ?? "Could not unsubscribe." });
    } catch (e: any) {
      setState({ kind: "error", message: e?.message ?? "Network error" });
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="max-w-md w-full rounded-xl border bg-card p-8 shadow-sm">
        <h1 className="text-2xl font-bold text-foreground">Xellvio email preferences</h1>
        <div className="mt-4 text-sm text-muted-foreground">
          {state.kind === "loading" && <p>Checking your link…</p>}
          {state.kind === "invalid" && (
            <p>This unsubscribe link is invalid or has expired.</p>
          )}
          {state.kind === "already" && (
            <p>You're already unsubscribed. We won't email you again.</p>
          )}
          {state.kind === "ready" && (
            <>
              <p>Click the button below to unsubscribe from Xellvio emails.</p>
              <button
                onClick={confirm}
                className="mt-6 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Confirm unsubscribe
              </button>
            </>
          )}
          {state.kind === "submitting" && <p>Unsubscribing…</p>}
          {state.kind === "success" && (
            <p>You've been unsubscribed. You won't receive further emails from us.</p>
          )}
          {state.kind === "error" && <p className="text-destructive">{state.message}</p>}
        </div>
      </div>
    </div>
  );
}
