// Server-only runtime for saved automation graphs.
//
// A "run" is one contact travelling through one automation. The engine walks the
// saved graph node by node, stopping whenever it needs to wait (a delay, a date,
// or a reply). Every send goes through sendAutomationSms so sender selection,
// suppression, content screening, Telnyx delivery and billing behave exactly as
// they do everywhere else on the platform.

type Json = Record<string, any>;

export type GraphNode = {
  node_key: string;
  type: string;
  label: string | null;
  configuration: Json;
  disabled: boolean | null;
};
export type GraphEdge = {
  source_node_key: string;
  target_node_key: string;
  source_handle: string | null;
  target_handle: string | null;
};
export type Graph = { nodes: GraphNode[]; edges: GraphEdge[] };

const MAX_STEPS_PER_TICK = 40;

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

export async function loadGraph(automationId: string): Promise<Graph> {
  const db = await admin();
  const [{ data: nodes }, { data: edges }] = await Promise.all([
    db.from("automation_nodes").select("node_key,type,label,configuration,disabled").eq("automation_id", automationId),
    db
      .from("automation_connections")
      .select("source_node_key,target_node_key,source_handle,target_handle")
      .eq("automation_id", automationId),
  ]);
  return { nodes: (nodes ?? []) as GraphNode[], edges: (edges ?? []) as GraphEdge[] };
}

function nextKey(graph: Graph, fromKey: string, handle = "out"): string | null {
  const matches = graph.edges.filter((e) => e.source_node_key === fromKey);
  const exact = matches.find((e) => (e.source_handle ?? "out") === handle);
  if (exact) return exact.target_node_key;
  // A single unlabelled edge is treated as the default path.
  if (handle === "out" && matches.length === 1) return matches[0].target_node_key;
  return null;
}

function ms(amount: number, unit: string) {
  const n = Number.isFinite(amount) ? amount : 0;
  switch (unit) {
    case "minutes":
      return n * 60_000;
    case "hours":
      return n * 3_600_000;
    case "days":
      return n * 86_400_000;
    case "weeks":
      return n * 604_800_000;
    default:
      return n * 3_600_000;
  }
}

function renderBody(body: string, contact: Json | null) {
  const first = String(contact?.first_name ?? "").trim();
  const last = String(contact?.last_name ?? "").trim();
  const now = new Date();
  const custom = (contact?.custom_fields ?? {}) as Json;
  return String(body ?? "")
    .replace(/\{\{\s*contact\.first_name\s*\}\}/gi, first || "there")
    .replace(/\{\{\s*contact\.last_name\s*\}\}/gi, last)
    .replace(/\{\{\s*contact\.full_name\s*\}\}/gi, [first, last].filter(Boolean).join(" ") || "there")
    .replace(/\{\{\s*contact\.phone\s*\}\}/gi, String(contact?.phone_e164 ?? ""))
    .replace(/\{\{\s*contact\.email\s*\}\}/gi, String(custom["email"] ?? ""))
    .replace(/\{\{\s*contact\.country\s*\}\}/gi, String(contact?.country_code ?? ""))
    .replace(/\{\{\s*system\.date\s*\}\}/gi, now.toLocaleDateString())
    .replace(/\{\{\s*system\.time\s*\}\}/gi, now.toLocaleTimeString())
    .replace(/\{\{\s*first_name\s*\}\}/gi, first || "there")
    .replace(/\{\{\s*last_name\s*\}\}/gi, last)
    .replace(/\{\{[^}]*\}\}/g, "")
    .trim();
}

function tagsOf(contact: Json | null): string[] {
  const raw = (contact?.custom_fields as Json | undefined)?.["tags"];
  return Array.isArray(raw) ? raw.map((t) => String(t).toLowerCase()) : [];
}

async function logEvent(run: Json, node: GraphNode | null, outcome: string, detail?: string) {
  const db = await admin();
  await db.from("automation_run_events").insert({
    run_id: run.id,
    account_id: run.account_id,
    automation_id: run.automation_id,
    node_key: node?.node_key ?? null,
    node_type: node?.type ?? null,
    outcome,
    detail: detail ? detail.slice(0, 400) : null,
  });
}

// ---------------------------------------------------------------- enrolment

export type TriggerEvent =
  | "trigger.contact_created"
  | "trigger.contact_added"
  | "trigger.contact_removed_from_list"
  | "trigger.contact_updated"
  | "trigger.tag_added"
  | "trigger.tag_removed"
  | "trigger.form_submitted"
  | "trigger.sms_received"
  | "trigger.keyword_received"
  | "trigger.link_clicked"
  | "trigger.sms_delivered"
  | "trigger.sms_failed"
  | "trigger.opted_out"
  | "trigger.webhook_received"
  | "trigger.custom_event";

/** Does this trigger node's configuration match the event that just happened? */
function triggerMatches(node: GraphNode, ev: { type: TriggerEvent; listId?: string | null; keyword?: string | null; formId?: string | null; eventName?: string | null }) {
  if (node.type !== ev.type) return false;
  const cfg = node.configuration ?? {};
  switch (ev.type) {
    case "trigger.contact_added":
    case "trigger.contact_removed_from_list":
      return !cfg["list_id"] || cfg["list_id"] === ev.listId;
    case "trigger.keyword_received": {
      const want = String(cfg["keyword"] ?? "")
        .split(/[,\n]/)
        .map((k) => k.trim().toUpperCase())
        .filter(Boolean);
      const got = String(ev.keyword ?? "").trim().toUpperCase();
      return want.length > 0 && want.includes(got);
    }
    case "trigger.form_submitted":
      return !cfg["form_id"] || cfg["form_id"] === ev.formId;
    case "trigger.custom_event":
      return String(cfg["event_name"] ?? "").trim().toLowerCase() === String(ev.eventName ?? "").trim().toLowerCase();
    case "trigger.tag_added":
    case "trigger.tag_removed":
      return String(cfg["tag"] ?? "").trim().toLowerCase() === String(ev.keyword ?? "").trim().toLowerCase();
    default:
      return true;
  }
}

/**
 * Start every active automation of this workspace whose trigger matches.
 * Safe to call from anywhere — it never throws.
 */
export async function fireAutomationTrigger(ev: {
  accountId: string;
  phone: string;
  type: TriggerEvent;
  listId?: string | null;
  keyword?: string | null;
  formId?: string | null;
  eventName?: string | null;
  payload?: Json;
}) {
  try {
    const db = await admin();
    const { data: automations } = await db
      .from("automations")
      .select("id")
      .eq("account_id", ev.accountId)
      .eq("status", "active");
    if (!automations?.length) return { started: 0 };

    let started = 0;
    for (const a of automations) {
      const graph = await loadGraph(a.id);
      const trigger = graph.nodes.find((n) => !n.disabled && triggerMatches(n, ev));
      if (!trigger) continue;
      const ok = await startRun({
        accountId: ev.accountId,
        automationId: a.id,
        phone: ev.phone,
        startNodeKey: trigger.node_key,
        graph,
        context: { trigger: ev.type, ...(ev.payload ?? {}) },
      });
      if (ok) started += 1;
    }
    return { started };
  } catch {
    return { started: 0 };
  }
}

export async function startRun(opts: {
  accountId: string;
  automationId: string;
  phone: string;
  startNodeKey: string;
  graph?: Graph;
  context?: Json;
  test?: boolean;
}) {
  const db = await admin();
  const graph = opts.graph ?? (await loadGraph(opts.automationId));
  const first = nextKey(graph, opts.startNodeKey, "out");

  const { data: profile } = await db
    .from("profiles")
    .select("id")
    .eq("account_id", opts.accountId)
    .eq("phone_e164", opts.phone)
    .maybeSingle();

  const { data: run, error } = await db
    .from("automation_runs")
    .insert({
      account_id: opts.accountId,
      automation_id: opts.automationId,
      phone_e164: opts.phone,
      profile_id: profile?.id ?? null,
      current_node_key: first,
      status: first ? "active" : "completed",
      completed_at: first ? null : new Date().toISOString(),
      context: { ...(opts.context ?? {}), test: !!opts.test },
    })
    .select("*")
    .maybeSingle();
  // A duplicate means the contact is already travelling through this automation.
  if (error || !run) return null;

  await logEvent(run, null, "entered", `Started on ${opts.startNodeKey}`);
  if (first) await advanceRun(run, graph);
  return run;
}

// ---------------------------------------------------------------- execution

type StepResult =
  | { kind: "next"; handle?: string; detail?: string }
  | { kind: "wait"; until: string; detail?: string }
  | { kind: "wait_reply"; until: string; detail?: string }
  | { kind: "stop"; detail?: string }
  | { kind: "fail"; detail: string };

async function runNode(run: Json, node: GraphNode, contact: Json | null): Promise<StepResult> {
  const db = await admin();
  const cfg = node.configuration ?? {};
  const isTest = !!(run.context ?? {})["test"];

  if (node.disabled) return { kind: "next", detail: "Step is switched off" };

  switch (node.type) {
    // ----- actions -----
    case "action.send_sms": {
      const body = renderBody(String(cfg["body"] ?? ""), contact);
      if (!body) return { kind: "next", detail: "Nothing to send" };
      if (isTest) return { kind: "next", detail: `Test run — would text: ${body.slice(0, 80)}` };
      try {
        const { sendAutomationSms } = await import("./flows.server");
        const res = await sendAutomationSms(run.account_id, run.phone_e164, body);
        return { kind: "next", detail: `Sent ($${res.cost.toFixed(4)})` };
      } catch (e: any) {
        const msg = String(e?.message ?? e);
        // Compliance refusals end the journey quietly rather than erroring forever.
        if (/unsubscribed|suspended|consent/i.test(msg)) return { kind: "stop", detail: msg };
        return { kind: "fail", detail: msg };
      }
    }

    case "action.add_tag":
    case "action.remove_tag": {
      if (!contact?.id) return { kind: "next", detail: "No contact record" };
      const tag = String(cfg["tag"] ?? "").trim();
      if (!tag) return { kind: "next" };
      const current = tagsOf(contact);
      const next =
        node.type === "action.add_tag"
          ? Array.from(new Set([...current, tag.toLowerCase()]))
          : current.filter((t) => t !== tag.toLowerCase());
      await db
        .from("profiles")
        .update({ custom_fields: { ...(contact.custom_fields ?? {}), tags: next } })
        .eq("id", contact.id);
      return { kind: "next", detail: `${node.type === "action.add_tag" ? "Tagged" : "Untagged"} ${tag}` };
    }

    case "action.update_contact": {
      if (!contact?.id) return { kind: "next", detail: "No contact record" };
      const field = String(cfg["field"] ?? "").trim();
      const value = cfg["value"] ?? "";
      if (!field) return { kind: "next" };
      if (["first_name", "last_name", "country_code", "timezone"].includes(field)) {
        await db.from("profiles").update({ [field]: String(value) }).eq("id", contact.id);
      } else {
        await db
          .from("profiles")
          .update({ custom_fields: { ...(contact.custom_fields ?? {}), [field]: value } })
          .eq("id", contact.id);
      }
      return { kind: "next", detail: `Set ${field}` };
    }

    case "action.add_to_list":
    case "action.remove_from_list": {
      const listId = String(cfg["list_id"] ?? "");
      if (!listId || !contact?.id) return { kind: "next", detail: "No list or contact" };
      if (node.type === "action.add_to_list") {
        await db
          .from("profile_list_members")
          .upsert({ account_id: run.account_id, list_id: listId, profile_id: contact.id }, { onConflict: "list_id,profile_id", ignoreDuplicates: true });
      } else {
        await db.from("profile_list_members").delete().eq("list_id", listId).eq("profile_id", contact.id);
      }
      return { kind: "next", detail: node.type === "action.add_to_list" ? "Added to list" : "Removed from list" };
    }

    case "action.opt_out": {
      if (isTest) return { kind: "next", detail: "Test run — no opt-out written" };
      await db
        .from("suppressions")
        .upsert(
          { account_id: run.account_id, phone_e164: run.phone_e164, reason: "automation", source: "automation" },
          { onConflict: "account_id,phone_e164", ignoreDuplicates: true },
        );
      return { kind: "stop", detail: "Contact unsubscribed" };
    }

    case "action.send_webhook":
    case "action.api_request": {
      const url = String(cfg["url"] ?? "");
      if (!url) return { kind: "next", detail: "No URL set" };
      if (isTest) return { kind: "next", detail: "Test run — webhook skipped" };
      try {
        await fetch(url, {
          method: String(cfg["method"] ?? "POST"),
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phone: run.phone_e164,
            first_name: contact?.first_name ?? null,
            last_name: contact?.last_name ?? null,
            automation_id: run.automation_id,
            run_id: run.id,
          }),
        });
        return { kind: "next", detail: "Webhook sent" };
      } catch (e: any) {
        return { kind: "next", detail: `Webhook failed: ${String(e?.message ?? e).slice(0, 120)}` };
      }
    }

    case "action.internal_notification": {
      if (isTest) return { kind: "next", detail: "Test run — no email sent" };
      try {
        const { data: acct } = await db.from("accounts").select("email,contact_email").eq("id", run.account_id).maybeSingle();
        const to = String(cfg["email"] ?? acct?.contact_email ?? acct?.email ?? "").trim();
        if (to) {
          const { sendBrandedEmail } = await import("./email/send-internal.server");
          await sendBrandedEmail({
            templateName: "generic",
            recipientEmail: to,
            idempotencyKey: `automation-${run.id}-${node.node_key}`,
            templateData: {
              heading: "Automation alert",
              body: `${renderBody(String(cfg["message"] ?? ""), contact)}\n\nContact: ${run.phone_e164}`,
            },
            sendImmediately: true,
          });
        }
      } catch {
        /* notifications are best-effort */
      }
      return { kind: "next", detail: "Team notified" };
    }

    // ----- logic -----
    case "logic.check_consent": {
      const { data: sup } = await db
        .from("suppressions")
        .select("phone_e164")
        .eq("account_id", run.account_id)
        .eq("phone_e164", run.phone_e164)
        .maybeSingle();
      const ok = !sup;
      return { kind: "next", handle: ok ? "yes" : "no", detail: ok ? "May be messaged" : "Opted out" };
    }

    case "logic.has_tag": {
      const has = tagsOf(contact).includes(String(cfg["tag"] ?? "").trim().toLowerCase());
      return { kind: "next", handle: has ? "yes" : "no" };
    }

    case "logic.in_list": {
      if (!contact?.id) return { kind: "next", handle: "no" };
      const { data } = await db
        .from("profile_list_members")
        .select("profile_id")
        .eq("list_id", String(cfg["list_id"] ?? ""))
        .eq("profile_id", contact.id)
        .maybeSingle();
      return { kind: "next", handle: data ? "yes" : "no" };
    }

    case "logic.clicked_link": {
      const days = Number(cfg["window_days"] ?? 3) || 3;
      const since = new Date(Date.now() - days * 86_400_000).toISOString();
      const { data } = await db
        .from("events")
        .select("id, messages!inner(phone_e164, account_id)")
        .eq("type", "clicked")
        .gte("created_at", since)
        .eq("messages.phone_e164", run.phone_e164)
        .eq("messages.account_id", run.account_id)
        .limit(1);
      return { kind: "next", handle: data?.length ? "yes" : "no" };
    }

    case "logic.replied": {
      const days = Number(cfg["window_days"] ?? 3) || 3;
      const since = new Date(Date.now() - days * 86_400_000).toISOString();
      const { data } = await db
        .from("sms_thread_messages")
        .select("id")
        .eq("account_id", run.account_id)
        .eq("phone_e164", run.phone_e164)
        .eq("direction", "inbound")
        .gte("created_at", since)
        .limit(1);
      return { kind: "next", handle: data?.length ? "yes" : "no" };
    }

    case "logic.if_else":
    case "logic.condition_split": {
      const conditions = Array.isArray(cfg["conditions"]) ? cfg["conditions"] : [];
      const results = await Promise.all(conditions.map((c: Json) => evaluateCondition(run, contact, c)));
      const match = String(cfg["match"] ?? "all") === "any" ? results.some(Boolean) : results.every(Boolean);
      return { kind: "next", handle: match ? "yes" : "no" };
    }

    case "logic.ab_split":
      return { kind: "next", handle: Math.random() < Number(cfg["split"] ?? 50) / 100 ? "a" : "b" };

    case "logic.random_split": {
      const paths = Math.max(2, Math.min(5, Number(cfg["paths"] ?? 2)));
      return { kind: "next", handle: `p${Math.floor(Math.random() * paths) + 1}` };
    }

    case "logic.goal": {
      // Goals are informational here: reached when the contact has replied or clicked.
      const { data } = await db
        .from("sms_thread_messages")
        .select("id")
        .eq("account_id", run.account_id)
        .eq("phone_e164", run.phone_e164)
        .eq("direction", "inbound")
        .limit(1);
      return { kind: "next", handle: data?.length ? "reached" : "missed" };
    }

    case "logic.exit":
      return { kind: "stop", detail: "Exit step reached" };

    // ----- timing -----
    case "timing.wait":
      return {
        kind: "wait",
        until: new Date(Date.now() + ms(Number(cfg["amount"] ?? 1), String(cfg["unit"] ?? "hours"))).toISOString(),
      };

    case "timing.wait_until":
    case "timing.schedule": {
      const at = String(cfg["run_at"] ?? cfg["at"] ?? "");
      const when = at ? new Date(at) : new Date(Date.now() + 3_600_000);
      return { kind: "wait", until: (isNaN(when.getTime()) ? new Date(Date.now() + 3_600_000) : when).toISOString() };
    }

    case "timing.wait_for_reply":
      return {
        kind: "wait_reply",
        until: new Date(Date.now() + ms(Number(cfg["amount"] ?? 24), String(cfg["unit"] ?? "hours"))).toISOString(),
      };

    default:
      // Unknown or legacy step: pass straight through so old automations keep moving.
      return { kind: "next", detail: `Skipped unsupported step ${node.type}` };
  }
}

async function evaluateCondition(run: Json, contact: Json | null, c: Json): Promise<boolean> {
  const db = await admin();
  const field = String(c["field"] ?? "");
  const op = String(c["operator"] ?? "is");
  const want = String(c["value"] ?? "");
  const custom = (contact?.custom_fields ?? {}) as Json;

  let actual = "";
  if (field === "contact.first_name") actual = String(contact?.first_name ?? "");
  else if (field === "contact.last_name") actual = String(contact?.last_name ?? "");
  else if (field === "contact.phone") actual = String(run.phone_e164 ?? "");
  else if (field === "contact.country") actual = String(contact?.country_code ?? "");
  else if (field === "contact.email") actual = String(custom["email"] ?? "");
  else if (field === "contact.custom_field") actual = String(custom[String(c["custom_key"] ?? "")] ?? "");
  else if (field === "contact.has_tag") return tagsOf(contact).includes(want.trim().toLowerCase());
  else if (field === "contact.in_list") {
    if (!contact?.id) return false;
    const { data } = await db
      .from("profile_list_members")
      .select("profile_id")
      .eq("list_id", want)
      .eq("profile_id", contact.id)
      .maybeSingle();
    return !!data;
  } else actual = String(custom[field] ?? "");

  const a = actual.toLowerCase();
  const b = want.toLowerCase();
  switch (op) {
    case "is":
      return a === b;
    case "is not":
      return a !== b;
    case "contains":
      return a.includes(b);
    case "does not contain":
      return !a.includes(b);
    case "starts with":
      return a.startsWith(b);
    case "ends with":
      return a.endsWith(b);
    case ">":
      return Number(actual) > Number(want);
    case "<":
      return Number(actual) < Number(want);
    case "before":
      return new Date(actual).getTime() < new Date(want).getTime();
    case "after":
      return new Date(actual).getTime() > new Date(want).getTime();
    case "exists":
      return actual.trim().length > 0;
    case "does not exist":
      return actual.trim().length === 0;
    default:
      return false;
  }
}

/** Walk a run forward until it must wait, finish, or fail. */
export async function advanceRun(run: Json, graph?: Graph) {
  const db = await admin();
  const g = graph ?? (await loadGraph(run.automation_id));
  const byKey = new Map(g.nodes.map((n) => [n.node_key, n]));

  const { data: contact } = await db
    .from("profiles")
    .select("id,first_name,last_name,country_code,custom_fields,phone_e164")
    .eq("account_id", run.account_id)
    .eq("phone_e164", run.phone_e164)
    .maybeSingle();

  let current = run.current_node_key as string | null;
  let steps = 0;

  while (current && steps < MAX_STEPS_PER_TICK) {
    const node = byKey.get(current);
    if (!node) {
      await finish(run, "completed", "Step no longer exists");
      return;
    }
    const result = await runNode(run, node, contact);
    steps += 1;

    if (result.kind === "fail") {
      await db
        .from("automation_runs")
        .update({ status: "failed", last_error: result.detail.slice(0, 300), updated_at: new Date().toISOString() })
        .eq("id", run.id);
      await logEvent(run, node, "failed", result.detail);
      return;
    }
    await logEvent(run, node, result.kind === "next" ? "ok" : result.kind, result.detail);

    if (result.kind === "stop") {
      await finish(run, "exited", result.detail);
      return;
    }
    if (result.kind === "wait" || result.kind === "wait_reply") {
      await db
        .from("automation_runs")
        .update({
          status: "waiting",
          current_node_key: node.node_key,
          wait_until: result.until,
          waiting_for: result.kind === "wait_reply" ? "reply" : null,
          steps_run: (run.steps_run ?? 0) + steps,
          updated_at: new Date().toISOString(),
        })
        .eq("id", run.id);
      return;
    }

    const next = nextKey(g, node.node_key, result.handle ?? "out");
    current = next;
    if (!next) {
      await finish(run, "completed", "Reached the end of this path");
      return;
    }
    await db
      .from("automation_runs")
      .update({ current_node_key: next, status: "active", updated_at: new Date().toISOString() })
      .eq("id", run.id);
  }

  if (current) {
    // Guard against very long paths: pick it up on the next sweep.
    await db
      .from("automation_runs")
      .update({ status: "waiting", wait_until: new Date(Date.now() + 30_000).toISOString(), current_node_key: current })
      .eq("id", run.id);
  }
}

async function finish(run: Json, status: "completed" | "exited", detail?: string) {
  const db = await admin();
  await db
    .from("automation_runs")
    .update({ status, completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", run.id);
  await logEvent(run, null, status, detail);
}

/** Background sweep: move every run whose wait has elapsed. */
export async function processDueAutomationRuns(limit = 100) {
  const db = await admin();
  const { data: due } = await db
    .from("automation_runs")
    .select("*")
    .in("status", ["waiting", "active"])
    .lte("wait_until", new Date().toISOString())
    .order("wait_until", { ascending: true })
    .limit(Math.min(limit, 200));
  if (!due?.length) return { processed: 0 };

  // Paused or archived automations hold everyone in place until they resume.
  const ids = Array.from(new Set(due.map((r: Json) => r.automation_id)));
  const { data: statusRows } = await db.from("automations").select("id,status").in("id", ids);
  const statuses = new Map<string, string>((statusRows ?? []).map((r: Json) => [r.id, r.status]));

  const graphs = new Map<string, Graph>();
  for (const run of due) {
    if (statuses.get(run.automation_id) !== "active") continue;
    try {
      if (!graphs.has(run.automation_id)) graphs.set(run.automation_id, await loadGraph(run.automation_id));
      const graph = graphs.get(run.automation_id)!;
      // A wait-for-reply that timed out leaves through the timeout path.
      if (run.waiting_for === "reply") {
        const node = graph.nodes.find((n) => n.node_key === run.current_node_key);
        const next = node ? nextKey(graph, node.node_key, "timeout") : null;
        await db
          .from("automation_runs")
          .update({ waiting_for: null, wait_until: null, current_node_key: next, status: next ? "active" : "completed" })
          .eq("id", run.id);
        if (!next) continue;
        await advanceRun({ ...run, waiting_for: null, current_node_key: next }, graph);
        continue;
      }
      const node = graph.nodes.find((n) => n.node_key === run.current_node_key);
      const next = node ? nextKey(graph, node.node_key, "out") : null;
      await db.from("automation_runs").update({ wait_until: null, status: "active", current_node_key: next }).eq("id", run.id);
      if (!next) {
        await finish(run, "completed", "Reached the end of this path");
        continue;
      }
      await advanceRun({ ...run, current_node_key: next, wait_until: null }, graph);
    } catch (e: any) {
      await db
        .from("automation_runs")
        .update({ status: "failed", last_error: String(e?.message ?? e).slice(0, 300) })
        .eq("id", run.id);
    }
  }
  return { processed: due.length };
}

/**
 * A contact texted back. Release any run parked on a wait-for-reply step down the
 * matching branch, and stop runs for anyone who opted out.
 */
export async function handleInboundForAutomations(opts: { accountId: string; phone: string; body: string; optedOut?: boolean }) {
  try {
    const db = await admin();
    const { data: runs } = await db
      .from("automation_runs")
      .select("*")
      .eq("account_id", opts.accountId)
      .eq("phone_e164", opts.phone)
      .eq("status", "waiting");
    if (!runs?.length) return { released: 0 };

    let released = 0;
    for (const run of runs) {
      if (opts.optedOut) {
        await finish(run, "exited", "Contact opted out");
        continue;
      }
      if (run.waiting_for !== "reply") continue;
      const graph = await loadGraph(run.automation_id);
      const node = graph.nodes.find((n) => n.node_key === run.current_node_key);
      if (!node) continue;
      const cfg = node.configuration ?? {};
      const upper = opts.body.trim().toUpperCase();
      let handle = "yes";
      if (String(cfg["expect"] ?? "any") === "keywords") {
        const yes = String(cfg["keywords_yes"] ?? "").split(/[,\s]+/).filter(Boolean);
        const no = String(cfg["keywords_no"] ?? "").split(/[,\s]+/).filter(Boolean);
        if (no.some((k: string) => upper.includes(k))) handle = "no";
        else if (yes.length && !yes.some((k: string) => upper.includes(k))) continue;
      }
      const next = nextKey(graph, node.node_key, handle);
      await db
        .from("automation_runs")
        .update({ waiting_for: null, wait_until: null, current_node_key: next, status: next ? "active" : "completed" })
        .eq("id", run.id);
      if (next) await advanceRun({ ...run, waiting_for: null, wait_until: null, current_node_key: next }, graph);
      released += 1;
    }
    return { released };
  } catch {
    return { released: 0 };
  }
}
