// Klaviyo-inspired per-feature permission model for workspace teammates.
// Stored as a JSON object on account_members.permissions.

export const PERMISSION_KEYS = [
  "dashboard",
  "campaigns",
  "inbox",
  "audience",
  "segments",
  "suppressions",
  "setup_sms",
  "billing",
  "team",
  "settings",
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];
export type Permissions = Partial<Record<PermissionKey, boolean>>;

export const PERMISSION_LABELS: Record<PermissionKey, string> = {
  dashboard: "Dashboard",
  campaigns: "Campaigns",
  inbox: "Inbox (two-way SMS)",
  audience: "Audience / contacts",
  segments: "Segments",
  suppressions: "Suppressions",
  setup_sms: "Set up SMS / sender IDs",
  billing: "Billing & payments",
  team: "Team management",
  settings: "Account settings",
};

export type PresetId =
  | "owner_admin"
  | "manager"
  | "campaign_creator"
  | "inbox_agent"
  | "analyst"
  | "custom";

export const PRESETS: { id: PresetId; label: string; description: string; permissions: Permissions }[] = [
  {
    id: "owner_admin",
    label: "Admin — full access",
    description: "Everything the workspace owner can do, including billing and team management.",
    permissions: Object.fromEntries(PERMISSION_KEYS.map((k) => [k, true])),
  },
  {
    id: "manager",
    label: "Manager",
    description: "Campaigns, inbox, audience, segments, suppressions, sender setup. No billing or team.",
    permissions: {
      dashboard: true, campaigns: true, inbox: true, audience: true,
      segments: true, suppressions: true, setup_sms: true,
    },
  },
  {
    id: "campaign_creator",
    label: "Campaign creator",
    description: "Build & send campaigns and manage the audience that receives them.",
    permissions: { dashboard: true, campaigns: true, audience: true, segments: true },
  },
  {
    id: "inbox_agent",
    label: "Inbox agent",
    description: "Reply to incoming SMS only — no access to campaigns, billing or settings.",
    permissions: { inbox: true },
  },
  {
    id: "analyst",
    label: "Analyst (read-only)",
    description: "View dashboards and campaign results. Cannot send or change anything.",
    permissions: { dashboard: true, campaigns: true, audience: true, segments: true },
  },
  {
    id: "custom",
    label: "Custom",
    description: "Pick exactly which areas this person can access.",
    permissions: {},
  },
];

export function permissionsForPreset(id: PresetId): Permissions {
  return PRESETS.find((p) => p.id === id)?.permissions ?? {};
}
