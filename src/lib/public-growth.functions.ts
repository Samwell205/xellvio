// Public (unauthenticated) server functions powering hosted landing pages and
// sign-up forms. These intentionally return only presentation fields — never PII.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const SEO_FIELDS = "logo_url,seo_title,seo_description,og_image_url,design";
const PAGE_FIELDS =
  `id,slug,name,headline,subheadline,body,cta_label,success_message,consent_text,theme,accent,image_url,sections,published,views,account_id,list_id,${SEO_FIELDS}`;
const FORM_FIELDS =
  `id,slug,name,headline,description,cta_label,success_message,collect_name,consent_text,theme,accent,image_url,published,views,account_id,list_id,${SEO_FIELDS}`;

export const getPublicLandingPage = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ slug: z.string().trim().min(1).max(80) }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: page } = await supabaseAdmin
      .from("landing_pages")
      .select(PAGE_FIELDS)
      .eq("slug", data.slug)
      .eq("published", true)
      .maybeSingle();
    if (!page) return null;
    await supabaseAdmin
      .from("landing_pages")
      .update({ views: ((page as any).views ?? 0) + 1 })
      .eq("id", (page as any).id);
    const { account_id, list_id, ...pub } = page as any;
    return pub as Record<string, any>;
  });

export const getPublicSignupForm = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ slug: z.string().trim().min(1).max(80) }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: form } = await supabaseAdmin
      .from("signup_forms")
      .select(FORM_FIELDS)
      .eq("slug", data.slug)
      .eq("published", true)
      .maybeSingle();
    if (!form) return null;
    await supabaseAdmin
      .from("signup_forms")
      .update({ views: ((form as any).views ?? 0) + 1 } as any)
      .eq("id", (form as any).id);
    const { account_id, list_id, ...pub } = form as any;
    return pub as Record<string, any>;
  });


const SubmitSchema = z.object({
  sourceType: z.enum(["landing_page", "signup_form"]),
  slug: z.string().trim().min(1).max(80),
  phone: z.string().trim().min(6).max(24),
  firstName: z.string().trim().max(60).optional().nullable(),
  lastName: z.string().trim().max(60).optional().nullable(),
});

export const submitSubscribe = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => SubmitSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { parsePhoneNumberFromString } = await import("libphonenumber-js");

    const table = data.sourceType === "landing_page" ? "landing_pages" : "signup_forms";
    const { data: source } = await supabaseAdmin
      .from(table)
      .select("id,account_id,list_id,success_message,submissions,published")
      .eq("slug", data.slug)
      .eq("published", true)
      .maybeSingle();
    if (!source) throw new Error("This form is no longer available.");

    const raw = data.phone.replace(/[^\d+]/g, "");
    const parsed = parsePhoneNumberFromString(raw.startsWith("+") ? raw : `+${raw}`);
    if (!parsed?.isValid()) throw new Error("Enter a valid phone number including country code.");
    const phone = parsed.number as string;

    const { error } = await (supabaseAdmin.rpc as any)("bulk_import_profiles", {
      _account_id: source.account_id,
      _list_id: source.list_id ?? null,
      _rows: [
        {
          phone_e164: phone,
          first_name: data.firstName ?? null,
          last_name: data.lastName ?? null,
          country_code: parsed.country ?? null,
          custom_fields: { source: data.sourceType, source_slug: data.slug },
        },
      ],
    });
    if (error) throw new Error("Could not save your details. Please try again.");

    await supabaseAdmin.from("subscribe_submissions").insert({
      account_id: source.account_id,
      source_type: data.sourceType,
      source_id: source.id,
      phone_e164: phone,
      first_name: data.firstName ?? null,
      last_name: data.lastName ?? null,
    });
    await supabaseAdmin
      .from(table)
      .update({ submissions: (source.submissions ?? 0) + 1 })
      .eq("id", source.id);

    try {
      const { enqueueFlowTriggers } = await import("./flows.server");
      await enqueueFlowTriggers({ accountId: source.account_id, phone, trigger: "new_contact" });
      if (source.list_id) {
        await enqueueFlowTriggers({
          accountId: source.account_id,
          phone,
          trigger: "list_join",
          listId: source.list_id,
        });
      }
    } catch {
      /* signup still succeeds if automation scheduling hiccups */
    }

    return { ok: true, message: source.success_message as string };
  });
