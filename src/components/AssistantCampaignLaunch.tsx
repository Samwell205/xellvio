import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Send, X, ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Message, MessageContent } from "@/components/ai-elements/message";
import { prepareAssistantLaunch, confirmAssistantLaunch } from "@/lib/assistant-campaign.functions";
import { sendTestSms, getTestSendUsage } from "@/lib/sms.functions";
import { canConfirmAssistantCampaign } from "@/lib/assistant-campaign-policy";
import { formatUSD } from "@/lib/money";

export function AssistantCampaignLaunch({
  campaignId,
  onClose,
}: {
  campaignId: string;
  onClose: () => void;
}) {
  const prepare = useServerFn(prepareAssistantLaunch),
    confirm = useServerFn(confirmAssistantLaunch),
    test = useServerFn(sendTestSms),
    usage = useServerFn(getTestSendUsage);
  const review = useQuery({
    queryKey: ["assistant-launch-review", campaignId],
    queryFn: () => prepare({ data: { campaignId } }),
    retry: false,
    staleTime: 0,
    refetchOnWindowFocus: false,
  });
  const tests = useQuery({ queryKey: ["test-send-usage"], queryFn: () => usage() });
  const [number, setNumber] = useState(""),
    [choice, setChoice] = useState<"none" | "tested" | "skipped">("none"),
    [consent, setConsent] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [launched, setLaunched] = useState(false);
  const r = review.data;
  async function sendTest() {
    if (!r) return;
    setBusy(true);
    setError("");
    try {
      await test({ data: { to: number.trim(), body: r.body } });
      setChoice("tested");
      void tests.refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Test could not be sent.");
      void tests.refetch();
    } finally {
      setBusy(false);
    }
  }
  async function launch() {
    if (
      !r ||
      !canConfirmAssistantCampaign({ choice, consent, blocked: r.blockers.length > 0 }) ||
      choice === "none"
    )
      return;
    setBusy(true);
    setError("");
    try {
      await confirm({
        data: { id: r.id, choice, consent, userAgent: navigator.userAgent.slice(0, 500) },
      });
      setLaunched(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nothing was launched. Try a fresh review.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Message from="assistant">
      <MessageContent>
        <section aria-label="Campaign send conversation" className="space-y-4 border-y py-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-semibold">
              {launched ? "Campaign launched" : (r?.name ?? "Send campaign")}
            </h2>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Close campaign sending"
              disabled={busy}
              onClick={onClose}
            >
              <X />
            </Button>
          </div>
          {review.isPending && (
            <p role="status" className="flex items-center gap-2 text-sm">
              <Loader2 className="size-4 animate-spin" />
              Loading campaign review…
            </p>
          )}
          {review.error && (
            <p role="alert" className="text-sm text-destructive">
              {review.error.message}
            </p>
          )}
          {r && !launched && (
            <>
              {choice === "none" ? (
                <>
                  <p>
                    Which number would you like to send a test to, or would you like to skip the
                    test?
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Input
                      aria-label="Test phone number"
                      placeholder="+15551234567"
                      type="tel"
                      value={number}
                      onChange={(e) => setNumber(e.target.value)}
                      disabled={busy}
                      className="min-w-0 flex-1 basis-48"
                    />
                    <Button
                      onClick={sendTest}
                      disabled={
                        busy ||
                        !/^\+[1-9][0-9]{6,14}$/.test(number.trim()) ||
                        !tests.data ||
                        tests.data.remaining <= 0
                      }
                    >
                      <Send />
                      {busy ? "Sending test…" : "Send test"}
                    </Button>
                  </div>
                  {tests.data && (
                    <p className="text-xs text-muted-foreground">
                      {tests.data.remaining} of {tests.data.limit} tests remaining today
                    </p>
                  )}
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => {
                      setChoice("skipped");
                      setError("");
                    }}
                  >
                    Skip test
                    <ArrowRight />
                  </Button>
                </>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    {choice === "tested"
                      ? `Test submitted to ${number}. Delivery is not yet confirmed.`
                      : "Test skipped. No test message was sent."}
                  </p>
                  <dl className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <dt className="text-muted-foreground">Eligible recipients</dt>
                      <dd>{r.recipients}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Estimated cost</dt>
                      <dd>{formatUSD(r.cost)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Balance</dt>
                      <dd>{formatUSD(r.balance)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Sending time</dt>
                      <dd>
                        {r.sendMode === "now"
                          ? "Now"
                          : r.scheduleAt
                            ? new Date(r.scheduleAt).toLocaleString()
                            : "Not set"}
                      </dd>
                    </div>
                  </dl>
                  <p className="whitespace-pre-wrap break-words text-sm">{r.body}</p>
                  {r.blockers.map((b) => (
                    <p key={b} role="alert" className="text-sm text-destructive">
                      {b}
                    </p>
                  ))}
                  <label className="flex items-start gap-3 text-sm">
                    <Checkbox
                      checked={consent}
                      disabled={busy}
                      onCheckedChange={(v) => setConsent(v === true)}
                    />
                    <span>
                      Normal sending charges and opt-outs apply. I confirm every recipient opted in,
                      the message complies with the Xellvio Acceptable Use Policy and carrier SHAFT
                      rules, and I accept liability for carrier penalties, fines or number
                      suspensions arising from this send.
                    </span>
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      disabled={
                        busy ||
                        !canConfirmAssistantCampaign({
                          choice,
                          consent,
                          blocked: r.blockers.length > 0,
                        })
                      }
                      onClick={launch}
                    >
                      <Send />
                      {busy
                        ? "Checking…"
                        : r.sendMode === "now"
                          ? "Confirm & send"
                          : "Confirm & schedule"}
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={busy}
                      onClick={() => {
                        setChoice("none");
                        setConsent(false);
                        setError("");
                      }}
                    >
                      Back to test
                    </Button>
                  </div>
                </>
              )}
            </>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {launched && (
            <p role="status">
              {r?.sendMode === "now"
                ? "Your campaign is queued for sending."
                : "Your campaign is scheduled."}
            </p>
          )}
          <Button variant="link" asChild>
            <Link to="/app/campaigns/new" search={{ id: campaignId }}>
              Review / edit
            </Link>
          </Button>
        </section>
      </MessageContent>
    </Message>
  );
}
