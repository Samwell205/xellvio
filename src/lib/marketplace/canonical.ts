// ============================================================================
// Xellvio Integration Engine — canonical data model + connector abstraction.
//
//   Xellvio  ->  Integration engine  ->  Connector  ->  Third-party app
//
// Everything inside Xellvio speaks the canonical entities below. Each connector
// declares how a canonical record is shaped for its provider, so no
// platform-specific mapping ever lives inside UI code.
// ============================================================================

export const CANONICAL_ENTITIES = [
  "contact",
  "company",
  "lead",
  "deal",
  "product",
  "customer",
  "order",
  "payment",
  "invoice",
  "appointment",
  "subscription",
  "form_submission",
  "message",
] as const;

export type CanonicalEntity = (typeof CANONICAL_ENTITIES)[number];

export type CanonicalContact = {
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  tags?: string[];
  custom_fields?: Record<string, unknown>;
  source?: string | null;
};

export type CanonicalRecord = Record<string, unknown>;

/** A connector maps canonical records to/from one provider's payload shape. */
export type Connector = {
  slug: string;
  name: string;
  /** Canonical entities this connector can write. */
  writes: CanonicalEntity[];
  /** Canonical entities this connector can emit as triggers. */
  emits: CanonicalEntity[];
  /** Canonical -> provider payload. */
  toProvider: (entity: CanonicalEntity, record: CanonicalRecord) => CanonicalRecord;
  /** Provider payload -> canonical. */
  fromProvider: (entity: CanonicalEntity, payload: CanonicalRecord) => CanonicalRecord;
};

const contactOf = (r: CanonicalRecord): CanonicalContact => r as CanonicalContact;
const fullName = (c: CanonicalContact) => [c.first_name, c.last_name].filter(Boolean).join(" ").trim();

const passthrough: Connector["fromProvider"] = (_entity, payload) => payload;

export const CONNECTORS: Record<string, Connector> = {
  hubspot: {
    slug: "hubspot",
    name: "HubSpot",
    writes: ["contact", "company", "deal"],
    emits: ["contact", "deal"],
    toProvider: (entity, record) => {
      if (entity !== "contact") return record;
      const c = contactOf(record);
      return {
        properties: {
          firstname: c.first_name ?? undefined,
          lastname: c.last_name ?? undefined,
          email: c.email ?? undefined,
          phone: c.phone ?? undefined,
          company: c.company ?? undefined,
          hs_lead_status: c.source ?? undefined,
        },
      };
    },
    fromProvider: (entity, payload) => {
      if (entity !== "contact") return payload;
      const p = (payload["properties"] ?? {}) as Record<string, unknown>;
      return {
        first_name: p["firstname"] ?? null,
        last_name: p["lastname"] ?? null,
        email: p["email"] ?? null,
        phone: p["phone"] ?? null,
        company: p["company"] ?? null,
      };
    },
  },
  gohighlevel: {
    slug: "gohighlevel",
    name: "GoHighLevel",
    writes: ["contact", "lead", "deal", "appointment"],
    emits: ["contact", "deal", "appointment"],
    toProvider: (entity, record) => {
      if (entity !== "contact" && entity !== "lead") return record;
      const c = contactOf(record);
      return {
        firstName: c.first_name ?? undefined,
        lastName: c.last_name ?? undefined,
        email: c.email ?? undefined,
        phone: c.phone ?? undefined,
        companyName: c.company ?? undefined,
        tags: c.tags ?? [],
        source: c.source ?? "Xellvio",
        customFields: c.custom_fields ?? {},
      };
    },
    fromProvider: (entity, payload) => {
      if (entity !== "contact") return payload;
      return {
        first_name: payload["firstName"] ?? null,
        last_name: payload["lastName"] ?? null,
        email: payload["email"] ?? null,
        phone: payload["phone"] ?? null,
        company: payload["companyName"] ?? null,
      };
    },
  },
  salesforce: {
    slug: "salesforce",
    name: "Salesforce",
    writes: ["contact", "lead", "deal"],
    emits: ["contact", "lead", "deal"],
    toProvider: (entity, record) => {
      const c = contactOf(record);
      if (entity === "lead") {
        return {
          FirstName: c.first_name ?? undefined,
          LastName: c.last_name ?? "Unknown",
          Email: c.email ?? undefined,
          Phone: c.phone ?? undefined,
          Company: c.company ?? "Unknown",
          LeadSource: c.source ?? "Xellvio",
        };
      }
      if (entity === "contact") {
        return {
          FirstName: c.first_name ?? undefined,
          LastName: c.last_name ?? "Unknown",
          Email: c.email ?? undefined,
          Phone: c.phone ?? undefined,
        };
      }
      return record;
    },
    fromProvider: (entity, payload) => {
      if (entity !== "contact" && entity !== "lead") return payload;
      return {
        first_name: payload["FirstName"] ?? null,
        last_name: payload["LastName"] ?? null,
        email: payload["Email"] ?? null,
        phone: payload["Phone"] ?? null,
        company: payload["Company"] ?? null,
      };
    },
  },
  "zoho-crm": {
    slug: "zoho-crm",
    name: "Zoho CRM",
    writes: ["contact", "lead", "deal"],
    emits: ["contact", "lead"],
    toProvider: (entity, record) => {
      if (entity !== "contact" && entity !== "lead") return record;
      const c = contactOf(record);
      return {
        data: [
          {
            First_Name: c.first_name ?? undefined,
            Last_Name: c.last_name ?? "Unknown",
            Email: c.email ?? undefined,
            Phone: c.phone ?? undefined,
            Company: c.company ?? undefined,
            Lead_Source: c.source ?? "Xellvio",
          },
        ],
      };
    },
    fromProvider: passthrough,
  },
  pipedrive: {
    slug: "pipedrive",
    name: "Pipedrive",
    writes: ["contact", "deal"],
    emits: ["contact", "deal"],
    toProvider: (entity, record) => {
      if (entity !== "contact") return record;
      const c = contactOf(record);
      return {
        name: fullName(c) || c.email || c.phone,
        email: c.email ? [{ value: c.email, primary: true }] : [],
        phone: c.phone ? [{ value: c.phone, primary: true }] : [],
      };
    },
    fromProvider: passthrough,
  },
  shopify: {
    slug: "shopify",
    name: "Shopify",
    writes: ["customer", "order", "product"],
    emits: ["customer", "order", "product"],
    toProvider: (entity, record) => {
      if (entity !== "customer" && entity !== "contact") return record;
      const c = contactOf(record);
      return {
        customer: {
          first_name: c.first_name ?? undefined,
          last_name: c.last_name ?? undefined,
          email: c.email ?? undefined,
          phone: c.phone ?? undefined,
          tags: (c.tags ?? []).join(", "),
        },
      };
    },
    fromProvider: (entity, payload) => {
      if (entity === "order") {
        return {
          external_id: payload["id"],
          total: payload["total_price"],
          currency: payload["currency"],
          email: payload["email"],
          created_at: payload["created_at"],
        };
      }
      return {
        first_name: payload["first_name"] ?? null,
        last_name: payload["last_name"] ?? null,
        email: payload["email"] ?? null,
        phone: payload["phone"] ?? null,
      };
    },
  },
  woocommerce: {
    slug: "woocommerce",
    name: "WooCommerce",
    writes: ["customer", "order"],
    emits: ["customer", "order"],
    toProvider: (entity, record) => {
      if (entity !== "customer" && entity !== "contact") return record;
      const c = contactOf(record);
      return {
        first_name: c.first_name ?? undefined,
        last_name: c.last_name ?? undefined,
        email: c.email ?? undefined,
        billing: { phone: c.phone ?? undefined },
      };
    },
    fromProvider: passthrough,
  },
  stripe: {
    slug: "stripe",
    name: "Stripe",
    writes: ["customer", "payment", "invoice", "subscription"],
    emits: ["payment", "invoice", "subscription", "customer"],
    toProvider: (entity, record) => {
      if (entity !== "customer" && entity !== "contact") return record;
      const c = contactOf(record);
      return { name: fullName(c) || undefined, email: c.email ?? undefined, phone: c.phone ?? undefined };
    },
    fromProvider: (entity, payload) => {
      if (entity !== "payment") return payload;
      return {
        external_id: payload["id"],
        amount: typeof payload["amount"] === "number" ? (payload["amount"] as number) / 100 : null,
        currency: payload["currency"],
        status: payload["status"],
      };
    },
  },
  mailchimp: {
    slug: "mailchimp",
    name: "Mailchimp",
    writes: ["contact"],
    emits: ["contact"],
    toProvider: (entity, record) => {
      if (entity !== "contact") return record;
      const c = contactOf(record);
      return {
        email_address: c.email ?? undefined,
        status: "subscribed",
        merge_fields: { FNAME: c.first_name ?? "", LNAME: c.last_name ?? "", PHONE: c.phone ?? "" },
        tags: c.tags ?? [],
      };
    },
    fromProvider: passthrough,
  },
  klaviyo: {
    slug: "klaviyo",
    name: "Klaviyo",
    writes: ["contact"],
    emits: ["contact"],
    toProvider: (entity, record) => {
      if (entity !== "contact") return record;
      const c = contactOf(record);
      return {
        data: {
          type: "profile",
          attributes: {
            email: c.email ?? undefined,
            phone_number: c.phone ?? undefined,
            first_name: c.first_name ?? undefined,
            last_name: c.last_name ?? undefined,
          },
        },
      };
    },
    fromProvider: passthrough,
  },
  slack: {
    slug: "slack",
    name: "Slack",
    writes: ["message"],
    emits: [],
    toProvider: (_entity, record) => ({ text: String(record["body"] ?? record["text"] ?? "") }),
    fromProvider: passthrough,
  },
  webhooks: {
    slug: "webhooks",
    name: "Webhooks",
    writes: [...CANONICAL_ENTITIES],
    emits: [...CANONICAL_ENTITIES],
    toProvider: (entity, record) => ({ entity, data: record, sent_at: new Date().toISOString() }),
    fromProvider: passthrough,
  },
};

/** Generic fallback so a brand-new app still works before a bespoke mapping exists. */
export const genericConnector = (slug: string, name: string): Connector => ({
  slug,
  name,
  writes: [...CANONICAL_ENTITIES],
  emits: [...CANONICAL_ENTITIES],
  toProvider: (entity, record) => ({ entity, ...record }),
  fromProvider: passthrough,
});

export function getConnector(slug: string, name = slug): Connector {
  return CONNECTORS[slug] ?? genericConnector(slug, name);
}

/** Transform one canonical record for a list of connector slugs at once. */
export function fanOut(entity: CanonicalEntity, record: CanonicalRecord, slugs: string[]) {
  return slugs.map((slug) => ({ slug, payload: getConnector(slug).toProvider(entity, record) }));
}
