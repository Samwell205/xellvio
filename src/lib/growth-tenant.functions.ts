import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ONBOARDING_GOALS, type OnboardingGoalKey } from "@/lib/growth/taxonomy";

/**
 * Tenant-facing growth helpers: the goal a workspace picks during setup, and
 * contextual next-step suggestions computed from what the workspace has actually
 * built. Suggestions are derived from real rows — never random prompts.
 */

async function acct(userId: string) {
  const { resolveActingAccount } = await import("./acting-account.server");
  return (await resolveActingAccount(userId)).accountId;
}

const GoalSchema = z.object({
  goal: z.enum(ONBOARDING_GOALS.map((g) => g.key) as [OnboardingGoalKey, ...OnboardingGoalKey[]]),
  session_id: z.string().trim().max(80).nullish(),
  source: z.string().trim().max(60).nullish(),
  medium: z.string().trim().max(40).nullish(),
  campaign: z.string().trim().max(80).nullish(),
});

/** Stores the workspace goal plus the channel that originally brought them in. */
export const saveGrowthGoal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => GoalSchema.parse(input))
  .handler(async ({ data, context }) => {
    const accountId = await acct(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const { data: existing } = await db.from("accounts").select("signup_source").eq("id", accountId).maybeSingle();
    const patch: Record<string, unknown> = { growth_goal: data.goal };
    if (!existing?.signup_source) {
      patch.signup_source = data.source ?? null;
      patch.signup_medium = data.medium ?? null;
      patch.signup_campaign = data.campaign ?? null;
      patch.signup_session_id = data.session_id ?? null;
    }
    const { error } = await db.from("accounts").update(patch).eq("id", accountId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getGrowthGoal = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const accountId = await acct(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const { data } = await db.from("accounts").select("growth_goal").eq("id", accountId).maybeSingle();
    const goal = (data?.growth_goal ?? null) as OnboardingGoalKey | null;
    const match = ONBOARDING_GOALS.find((g) => g.key === goal) ?? null;
    return { goal, recommend: match?.recommend ?? [], href: match?.href ?? null };
  });

export type FeatureSuggestion = {
  key: string;
  title: string;
  reason: string;
  cta: string;
  href: string;
};

/**
 * Contextual next steps for this workspace. Every suggestion depends on something
 * the workspace already did, so nothing is shown out of the blue.
 */
export const featureSuggestions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<FeatureSuggestion[]> => {
    const accountId = await acct(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;

    const count = async (table: string, filters: Record<string, unknown> = {}) => {
      let q = db.from(table).select("id", { count: "exact", head: true }).eq("account_id", accountId);
      for (const [k, v] of Object.entries(filters)) q = q.eq(k, v);
      const { count: c } = await q;
      return c ?? 0;
    };

    const [pages, publishedPages, forms, publishedForms, automations, activeAutomations, campaigns, contacts, lists] =
      await Promise.all([
        count("landing_pages"),
        count("landing_pages", { published: true }),
        count("signup_forms"),
        count("signup_forms", { published: true }),
        count("automations"),
        count("automations", { status: "active" }),
        count("campaigns"),
        count("profiles"),
        count("contact_lists"),
      ]);

    const out: FeatureSuggestion[] = [];

    if (pages > 0 && automations === 0) {
      out.push({
        key: "page_to_automation",
        title: "Follow up with new leads automatically",
        reason: "You have a landing page but no automated follow-up yet.",
        cta: "Build a follow-up",
        href: "/app/automations",
      });
    }
    if (pages > 0 && publishedPages === 0) {
      out.push({
        key: "publish_page",
        title: "Publish your landing page",
        reason: "Your page is still a draft, so visitors can't reach it.",
        cta: "Publish it",
        href: "/app/landing-pages",
      });
    }
    if (forms > 0 && lists === 0) {
      out.push({
        key: "form_to_list",
        title: "Send form sign-ups into an audience",
        reason: "You built a sign-up form but have no audience list to collect into.",
        cta: "Create a list",
        href: "/app/lists",
      });
    }
    if (forms > 0 && publishedForms === 0) {
      out.push({
        key: "publish_form",
        title: "Publish or embed your sign-up form",
        reason: "The form exists but isn't live anywhere yet.",
        cta: "Publish the form",
        href: "/app/signup-forms",
      });
    }
    if (contacts > 0 && campaigns === 0) {
      out.push({
        key: "contacts_to_campaign",
        title: "Send your first campaign",
        reason: "You have contacts imported but haven't messaged them yet.",
        cta: "Create a campaign",
        href: "/app/campaigns/new",
      });
    }
    if (campaigns > 0 && contacts === 0) {
      out.push({
        key: "campaign_needs_contacts",
        title: "Import your contacts",
        reason: "A campaign is waiting but there is no audience to send it to.",
        cta: "Import contacts",
        href: "/app/audience",
      });
    }
    if (automations > 0 && activeAutomations === 0) {
      out.push({
        key: "activate_automation",
        title: "Turn your workflow on",
        reason: "Your automation is built but not activated, so it never runs.",
        cta: "Review and activate",
        href: "/app/automations",
      });
    }
    if (contacts > 0 && forms === 0 && pages === 0) {
      out.push({
        key: "keep_growing",
        title: "Keep the audience growing",
        reason: "You're messaging contacts but not collecting new ones yet.",
        cta: "Add a sign-up form",
        href: "/app/signup-forms",
      });
    }

    return out.slice(0, 3);
  });
