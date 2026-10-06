import { useEffect, useRef, useState } from "react";
import { MessageCircle, Send, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { useServerFn } from "@tanstack/react-start";
import { useRouterState } from "@tanstack/react-router";
import { chatWithSupportBot } from "@/lib/chat.functions";
import { cn } from "@/lib/utils";

type Msg = { role: "user" | "assistant"; content: string };

const GREETING: Msg = {
  role: "assistant",
  content:
    "👋 Hi! I'm the Xellvio assistant. Ask me anything — or paste a message you plan to send, e.g. *Review this: \"your text\"*, and I'll check if it's allowed and suggest fixes.",
};

// Turn bare "/contact"-style paths into clickable links.
function linkify(text: string) {
  return text.replace(/(^|[\s(])(\/(?:contact|auth|forgot-password|pricing|app\/[a-z0-9\-/]+))(?=[\s.,)!?]|$)/g, "$1[$2]($2)");
}

const WIDGET_STYLES = `
@keyframes xv-msg-in {
  0% { opacity: 0; transform: translateY(14px) scale(0.96); }
  60% { opacity: 1; transform: translateY(-2px) scale(1.01); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes xv-panel-in {
  0% { opacity: 0; transform: translateY(24px) scale(0.92); }
  60% { opacity: 1; transform: translateY(-4px) scale(1.01); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes xv-wave {
  0%, 100% { transform: scaleY(0.4); }
  50% { transform: scaleY(1); }
}
.xv-msg { animation: xv-msg-in 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) both; }
.xv-panel-open { animation: xv-panel-in 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both; }
.xv-scroll::-webkit-scrollbar { width: 4px; }
.xv-scroll::-webkit-scrollbar-track { background: rgba(255,255,255,0.02); }
.xv-scroll::-webkit-scrollbar-thumb { background: rgba(124,58,237,0.35); border-radius: 10px; }
`;

function TypingWave() {
  return (
    <div className="flex items-end gap-1 px-1 py-1" aria-label="Assistant is typing">
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className="block w-1 rounded-full bg-[#22D3EE]"
          style={{ height: 14, animation: `xv-wave 0.9s ease-in-out ${i * 0.12}s infinite` }}
        />
      ))}
    </div>
  );
}

export function AiChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([GREETING]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [human, setHuman] = useState(false);
  const [humanDone, setHumanDone] = useState(false);
  const [hName, setHName] = useState("");
  const [hEmail, setHEmail] = useState("");
  const [hMsg, setHMsg] = useState("");
  const [hErr, setHErr] = useState<string | null>(null);
  const [hSending, setHSending] = useState(false);
  const sendChat = useServerFn(chatWithSupportBot);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // Full-screen editors (automation builder) need the bottom-right corner for their own controls.
  const hidden = /^\/app\/automations\/[^/]+/.test(pathname);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, open, loading]);

  async function handleSend(e?: React.FormEvent) {
    e?.preventDefault();
    const text = input.trim();
    if (!text || loading) return;
    const next: Msg[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      const { reply } = await sendChat({ data: { messages: next } });
      setMessages((m) => [...m, { role: "assistant", content: reply }]);
    } catch (err) {
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content:
            (err instanceof Error ? err.message : "Something went wrong.") +
            " You can also reach us at the [Contact page](/contact).",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function openHuman() {
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    setHMsg(lastUser?.content ?? "");
    setHErr(null);
    setHuman(true);
    import("@/integrations/supabase/client").then(({ supabase }) =>
      supabase.auth.getUser().then(({ data }) => {
        if (data.user?.email) setHEmail((v) => v || data.user!.email!);
      }),
    );
  }

  async function sendToHuman(e: React.FormEvent) {
    e.preventDefault();
    setHSending(true);
    setHErr(null);
    const transcript = messages
      .slice(1)
      .slice(-10)
      .map((m) => `${m.role === "user" ? "Tenant" : "Assistant"}: ${m.content}`)
      .join("\n\n");
    const message = `${hMsg}\n\n--- Chat history ---\n${transcript}`.slice(0, 2000);
    try {
      const r = await fetch("/api/public/contact", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: hName, email: hEmail, topic: "Support chat", message, user_agent: navigator.userAgent }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error ?? "Could not send");
      setHumanDone(true);
    } catch (err) {
      setHErr(err instanceof Error ? err.message : "Could not send");
    } finally {
      setHSending(false);
    }
  }

  if (hidden) return null;

  return (
    <>
      <style>{WIDGET_STYLES}</style>

      {/* Launcher orb */}
      <button
        type="button"
        aria-label={open ? "Close support chat" : "Open support chat"}
        onClick={() => setOpen((v) => !v)}
        className="group fixed bottom-5 right-5 z-50 grid size-16 place-items-center rounded-full border border-white/10 bg-[#0B0B14] transition-all duration-300 hover:scale-110 active:scale-95"
      >
        {/* Orbiting rings */}
        <span className="pointer-events-none absolute inset-0 rounded-full border border-[#7C3AED]/30 [animation:spin_4s_linear_infinite]" />
        <span className="pointer-events-none absolute inset-0 rounded-full border border-[#22D3EE]/20 [animation:spin_7s_linear_infinite_reverse]" />
        {/* Outer glow */}
        <span className="pointer-events-none absolute -inset-1 rounded-full bg-gradient-to-tr from-[#7C3AED] via-[#F0ABFC] to-[#22D3EE] opacity-60 blur-md transition duration-500 group-hover:opacity-100" />
        {/* Face */}
        <span className="relative grid size-full place-items-center overflow-hidden rounded-full bg-[#0B0B14] text-white">
          {open ? <X className="size-6" /> : <MessageCircle className="size-7" />}
        </span>
      </button>

      {/* Panel */}
      <div
        className={cn(
          "fixed bottom-24 right-5 z-50 flex w-[min(380px,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-[2rem] border border-white/10 bg-[#0B0B14]/90 shadow-[0_0_40px_-10px_rgba(124,58,237,0.3)] backdrop-blur-2xl transition-all",
          open ? "xv-panel-open pointer-events-auto opacity-100" : "pointer-events-none translate-y-3 opacity-0",
        )}
        style={{ height: "min(560px, calc(100vh - 8rem))", fontFamily: "'DM Sans', sans-serif" }}
        role="dialog"
        aria-label="Support chat"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/5 bg-gradient-to-r from-[#7C3AED]/20 to-[#22D3EE]/20 p-5">
          <div>
            <h3 className="text-lg font-bold tracking-tight text-white" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              Xellvio Support
            </h3>
            <div className="flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#22D3EE] opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-[#22D3EE]" />
              </span>
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#22D3EE]">AI assistant • active</p>
            </div>
          </div>
          <button onClick={() => setOpen(false)} aria-label="Close" className="text-white/40 transition-colors hover:text-white">
            <X className="size-5" />
          </button>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="xv-scroll flex-1 space-y-4 overflow-y-auto p-4">
          {messages.map((m, i) => (
            <div key={i} className={cn("xv-msg flex flex-col", m.role === "user" ? "items-end" : "items-start")}>
              <div
                className={cn(
                  "rounded-[1.5rem] p-4 text-sm leading-relaxed",
                  m.role === "user"
                    ? "max-w-[85%] rounded-tr-none bg-gradient-to-br from-[#7C3AED] to-[#F0ABFC] font-medium text-white shadow-[0_4px_15px_rgba(124,58,237,0.3)]"
                    : "max-w-[90%] rounded-tl-none border border-white/5 bg-[#161625] text-white/90",
                )}
              >
                {m.role === "assistant" ? (
                  <div className="prose prose-sm prose-invert max-w-none prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-a:text-[#22D3EE]">
                    <ReactMarkdown
                      components={{
                        a: ({ href, children }) => (
                          <a
                            href={href}
                            className="font-medium text-[#22D3EE] underline decoration-[#22D3EE]/40 underline-offset-4"
                            target={href?.startsWith("/") ? undefined : "_blank"}
                            rel="noreferrer"
                          >
                            {children}
                          </a>
                        ),
                      }}
                    >
                      {linkify(m.content)}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <span className="whitespace-pre-wrap">{m.content}</span>
                )}
              </div>
              <span
                className={cn(
                  "mt-1 text-[10px] font-bold uppercase",
                  m.role === "user" ? "mr-1 text-white/30" : "ml-1 text-[#7C3AED]",
                )}
              >
                {m.role === "user" ? "You" : "Xellvio AI"}
              </span>
            </div>
          ))}
          {loading && (
            <div className="xv-msg flex flex-col items-start">
              <div className="rounded-[1.5rem] rounded-tl-none border border-white/5 bg-[#161625] px-4 py-2">
                <TypingWave />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {human ? (
          <form onSubmit={sendToHuman} className="space-y-2 border-t border-white/5 bg-black/40 p-4">
            {humanDone ? (
              <p className="text-sm text-white/90">✅ Sent! Our team will reply to your email soon.</p>
            ) : (
              <>
                <div className="flex gap-2">
                  <input
                    required
                    minLength={2}
                    value={hName}
                    onChange={(e) => setHName(e.target.value)}
                    placeholder="Your name"
                    className="w-1/2 rounded-xl border border-white/10 bg-[#0B0B14] px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-[#7C3AED]"
                  />
                  <input
                    required
                    type="email"
                    value={hEmail}
                    onChange={(e) => setHEmail(e.target.value)}
                    placeholder="Your email"
                    className="w-1/2 rounded-xl border border-white/10 bg-[#0B0B14] px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-[#7C3AED]"
                  />
                </div>
                <textarea
                  required
                  minLength={10}
                  value={hMsg}
                  onChange={(e) => setHMsg(e.target.value)}
                  rows={3}
                  placeholder="Describe your problem…"
                  className="w-full resize-none rounded-xl border border-white/10 bg-[#0B0B14] px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-[#7C3AED]"
                />
                {hErr && <p className="text-xs text-[#F0ABFC]">{hErr}</p>}
              </>
            )}
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  setHuman(false);
                  setHumanDone(false);
                }}
                className="text-xs font-bold text-white/40 transition-colors hover:text-white"
              >
                ← Back to chat
              </button>
              {!humanDone && (
                <button
                  type="submit"
                  disabled={hSending}
                  className="rounded-xl bg-gradient-to-tr from-[#7C3AED] to-[#22D3EE] px-4 py-2 text-xs font-bold text-white shadow-lg transition active:scale-95 disabled:opacity-50"
                >
                  {hSending ? "Sending…" : "Send to team"}
                </button>
              )}
            </div>
          </form>
        ) : (
          <div className="border-t border-white/5 bg-black/40 p-4">
            <button
              type="button"
              onClick={openHuman}
              className="group mb-3 flex items-center gap-1 px-1 text-[11px] font-bold text-[#22D3EE]"
            >
              TALK TO A HUMAN
              <span className="transition-transform group-hover:translate-x-1">→</span>
            </button>
            <form onSubmit={handleSend} className="group relative">
              <div className="absolute -inset-0.5 rounded-2xl bg-gradient-to-r from-[#7C3AED] to-[#22D3EE] opacity-20 blur transition duration-500 group-focus-within:opacity-50" />
              <div className="relative flex items-center rounded-2xl border border-white/10 bg-[#0B0B14] px-4 py-2">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  rows={1}
                  placeholder="Ask anything…"
                  className="max-h-32 w-full flex-1 resize-none border-none bg-transparent py-1 text-sm text-white placeholder-white/20 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={loading || !input.trim()}
                  aria-label="Send"
                  className="ml-2 rounded-lg bg-gradient-to-tr from-[#7C3AED] to-[#22D3EE] p-1.5 text-white shadow-lg transition active:scale-95 disabled:opacity-40"
                >
                  <Send className="size-4" />
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </>
  );
}
