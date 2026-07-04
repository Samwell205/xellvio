// Toll-free verification use-case labels — must match the carrier verification
// vendor's accepted enum exactly, or the submission is rejected before it
// reaches the mobile carriers.

export const TOLLFREE_USE_CASES = [
  "2FA",
  "App Notifications",
  "Appointments",
  "Auctions",
  "Auto Repair Services",
  "Bank Transfers",
  "Billing",
  "Booking Confirmations",
  "Business Updates",
  "COVID-19 Alerts",
  "Career Training",
  "Chatbot",
  "Conversational / Alerts",
  "Courier Services & Deliveries",
  "Emergency Alerts",
  "Events & Planning",
  "Financial Services",
  "Fraud Alerts",
  "Fundraising",
  "General Marketing",
  "General School Updates",
  "HR / Staffing",
  "Healthcare Alerts",
  "Housing Community Updates",
  "Insurance Services",
  "Job Dispatch",
  "Legal Services",
  "Mixed",
  "Motivational Reminders",
  "Notary Notifications",
  "Order Notifications",
  "Political",
  "Public Works",
  "Real Estate Services",
  "Religious Services",
  "Repair and Diagnostics Alerts",
  "Rewards Program",
  "Surveys",
  "System Alerts",
  "Voting Reminders",
  "Waitlist Alerts",
  "Webinar Reminders",
  "Workshop Alerts",
] as const;

export type TollfreeUseCase = (typeof TOLLFREE_USE_CASES)[number];

export const TOLLFREE_VOLUMES = [
  "10",
  "100",
  "1,000",
  "10,000",
  "100,000",
  "250,000",
  "500,000",
  "750,000",
  "1,000,000",
  "5,000,000",
  "10,000,000+",
] as const;

// Legacy uppercase enum values map into the new Telnyx-style labels so old
// saved wizard forms don't blow up validation on resubmit.
export const LEGACY_USE_CASE_MAP: Record<string, TollfreeUseCase> = {
  TWO_FACTOR_AUTHENTICATION: "2FA",
  ACCOUNT_NOTIFICATIONS: "App Notifications",
  CUSTOMER_CARE: "Conversational / Alerts",
  CHARITY_NONPROFIT: "Fundraising",
  DELIVERY_NOTIFICATIONS: "Courier Services & Deliveries",
  FRAUD_ALERT_MESSAGING: "Fraud Alerts",
  EVENTS: "Events & Planning",
  HIGHER_EDUCATION: "Career Training",
  K12: "General School Updates",
  MARKETING: "General Marketing",
  POLLING_AND_VOTING_NON_POLITICAL: "Surveys",
  POLITICAL_ELECTION_CAMPAIGNS: "Political",
  PUBLIC_SERVICE_ANNOUNCEMENT: "Public Works",
  SECURITY_ALERT: "Fraud Alerts",
  "Employee Alerts": "HR / Staffing",
  Notifications: "App Notifications",
  "5,000,000+": "5,000,000" as TollfreeUseCase,
};

export function normalizeUseCase(raw: string): TollfreeUseCase | null {
  if (!raw) return null;
  if ((TOLLFREE_USE_CASES as readonly string[]).includes(raw)) return raw as TollfreeUseCase;
  return LEGACY_USE_CASE_MAP[raw] ?? null;
}
