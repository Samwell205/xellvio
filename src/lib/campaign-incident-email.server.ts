/** Narrow queue integration for campaign incidents; other email labels are unchanged. */
export const INCIDENT_EMAIL_LABEL = "campaign-spam-incident";
export const INCIDENT_EMAIL_KEY_PREFIX = "spamgate-incident-";

export type IncidentEmailPayload = Record<string, any>;
export type IncidentEmailState = "pending" | "queued" | "sent" | "failed" | "suppressed" | "missing";

export function isIncidentEmail(payload: IncidentEmailPayload): boolean {
  return payload?.label === INCIDENT_EMAIL_LABEL;
}

/** Expected-status CAS; never reset a committed enqueue after an uncertain response. */
export async function transitionIncidentOutbox(
  db: any, id: string, expected: IncidentEmailState, next: IncidentEmailState,
  error: string | null, retrySeconds = 300,
): Promise<boolean> {
  const { data, error: writeError } = await db.rpc("spam_gate_outbox_mark", {
    _outbox_id: id, _expected_status: expected, _status: next,
    _error: error, _retry_delay_seconds: retrySeconds,
  });
  if (writeError) throw new Error("Incident notification state could not be saved");
  return data === true;
}

async function readOwnedOutbox(db: any, payload: IncidentEmailPayload): Promise<any> {
  const id = payload?.incident_outbox_id;
  if (typeof id !== "string" || !id) throw new Error("Incident email is missing its outbox identity");
  const { data: row, error } = await db.from("campaign_spam_email_outbox")
    .select("id,campaign_id,status,payload").eq("id", id).maybeSingle();
  if (error || !row) throw new Error("Incident email identity could not be verified");
  const key = `${INCIDENT_EMAIL_KEY_PREFIX}${row.campaign_id}`;
  const to = String(payload.to ?? "").trim().toLowerCase();
  const savedTo = String(row.payload?.to ?? "").trim().toLowerCase();
  if (!savedTo || to !== savedTo || payload.message_id !== key || payload.idempotency_key !== key) {
    throw new Error("Incident email does not match its server-owned outbox");
  }
  return row;
}

/** Recheck immediately before sendMail, after queue waiting and retries. Errors defer. */
export async function prepareIncidentEmailSend(
  db: any, payload: IncidentEmailPayload,
): Promise<{ send: boolean; reason?: string }> {
  if (!isIncidentEmail(payload)) return { send: true };
  const row = await readOwnedOutbox(db, payload);
  if (row.status === "sent") return { send: false, reason: "already_sent" };
  if (["suppressed", "missing", "failed"].includes(row.status)) return { send: false, reason: row.status };
  if (row.status !== "queued") throw new Error("Incident email is not committed to the queue");
  const to = String(payload.to).trim().toLowerCase();
  const { data: suppressed, error: suppressionError } = await db.from("suppressed_emails")
    .select("email").eq("email", to).maybeSingle();
  if (suppressionError) throw new Error("Incident email suppression check is unavailable");
  if (!suppressed) return { send: true };
  const changed = await transitionIncidentOutbox(db, row.id, "queued", "suppressed", "Recipient is on the suppression list");
  if (!changed) throw new Error("Incident email state changed during suppression check");
  const { error: logError } = await db.from("email_send_log").insert({
    message_id: payload.message_id, template_name: INCIDENT_EMAIL_LABEL,
    recipient_email: to, status: "suppressed", error_message: "Recipient is on the suppression list",
  });
  if (logError) throw new Error("Incident email suppression could not be recorded");
  return { send: false, reason: "suppressed" };
}

/** Called after actual sendMail success, or once retry/age policy stops attempts.
 * Policy exhaustion is manual-review state, not proof of recipient delivery failure. */
export async function recordIncidentEmailOutcome(
  db: any, payload: IncidentEmailPayload, outcome: "sent" | "failed", reason: string | null = null,
): Promise<void> {
  if (!isIncidentEmail(payload)) return;
  const row = await readOwnedOutbox(db, payload);
  if (row.status === "sent") return; // successful send proof is monotonic
  if (outcome === "failed" && row.status !== "queued") return;
  const changed = await transitionIncidentOutbox(db, row.id, row.status, outcome, reason);
  if (!changed) {
    // A second successful sender may have won the CAS. Verify rather than claim failure.
    const current = await readOwnedOutbox(db, payload);
    if (current.status !== "sent" && current.status !== outcome) {
      throw new Error("Incident email outcome changed concurrently");
    }
  }
}

/** Lookup/suppression outages defer without consuming a provider-send retry. */
export async function deferIncidentEmail(db: any, payload: IncidentEmailPayload, reason: string): Promise<void> {
  if (!isIncidentEmail(payload)) return;
  const row = await readOwnedOutbox(db, payload);
  if (row.status === "queued") await transitionIncidentOutbox(db, row.id, "queued", "queued", reason, 300);
}
