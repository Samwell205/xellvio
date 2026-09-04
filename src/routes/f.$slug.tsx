import { createFileRoute, notFound } from "@tanstack/react-router";
import { getPublicSignupForm, submitSubscribe } from "@/lib/public-growth.functions";
import { FormRenderer } from "@/components/website/renderers";
import { mergeDesign } from "@/lib/website-design";
import { BlockCanvas } from "@/components/builder/BlockRenderer";
import { mergeTheme, normalizeBlocks } from "@/lib/builder/schema";

export const Route = createFileRoute("/f/$slug")({
  loader: async ({ params }) => {
    const form = await getPublicSignupForm({ data: { slug: params.slug } });
    if (!form) throw notFound();
    return form;
  },
  head: ({ params, loaderData }) => {
    const d = (loaderData ?? {}) as any;
    const title = (d.seo_title || d.headline || d.name || "Sign up").slice(0, 70);
    const description = (d.seo_description || d.description || "Join our text list.").slice(0, 155);
    const url = `https://xellvio.com/f/${params.slug}`;
    const image: string | null = typeof d.og_image_url === "string" && d.og_image_url.startsWith("https://") ? d.og_image_url : null;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { property: "og:url", content: url },
        { name: "twitter:card", content: image ? "summary_large_image" : "summary" },
        ...(image ? [{ property: "og:image", content: image }, { name: "twitter:image", content: image }] : []),
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },
  component: SignupFormView,
});

function SignupFormView() {
  const form = Route.useLoaderData() as any;
  const design = mergeDesign(form.design);
  const blocks = normalizeBlocks(form.blocks);

  const submit = async ({ phone, firstName, lastName }: { phone: string; firstName?: string; lastName?: string }) => {
    const r = await submitSubscribe({
      data: {
        sourceType: "signup_form",
        slug: form.slug,
        phone,
        firstName: firstName || null,
        lastName: lastName || null,
      },
    });
    return r.message;
  };

  if (blocks.length > 0) {
    return (
      <main style={{ minHeight: "100vh" }}>
        <BlockCanvas blocks={blocks} theme={mergeTheme(form.builder_theme)} interactive onSubmit={submit} />
      </main>
    );
  }

  return (
    <main style={{ minHeight: "100vh" }}>
      <FormRenderer
        design={design}
        headline={form.headline || form.name}
        description={form.description || ""}
        logoUrl={form.logo_url || null}
        imageUrl={form.image_url || null}
        form={{
          ctaLabel: form.cta_label || "Subscribe",
          successMessage: form.success_message || "You are on the list!",
          consentText: form.consent_text || "",
          collectName: !!form.collect_name,
        }}
        onSubmit={async ({ phone, firstName, lastName }) => {
          const r = await submitSubscribe({
            data: {
              sourceType: "signup_form",
              slug: form.slug,
              phone,
              firstName: firstName || null,
              lastName: lastName || null,
            },
          });
          return r.message;
        }}
      />
    </main>
  );
}
