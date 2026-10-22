import { tool } from "ai";
import { z } from "zod";
import { AREA_ACCESS, ACCOUNT_AREAS, EDIT_RULES, accountEditSchema, canUseAccountArea, type AccountArea } from "./account-assistant-catalog";
import { resolveActingAccount, assertOwner } from "./acting-account.server";
import { withSmsOptOut } from "./sms-optout";

const TABLES = { settings: "accounts", contact: "profiles", list: "contact_lists", campaign: "campaigns", website: "landing_pages", form: "signup_forms", automation: "automations", flow: "sms_flows" } as const;
const EDIT_COLUMNS = { settings: "id,full_name,company,phone", contact: "id,first_name,last_name", list: "id,name", campaign: "id,name,message_body,status", website: "id,name", form: "id,name", automation: "id,name,status", flow: "id,name,status" } as const;

export async function accountAreaAccess(userId: string, area: AccountArea) {
  const acting = await resolveActingAccount(userId);
  if (!canUseAccountArea(area, acting)) throw new Error("You do not have permission to access this account area.");
  if (area === "receptionist") {
    const { assertVoicePilotAccess } = await import("./voice-rollout.server");
    await assertVoicePilotAccess(userId, acting.accountId);
  }
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  return { acting, db };
}

export async function readAccountArea(userId: string, area: AccountArea, targetId: string | null) {
  const { acting, db } = await accountAreaAccess(userId, area);
  const done = <T,>(r: { data: T; error: unknown }) => {
    if (r.error) throw new Error("This account information could not be loaded. Please try again.");
    return { area, records: r.data, path: AREA_ACCESS[area].path, bounded: true };
  };
  const scope = <T extends { eq: (column: string, value: string) => T }>(q: T) => targetId ? q.eq("id", targetId) : q;
  switch (area) {
    case "settings": return done(await db.from("accounts").select("id,full_name,company,phone").eq("id", acting.accountId).single());
    case "billing": {
      const balance = await db.from("accounts").select("credit_balance,auto_recharge_enabled,auto_recharge_threshold,auto_recharge_amount").eq("id", acting.accountId).single();
      const payments = await db.from("payments").select("id,amount,currency,credits,status,paid_at,created_at").eq("account_id", acting.accountId).order("created_at", { ascending: false }).limit(20);
      if (balance.error || payments.error) throw new Error("Billing information could not be loaded.");
      return { area, balance: balance.data, recentPayments: payments.data, path: AREA_ACCESS[area].path, bounded: true };
    }
    case "team": return done(await db.from("account_members").select("id,invited_email,role,permissions,status").eq("account_id", acting.accountId).neq("status", "removed").limit(50));
    case "audience": return targetId
      ? done(await db.from("profiles").select("id,first_name,last_name,phone_e164,country_code").eq("account_id", acting.accountId).eq("id", targetId).limit(1))
      : done(await db.from("contact_lists").select("id,name").eq("account_id", acting.accountId).limit(50));
    case "campaigns": return done(await scope(db.from("campaigns").select("id,name,status,message_body,send_mode,created_at").eq("account_id", acting.accountId)).order("created_at", { ascending: false }).limit(25));
    case "websites": return done(await scope(db.from("landing_pages").select("id,name,headline,slug,published,seo_title,seo_description,updated_at").eq("account_id", acting.accountId)).limit(25));
    case "forms": return done(await scope(db.from("signup_forms").select("id,name,headline,description,slug,published,submissions,updated_at").eq("account_id", acting.accountId)).limit(25));
    case "leads": return done(await db.from("subscribe_submissions").select("id,first_name,last_name,phone_e164,source_id,source_type,created_at").eq("account_id", acting.accountId).order("created_at", { ascending: false }).limit(25));
    case "automations": return done(await scope(db.from("automations").select("id,name,status,updated_at").eq("account_id", acting.accountId)).limit(25));
    case "flows": return done(await scope(db.from("sms_flows").select("id,name,status,trigger_type,trigger_keyword,updated_at").eq("account_id", acting.accountId)).limit(25));
    case "numbers": return done(await db.from("sender_assets").select("id,phone_number,country_code,sender_kind,verification_status").eq("account_id", acting.accountId).limit(50));
    case "integrations": return done(await db.from("app_installations").select("id,app_id,status,installed_at").eq("workspace_id", acting.accountId).limit(50));
    case "receptionist": return done(await db.from("receptionist_assistants").select("id,name,sync_status,archived_at").eq("account_id", acting.accountId).limit(50));
    case "support": {
      const tickets = await scope(db.from("support_tickets").select("id,number,subject,status,updated_at").eq("account_id", acting.accountId)).order("updated_at", { ascending: false }).limit(25);
      if (tickets.error) throw new Error("Support tickets could not be loaded.");
      if (targetId && tickets.data.length) return { ...done(tickets), messages: done(await db.from("support_ticket_messages").select("author,body,created_at").eq("ticket_id", targetId).eq("internal", false).order("created_at", { ascending: false }).limit(30)).records };
      return done(tickets);
    }
    case "inbox": {
      // Respect the same hidden markers as the Inbox; never expose deleted conversations.
      const inbound = await db.from("sms_thread_messages").select("id,phone_e164,body,direction,created_at").eq("account_id", acting.accountId).eq("direction", "inbound").order("created_at", { ascending: false }).limit(100);
      const hidden = await db.from("inbox_hidden").select("phone_e164,message_id,hidden_at").eq("account_id", acting.accountId).limit(10000);
      if (inbound.error || hidden.error || hidden.data.length === 10000) throw new Error("Inbox information could not be loaded safely. Open Inbox to view it.");
      const rows = inbound.data.filter(m => !hidden.data.some(h => h.message_id === m.id || (!h.message_id && h.phone_e164 === m.phone_e164 && Date.parse(m.created_at) <= Date.parse(h.hidden_at))));
      return { area, records: rows.slice(0,25), path: AREA_ACCESS[area].path, bounded: true };
    }
  }
}

export async function prepareAccountEdit(userId: string, input: unknown) {
  const data = accountEditSchema.parse(input);
  const rule = EDIT_RULES[data.resource];
  const { acting, db } = await accountAreaAccess(userId, rule.area);
  if (rule.owner) assertOwner(acting);
  if (data.resource === "settings" && data.id !== acting.accountId) throw new Error("Choose your business account.");
  // Fixed projections prevent model-chosen columns from reading sensitive fields.
  const query = data.resource === "settings"
    ? db.from("accounts").select(EDIT_COLUMNS.settings).eq("id", acting.accountId)
    : db.from(TABLES[data.resource]).select(EDIT_COLUMNS[data.resource]).eq("id", data.id).eq("account_id", acting.accountId);
  const row = await query.single();
  if (row.error || !row.data) throw new Error("The selected item could not be loaded.");
  const record = row.data as unknown as Record<string, unknown>;
  if (data.resource === "campaign" && record.status !== "draft") throw new Error("Only draft campaigns can be edited here. Sending and stopped campaigns are not changed.");
  const stored = record[data.field];
  const before = typeof stored === "string" ? stored : null;
  const value = data.field === "message_body" ? withSmsOptOut(data.value) : data.value;
  const args = { ...data, value, before, name: `Update ${data.resource}: ${data.field.replaceAll("_", " ")}`, targetName: String(record.name ?? record.company ?? record.first_name ?? data.id) };
  const op = await db.from("assistant_operations").insert({ account_id: acting.accountId, user_id: userId, kind: "account_edit", arguments: args }).select("id,kind,arguments,status,expires_at").single();
  if (op.error) throw new Error("The proposed change could not be saved.");
  return op.data;
}

export async function confirmAccountEdit(userId: string, id: string) {
  const { resolveActingAccount } = await import("./acting-account.server");
  const acting = await resolveActingAccount(userId);
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const op = await db.from("assistant_operations").select("arguments").eq("id", id).eq("user_id", userId).eq("account_id", acting.accountId).eq("kind", "account_edit").single();
  if (op.error) throw new Error("Action not found.");
  const args = op.data.arguments as Record<string, unknown>;
  const data = accountEditSchema.parse({ resource: args.resource, id: args.id, field: args.field, value: args.value });
  const rule = EDIT_RULES[data.resource];
  await accountAreaAccess(userId, rule.area);
  if (rule.owner) assertOwner(acting);
  const result = await db.rpc("confirm_assistant_account_edit", { _id: id, _user_id: userId, _account_id: acting.accountId });
  if (result.error) throw new Error("The change could not be applied. It may have expired or the item changed; prepare a fresh proposal.");
  return result.data;
}

export function accountManagementTools(userId: string) {
  return {
    read_account_area: tool({ description: "Read permitted account information for settings, billing, team, inbox, websites, forms, leads, audience, campaigns, automations, flows, numbers, receptionist, integrations or support. Results are bounded recent records, never all-time totals. targetId is a known resource UUID or null. No mutations.", inputSchema: z.object({ area: z.enum(ACCOUNT_AREAS), targetId: z.string().nullable() }).strict(), execute: ({ area, targetId }) => readAccountArea(userId, area, targetId ? z.string().uuid().parse(targetId) : null) }),
    prepare_account_edit: tool({ description: "Prepare an exact on-screen-confirmed change. Settings: full_name/company/phone (owner). Contacts: first_name/last_name. Lists, websites/forms: name only. Draft campaigns: name/message_body. Automations/flows: name or status=paused only. Never modifies live page copy, publishes, activates, changes money or team roles. Does not execute the change.", inputSchema: z.object({ resource: z.string(), id: z.string(), field: z.string(), value: z.string() }).strict(), execute: args => prepareAccountEdit(userId,args) }),
  };
}