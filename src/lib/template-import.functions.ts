/**
 * Product-led template flow: a visitor picks a template on the public site,
 * signs in or signs up, and the template is imported into their workspace as an
 * editable draft. Nothing is published automatically.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PAGE_BUILDER_TEMPLATES, FORM_BUILDER_TEMPLATES, instantiate } from "@/lib/builder/templates";
import { AUTOMATION_TEMPLATES, materialiseTemplate } from "@/lib/automation-templates";
import { stepDef, outputsFor, defaultConfig, type NodeConfig } from "@/lib/automation-catalog";
import { findLibraryTemplate } from "@/lib/templates/library";

const EventSchema = z.object({
  category: z.string().trim().max(40),
  slug: z.string().trim().max(80),
  event: z.enum(["view", "preview", "use_click", "import", "publish"]),
  referrer: z.string().trim().max(300).optional().nullable(),
});

/** Anonymous, aggregate-only template analytics. No visitor identifiers stored. */
export const recordTemplateEvent = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => EventSchema.parse(input))
  .handler(async ({ data }) => {
    const tpl = findLibraryTemplate(data.category, data.slug);
    if (!tpl) return { ok: false };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("template_events").insert({
      template_type: tpl.type,
      template_slug: tpl.slug,
      event: data.event,
      referrer: data.referrer ?? null,
    } as never);
    return { ok: true };
  });

async function accountFor(userId: string) {
  const { resolveActingAccount } = await import("./acting-account.server");
  return (await resolveActingAccount(userId)).accountId;
}

function slugify(s: string) {
  const base = s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "page";
  return `${base}-${Math.random().toString(36).slice(2, 7)}`;
}

export type TemplateImportResult = {
  type: "landing-page" | "signup-form" | "automation";
  id: string;
  name: string;
  /** Where the user should land to finish the template. */
  to: string;
};

export const importTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ category: z.string().trim().max(40), slug: z.string().trim().max(80) }).parse(input),
  )
  .handler(async ({ data, context }): Promise<TemplateImportResult> => {
    const tpl = findLibraryTemplate(data.category, data.slug);
    if (!tpl) throw new Error("Template not found");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const accountId = await accountFor(context.userId);

    const stamp = { source_template: tpl.slug, source_template_version: tpl.version };

    const log = async () => {
      await supabaseAdmin.from("template_events").insert({
        template_type: tpl.type,
        template_slug: tpl.slug,
        event: "import",
        account_id: accountId,
      } as never);
    };

    if (tpl.type === "landing-page") {
      const builder = PAGE_BUILDER_TEMPLATES.find((t) => t.id === tpl.slug);
      if (!builder) throw new Error("Template not found");
      const { blocks, theme } = instantiate(builder);
      const { data: created, error } = await supabaseAdmin
        .from("landing_pages")
        .insert({
          account_id: accountId,
          name: tpl.label,
          slug: slugify(tpl.label),
          headline: tpl.label,
          subheadline: tpl.blurb,
          blocks: blocks as never,
          builder_theme: theme as never,
          published: false,
          ...stamp,
        } as never)
        .select("id,name")
        .single();
      if (error) throw new Error(error.message);
      await log();
      return { type: "landing-page", id: (created as any).id, name: (created as any).name, to: "/app/landing-pages" };
    }

    if (tpl.type === "signup-form") {
      const builder = FORM_BUILDER_TEMPLATES.find((t) => t.id === tpl.slug);
      if (!builder) throw new Error("Template not found");
      const { blocks, theme } = instantiate(builder);
      const { data: created, error } = await supabaseAdmin
        .from("signup_forms")
        .insert({
          account_id: accountId,
          name: tpl.label,
          slug: slugify(tpl.label),
          headline: tpl.label,
          description: tpl.blurb,
          consent_text:
            "By signing up you agree to receive recurring marketing texts. Message and data rates may apply. Reply STOP to opt out.",
          blocks: blocks as never,
          builder_theme: theme as never,
          published: false,
          ...stamp,
        } as never)
        .select("id,name")
        .single();
      if (error) throw new Error(error.message);
      await log();
      return { type: "signup-form", id: (created as any).id, name: (created as any).name, to: "/app/signup-forms" };
    }

    const auto = AUTOMATION_TEMPLATES.find((t) => t.id === tpl.slug);
    if (!auto) throw new Error("Template not found");
    const built = materialiseTemplate(auto);
    const { data: created, error } = await supabaseAdmin
      .from("automations")
      .insert({ account_id: accountId, name: auto.name, status: "draft", ...stamp } as never)
      .select("id,name")
      .single();
    if (error) throw new Error(error.message);
    const automationId = (created as any).id as string;

    const nodes = built.nodes.map((n, i) => ({
      automation_id: automationId,
      node_key: `n${i + 1}`,
      type: n.type,
      label: stepDef(n.type).label,
      position: n.position,
      configuration: (n.config ?? defaultConfig(n.type)) as NodeConfig,
      disabled: false,
    }));
    const keyOf = new Map(built.nodes.map((n, i) => [n.key, `n${i + 1}`]));
    const connections = built.edges.map((e, i) => {
      const source = built.nodes.find((n) => n.key === e.source)!;
      const handles = outputsFor(source.type, (source.config ?? defaultConfig(source.type)) as NodeConfig);
      return {
        automation_id: automationId,
        edge_key: `e${i + 1}`,
        source_node_key: keyOf.get(e.source)!,
        target_node_key: keyOf.get(e.target)!,
        source_handle: e.sourceHandle ?? handles[0]?.id ?? null,
        target_handle: null,
      };
    });

    if (nodes.length) {
      const { error: nErr } = await supabaseAdmin.from("automation_nodes").insert(nodes as never);
      if (nErr) throw new Error(nErr.message);
    }
    if (connections.length) {
      const { error: cErr } = await supabaseAdmin.from("automation_connections").insert(connections as never);
      if (cErr) throw new Error(cErr.message);
    }
    await log();
    return { type: "automation", id: automationId, name: auto.name, to: `/app/automations/${automationId}` };
  });

/** Admin-only aggregate view: which templates drive discovery and imports. */
export const templateFunnelStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    if (!(roles ?? []).some((r: any) => r.role === "admin")) throw new Error("Not authorised");
    const { data } = await supabaseAdmin
      .from("template_events")
      .select("template_type,template_slug,event")
      .order("created_at", { ascending: false })
      .limit(5000);
    const rows = new Map<string, { type: string; slug: string; views: number; useClicks: number; imports: number }>();
    for (const r of (data ?? []) as any[]) {
      const key = `${r.template_type}:${r.template_slug}`;
      const row = rows.get(key) ?? { type: r.template_type, slug: r.template_slug, views: 0, useClicks: 0, imports: 0 };
      if (r.event === "view") row.views += 1;
      if (r.event === "use_click") row.useClicks += 1;
      if (r.event === "import") row.imports += 1;
      rows.set(key, row);
    }
    return Array.from(rows.values()).sort((a, b) => b.views - a.views);
  });
