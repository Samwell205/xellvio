import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import {
  Sparkles,
  Mic,
  MicOff,
  PhoneOff,
  Upload,
  Check,
  X,
  ArrowUpRight,
  Send,
  ChevronDown,
  ClipboardList,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { uploadCountry, uploadNeedsCountry } from "@/lib/assistant-upload";
import { Checkbox } from "@/components/ui/checkbox";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputSubmit,
} from "@/components/ai-elements/prompt-input";
import { Tool, ToolHeader, ToolContent } from "@/components/ai-elements/tool";
import { useLiveVoice } from "@/hooks/use-live-voice";
import {
  inspectAssistantFile,
  listAssistantOperations,
  confirmAssistantAction,
  cancelAssistantAction,
  saveStoppedAssistantMessage,
} from "@/lib/account-assistant.functions";
import { toast } from "sonner";
import { getVoicePilotAccess } from "@/lib/voice-rollout.functions";
import { AssistantCampaignLaunch } from "@/components/AssistantCampaignLaunch";
import { AssistantCampaignReport } from "@/components/AssistantCampaignReport";
import { canSendAssistantCampaign, assistantCampaignStatus } from "@/lib/assistant-campaign-status";
import { AssistantMark } from "@/components/AssistantHome";
export { AssistantThreads } from "@/components/AssistantHome";
export function AccountAssistant({
  threadId,
  initialMessages,
}: {
  threadId: string;
  initialMessages: UIMessage[];
}) {
  const { data: voiceAccess } = useQuery({
    queryKey: ["voice-pilot-access"],
    queryFn: () => getVoicePilotAccess(),
  });
  const qc = useQueryClient();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const inspect = useServerFn(inspectAssistantFile),
    confirm = useServerFn(confirmAssistantAction),
    cancel = useServerFn(cancelAssistantAction),
    saveStopped = useServerFn(saveStoppedAssistantMessage);
  const [input, setInput] = useState(""),
    [fileBusy, setFileBusy] = useState(false),
    [consents, setConsents] = useState<Record<string, boolean>>({}),
    [busy, setBusy] = useState<string | null>(null),
    [caption, setCaption] = useState("");
  const [pendingUpload, setPendingUpload] = useState<{
    fileName: string;
    content: string;
    country: string;
    stage: "country" | "name";
  } | null>(null);
  const [uploadReply, setUploadReply] = useState("");
  const [launchId, setLaunchId] = useState<string | null>(null);
  const [reportId, setReportId] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState<boolean | null>(null);
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["assistant-actions"] });
    void qc.invalidateQueries({ queryKey: ["assistant-threads"] });
  };
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/account-assistant",
        body: { threadId },
        headers: async () => {
          const { data } = await supabase.auth.getSession();
          return { Authorization: `Bearer ${data.session?.access_token ?? ""}` };
        },
      }),
    [threadId],
  );
  const { messages, sendMessage, status, error, stop } = useChat({
    id: threadId,
    messages: initialMessages,
    transport,
    onError: (e) => toast.error(e.message),
    onFinish: async ({ message, isAbort }) => {
      if (isAbort) {
        const parts = message.parts.map((p) => ({ ...p }));
        parts.push({ type: "text", text: "\n\n_Stopped._" });
        try {
          await saveStopped({
            data: { threadId, message: { id: message.id, role: "assistant", parts } },
          });
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Stopped answer was not saved.");
        }
      }
      refresh();
      inputRef.current?.focus();
    },
  });
  const voice = useLiveVoice({
    getToken: async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) throw new Error("Sign in to use voice.");
      return data.session.access_token;
    },
    onEvent: (event) => {
      if (
        (event.type === "session.input_transcript.delta" ||
          event.type === "session.output_transcript.delta") &&
        typeof event.delta === "string"
      )
        setCaption(event.delta);
      if (event.type === "app.delegation.pending" || event.type === "session.commentary.appended")
        refresh();
    },
  });
  const speaking = ["connecting", "connected", "stopping"].includes(voice.status),
    generating = status === "submitted" || status === "streaming";
  const { data: operations = [] } = useQuery({
    queryKey: ["assistant-actions"],
    queryFn: () => listAssistantOperations(),
    refetchInterval: speaking ? 2000 : 15000,
  });
  useEffect(() => {
    inputRef.current?.focus();
  }, [threadId]);
  async function fileChange(file: File) {
    if (file.size > 2_000_000 || !/\.(csv|txt)$/i.test(file.name)) {
      toast.error("Contact uploads currently support CSV or text files under 2 MB.");
      return;
    }
    setFileBusy(true);
    try {
      const content = await file.text();
      if (!content.trim()) throw new Error("This file is empty.");
      setPendingUpload({
        fileName: file.name,
        content,
        country: "",
        stage: uploadNeedsCountry(content) ? "country" : "name",
      });
      setUploadReply("");
      inputRef.current?.focus();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not read file.");
    } finally {
      setFileBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }
  async function submitInput() {
    if (!input.trim() || generating || speaking || fileBusy) return;
    const text = input.trim();
    if (pendingUpload) {
      if (pendingUpload.stage === "country") {
        const country = uploadCountry(text);
        if (!country) {
          // Not a country: treat it as a normal message so the assistant can answer and explain,
          // while the file stays attached for the country answer.
          if (text.split(/\s+/).length > 2 || text.includes("?")) {
            setInput("");
            await sendMessage({
              text: `${text}\n\n(Context: I attached ${pendingUpload.fileName}; the upload is waiting for me to say which country the local numbers are from.)`,
            });
            setUploadReply("When you're ready, tell me which country the local numbers are from, e.g. United States.");
            inputRef.current?.focus();
            return;
          }
          setUploadReply(
            "Which country are the local phone numbers from? For example, United States or United Kingdom.",
          );
          return;
        }
        setPendingUpload({ ...pendingUpload, country, stage: "name" });
        setUploadReply("");
        setInput("");
        inputRef.current?.focus();
        return;
      }
      if (text.length > 120) {
        setUploadReply("What list name would you like? Please keep it under 120 characters.");
        return;
      }
      setFileBusy(true);
      const fileName = pendingUpload.fileName;
      try {
        const result = await inspect({
          data: {
            name: text,
            content: pendingUpload.content,
            defaultCountry: pendingUpload.country,
          },
        });
        refresh();
        const args = result.arguments as Record<string, unknown>;
        setPendingUpload(null);
        setUploadReply("");
        setInput("");
        await sendMessage({
          text: `I uploaded ${fileName} and named the list ${text}. The file inspection found ${args.valid} unique valid numbers, ${args.invalid} invalid rows and ${args.duplicates} duplicates. The import proposal is awaiting my on-screen opt-in confirmation. Do not treat these contacts as imported yet.`,
        });
      } catch (e) {
        // Never trap the user in the upload step: hand the problem to the assistant to explain.
        const reason = e instanceof Error ? e.message : "The file could not be read.";
        setPendingUpload(null);
        setUploadReply("");
        setInput("");
        await sendMessage({
          text: `I uploaded ${fileName} (list name "${text}") but the file check said: "${reason}". Explain in plain words what this means and exactly how I can fix the file, then I'll upload it again.`,
        });
      } finally {
        setFileBusy(false);
        inputRef.current?.focus();
      }
      return;
    }
    setInput("");
    await sendMessage({ text });
    inputRef.current?.focus();
  }
  const reviewOps = operations
    .filter((op) => op.kind !== "campaign_launch")
    .filter((op) => op.status === "pending" || op.status === "completed")
    .slice(0, 6);
  const awaitingReview = reviewOps.filter(
    (op) => op.status === "pending" && Date.parse(op.expires_at) > Date.now(),
  ).length;
  const trayOpen = reviewOpen ?? awaitingReview > 0;
  return (
    <div className="assistant-chat assistant-arrive flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
        <div className="flex items-center gap-3">
          <Sparkles className="size-5 text-primary" />
          <div>
            <h1 className="font-display text-lg font-medium">Xellvio assistant</h1>
            <p className="mt-0.5 text-xs text-muted-foreground">Business conversation</p>
          </div>
        </div>
        <div className="flex gap-2">
          {speaking ? (
            <>
              <Button
                size="icon"
                variant="outline"
                aria-label={voice.muted ? "Unmute microphone" : "Mute microphone"}
                onClick={() => voice.setMuted(!voice.muted)}
              >
                {voice.muted ? <MicOff /> : <Mic />}
              </Button>
              <Button variant="destructive" onClick={voice.stop}>
                <PhoneOff />
                End call
              </Button>
            </>
          ) : (
            <Button
              variant="outline"
              disabled={generating || !voiceAccess?.available}
              onClick={voice.start}
            >
              <Mic />
              {voiceAccess?.available ? "Talk" : "Voice · Coming soon"}
            </Button>
          )}
        </div>
      </header>
      <audio ref={voice.audioRef} autoPlay playsInline />
      {(speaking || voice.error) && (
        <div className="border-b bg-muted px-5 py-3 text-sm">
          <p>{voice.error || `${voice.status === "connected" ? "Listening" : voice.status}…`}</p>
          <p className="mt-1 text-muted-foreground">{caption}</p>
          {voice.playbackBlocked && <Button onClick={voice.resumePlayback}>Resume audio</Button>}
        </div>
      )}
      <Conversation className="min-h-64 flex-1">
        <ConversationContent className="mx-auto w-full max-w-3xl space-y-6 p-5">
          {messages.length === 0 && (
            <div className="assistant-arrive py-10 md:py-16">
              <AssistantMark />
              <h2 className="mt-6 font-display text-3xl font-medium">What needs doing today?</h2>
            </div>
          )}
          {messages.map((message) => (
            <Message key={message.id} from={message.role}>
              <MessageContent
                className={
                  message.role === "user"
                    ? "group-[.is-user]:bg-primary group-[.is-user]:text-primary-foreground"
                    : ""
                }
              >
                {message.parts.map((part, i) => {
                  if (part.type === "text")
                    return <MessageResponse key={i}>{part.text}</MessageResponse>;
                  if (part.type === "reasoning")
                    return (
                      <details key={i} className="text-xs text-muted-foreground">
                        <summary>Thinking</summary>
                        <MessageResponse>{part.text}</MessageResponse>
                      </details>
                    );
                  if (part.type.startsWith("tool-") && "state" in part)
                    return (
                      <Tool key={i} defaultOpen={false}>
                        <ToolHeader
                          type={part.type as `tool-${string}`}
                          state={part.state as "output-available"}
                          title={part.type.replace("tool-", "").replaceAll("_", " ")}
                        />
                        <ToolContent>
                          {"errorText" in part ? (
                            <p>{String(part.errorText)}</p>
                          ) : (
                            <p>Prepared changes appear in the action review.</p>
                          )}
                        </ToolContent>
                      </Tool>
                    );
                  return null;
                })}
              </MessageContent>
            </Message>
          ))}
          {pendingUpload && (
            <>
              <Message from="user">
                <MessageContent className="group-[.is-user]:bg-primary group-[.is-user]:text-primary-foreground">
                  <p className="flex items-center gap-2 break-all">
                    <Upload className="size-4 shrink-0" />
                    {pendingUpload.fileName}
                  </p>
                </MessageContent>
              </Message>
              <Message from="assistant">
                <MessageContent>
                  <MessageResponse>
                    {uploadReply ||
                      (pendingUpload.stage === "country"
                        ? "Which country are the local phone numbers in this file from?"
                        : "What would you like to name this list?")}
                  </MessageResponse>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setPendingUpload(null);
                      setUploadReply("");
                      setInput("");
                      inputRef.current?.focus();
                    }}
                  >
                    <X />
                    Cancel upload
                  </Button>
                </MessageContent>
              </Message>
            </>
          )}
          {launchId && (
            <AssistantCampaignLaunch
              key={launchId}
              campaignId={launchId}
              onClose={() => setLaunchId(null)}
              onLaunched={() => {
                refresh();
                setReportId(launchId);
                toast.success("Campaign confirmed. Sending progress is shown in your report.");
              }}
            />
          )}
          {reportId && (
            <AssistantCampaignReport
              key={reportId}
              campaignId={reportId}
              onClose={() => setReportId(null)}
            />
          )}{" "}
          {status === "submitted" && (
            <p role="status" className="text-sm text-muted-foreground">
              Working on your request…
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error.message}
            </p>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>
      {reviewOps.length > 0 && (
        <section aria-label="Action review" className="border-t bg-muted/20">
          <button
            type="button"
            aria-expanded={trayOpen}
            onClick={() => setReviewOpen(!trayOpen)}
            className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-5 py-2.5 text-left"
          >
            <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
              <ClipboardList className="size-4 shrink-0 text-primary" />
              Actions
              <Badge variant="secondary" className="rounded-full px-2 text-[10px]">
                {reviewOps.length}
              </Badge>
              {awaitingReview > 0 && (
                <Badge className="rounded-full px-2 text-[10px]">
                  {awaitingReview} to review
                </Badge>
              )}
            </span>
            <ChevronDown
              className={`size-4 shrink-0 text-muted-foreground transition-transform ${trayOpen ? "rotate-180" : ""}`}
            />
          </button>
          {trayOpen && (
            <div className="mx-auto max-h-72 w-full max-w-3xl space-y-3 overflow-y-auto px-4 pb-4 md:px-5">
              {reviewOps.map((op) => {
            const args = op.arguments as Record<string, unknown>,
              out = op.outcome as Record<string, unknown> | null;
            const expired = Date.parse(op.expires_at) <= Date.now();
            return (
              <article
                key={op.id}
                className="space-y-3 rounded-lg border border-border bg-card p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <h2 className="min-w-0 font-semibold">
                    {String(op.campaign?.name ?? args.name ?? "Action")} ·{" "}
                    {op.status === "completed"
                      ? op.kind === "campaign_draft"
                        ? assistantCampaignStatus(op.campaign?.status)
                        : "Saved"
                      : expired
                        ? "Expired"
                        : "Review"}
                  </h2>
                  <Badge variant="outline" className="shrink-0 rounded-full text-[10px]">
                    {op.kind === "campaign_draft" && op.status === "completed"
                      ? "campaign"
                      : op.kind.replaceAll("_", " ")}
                  </Badge>
                </div>
                {op.kind === "contact_import" ? (
                  <p className="text-sm">
                    {String(args.valid)} valid · {String(args.invalid)} invalid ·{" "}
                    {String(args.duplicates)} duplicates
                  </p>
                ) : op.kind === "campaign_draft" ? (
                  <>
                    <p className="text-sm text-muted-foreground">{String(args.listName)}</p>
                    <p className="whitespace-pre-wrap break-words text-sm">
                      {String(op.campaign?.message_body ?? args.body)}
                    </p>
                    {op.status === "completed" &&
                      !canSendAssistantCampaign(op.campaign?.status) && (
                        <p role="status" className="text-sm">
                          {op.campaign?.status === "sent"
                            ? "Sending is complete. Open the report below for confirmed delivery results."
                            : "This campaign is no longer a draft. Check its current progress below."}
                        </p>
                      )}
                  </>
                ) : op.kind === "account_edit" ? (
                  <div className="space-y-2 text-sm">
                    <p className="font-medium">{String(args.targetName)}</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div>
                        <p className="text-xs text-muted-foreground">Current</p>
                        <p className="whitespace-pre-wrap break-words">
                          {String(args.before ?? "Not set")}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Proposed</p>
                        <p className="whitespace-pre-wrap break-words">{String(args.value)}</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap text-sm">
                    {String((args.config as Record<string, unknown>)?.agentInstructions ?? "")}
                  </p>
                )}
                {op.status === "pending" && !expired && (
                  <>
                    {op.kind === "contact_import" && (
                      <label className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={consents[op.id] ?? false}
                          onCheckedChange={(v) =>
                            setConsents((c) => ({ ...c, [op.id]: v === true }))
                          }
                        />
                        These contacts explicitly opted in to receive my SMS.
                      </label>
                    )}
                    <div className="flex gap-2">
                      <Button
                        disabled={
                          busy !== null || (op.kind === "contact_import" && !consents[op.id])
                        }
                        onClick={async () => {
                          setBusy(op.id);
                          try {
                            await confirm({
                              data: { id: op.id, consent: consents[op.id] ?? false },
                            });
                            toast.success("Saved successfully");
                            refresh();
                          } catch (e) {
                            toast.error(e instanceof Error ? e.message : "Could not save.");
                          } finally {
                            setBusy(null);
                          }
                        }}
                      >
                        <Check />
                        {op.kind === "contact_import"
                          ? "Confirm import"
                          : op.kind === "account_edit"
                            ? "Confirm change"
                            : "Save draft"}
                      </Button>
                      <Button
                        variant="ghost"
                        disabled={busy !== null}
                        onClick={async () => {
                          try {
                            await cancel({ data: { id: op.id } });
                            refresh();
                          } catch (e) {
                            toast.error(e instanceof Error ? e.message : "Could not cancel.");
                          }
                        }}
                      >
                        <X />
                        Cancel
                      </Button>
                    </div>
                  </>
                )}
                {op.status === "completed" && Boolean(out?.campaignId) && (
                  <div className="flex flex-wrap gap-2">
                    {canSendAssistantCampaign(op.campaign?.status) ? (
                      <>
                        <Button
                          disabled={generating || speaking || fileBusy || !!pendingUpload}
                          onClick={() => setLaunchId(String(out?.campaignId))}
                        >
                          <Send />
                          Send campaign
                        </Button>
                        <Button variant="outline" asChild>
                          <Link to="/app/campaigns/new" search={{ id: String(out?.campaignId) }}>
                            Review / edit
                            <ArrowUpRight />
                          </Link>
                        </Button>
                      </>
                    ) : (
                      <Button
                        variant="outline"
                        onClick={() => setReportId(String(out?.campaignId))}
                      >
                        View delivery report
                        <ArrowUpRight />
                      </Button>
                    )}
                  </div>
                )}
                {op.status === "completed" && Boolean(out?.assistantId) && (
                  <Button variant="outline" asChild>
                    <Link to="/app/receptionist">
                      Open assistant settings
                      <ArrowUpRight />
                    </Link>
                  </Button>
                )}
              </article>
            );
          })}
            </div>
          )}
        </section>
      )}
      <footer className="mx-auto w-full max-w-3xl p-4 md:p-5">
        <input
          hidden
          ref={fileRef}
          type="file"
          accept=".csv,.txt"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void fileChange(file);
          }}
        />
        <PromptInput className="assistant-composer" onSubmit={submitInput}>
          <PromptInputTextarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              pendingUpload
                ? pendingUpload.stage === "country"
                  ? "Country name…"
                  : "List name…"
                : "Ask about anything in your account…"
            }
            disabled={speaking || fileBusy}
            maxLength={8000}
          />
          <PromptInputFooter className="justify-between">
            <div className="flex min-w-0 items-center gap-1">
              <Button
                type="button"
                aria-label="Upload a contact list"
                title="Upload a contact list (CSV or text)"
                variant="ghost"
                size="sm"
                disabled={fileBusy || generating || speaking || !!pendingUpload}
                onClick={() => fileRef.current?.click()}
              >
                <Upload />
                {fileBusy ? "Inspecting…" : "Upload"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
              disabled={
                generating || speaking || fileBusy || !!pendingUpload || !voiceAccess?.available
              }
              title={
                voiceAccess?.available
                  ? "Use your microphone to explain your request"
                  : "Voice is coming soon; currently limited to the verified pilot account"
              }
              aria-label={
                voiceAccess?.available ? "Voice instructions" : "Voice instructions coming soon"
              }
              onClick={voice.start}
            >
              <Mic />
              {voiceAccess?.available ? "Voice instructions" : "Voice · Coming soon"}
              </Button>
            </div>
            <PromptInputSubmit
              status={status}
              onStop={stop}
              disabled={!generating && (!input.trim() || speaking || fileBusy)}
            />
          </PromptInputFooter>
        </PromptInput>
      </footer>
    </div>
  );
}
