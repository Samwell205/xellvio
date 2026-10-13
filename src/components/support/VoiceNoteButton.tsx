import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Mic, Square } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { transcribeCopilotVoiceNote } from "@/lib/support-copilot.functions";

const MAX_SECONDS = 300;

function pickMime() {
  if (typeof MediaRecorder === "undefined") return "";
  for (const m of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"]) if (MediaRecorder.isTypeSupported(m)) return m;
  return "";
}

/** Records a voice note, transcribes it and hands back the text for review before sending. */
export function VoiceNoteButton({ onText }: { onText: (text: string) => void }) {
  const transcribe = useServerFn(transcribeCopilotVoiceNote);
  const [state, setState] = useState<"idle" | "recording" | "working">("idle");
  const [secs, setSecs] = useState(0);
  const rec = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (timer.current) clearInterval(timer.current); rec.current?.stream.getTracks().forEach((t) => t.stop()); }, []);

  const stop = () => { if (rec.current?.state === "recording") rec.current.stop(); };

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = pickMime();
      const r = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const chunks: Blob[] = [];
      r.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      r.onstop = async () => {
        if (timer.current) clearInterval(timer.current);
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: r.mimeType || mime || "audio/webm" });
        if (blob.size < 1000) { setState("idle"); toast.info("Voice note was too short."); return; }
        setState("working");
        try {
          const buf = new Uint8Array(await blob.arrayBuffer());
          let bin = ""; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
          const { text } = await transcribe({ data: { audioBase64: btoa(bin), mimeType: blob.type } });
          onText(text);
          toast.success("Voice note added — review it, then send");
        } catch (e: any) { toast.error(e?.message ?? "Could not transcribe the voice note"); }
        finally { setState("idle"); }
      };
      rec.current = r; r.start(); setSecs(0); setState("recording");
      timer.current = setInterval(() => setSecs((s) => { if (s + 1 >= MAX_SECONDS) stop(); return s + 1; }), 1000);
    } catch { toast.error("Microphone access is needed to record a voice note."); }
  };

  if (state === "recording") {
    return (
      <Button size="sm" variant="destructive" type="button" onClick={stop} aria-label="Stop recording" className="gap-1.5 tabular-nums">
        <Square className="size-3.5 fill-current" />
        <span className="size-2 animate-pulse rounded-full bg-destructive-foreground" />
        {Math.floor(secs / 60)}:{String(secs % 60).padStart(2, "0")}
      </Button>
    );
  }
  return (
    <Button size="icon" variant="ghost" type="button" disabled={state === "working"} onClick={start}
      aria-label="Record voice note" title="Record a voice note">
      {state === "working" ? <Loader2 className="size-4 animate-spin" /> : <Mic className="size-4" />}
    </Button>
  );
}
