import { useEffect, useRef, useState } from "react";
import { MessageCircle, Send, X, Loader2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { useServerFn } from "@tanstack/react-start";
import { chatWithSupportBot } from "@/lib/chat.functions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Msg = { role: "user" | "assistant"; content: string };

const GREETING: Msg = {
  role: "assistant",
  content:
    "👋 Hi! I'm the Samwell Global SMS assistant. Ask me about sign up, verifying your email, importing contacts, sending SMS, or anything else.",
};

export function AiChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([GREETING]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const sendChat = useServerFn(chatWithSupportBot);
  const scrollRef = useRef<HTMLDivElement>(null);

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

  return (
    <>
      <button
        type="button"
        aria-label={open ? "Close support chat" : "Open support chat"}
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-5 right-5 z-50 grid size-14 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 transition hover:scale-105"
      >
        {open ? <X className="size-6" /> : <MessageCircle className="size-6" />}
      </button>

      <div
        className={cn(
          "fixed bottom-24 right-5 z-50 flex w-[min(380px,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-xl border bg-background shadow-2xl transition-all",
          open ? "pointer-events-auto translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0",
        )}
        style={{ height: "min(560px, calc(100vh - 8rem))" }}
        role="dialog"
        aria-label="Support chat"
      >
        <div className="flex items-center justify-between border-b bg-secondary px-4 py-3 text-secondary-foreground">
          <div>
            <div className="text-sm font-semibold">Samwell Support</div>
            <div className="text-xs opacity-70">AI assistant • replies in seconds</div>
          </div>
          <button onClick={() => setOpen(false)} aria-label="Close" className="opacity-70 hover:opacity-100">
            <X className="size-4" />
          </button>
        </div>

        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {messages.map((m, i) => (
            <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed",
                  m.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-foreground",
                )}
              >
                {m.role === "assistant" ? (
                  <div className="prose prose-sm max-w-none dark:prose-invert prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-a:text-primary">
                    <ReactMarkdown>{m.content}</ReactMarkdown>
                  </div>
                ) : (
                  <span className="whitespace-pre-wrap">{m.content}</span>
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="flex items-center gap-2 rounded-2xl bg-muted px-3.5 py-2 text-sm text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" /> Thinking…
              </div>
            </div>
          )}
        </div>

        <form onSubmit={handleSend} className="flex items-end gap-2 border-t bg-background p-3">
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
            placeholder="Ask anything about the platform…"
            className="max-h-32 flex-1 resize-none rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <Button type="submit" size="icon" disabled={loading || !input.trim()} aria-label="Send">
            <Send className="size-4" />
          </Button>
        </form>
      </div>
    </>
  );
}
