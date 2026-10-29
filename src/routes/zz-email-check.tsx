import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { EmailContentChooser, EmailDesigner } from "@/components/email/EmailDesigner";
import type { EmailDraft } from "@/lib/email-campaign-rules";

export const Route = createFileRoute("/zz-email-check")({ component: Check });
function Check() {
  const [d, setD] = useState<EmailDraft>({ id: crypto.randomUUID(), name: "T", subject: "", preheader: "", from_name: "SAMWELL", from_email: "", reply_to: "", list_id: null, postal_address: "651 N Broad St", blocks: [], content_mode: "design", plain_body: "", html_body: "", theme: {} });
  const [step, setStep] = useState(1); const [v, setV] = useState<"visual" | "code">("visual");
  const patch = (x: Partial<EmailDraft>) => setD((o) => ({ ...o, ...x }));
  return <div className="p-6"><pre id="htmlout" className="hidden">{d.html_body}</pre>{step === 1 ? <EmailContentChooser draft={d} onPick={(x, m) => { patch(x); setV(m === "html" ? "code" : "visual"); setStep(2); }} /> : <EmailDesigner draft={d} onChange={patch} onChangeMethod={() => setStep(1)} htmlView={v} onHtmlView={setV} />}</div>;
}
