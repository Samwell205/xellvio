import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { MessageSquareText, Send, Search, Inbox } from "lucide-react";
import { listConversations, getConversation, sendReply } from "@/lib/inbox.functions";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/app/inbox")({
  component: InboxPage,
});

function formatTime(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function InboxPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listConversations);
  const getFn = useServerFn(getConversation);
  const replyFn = useServerFn(sendReply);

  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState("");
  const [manualPhone, setManualPhone] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const convos = useQuery({
    queryKey: ["inbox", "conversations"],
    queryFn: () => listFn(),
    refetchInterval: 15000,
  });

  const thread = useQuery({
    queryKey: ["inbox", "thread", selected],
    queryFn: () => getFn({ data: { phone: selected! } }),
    enabled: !!selected,
    refetchInterval: selected ? 8000 : false,
  });

  const reply = useMutation({
    mutationFn: (vars: { phone: string; body: string }) => replyFn({ data: vars }),
    onSuccess: () => {
      setDraft("");
      qc.invalidateQueries({ queryKey: ["inbox"] });
      toast.success("Reply sent");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to send"),
  });

  // Auto-select first conversation
  useEffect(() => {
    if (!selected && convos.data && convos.data.length > 0) {
      setSelected(convos.data[0].phone);
    }
  }, [convos.data, selected]);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [thread.data?.messages.length]);

  // Realtime: refresh on new inbound messages for this account
  useEffect(() => {
    const channel = supabase
      .channel("inbox-thread")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "sms_thread_messages" },
        () => {
          qc.invalidateQueries({ queryKey: ["inbox"] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);

  const filtered = (convos.data ?? []).filter((c) =>
    search ? c.phone.includes(search) : true,
  );

  function startNewConversation() {
    const phone = manualPhone.trim();
    if (!/^\+[1-9][0-9]{6,14}$/.test(phone)) {
      toast.error("Use E.164 format, e.g. +15551234567");
      return;
    }
    setSelected(phone);
    setManualPhone("");
  }

  return (
    <div className="flex flex-col gap-4 h-[calc(100vh-8rem)]">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Inbox className="size-6" /> Inbox
        </h1>
        <p className="text-sm text-muted-foreground">
          Two-way SMS conversations. Replies from contacts land here in real time.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] gap-4 flex-1 min-h-0">
        {/* Conversation list */}
        <Card className="flex flex-col min-h-0">
          <div className="p-3 border-b space-y-2">
            <div className="relative">
              <Search className="size-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search phone…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-9"
              />
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="+15551234567"
                value={manualPhone}
                onChange={(e) => setManualPhone(e.target.value)}
                className="h-9"
              />
              <Button size="sm" onClick={startNewConversation} variant="secondary">
                New
              </Button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {convos.isLoading ? (
              <div className="p-3 space-y-2">
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                <MessageSquareText className="size-8 mx-auto mb-2 opacity-50" />
                No conversations yet. Replies from your SMS campaigns will appear here.
              </div>
            ) : (
              filtered.map((c) => (
                <button
                  key={c.phone}
                  onClick={() => setSelected(c.phone)}
                  className={`w-full text-left px-3 py-2.5 border-b hover:bg-muted/50 transition ${
                    selected === c.phone ? "bg-muted" : ""
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-sm">{c.phone}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatTime(c.lastAt)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {c.lastDirection === "inbound" && (
                      <Badge variant="secondary" className="text-[10px] h-4 px-1">
                        reply
                      </Badge>
                    )}
                    <p className="text-xs text-muted-foreground truncate">{c.lastBody}</p>
                  </div>
                </button>
              ))
            )}
          </div>
        </Card>

        {/* Thread view */}
        <Card className="flex flex-col min-h-0">
          {!selected ? (
            <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
              Select a conversation to view messages.
            </div>
          ) : (
            <>
              <div className="px-4 py-3 border-b">
                <div className="font-semibold">{selected}</div>
                <div className="text-xs text-muted-foreground">SMS conversation</div>
              </div>
              <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-2">
                {thread.isLoading ? (
                  <Skeleton className="h-20 w-full" />
                ) : thread.data?.messages.length === 0 ? (
                  <div className="text-center text-sm text-muted-foreground py-8">
                    No messages yet. Send the first one below.
                  </div>
                ) : (
                  thread.data?.messages.map((m) => (
                    <div
                      key={m.id}
                      className={`flex ${m.direction === "outbound" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${
                          m.direction === "outbound"
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted"
                        }`}
                      >
                        <div className="whitespace-pre-wrap break-words">{m.body}</div>
                        <div
                          className={`text-[10px] mt-1 ${
                            m.direction === "outbound"
                              ? "text-primary-foreground/70"
                              : "text-muted-foreground"
                          }`}
                        >
                          {formatTime(m.created_at)}
                          {m.status ? ` · ${m.status}` : ""}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div className="border-t p-3 flex gap-2 items-end">
                <Textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && draft.trim()) {
                      reply.mutate({ phone: selected, body: draft.trim() });
                    }
                  }}
                  placeholder="Type a reply… (⌘/Ctrl + Enter to send)"
                  className="min-h-[60px] resize-none"
                />
                <Button
                  onClick={() => reply.mutate({ phone: selected, body: draft.trim() })}
                  disabled={!draft.trim() || reply.isPending}
                >
                  <Send className="size-4 mr-1" />
                  {reply.isPending ? "Sending…" : "Send"}
                </Button>
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
