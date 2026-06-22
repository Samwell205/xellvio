// Server-only Gorgias helpdesk integration.
// Each tenant connects their own Gorgias account (domain + email + API key).
// Outbound SMS we send and inbound replies we receive both land on a single
// rolling ticket per customer phone number.

type GorgiasCreds = {
  domain: string; // e.g. "mybrand" → mybrand.gorgias.com
  email: string;
  apiKey: string;
};

function basic(creds: GorgiasCreds) {
  return "Basic " + Buffer.from(`${creds.email}:${creds.apiKey}`).toString("base64");
}

function baseUrl(creds: GorgiasCreds) {
  const d = creds.domain.trim().replace(/^https?:\/\//, "").replace(/\.gorgias\.com.*$/i, "");
  return `https://${d}.gorgias.com`;
}

async function gorgias<T = any>(creds: GorgiasCreds, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${baseUrl(creds)}${path}`, {
    ...init,
    headers: {
      Authorization: basic(creds),
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init.headers ?? {}),
    },
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Gorgias ${res.status}: ${json?.error?.message ?? json?.message ?? "request failed"}`);
  }
  return json as T;
}

/** Lightweight credential check used by the Settings UI. */
export async function verifyGorgias(creds: GorgiasCreds): Promise<{ ok: true; account: any }> {
  const account = await gorgias(creds, "/api/account");
  return { ok: true, account };
}

async function getTenantCreds(accountId: string): Promise<GorgiasCreds | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("accounts")
    .select("gorgias_enabled,gorgias_domain,gorgias_email,gorgias_api_key_enc")
    .eq("id", accountId)
    .maybeSingle();
  if (!data?.gorgias_enabled || !data.gorgias_domain || !data.gorgias_email || !data.gorgias_api_key_enc) {
    return null;
  }
  const { decryptToken } = await import("./tenant-crypto.server");
  return {
    domain: data.gorgias_domain,
    email: data.gorgias_email,
    apiKey: decryptToken(data.gorgias_api_key_enc as unknown as string),
  };
}

async function findOrCreateCustomer(creds: GorgiasCreds, phone: string): Promise<number> {
  // Search by channel handle
  try {
    const search: any = await gorgias(creds, `/api/customers?channel=sms&handle=${encodeURIComponent(phone)}&limit=1`);
    const hit = search?.data?.[0];
    if (hit?.id) return hit.id;
  } catch {
    /* fall through to create */
  }
  const created: any = await gorgias(creds, "/api/customers", {
    method: "POST",
    body: JSON.stringify({
      channels: [{ type: "sms", address: phone }],
      name: phone,
    }),
  });
  return created.id;
}

async function findOrCreateTicket(args: {
  accountId: string;
  creds: GorgiasCreds;
  phone: string;
  fromNumber?: string | null;
}): Promise<number> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: existing } = await supabaseAdmin
    .from("gorgias_ticket_map")
    .select("gorgias_ticket_id")
    .eq("account_id", args.accountId)
    .eq("phone_e164", args.phone)
    .maybeSingle();

  if (existing?.gorgias_ticket_id) {
    // If ticket is closed, reopen it so new messages keep arriving on the same thread.
    try {
      await gorgias(args.creds, `/api/tickets/${existing.gorgias_ticket_id}`, {
        method: "PUT",
        body: JSON.stringify({ status: "open" }),
      });
    } catch {
      /* ignore reopen errors */
    }
    return existing.gorgias_ticket_id;
  }

  const customerId = await findOrCreateCustomer(args.creds, args.phone);
  const ticket: any = await gorgias(args.creds, "/api/tickets", {
    method: "POST",
    body: JSON.stringify({
      channel: "sms",
      via: "sms",
      subject: `SMS conversation with ${args.phone}`,
      customer: { id: customerId },
      messages: [
        {
          channel: "sms",
          via: "sms",
          from_agent: false,
          sender: { id: customerId },
          source: { type: "sms", to: [{ address: args.fromNumber ?? "" }], from: { address: args.phone } },
          body_text: "Conversation opened.",
        },
      ],
    }),
  });
  await supabaseAdmin
    .from("gorgias_ticket_map")
    .upsert(
      {
        account_id: args.accountId,
        phone_e164: args.phone,
        gorgias_ticket_id: ticket.id,
        gorgias_customer_id: customerId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "account_id,phone_e164" },
    );
  return ticket.id;
}

export type GorgiasForwardInput = {
  accountId: string;
  phone: string; // customer phone (E.164)
  fromNumber?: string | null; // our Twilio number
  body: string;
  direction: "inbound" | "outbound";
};

/**
 * Forward an SMS to Gorgias. Safe to call regardless of whether the tenant
 * has Gorgias enabled — silently no-ops when not configured, and never throws
 * back into the SMS pipeline. Returns true if forwarded.
 */
export async function forwardSmsToGorgias(input: GorgiasForwardInput): Promise<boolean> {
  try {
    const creds = await getTenantCreds(input.accountId);
    if (!creds) return false;
    const ticketId = await findOrCreateTicket({
      accountId: input.accountId,
      creds,
      phone: input.phone,
      fromNumber: input.fromNumber ?? null,
    });
    const customerId = await findOrCreateCustomer(creds, input.phone);
    const message =
      input.direction === "inbound"
        ? {
            channel: "sms",
            via: "sms",
            from_agent: false,
            sender: { id: customerId },
            source: {
              type: "sms",
              to: [{ address: input.fromNumber ?? "" }],
              from: { address: input.phone },
            },
            body_text: input.body,
          }
        : {
            channel: "sms",
            via: "sms",
            from_agent: true,
            source: {
              type: "sms",
              to: [{ address: input.phone }],
              from: { address: input.fromNumber ?? "" },
            },
            body_text: input.body,
          };
    await gorgias(creds, `/api/tickets/${ticketId}/messages`, {
      method: "POST",
      body: JSON.stringify(message),
    });
    return true;
  } catch (e) {
    console.error("[gorgias] forward failed", { accountId: input.accountId, error: String(e) });
    return false;
  }
}
