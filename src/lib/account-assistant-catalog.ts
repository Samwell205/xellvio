import { z } from "zod";
import type { PermissionKey } from "./team-permissions";

export const ACCOUNT_AREAS = ["settings", "billing", "team", "inbox", "websites", "forms", "leads", "audience", "campaigns", "automations", "flows", "numbers", "receptionist", "integrations", "support"] as const;
export type AccountArea = typeof ACCOUNT_AREAS[number];
export const AREA_ACCESS: Record<AccountArea, { permission: PermissionKey | null; owner?: boolean; path: string }> = {
  settings: { permission: "settings", path: "/app/settings" },
  billing: { permission: "billing", path: "/app/billing" },
  team: { permission: "team", owner: true, path: "/app/team" },
  inbox: { permission: "inbox", path: "/app/inbox" },
  websites: { permission: "settings", path: "/app/landing-pages" },
  forms: { permission: "settings", path: "/app/signup-forms" },
  leads: { permission: "audience", path: "/app/signup-forms" },
  audience: { permission: "audience", path: "/app/audience" },
  campaigns: { permission: "campaigns", path: "/app/campaigns" },
  automations: { permission: "campaigns", path: "/app/automations" },
  flows: { permission: "campaigns", path: "/app/flows" },
  numbers: { permission: "setup_sms", path: "/app/setup-sms" },
  receptionist: { permission: "settings", owner: true, path: "/app/receptionist" },
  integrations: { permission: "settings", path: "/app/apps" },
  support: { permission: null, path: "/app/support" },
};

export const EDIT_RESOURCES = ["settings", "contact", "list", "campaign", "website", "form", "automation", "flow"] as const;
export type EditResource = typeof EDIT_RESOURCES[number];
export const EDIT_RULES: Record<EditResource, { area: AccountArea; fields: readonly string[]; owner?: boolean }> = {
  settings: { area: "settings", fields: ["full_name", "company", "phone"], owner: true },
  contact: { area: "audience", fields: ["first_name", "last_name"] },
  list: { area: "audience", fields: ["name"] },
  campaign: { area: "campaigns", fields: ["name", "message_body"] },
  website: { area: "websites", fields: ["name"] },
  form: { area: "forms", fields: ["name"] },
  automation: { area: "automations", fields: ["name", "status"] },
  flow: { area: "flows", fields: ["name", "status"] },
};

export const accountEditSchema = z.object({
  resource: z.enum(EDIT_RESOURCES), id: z.string().uuid(),
  field: z.string(), value: z.string().trim().min(1).max(1600),
}).strict().superRefine((d, ctx) => {
  if (!EDIT_RULES[d.resource].fields.includes(d.field)) ctx.addIssue({ code: "custom", message: "This field cannot be changed by the assistant." });
  if (d.field === "status" && d.value !== "paused") ctx.addIssue({ code: "custom", message: "Activation requires the existing workflow review. Only pausing is supported here." });
  if (d.field !== "message_body" && d.value.length > 120) ctx.addIssue({ code: "custom", message: "Keep this value under 120 characters." });
});

export function canUseAccountArea(area: AccountArea, access: { isOwner: boolean; permissions: Partial<Record<PermissionKey, boolean>> }): boolean {
  const rule = AREA_ACCESS[area];
  return (!rule.owner || access.isOwner) && (access.isOwner || rule.permission === null || access.permissions[rule.permission] === true);
}