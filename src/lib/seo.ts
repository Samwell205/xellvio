/**
 * Centralised SEO + GEO configuration for every public Xellvio page.
 *
 * Route files should never hand-write meta tags. They call `pageHead()` with
 * page-specific values; global defaults (site name, share image, twitter card,
 * canonical host) are applied here so the whole site stays consistent.
 */

/** Production canonical origin. Overridable per environment, never a preview host. */
export const SITE_URL = (
  (typeof import.meta !== "undefined" ? import.meta.env?.VITE_SITE_URL : undefined) ||
  "https://xellvio.com"
).replace(/\/+$/, "");

/** Single source of truth for the Xellvio entity (used in metadata + schema). */
export const BRAND = {
  name: "Xellvio",
  legalName: "Xellvio",
  category: "BusinessApplication",
  /** One-line description. Keep consistent across pages and structured data. */
  short:
    "Xellvio is a customer messaging platform for SMS campaigns, automations, sign-up forms and landing pages.",
  /** Full factual description used for Organization / SoftwareApplication schema. */
  long: "Xellvio is a customer messaging platform that helps businesses send bulk SMS and MMS campaigns to 190+ countries, automate customer journeys, collect leads through sign-up forms and landing pages, reply in a shared two-way inbox, and measure delivery, clicks and revenue from one place.",
  logo: `${SITE_URL}/icon-512.png`,
  /** Only officially owned profiles belong here. Empty until verified. */
  sameAs: [] as string[],
  supportEmail: "support@xellvio.com",
  /** Fallback social share image (1200x630). */
  ogImage:
    "https://storage.googleapis.com/gpt-engineer-file-uploads/attachments/og-images/74e5da20-6d22-40e0-9f0a-22e55bedbb4c",
} as const;

export const ORG_ID = `${SITE_URL}/#organization`;
export const WEBSITE_ID = `${SITE_URL}/#website`;

/** Builds an absolute canonical URL, normalising slashes and stripping queries. */
export function absoluteUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const clean = `/${path.replace(/^\/+/, "")}`.split(/[?#]/)[0]!;
  const noTrailing = clean.length > 1 ? clean.replace(/\/+$/, "") : "/";
  return `${SITE_URL}${noTrailing}`;
}

export type RobotsDirective = "index" | "noindex";

export type PageSeo = {
  /** Page-specific title. `| Xellvio` is appended unless the title already names the brand. */
  title: string;
  description: string;
  /** Route path, e.g. "/pricing". Used for canonical + og:url. */
  path: string;
  ogTitle?: string;
  ogDescription?: string;
  /** Absolute https image URL sized ~1200x630. Falls back to the brand image. */
  image?: string | null;
  ogType?: "website" | "article" | "product";
  robots?: RobotsDirective;
  /** Only where genuinely useful; ignored by most engines. */
  keywords?: string[];
  /** Extra JSON-LD nodes. Use the generators below. */
  schema?: Record<string, unknown>[];
  /** Visible breadcrumb trail; emits BreadcrumbList when provided. */
  breadcrumbs?: { name: string; path: string }[];
  /** ISO date for WebPage.dateModified. */
  dateModified?: string;
  /** Set false to skip the automatic WebPage node (e.g. when Article is used). */
  webPage?: boolean;
};

function formatTitle(title: string) {
  return /xellvio/i.test(title) ? title : `${title} | ${BRAND.name}`;
}

/** Returns a TanStack Router `head()` object. Single place all public pages use. */
export function pageHead(seo: PageSeo) {
  const title = formatTitle(seo.title);
  const url = absoluteUrl(seo.path);
  const image = seo.image === null ? null : (seo.image ?? BRAND.ogImage);
  const noindex = seo.robots === "noindex";

  const meta: Record<string, string>[] = [
    { title },
    { name: "description", content: seo.description },
    { property: "og:title", content: seo.ogTitle ?? title },
    { property: "og:description", content: seo.ogDescription ?? seo.description },
    { property: "og:type", content: seo.ogType ?? "website" },
    { property: "og:url", content: url },
    { property: "og:site_name", content: BRAND.name },
    { name: "twitter:card", content: image ? "summary_large_image" : "summary" },
    { name: "twitter:title", content: seo.ogTitle ?? title },
    { name: "twitter:description", content: seo.ogDescription ?? seo.description },
  ];
  if (image) {
    meta.push({ property: "og:image", content: image });
    meta.push({ name: "twitter:image", content: image });
  }
  if (seo.keywords?.length) meta.push({ name: "keywords", content: seo.keywords.join(", ") });
  if (noindex) meta.push({ name: "robots", content: "noindex, nofollow" });

  const nodes: Record<string, unknown>[] = [];
  if (!noindex) {
    if (seo.webPage !== false) {
      nodes.push(
        webPageSchema({
          name: title,
          description: seo.description,
          path: seo.path,
          dateModified: seo.dateModified,
        }),
      );
    }
    if (seo.breadcrumbs?.length) nodes.push(breadcrumbSchema(seo.breadcrumbs));
    if (seo.schema?.length) nodes.push(...seo.schema);
  }

  return {
    meta,
    links: noindex ? [] : [{ rel: "canonical", href: url }],
    scripts: nodes.length
      ? [
          {
            type: "application/ld+json",
            children: JSON.stringify({ "@context": "https://schema.org", "@graph": nodes }),
          },
        ]
      : [],
  };
}

/* ------------------------------------------------------------------ schema */

export function organizationSchema(): Record<string, unknown> {
  return {
    "@type": "Organization",
    "@id": ORG_ID,
    name: BRAND.name,
    legalName: BRAND.legalName,
    url: `${SITE_URL}/`,
    logo: BRAND.logo,
    description: BRAND.long,
    ...(BRAND.sameAs.length ? { sameAs: BRAND.sameAs } : {}),
    contactPoint: [
      {
        "@type": "ContactPoint",
        contactType: "customer support",
        email: BRAND.supportEmail,
        availableLanguage: ["English"],
      },
    ],
  };
}

export function websiteSchema(): Record<string, unknown> {
  return {
    "@type": "WebSite",
    "@id": WEBSITE_ID,
    url: `${SITE_URL}/`,
    name: BRAND.name,
    description: BRAND.long,
    inLanguage: "en",
    publisher: { "@id": ORG_ID },
  };
}

export function softwareApplicationSchema(opts?: {
  name?: string;
  description?: string;
  path?: string;
  featureList?: string[];
}): Record<string, unknown> {
  return {
    "@type": "SoftwareApplication",
    name: opts?.name ?? BRAND.name,
    applicationCategory: BRAND.category,
    operatingSystem: "Web",
    url: absoluteUrl(opts?.path ?? "/"),
    description: opts?.description ?? BRAND.long,
    ...(opts?.featureList?.length ? { featureList: opts.featureList } : {}),
    offers: {
      "@type": "Offer",
      url: `${SITE_URL}/pricing`,
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
    },
    publisher: { "@id": ORG_ID },
  };
}

export function webPageSchema(opts: {
  name: string;
  description: string;
  path: string;
  dateModified?: string;
}): Record<string, unknown> {
  const url = absoluteUrl(opts.path);
  return {
    "@type": "WebPage",
    "@id": `${url}#webpage`,
    url,
    name: opts.name,
    description: opts.description,
    inLanguage: "en",
    isPartOf: { "@id": WEBSITE_ID },
    ...(opts.dateModified ? { dateModified: opts.dateModified } : {}),
  };
}

/** Only for real article/guide pages with visible bylines and dates. */
export function articleSchema(opts: {
  headline: string;
  description: string;
  path: string;
  datePublished: string;
  dateModified?: string;
  authorName?: string;
  image?: string;
}): Record<string, unknown> {
  const url = absoluteUrl(opts.path);
  return {
    "@type": "Article",
    "@id": `${url}#article`,
    headline: opts.headline,
    description: opts.description,
    mainEntityOfPage: url,
    datePublished: opts.datePublished,
    dateModified: opts.dateModified ?? opts.datePublished,
    author: {
      "@type": opts.authorName ? "Person" : "Organization",
      name: opts.authorName ?? BRAND.name,
    },
    publisher: { "@id": ORG_ID },
    ...(opts.image ? { image: opts.image } : {}),
  };
}

/** Only when the same questions and answers are visible on the page. */
export function faqSchema(faqs: { q: string; a: string }[]): Record<string, unknown> {
  return {
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}

/** Only when a visible breadcrumb trail exists on the page. */
export function breadcrumbSchema(items: { name: string; path: string }[]): Record<string, unknown> {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

/* --------------------------------------------------- public page inventory */

export type PublicPage = {
  path: string;
  changefreq: "daily" | "weekly" | "monthly" | "yearly";
  priority: string;
  /** Grouping used for internal-link and sitemap organisation. */
  group: "core" | "product" | "solutions" | "resources" | "marketplace" | "legal";
};

/**
 * Every indexable marketing route. The sitemap is generated from this list, so
 * adding a public page here is all that is needed for discovery.
 * Private, authenticated, editor and auth-flow routes are intentionally absent.
 */
export const PUBLIC_PAGES: PublicPage[] = [
  { path: "/", changefreq: "weekly", priority: "1.0", group: "core" },
  { path: "/sms-marketing", changefreq: "weekly", priority: "0.9", group: "product" },
  { path: "/email-marketing", changefreq: "weekly", priority: "0.9", group: "product" },
  { path: "/features", changefreq: "monthly", priority: "0.9", group: "product" },
  { path: "/pricing", changefreq: "weekly", priority: "0.9", group: "product" },
  { path: "/solutions", changefreq: "monthly", priority: "0.8", group: "solutions" },
  { path: "/solutions/email-to-sms", changefreq: "monthly", priority: "0.8", group: "solutions" },
  { path: "/marketplace", changefreq: "weekly", priority: "0.7", group: "marketplace" },
  { path: "/marketplace/apps", changefreq: "weekly", priority: "0.7", group: "marketplace" },
  { path: "/marketplace/categories", changefreq: "monthly", priority: "0.6", group: "marketplace" },
  { path: "/marketplace/developers", changefreq: "monthly", priority: "0.5", group: "marketplace" },
  { path: "/docs", changefreq: "monthly", priority: "0.7", group: "resources" },
  { path: "/connect", changefreq: "monthly", priority: "0.6", group: "resources" },
  { path: "/about", changefreq: "monthly", priority: "0.6", group: "core" },
  { path: "/contact", changefreq: "yearly", priority: "0.5", group: "core" },
  { path: "/verify", changefreq: "monthly", priority: "0.6", group: "core" },
  { path: "/sellers", changefreq: "monthly", priority: "0.5", group: "core" },
  { path: "/terms", changefreq: "yearly", priority: "0.3", group: "legal" },
  { path: "/privacy", changefreq: "yearly", priority: "0.3", group: "legal" },
  { path: "/aup", changefreq: "yearly", priority: "0.3", group: "legal" },
  { path: "/anti-spam", changefreq: "yearly", priority: "0.3", group: "legal" },
  { path: "/sms-terms", changefreq: "yearly", priority: "0.3", group: "legal" },
  { path: "/cookies", changefreq: "yearly", priority: "0.3", group: "legal" },
  { path: "/dpa", changefreq: "yearly", priority: "0.3", group: "legal" },
  { path: "/prohibited-content", changefreq: "monthly", priority: "0.4", group: "legal" },
];
