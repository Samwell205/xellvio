import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { createMyTicket } from "@/lib/support-tickets.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function AccountBlocked() {
  const [message, setMessage] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const navigate = useNavigate();
  const qc = useQueryClient();

  async function send() {
    if (message.trim().length < 1) return;
    setState("sending");
    try {
      await createMyTicket({ data: { subject: "Account blocked – review request", body: message.trim() } });
      setState("sent");
    } catch { setState("error"); }
  }
  async function signOut() {
    await qc.cancelQueries(); qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4">
      <div className="w-full max-w-md rounded-2xl border bg-background p-8 shadow-sm text-center">
        <ShieldAlert className="mx-auto size-10 text-destructive" />
        <h1 className="mt-4 text-2xl font-semibold">Account blocked</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This account was blocked after 3 warnings for trying to send content that is not allowed.
          You can contact support below. If your account is eligible it will be reopened; otherwise it stays blocked permanently.
        </p>
        {state === "sent" ? (
          <p className="mt-6 text-sm font-medium">Your message was sent to support. We'll reply by email.</p>
        ) : (
          <div className="mt-6 space-y-3 text-left">
            <Textarea rows={4} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Explain why your account should be reviewed…" maxLength={8000} />
            {state === "error" && <p className="text-sm text-destructive">Couldn't send. Please try again.</p>}
            <Button className="w-full" onClick={send} disabled={state === "sending" || !message.trim()}>
              {state === "sending" ? "Sending…" : "Contact support"}
            </Button>
          </div>
        )}
        <Button variant="ghost" className="mt-3 w-full" onClick={signOut}>Log out</Button>
      </div>
    </div>
  );
}
