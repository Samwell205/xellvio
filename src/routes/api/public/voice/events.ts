import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/api/public/voice/events")({ server: { handlers: { POST: async ({ request }) => {
  if (Number(request.headers.get("content-length")) > 262144) return new Response("Payload too large",{status:413});
  const raw = await request.text();
  if (raw.length > 262144) return new Response("Payload too large",{status:413});
  const key = process.env['TELNYX_PUBLIC_KEY'];
  const { verifyVoiceSignature } = await import("@/lib/receptionist/voice-signature.server");
  if (!key || !verifyVoiceSignature(raw,request.headers.get("telnyx-signature-ed25519"),request.headers.get("telnyx-timestamp"),key)) return new Response("Invalid signature",{status:401});
  let event: unknown;
  try { event = JSON.parse(raw); } catch { return new Response("Invalid event",{status:400}); }
  const { handleVoiceEvent,voiceEventSchema } = await import("@/lib/receptionist/voice.server");
  if (!voiceEventSchema.safeParse(event).success) return new Response("Invalid event",{status:400});
  try { await handleVoiceEvent(event); return new Response("ok"); } catch (err) { console.error("Voice event processing failed",err); return new Response("Retry event",{status:503}); }
} } } });