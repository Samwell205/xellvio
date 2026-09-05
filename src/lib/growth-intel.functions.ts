import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  ACTIVATION_EVENTS,
  DEFAULT_ACTIVATION_EVENTS,
  DROPOFF_CHECKS,
  INSIGHT_LANGUAGE,
  rate,
  type ActivationEventKey,
} from "@/lib/growth/taxonomy";

/**
 * Growth intelligence read model.
 *
 * Everything here is derived from real rows: the visitor event log for the public
 * journey, and the product tables (campaigns, automations, pages, forms, templates,
 * payments) for activation, adoption, retention and revenue. Nothing is simulated,
 * and conversion rates are withheld until the sample is large enough to mean something.
 */

async function ensureAdmin(supabase: any) {
  const { data, error } = await supabase.rpc("has_role", { _role: "admin" });
  if (error) throw new Error(error.message);
  if (data !== true) throw new Error("Forbidden: admin only");
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

const WindowSchema = z.object({ days: z.number().int().min(1).max(365).default(30) });

type Row = Record<string, any>;

function daysAgo(days: number) {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

function ms(a?: string | null, b?: string | null) {
  if (!a || !b) return null;
  return new Date(b).getTime() - new Date(a).getTime();
}

function topN<T>(list: T[], key: (t: T) => number, n: number) {
  return [...list].sort((x, y) => key(y) - key(x)).slice(0, n);
}

function dayKey(iso: string) {
  return iso.slice(0, 10);
}

/* ------------------------------------------------------------------ */
/* Per-workspace product milestones, read from real product tables.    */
/* ------------------------------------------------------------------ */

type Milestones = Partial<Record<ActivationEventKey, string>>;

type WorkspaceFacts = {
  id: string;
  created_at: string;
  goal: string | null;
  source: string | null;
  milestones: Milestones;
  activityDays: Set<string>;
  areas: Set<string>;
  paidAt: string | null;
  recentValueAt: string | null;
};

function firstStamp(map: Map<string, Milestones>, id: string | null, key: ActivationEventKey, at?: string | null) {
  if (!id || !at) return;
  const m = map.get(id) ?? {};
  if (!m[key] || at < m[key]!) m[key] = at;
  map.set(id, m);
}

async function loadWorkspaceFacts(db: any, sinceDays: number): Promise<Map<string, WorkspaceFacts>> {
  const [accounts, campaigns, automations, pages, forms, submissions, imports, templateEvents, payments] =
    await Promise.all([
      db.from("accounts").select("id,created_at,growth_goal,signup_source,click_domain").limit(20000),
      db.from("campaigns").select("id,account_id,status,created_at,updated_at").limit(20000),
      db.from("automations").select("account_id,created_at,activated_at,status").limit(20000),
      db.from("landing_pages").select("account_id,created_at,published,last_published_at,published_at").limit(20000),
      db.from("signup_forms").select("account_id,created_at,published,last_published_at,published_at").limit(20000),
      db.from("subscribe_submissions").select("account_id,created_at").order("created_at", { ascending: true }).limit(20000),
      db.from("contact_import_jobs").select("account_id,created_at,status").limit(20000),
      db.from("template_events").select("account_id,event,template_type,template_slug,created_at").limit(20000),
      db.from("payments").select("account_id,status,paid_at,created_at").limit(20000),
    ]);

  const milestones = new Map<string, Milestones>();
  const activity = new Map<string, Set<string>>();
  const areas = new Map<string, Set<string>>();
  const recentValue = new Map<string, string>();
  const cutoff = daysAgo(sinceDays);

  const note = (accountId: string | null, at: string | null | undefined, area?: string, valuable = false) => {
    if (!accountId || !at) return;
    const set = activity.get(accountId) ?? new Set<string>();
    set.add(dayKey(at));
    activity.set(accountId, set);
    if (area) {
      const a = areas.get(accountId) ?? new Set<string>();
      a.add(area);
      areas.set(accountId, a);
    }
    if (valuable && at >= cutoff) {
      const prev = recentValue.get(accountId);
      if (!prev || at > prev) recentValue.set(accountId, at);
    }
  };

  const sentStatuses = new Set(["sent", "sending", "completed", "partial", "delivered"]);
  for (const c of campaigns.data ?? []) {
    firstStamp(milestones, c.account_id, "campaign_created", c.created_at);
    note(c.account_id, c.created_at, "sms");
    if (sentStatuses.has(String(c.status))) {
      // The campaign row's last update is the closest reliable "was sent" stamp.
      firstStamp(milestones, c.account_id, "campaign_sent", c.updated_at ?? c.created_at);
      note(c.account_id, c.updated_at ?? c.created_at, "sms", true);
    }
  }
  for (const a of automations.data ?? []) {
    firstStamp(milestones, a.account_id, "automation_created", a.created_at);
    note(a.account_id, a.created_at, "automation");
    if (a.activated_at) {
      firstStamp(milestones, a.account_id, "automation_activated", a.activated_at);
      note(a.account_id, a.activated_at, "automation", true);
    }
  }
  for (const p of pages.data ?? []) {
    firstStamp(milestones, p.account_id, "landing_page_created", p.created_at);
    note(p.account_id, p.created_at, "landing_pages");
    const pub = p.last_published_at ?? p.published_at;
    if (p.published && pub) {
      firstStamp(milestones, p.account_id, "landing_page_published", pub);
      note(p.account_id, pub, "landing_pages", true);
    }
  }
  for (const f of forms.data ?? []) {
    firstStamp(milestones, f.account_id, "form_created", f.created_at);
    note(f.account_id, f.created_at, "forms");
    const pub = f.last_published_at ?? f.published_at;
    if (f.published && pub) {
      firstStamp(milestones, f.account_id, "form_published", pub);
      note(f.account_id, pub, "forms", true);
    }
  }
  for (const s of submissions.data ?? []) {
    firstStamp(milestones, s.account_id, "form_submission_received", s.created_at);
    note(s.account_id, s.created_at, "forms", true);
  }
  for (const j of imports.data ?? []) {
    firstStamp(milestones, j.account_id, "contact_imported", j.created_at);
    note(j.account_id, j.created_at, "audience");
  }
  for (const t of templateEvents.data ?? []) {
    if (t.event === "import") {
      firstStamp(milestones, t.account_id, "template_imported", t.created_at);
      note(t.account_id, t.created_at, "templates");
    }
  }

  const paid = new Map<string, string>();
  for (const p of payments.data ?? []) {
    if (String(p.status) !== "paid" && String(p.status) !== "completed") continue;
    const at = p.paid_at ?? p.created_at;
    if (!p.account_id || !at) continue;
    const prev = paid.get(p.account_id);
    if (!prev || at < prev) paid.set(p.account_id, at);
    note(p.account_id, at);
  }

  const out = new Map<string, WorkspaceFacts>();
  for (const a of accounts.data ?? []) {
    const m = milestones.get(a.id) ?? {};
    if (a.click_domain) m.domain_connected = m.domain_connected ?? a.created_at;
    out.set(a.id, {
      id: a.id,
      created_at: a.created_at,
      goal: a.growth_goal ?? null,
      source: a.signup_source ?? null,
      milestones: m,
      activityDays: activity.get(a.id) ?? new Set<string>(),
      areas: areas.get(a.id) ?? new Set<string>(),
      paidAt: paid.get(a.id) ?? null,
      recentValueAt: recentValue.get(a.id) ?? null,
    });
  }
  return out;
}

function activationOf(facts: WorkspaceFacts, activationEvents: ActivationEventKey[]) {
  let best: { key: ActivationEventKey; at: string } | null = null;
  for (const key of activationEvents) {
    const at = facts.milestones[key];
    if (at && (!best || at < best.at)) best = { key, at };
  }
  return best;
}

/* ------------------------------------------------------------------ */
/* The one dashboard payload.                                          */
/* ------------------------------------------------------------------ */

export const growthOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => WindowSchema.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase);
    const db = await admin();
    const since = daysAgo(data.days);
    const prevSince = daysAgo(data.days * 2);

    const [cfgRes, sessionsRes, eventsRes, prevSessionsRes, experimentsRes, alertsRes] = await Promise.all([
      db.from("growth_config").select("*").eq("id", true).maybeSingle(),
      db
        .from("growth_sessions")
        .select("*")
        .gte("first_seen", since)
        .order("first_seen", { ascending: false })
        .limit(20000),
      db
        .from("growth_events")
        .select("event,path,page_type,entity_type,entity_slug,cta_name,cta_placement,source,medium,session_id,account_id,created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: true })
        .limit(50000),
      db.from("growth_sessions").select("session_id,first_seen,signup_completed").gte("first_seen", prevSince).lt("first_seen", since).limit(20000),
      db.from("growth_experiments").select("*").order("created_at", { ascending: false }).limit(200),
      db.from("growth_alerts").select("*").order("created_at", { ascending: false }).limit(100),
    ]);

    const cfg = cfgRes.data ?? {
      activation_events: DEFAULT_ACTIVATION_EVENTS,
      north_star_events: DEFAULT_ACTIVATION_EVENTS,
      min_sample: 50,
      notes: null,
    };
    const activationEvents = (cfg.activation_events ?? DEFAULT_ACTIVATION_EVENTS) as ActivationEventKey[];
    const northStarEvents = (cfg.north_star_events ?? DEFAULT_ACTIVATION_EVENTS) as ActivationEventKey[];
    const minSample = Number(cfg.min_sample ?? 50);

    const sessions: Row[] = sessionsRes.data ?? [];
    const events: Row[] = eventsRes.data ?? [];
    const facts = await loadWorkspaceFacts(db, data.days);

    const newAccounts = [...facts.values()].filter((f) => f.created_at >= since);
    const activatedInWindow = newAccounts
      .map((f) => ({ f, act: activationOf(f, activationEvents) }))
      .filter((x) => x.act);

    /* ---------------- funnel ---------------- */
    const visitors = sessions.length;
    const engaged = sessions.filter((s) => s.engaged).length;
    const explorers = sessions.filter((s) => (s.product_views ?? 0) > 0).length;
    const ctaClickSessions = sessions.filter((s) => (s.cta_clicks ?? 0) > 0).length;
    const signupStarted = sessions.filter((s) => s.signup_started).length;
    const signupCompleted = newAccounts.length;
    const onboardingStarted = events.filter((e) => e.event === "onboarding_started").length;
    const activated = activatedInWindow.length;
    const activeUsers = [...facts.values()].filter((f) => f.recentValueAt).length;
    const paying = [...facts.values()].filter((f) => f.paidAt && f.paidAt >= since).length;

    const funnelRaw: { key: string; label: string; count: number }[] = [
      { key: "visitor", label: "Visitors", count: visitors },
      { key: "engaged", label: "Engaged visitors", count: engaged },
      { key: "explorer", label: "Product explorers", count: explorers },
      { key: "cta_click", label: "CTA clicks", count: ctaClickSessions },
      { key: "signup_started", label: "Signup started", count: signupStarted },
      { key: "signup_completed", label: "Signup completed", count: signupCompleted },
      { key: "onboarding_started", label: "Onboarding started", count: onboardingStarted },
      { key: "activated", label: "Activated users", count: activated },
      { key: "active", label: "Active users", count: activeUsers },
      { key: "paying", label: "Paying customers", count: paying },
    ];
    const funnel = funnelRaw.map((stage, i) => {
      const prev = i === 0 ? null : funnelRaw[i - 1].count;
      const conversion = prev === null ? null : rate(stage.count, prev, Math.min(minSample, prev || minSample));
      return {
        ...stage,
        conversion: prev !== null && prev >= minSample ? conversion : null,
        dropoff: prev !== null && prev >= minSample && conversion !== null ? Math.round((100 - conversion) * 10) / 10 : null,
        sampleTooSmall: prev !== null && prev < minSample,
      };
    });

    const byKey = new Map(funnelRaw.map((s) => [s.key, s.count]));
    const dropoffs = DROPOFF_CHECKS.map((c) => {
      const from = byKey.get(c.from) ?? 0;
      const to = byKey.get(c.to) ?? 0;
      const conv = rate(to, from, minSample);
      return {
        ...c,
        from_count: from,
        to_count: to,
        conversion: conv,
        flagged: conv !== null && conv < 25,
        note: conv === null ? INSIGHT_LANGUAGE.insufficient : null,
      };
    });

    /* ---------------- pages ---------------- */
    const pageMap = new Map<string, { path: string; page_type: string; views: number; sessions: Set<string>; cta: number }>();
    for (const e of events) {
      if (e.event !== "page_view" && e.event !== "cta_click") continue;
      const path = e.path ?? "/";
      const rec = pageMap.get(path) ?? { path, page_type: e.page_type ?? "other", views: 0, sessions: new Set<string>(), cta: 0 };
      if (e.event === "page_view") rec.views += 1;
      if (e.event === "cta_click") rec.cta += 1;
      if (e.session_id) rec.sessions.add(e.session_id);
      pageMap.set(path, rec);
    }
    const sessionSignup = new Map<string, boolean>(sessions.map((s) => [s.session_id, Boolean(s.signup_completed)]));
    const sessionEngaged = new Map<string, boolean>(sessions.map((s) => [s.session_id, Boolean(s.engaged)]));
    const pages = topN(
      [...pageMap.values()].map((p) => {
        const sess = [...p.sessions];
        const signups = sess.filter((s) => sessionSignup.get(s)).length;
        return {
          path: p.path,
          page_type: p.page_type,
          views: p.views,
          unique_visitors: sess.length,
          engaged_sessions: sess.filter((s) => sessionEngaged.get(s)).length,
          cta_clicks: p.cta,
          signups,
          signup_rate: rate(signups, sess.length, minSample),
        };
      }),
      (p) => p.views,
      40,
    );

    /* ---------------- CTAs ---------------- */
    const ctaMap = new Map<string, { name: string; path: string; placement: string; clicks: number; sessions: Set<string> }>();
    const placementMap = new Map<string, { placement: string; clicks: number; sessions: Set<string> }>();
    for (const e of events) {
      if (e.event !== "cta_click") continue;
      const name = e.cta_name ?? "(unnamed)";
      const placement = e.cta_placement ?? "unknown";
      const k = `${name}|${e.path}|${placement}`;
      const rec = ctaMap.get(k) ?? { name, path: e.path ?? "/", placement, clicks: 0, sessions: new Set<string>() };
      rec.clicks += 1;
      if (e.session_id) rec.sessions.add(e.session_id);
      ctaMap.set(k, rec);
      const pl = placementMap.get(placement) ?? { placement, clicks: 0, sessions: new Set<string>() };
      pl.clicks += 1;
      if (e.session_id) pl.sessions.add(e.session_id);
      placementMap.set(placement, pl);
    }
    const ctas = topN(
      [...ctaMap.values()].map((c) => {
        const signups = [...c.sessions].filter((s) => sessionSignup.get(s)).length;
        return {
          name: c.name,
          path: c.path,
          placement: c.placement,
          clicks: c.clicks,
          signups,
          conversion: rate(signups, c.sessions.size, minSample),
        };
      }),
      (c) => c.clicks,
      30,
    );
    const placements = topN(
      [...placementMap.values()].map((p) => {
        const signups = [...p.sessions].filter((s) => sessionSignup.get(s)).length;
        return {
          placement: p.placement,
          clicks: p.clicks,
          signups,
          conversion: rate(signups, p.sessions.size, minSample),
        };
      }),
      (p) => p.clicks,
      10,
    );

    /* ---------------- traffic sources ---------------- */
    const accountsBySource = new Map<string, WorkspaceFacts[]>();
    for (const f of newAccounts) {
      const key = f.source ?? "unknown";
      accountsBySource.set(key, [...(accountsBySource.get(key) ?? []), f]);
    }
    const sourceMap = new Map<string, { source: string; sessions: number; engaged: number; signups: number }>();
    for (const s of sessions) {
      const key = s.source ?? "direct";
      const rec = sourceMap.get(key) ?? { source: key, sessions: 0, engaged: 0, signups: 0 };
      rec.sessions += 1;
      if (s.engaged) rec.engaged += 1;
      if (s.signup_completed) rec.signups += 1;
      sourceMap.set(key, rec);
    }
    const sources = topN(
      [...sourceMap.values()].map((s) => {
        const accts = accountsBySource.get(s.source) ?? [];
        const act = accts.filter((a) => activationOf(a, activationEvents)).length;
        return {
          ...s,
          signup_rate: rate(s.signups, s.sessions, minSample),
          attributed_accounts: accts.length,
          activated_accounts: act,
          paying_accounts: accts.filter((a) => a.paidAt).length,
        };
      }),
      (s) => s.sessions,
      15,
    );

    /* ---------------- journeys and exits ---------------- */
    const journeyMap = new Map<string, number>();
    const exitMap = new Map<string, number>();
    const bySession = new Map<string, Row[]>();
    for (const e of events) {
      if (e.event !== "page_view") continue;
      bySession.set(e.session_id ?? "?", [...(bySession.get(e.session_id ?? "?") ?? []), e]);
    }
    for (const [, list] of bySession) {
      const paths: string[] = [];
      for (const e of list) {
        const t = `${e.page_type ?? "other"}:${e.path}`;
        if (paths[paths.length - 1] !== t) paths.push(t);
      }
      if (paths.length === 0) continue;
      const key = paths.slice(0, 5).join(" → ");
      journeyMap.set(key, (journeyMap.get(key) ?? 0) + 1);
      const exit = paths[paths.length - 1];
      exitMap.set(exit, (exitMap.get(exit) ?? 0) + 1);
    }
    const journeys = topN([...journeyMap.entries()].map(([path, count]) => ({ path, count })), (j) => j.count, 15);
    const exits = topN([...exitMap.entries()].map(([path, count]) => ({ path, count })), (j) => j.count, 15);

    /* ---------------- content attribution ---------------- */
    const contentMap = new Map<string, { slug: string; views: number; sessions: Set<string> }>();
    for (const e of events) {
      if (e.event !== "resource_view") continue;
      const slug = e.path ?? e.entity_slug ?? "unknown";
      const rec = contentMap.get(slug) ?? { slug, views: 0, sessions: new Set<string>() };
      rec.views += 1;
      if (e.session_id) rec.sessions.add(e.session_id);
      contentMap.set(slug, rec);
    }
    const ctaSessions = new Set(events.filter((e) => e.event === "cta_click").map((e) => e.session_id));
    const productSessions = new Set(events.filter((e) => e.event === "product_page_view").map((e) => e.session_id));
    const content = topN(
      [...contentMap.values()].map((c) => {
        const sess = [...c.sessions];
        return {
          slug: c.slug,
          views: c.views,
          unique_visitors: sess.length,
          product_clicks: sess.filter((s) => productSessions.has(s)).length,
          cta_clicks: sess.filter((s) => ctaSessions.has(s)).length,
          signups: sess.filter((s) => sessionSignup.get(s)).length,
        };
      }),
      (c) => c.views,
      25,
    );

    /* ---------------- template attribution ---------------- */
    const tplRes = await db
      .from("template_events")
      .select("template_type,template_slug,event,account_id,created_at")
      .gte("created_at", since)
      .limit(20000);
    const tplMap = new Map<
      string,
      { slug: string; type: string; views: number; previews: number; imports: number; accounts: Set<string> }
    >();
    const bump = (type: string, slug: string, field: "views" | "previews" | "imports", accountId?: string | null) => {
      const key = `${type}|${slug}`;
      const rec = tplMap.get(key) ?? { slug, type, views: 0, previews: 0, imports: 0, accounts: new Set<string>() };
      rec[field] += 1;
      if (accountId) rec.accounts.add(accountId);
      tplMap.set(key, rec);
    };
    for (const t of tplRes.data ?? []) {
      if (t.event === "import") bump(t.template_type ?? "template", t.template_slug ?? "unknown", "imports", t.account_id);
      else bump(t.template_type ?? "template", t.template_slug ?? "unknown", "views");
    }
    for (const e of events) {
      if (e.event === "template_view") bump(e.entity_type ?? "template", e.entity_slug ?? e.path ?? "unknown", "views");
      if (e.event === "template_preview") bump(e.entity_type ?? "template", e.entity_slug ?? e.path ?? "unknown", "previews");
    }
    const templates = topN(
      [...tplMap.values()].map((t) => {
        const accts = [...t.accounts].map((id) => facts.get(id)).filter(Boolean) as WorkspaceFacts[];
        return {
          slug: t.slug,
          type: t.type,
          views: t.views,
          previews: t.previews,
          imports: t.imports,
          importing_workspaces: t.accounts.size,
          activated_workspaces: accts.filter((a) => activationOf(a, activationEvents)).length,
          view_to_import: rate(t.imports, t.views, minSample),
        };
      }),
      (t) => t.views + t.imports * 5,
      25,
    );

    /* ---------------- activation & time to value ---------------- */
    const times = activatedInWindow
      .map((x) => ms(x.f.created_at, x.act!.at))
      .filter((v): v is number => typeof v === "number" && v >= 0);
    times.sort((a, b) => a - b);
    const medianHours = times.length ? Math.round((times[Math.floor(times.length / 2)] / 3_600_000) * 10) / 10 : null;
    const activationByEvent = new Map<string, number>();
    for (const x of activatedInWindow) activationByEvent.set(x.act!.key, (activationByEvent.get(x.act!.key) ?? 0) + 1);
    const activation = {
      new_users: newAccounts.length,
      activated_users: activated,
      activation_rate: rate(activated, newAccounts.length, Math.min(minSample, 20)),
      median_hours_to_activation: medianHours,
      fastest_hours: times.length ? Math.round((times[0] / 3_600_000) * 10) / 10 : null,
      most_common_event:
        topN([...activationByEvent.entries()].map(([key, count]) => ({ key, count })), (x) => x.count, 1)[0] ?? null,
      by_event: [...activationByEvent.entries()].map(([key, count]) => ({
        key,
        label: ACTIVATION_EVENTS.find((a) => a.key === key)?.label ?? key,
        count,
      })),
      configured_events: activationEvents,
    };

    /* ---------------- onboarding ---------------- */
    const onboardingSteps = new Map<string, { step: string; started: number; completed: number }>();
    for (const e of events) {
      if (e.event !== "onboarding_step_completed" && e.event !== "onboarding_started" && e.event !== "onboarding_completed")
        continue;
      const step = e.entity_slug ?? (e.event === "onboarding_started" ? "start" : "complete");
      const rec = onboardingSteps.get(step) ?? { step, started: 0, completed: 0 };
      if (e.event === "onboarding_step_completed" || e.event === "onboarding_completed") rec.completed += 1;
      else rec.started += 1;
      onboardingSteps.set(step, rec);
    }
    const onboarding = {
      started: events.filter((e) => e.event === "onboarding_started").length,
      completed: events.filter((e) => e.event === "onboarding_completed").length,
      steps: [...onboardingSteps.values()],
      goals: topN(
        [...newAccounts.reduce((m, a) => m.set(a.goal ?? "not chosen", (m.get(a.goal ?? "not chosen") ?? 0) + 1), new Map<string, number>())]
          .map(([goal, count]) => ({ goal, count })),
        (g) => g.count,
        10,
      ),
    };

    /* ---------------- product adoption ---------------- */
    const allWorkspaces = [...facts.values()];
    const adoption = [
      { key: "sms", label: "SMS campaigns", created: "campaign_created", launched: "campaign_sent" },
      { key: "automation", label: "Automation", created: "automation_created", launched: "automation_activated" },
      { key: "landing_pages", label: "Landing pages", created: "landing_page_created", launched: "landing_page_published" },
      { key: "forms", label: "Sign-up forms", created: "form_created", launched: "form_published" },
      { key: "audience", label: "Audiences", created: "contact_imported", launched: "contact_imported" },
      { key: "templates", label: "Templates", created: "template_imported", launched: "template_imported" },
    ].map((a) => ({
      key: a.key,
      label: a.label,
      created: allWorkspaces.filter((w) => w.milestones[a.created as ActivationEventKey]).length,
      launched: allWorkspaces.filter((w) => w.milestones[a.launched as ActivationEventKey]).length,
      repeat_users: allWorkspaces.filter((w) => w.areas.has(a.key) && w.activityDays.size > 3).length,
    }));

    /* ---------------- retention & cohorts ---------------- */
    const retentionWindows = [1, 7, 30, 90];
    const retention = retentionWindows.map((d) => {
      const eligible = allWorkspaces.filter((w) => Date.now() - new Date(w.created_at).getTime() >= d * 86_400_000);
      const retained = eligible.filter((w) => {
        const start = new Date(w.created_at).getTime();
        return [...w.activityDays].some((day) => {
          const t = new Date(`${day}T12:00:00Z`).getTime();
          return t >= start + (d - 1) * 86_400_000 && t <= start + (d + 1) * 86_400_000;
        });
      }).length;
      return { day: d, eligible: eligible.length, retained, rate: rate(retained, eligible.length, Math.min(minSample, 20)) };
    });

    const cohortMap = new Map<string, WorkspaceFacts[]>();
    for (const w of allWorkspaces) {
      const key = w.created_at.slice(0, 7);
      cohortMap.set(key, [...(cohortMap.get(key) ?? []), w]);
    }
    const cohorts = [...cohortMap.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, 12)
      .map(([month, list]) => ({
        month,
        signups: list.length,
        activated: list.filter((w) => activationOf(w, activationEvents)).length,
        adopted_two_areas: list.filter((w) => w.areas.size >= 2).length,
        still_active: list.filter((w) => w.recentValueAt).length,
        paying: list.filter((w) => w.paidAt).length,
      }));

    /* ---------------- segments ---------------- */
    const segments = [
      {
        key: "new",
        label: "New (last 14 days, not activated yet)",
        count: allWorkspaces.filter(
          (w) => w.created_at >= daysAgo(14) && !activationOf(w, activationEvents),
        ).length,
      },
      { key: "activated", label: "Activated", count: allWorkspaces.filter((w) => activationOf(w, activationEvents)).length },
      {
        key: "inactive",
        label: "No meaningful activity in 30 days",
        count: allWorkspaces.filter((w) => !w.recentValueAt && w.activityDays.size > 0).length,
      },
      { key: "power", label: "Using 3+ product areas", count: allWorkspaces.filter((w) => w.areas.size >= 3).length },
      { key: "paying", label: "Paying customers", count: allWorkspaces.filter((w) => w.paidAt).length },
    ];

    /* ---------------- north star ---------------- */
    const northStarWorkspaces = allWorkspaces.filter((w) => {
      if (!w.recentValueAt) return false;
      return northStarEvents.some((k) => w.milestones[k]);
    });
    const northStar = {
      label: "Monthly active value-creating workspaces",
      value: northStarWorkspaces.length,
      definition: northStarEvents,
      window_days: data.days,
    };

    /* ---------------- alerts ---------------- */
    const prevSessions: Row[] = prevSessionsRes.data ?? [];
    const prevAccounts = [...facts.values()].filter((f) => f.created_at >= prevSince && f.created_at < since);
    const compare = (metric: string, now: number, before: number) => {
      const change = before > 0 ? Math.round(((now - before) / before) * 1000) / 10 : null;
      return { metric, now, before, change_pct: change };
    };
    const trends = [
      compare("Visitors", visitors, prevSessions.length),
      compare("Signups", newAccounts.length, prevAccounts.length),
      compare(
        "Activations",
        activated,
        prevAccounts.filter((a) => activationOf(a, activationEvents)).length,
      ),
    ];
    const alertRules: Row[] = alertsRes.data ?? [];
    const triggered = alertRules
      .filter((r) => r.enabled)
      .map((r) => {
        const t = trends.find((x) => x.metric.toLowerCase() === String(r.metric).toLowerCase());
        if (!t || t.change_pct === null) return { rule: r, fired: false, trend: t ?? null };
        const fired =
          r.direction === "drop" ? t.change_pct <= -Number(r.threshold_pct) : t.change_pct >= Number(r.threshold_pct);
        return { rule: r, fired, trend: t };
      });

    /* ---------------- insights (evidence only) ---------------- */
    const insights: { text: string; kind: "fact" | "opportunity" | "watch" }[] = [];
    if (visitors < minSample) {
      insights.push({
        text: `${INSIGHT_LANGUAGE.insufficient} Only ${visitors} visits recorded in the last ${data.days} days, so conversion rates are hidden until the sample is bigger.`,
        kind: "watch",
      });
    }
    const bestTemplate = templates.find((t) => t.imports > 0);
    if (bestTemplate) {
      insights.push({
        text: `${INSIGHT_LANGUAGE.fact} "${bestTemplate.slug}" was imported ${bestTemplate.imports} time(s) by ${bestTemplate.importing_workspaces} workspace(s); ${bestTemplate.activated_workspaces} of those reached activation.`,
        kind: "fact",
      });
    }
    for (const d of dropoffs) {
      if (d.flagged) {
        insights.push({
          text: `${INSIGHT_LANGUAGE.fact} ${d.label.toLowerCase()} (${d.conversion}% carry through). ${INSIGHT_LANGUAGE.action}: ${d.investigate}.`,
          kind: "opportunity",
        });
      }
    }
    const highTrafficLowConversion = pages.find((p) => p.views >= minSample && p.cta_clicks === 0);
    if (highTrafficLowConversion) {
      insights.push({
        text: `${INSIGHT_LANGUAGE.fact} ${highTrafficLowConversion.path} received ${highTrafficLowConversion.views} views and no CTA clicks. ${INSIGHT_LANGUAGE.action}: whether that page offers a clear next step.`,
        kind: "opportunity",
      });
    }
    if (activation.activation_rate !== null && activation.activation_rate < 30) {
      insights.push({
        text: `${INSIGHT_LANGUAGE.fact} ${activation.activated_users} of ${activation.new_users} new workspaces reached a first outcome. ${INSIGHT_LANGUAGE.action}: the onboarding path and time to first value.`,
        kind: "opportunity",
      });
    }
    if (activation.median_hours_to_activation !== null) {
      insights.push({
        text: `${INSIGHT_LANGUAGE.fact} half of activated workspaces got there within ${activation.median_hours_to_activation} hours of signing up.`,
        kind: "fact",
      });
    }

    return {
      window_days: data.days,
      min_sample: minSample,
      config: {
        activation_events: activationEvents,
        north_star_events: northStarEvents,
        min_sample: minSample,
        notes: cfg.notes ?? null,
      },
      funnel,
      dropoffs,
      pages,
      ctas,
      placements,
      sources,
      journeys,
      exits,
      content,
      templates,
      activation,
      onboarding,
      adoption,
      retention,
      cohorts,
      segments,
      northStar,
      trends,
      alerts: triggered,
      experiments: experimentsRes.data ?? [],
      insights,
      events_recorded: events.length,
    };
  });

export type GrowthOverview = Awaited<ReturnType<typeof growthOverview>>;

/* ------------------------------------------------------------------ */
/* Configuration, experiments, alerts                                  */
/* ------------------------------------------------------------------ */

const ConfigSchema = z.object({
  activation_events: z.array(z.string().max(60)).max(20),
  north_star_events: z.array(z.string().max(60)).max(20),
  min_sample: z.number().int().min(1).max(10000),
  notes: z.string().trim().max(2000).nullish(),
});

export const growthSaveConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ConfigSchema.parse(input))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase);
    const db = await admin();
    const { error } = await db
      .from("growth_config")
      .upsert(
        {
          id: true,
          activation_events: data.activation_events,
          north_star_events: data.north_star_events,
          min_sample: data.min_sample,
          notes: data.notes ?? null,
          updated_at: new Date().toISOString(),
          updated_by: context.userId,
        },
        { onConflict: "id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const ExperimentSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2).max(120),
  hypothesis: z.string().trim().max(1000).nullish(),
  area: z.enum(["messaging", "layout", "cta", "content", "onboarding"]),
  variant_a: z.string().trim().max(600).nullish(),
  variant_b: z.string().trim().max(600).nullish(),
  target_page: z.string().trim().max(200).nullish(),
  primary_metric: z.string().trim().max(120).nullish(),
  status: z.enum(["draft", "running", "paused", "completed"]),
  start_date: z.string().trim().max(20).nullish(),
  end_date: z.string().trim().max(20).nullish(),
  min_sample: z.number().int().min(20).max(100000).default(200),
  result_summary: z.string().trim().max(2000).nullish(),
  notes: z.string().trim().max(2000).nullish(),
});

export const growthSaveExperiment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ExperimentSchema.parse(input))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase);
    const db = await admin();
    const payload = { ...data, start_date: data.start_date || null, end_date: data.end_date || null };
    const { error } = data.id
      ? await db.from("growth_experiments").update(payload).eq("id", data.id)
      : await db.from("growth_experiments").insert(payload);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const growthDeleteExperiment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase);
    const db = await admin();
    const { error } = await db.from("growth_experiments").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const AlertSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2).max(120),
  metric: z.enum(["Visitors", "Signups", "Activations"]),
  direction: z.enum(["drop", "rise"]),
  threshold_pct: z.number().min(1).max(500),
  window_days: z.number().int().min(1).max(90),
  enabled: z.boolean(),
  note: z.string().trim().max(500).nullish(),
});

export const growthSaveAlert = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => AlertSchema.parse(input))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase);
    const db = await admin();
    const { error } = data.id
      ? await db.from("growth_alerts").update(data).eq("id", data.id)
      : await db.from("growth_alerts").insert(data);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const growthDeleteAlert = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase);
    const db = await admin();
    const { error } = await db.from("growth_alerts").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ------------------------------------------------------------------ */
/* AI growth analyst — reads the same numbers, never invents any        */
/* ------------------------------------------------------------------ */

const AskSchema = z.object({
  question: z.string().trim().min(4).max(500),
  days: z.number().int().min(1).max(365).default(30),
});

const ANALYST_PROMPT = `You are the Xellvio growth analyst. You are given a JSON snapshot of REAL measured data.

Absolute rules:
- Never invent numbers, rates, sources, templates or explanations. Only use the snapshot.
- When a value is null it means the sample was too small to report — say the data is insufficient instead of guessing.
- Clearly separate sections and label them exactly: OBSERVATION, SUPPORTING DATA, POSSIBLE EXPLANATIONS, RECOMMENDED INVESTIGATION.
- OBSERVATION and SUPPORTING DATA must be facts from the snapshot. POSSIBLE EXPLANATIONS are hypotheses and must be worded as such ("possible explanation", "may indicate").
- Never claim causation. Never recommend experiments on authentication, payments, privacy or customer data.
- Be concise: short paragraphs or bullets.`;

export const growthAsk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => AskSchema.parse(input))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase);
    const db = await admin();

    // Rebuild a compact snapshot from the same read model the dashboard uses.
    const full = await (growthOverview as any).__executeHandler?.({ data: { days: data.days }, context });
    void db;
    const snapshot = full ?? null;

    const { getChatModel } = await import("./ai-provider.server");
    const { generateText } = await import("ai");
    const model = await getChatModel();
    if (!model) throw new Error("AI is not configured");

    const compact = snapshot
      ? {
          window_days: snapshot.window_days,
          min_sample: snapshot.min_sample,
          funnel: snapshot.funnel,
          dropoffs: snapshot.dropoffs,
          activation: snapshot.activation,
          onboarding: snapshot.onboarding,
          sources: snapshot.sources,
          top_pages: snapshot.pages?.slice(0, 12),
          ctas: snapshot.ctas?.slice(0, 12),
          placements: snapshot.placements,
          templates: snapshot.templates?.slice(0, 12),
          content: snapshot.content?.slice(0, 12),
          retention: snapshot.retention,
          cohorts: snapshot.cohorts?.slice(0, 6),
          segments: snapshot.segments,
          north_star: snapshot.northStar,
          trends: snapshot.trends,
        }
      : null;

    try {
      const { text } = await generateText({
        model,
        system: ANALYST_PROMPT,
        messages: [
          {
            role: "user",
            content: `Question: ${data.question}\n\nData snapshot (JSON):\n${JSON.stringify(compact).slice(0, 24000)}`,
          },
        ],
        maxOutputTokens: 900,
      });
      return { answer: text.trim() || "No answer produced." };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/429|rate.?limit/i.test(message)) throw new Error("AI is busy right now — try again in a moment.");
      if (/402|credit|quota/i.test(message)) throw new Error("AI credits are exhausted for this workspace.");
      if (/403/i.test(message)) throw new Error("AI is disabled for this workspace.");
      throw new Error(`AI error: ${message.slice(0, 200)}`);
    }
  });
