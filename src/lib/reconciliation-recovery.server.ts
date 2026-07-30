type RecoveryStatus =
  | "draft"
  | "pending_provider"
  | "provider_credited"
  | "provider_rejected"
  | "tenant_pending"
  | "tenant_collected"
  | "closed";

const allowedStatuses = new Set<RecoveryStatus>([
  "draft",
  "pending_provider",
  "provider_credited",
  "provider_rejected",
  "tenant_pending",
  "tenant_collected",
  "closed",
]);

export async function listRecoveryCases(admin: any) {
  const { data, error } = await admin
    .from("financial_recovery_cases")
    .select("*,accounts(email,full_name,company,legal_business_name)")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function updateRecoveryCase(
  admin: any,
  input: { id: string; status: string; providerCreditReceived?: number; tenantAmountCollected?: number; adminNotes?: string },
) {
  if (!allowedStatuses.has(input.status as RecoveryStatus)) throw new Error("Invalid recovery status");
  const update: Record<string, unknown> = { status: input.status };
  if (typeof input.providerCreditReceived === "number") update.provider_credit_received = input.providerCreditReceived;
  if (typeof input.tenantAmountCollected === "number") update.tenant_amount_collected = input.tenantAmountCollected;
  if (typeof input.adminNotes === "string") update.admin_notes = input.adminNotes.slice(0, 4000);
  const { data, error } = await admin.from("financial_recovery_cases").update(update).eq("id", input.id).select("*").single();
  if (error) throw new Error(error.message);
  return data;
}

function csvCell(value: unknown) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

export async function recoveryCaseCsv(admin: any, id: string) {
  const { data: recovery, error } = await admin
    .from("financial_recovery_cases")
    .select("*,accounts(email,full_name,company,legal_business_name)")
    .eq("id", id)
    .single();
  if (error) throw new Error(error.message);
  const evidence = recovery.evidence ?? {};
  const rows = [
    ["Recovery case", recovery.title],
    ["Tenant", recovery.accounts?.legal_business_name || recovery.accounts?.company || recovery.accounts?.full_name || recovery.accounts?.email],
    ["Status", recovery.status],
    ["Evidence quality", recovery.evidence_quality],
    ["Verified funding", recovery.verified_funding],
    ["Verified tenant debits", recovery.verified_tenant_debits],
    ["Verified uncovered tenant charge", recovery.verified_uncovered_tenant_charge],
    ["Disputed attempts", recovery.disputed_provider_attempts],
    ["Disputed amount", recovery.disputed_provider_amount],
    ["Provider credit received", recovery.provider_credit_received],
    ["Tenant amount collected", recovery.tenant_amount_collected],
    ["Campaigns", recovery.campaign_ids.join(" | ")],
    ["Retry window", `${evidence.retry_window_start ?? ""} – ${evidence.retry_window_end ?? ""}`],
    ["Limitation", evidence.limitation ?? ""],
    ["Summary", recovery.summary],
  ];
  return rows.map((row) => row.map(csvCell).join(",")).join("\n");
}

export async function sendRecoveryNotice(admin: any, id: string) {
  const { data: recovery, error } = await admin
    .from("financial_recovery_cases")
    .select("*,accounts(email,contact_email,full_name)")
    .eq("id", id)
    .single();
  if (error) throw new Error(error.message);
  const email = recovery.accounts?.contact_email || recovery.accounts?.email;
  if (!email) throw new Error("Tenant has no contact email");
  const { sendBrandedEmail } = await import("@/lib/email/send-internal.server");
  return sendBrandedEmail({
    templateName: "generic",
    recipientEmail: email,
    idempotencyKey: `financial-recovery-${id}-${recovery.updated_at}`,
    templateData: {
      subject: "Campaign billing review update",
      heading: "Campaign billing review",
      body: `Hello ${recovery.accounts?.full_name || "there"},\n\nWe reviewed the listed campaigns and verified ${Number(recovery.verified_tenant_debits).toFixed(2)} USD in account charges against ${Number(recovery.verified_funding).toFixed(2)} USD in funding. No additional tenant charge has been applied from estimated or incomplete evidence.\n\nStatus: ${String(recovery.status).replaceAll("_", " ")}.\n\nIf a verified correction becomes necessary, it will appear as a separate item in your account ledger.`,
      ctaText: "View billing",
      ctaUrl: "https://xellvio.com/app/billing",
    },
  });
}