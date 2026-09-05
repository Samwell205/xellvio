import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { TRACKED_EVENTS } from "@/lib/growth/taxonomy";

/**
 * Public, unauthenticated growth event intake.
 *
 * Accepts small batches from the browser, validates and truncates every field,
 * stores no IP address (only the country the edge reports) and always answers 204
 * so a tracking failure can never affect the page the visitor is on.
 */

const str = (max: number) => z.string().trim().max(max).nullish();

// Only the project's known vocabulary is stored, so the event stream cannot be
// polluted by arbitrary names from outside.
const KNOWN_EVENTS = new Set<string>(TRACKED_EVENTS as readonly string[]);

const EventSchema = z.object({
  event: z.string().trim().min(1).max(60).refine((v) => KNOWN_EVENTS.has(v), "unknown event"),
  session_id: str(80),
  account_id: z.string().uuid().nullish(),
  path: str(300),
  page_type: str(30),
  entity_type: str(40),
  entity_slug: str(160),
  cta_name: str(60),
  cta_placement: str(40),
  source: str(60),
  medium: str(40),
  campaign: str(80),
  referrer_host: str(120),
  experiment: str(80),
  variant: str(40),
  props: z.record(z.string(), z.union([z.string().max(200), z.number(), z.boolean(), z.null()])).nullish(),
});

const BodySchema = z.object({ events: z.array(EventSchema).min(1).max(40) });

const ENGAGED_AFTER_VIEWS = 2;
const EXPLORER_EVENTS = new Set([
  "product_page_view",
  "pricing_page_view",
  "template_view",
  "template_preview",
  "resource_view",
]);

export const Route = createFileRoute("/api/public/growth-events")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const parsed = BodySchema.safeParse(await request.json());
          if (!parsed.success) return new Response(null, { status: 204 });

          const { geoFromHeaders } = await import("@/lib/geo.server");
          const country = geoFromHeaders(request.headers).country?.slice(0, 2) ?? null;
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const db = supabaseAdmin as any;

          const rows = parsed.data.events.map((e) => ({
            event: e.event,
            session_id: e.session_id ?? null,
            account_id: e.account_id ?? null,
            path: e.path ?? null,
            page_type: e.page_type ?? null,
            entity_type: e.entity_type ?? null,
            entity_slug: e.entity_slug ?? null,
            cta_name: e.cta_name ?? null,
            cta_placement: e.cta_placement ?? null,
            source: e.source ?? null,
            medium: e.medium ?? null,
            campaign: e.campaign ?? null,
            referrer_host: e.referrer_host ?? null,
            country,
            experiment: e.experiment ?? null,
            variant: e.variant ?? null,
            props: e.props ?? {},
          }));

          await db.from("growth_events").insert(rows);

          // Roll the visit summary forward so funnel maths stays cheap.
          const bySession = new Map<string, typeof rows>();
          for (const r of rows) {
            if (!r.session_id) continue;
            const list = bySession.get(r.session_id) ?? [];
            list.push(r);
            bySession.set(r.session_id, list);
          }

          for (const [sid, list] of bySession) {
            const { data: existing } = await db
              .from("growth_sessions")
              .select("session_id,page_views,product_views,cta_clicks,signup_started,signup_completed,account_id,first_path")
              .eq("session_id", sid)
              .maybeSingle();

            const views = list.filter((r) => r.event === "page_view").length;
            const productViews = list.filter((r) => EXPLORER_EVENTS.has(r.event)).length;
            const ctaClicks = list.filter((r) => r.event === "cta_click").length;
            const first = list[0];
            const pageViews = (existing?.page_views ?? 0) + views;
            const totalProduct = (existing?.product_views ?? 0) + productViews;
            const totalCta = (existing?.cta_clicks ?? 0) + ctaClicks;

            const payload = {
              session_id: sid,
              last_seen: new Date().toISOString(),
              last_path: list[list.length - 1]?.path ?? null,
              page_views: pageViews,
              product_views: totalProduct,
              cta_clicks: totalCta,
              engaged: pageViews >= ENGAGED_AFTER_VIEWS || totalProduct > 0 || totalCta > 0,
              signup_started:
                (existing?.signup_started ?? false) || list.some((r) => r.event === "signup_started"),
              signup_completed:
                (existing?.signup_completed ?? false) || list.some((r) => r.event === "signup_completed"),
              account_id: list.find((r) => r.account_id)?.account_id ?? existing?.account_id ?? null,
              ...(existing
                ? {}
                : {
                    first_path: first?.path ?? null,
                    source: first?.source ?? null,
                    medium: first?.medium ?? null,
                    campaign: first?.campaign ?? null,
                    referrer_host: first?.referrer_host ?? null,
                    country,
                  }),
            };
            await db.from("growth_sessions").upsert(payload, { onConflict: "session_id" });
          }
        } catch {
          /* measurement must never surface an error to the visitor */
        }
        return new Response(null, { status: 204 });
      },
    },
  },
});
