export function canSendAssistantCampaign(status: unknown) {
  return status === "draft";
}

export function assistantCampaignStatus(status: unknown): string {
  const labels: Record<string, string> = { draft: "Draft", queued: "Queued for sending", scheduled: "Scheduled", sending: "Sending", processing: "Sending", sent: "Sending complete", paused: "Paused", paused_low_balance: "Paused — low balance", cancelled: "Cancelled" };
  return typeof status === "string" ? labels[status] ?? status.replaceAll("_", " ") : "Status unavailable";
}

export function summarizeAssistantDelivery(raw: unknown) {
  const s = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const count = (key: string) => typeof s[key] === "number" && Number.isFinite(s[key]) ? Number(s[key]) : null;
  const add = (a: number | null, b: number | null) => a === null || b === null ? null : a + b;
  return { total: count("total"), delivered: count("delivered"), failed: count("failed"), awaitingDelivery: add(count("sent"), count("sent_with_error")), deliveryUnconfirmed: count("delivery_unconfirmed"), queued: add(count("queued"), count("sending")) };
}