import { z } from "zod";
import { registrationPhone, tollfreePhoneSchema, tollfreeSampleSchema, tollfreeVolumeSchema } from "./tollfree-registration";
import { normalizeUseCase } from "./tollfree-use-cases";

// Map the shared form's descriptive labels to the verification API's enums.
const categories: Record<string, string> = {
  "2FA": "TWO_FACTOR_AUTHENTICATION",
  "App Notifications": "ACCOUNT_NOTIFICATIONS", Appointments: "ACCOUNT_NOTIFICATIONS",
  Auctions: "MARKETING", "Auto Repair Services": "CUSTOMER_CARE", "Bank Transfers": "ACCOUNT_NOTIFICATIONS",
  Billing: "ACCOUNT_NOTIFICATIONS", "Booking Confirmations": "ACCOUNT_NOTIFICATIONS", "Business Updates": "ACCOUNT_NOTIFICATIONS",
  "COVID-19 Alerts": "PUBLIC_SERVICE_ANNOUNCEMENT", "Career Training": "HIGHER_EDUCATION",
  Chatbot: "CUSTOMER_CARE", "Conversational / Alerts": "CUSTOMER_CARE",
  "Courier Services & Deliveries": "DELIVERY_NOTIFICATIONS", "Emergency Alerts": "PUBLIC_SERVICE_ANNOUNCEMENT",
  "Events & Planning": "EVENTS", "Financial Services": "ACCOUNT_NOTIFICATIONS", "Fraud Alerts": "FRAUD_ALERT_MESSAGING",
  Fundraising: "CHARITY_NONPROFIT", "General Marketing": "MARKETING", "General School Updates": "K12",
  "HR / Staffing": "ACCOUNT_NOTIFICATIONS", "Healthcare Alerts": "ACCOUNT_NOTIFICATIONS",
  "Housing Community Updates": "ACCOUNT_NOTIFICATIONS", "Insurance Services": "CUSTOMER_CARE",
  "Job Dispatch": "ACCOUNT_NOTIFICATIONS", "Legal Services": "CUSTOMER_CARE", "Motivational Reminders": "MARKETING",
  "Notary Notifications": "ACCOUNT_NOTIFICATIONS", "Order Notifications": "DELIVERY_NOTIFICATIONS",
  "Public Works": "PUBLIC_SERVICE_ANNOUNCEMENT", "Real Estate Services": "MARKETING", "Religious Services": "CHARITY_NONPROFIT",
  "Repair and Diagnostics Alerts": "CUSTOMER_CARE", "Rewards Program": "MARKETING", Surveys: "POLLING_AND_VOTING_NON_POLITICAL",
  "System Alerts": "SECURITY_ALERT", "Voting Reminders": "POLLING_AND_VOTING_NON_POLITICAL",
  "Waitlist Alerts": "ACCOUNT_NOTIFICATIONS", "Webinar Reminders": "EVENTS", "Workshop Alerts": "EVENTS",
};

export function verifierUseCaseCategories(values: string[]): string[] {
  if (!values.length) throw new Error("Select at least one use case category.");
  return [...new Set(values.map((value) => {
    const label = normalizeUseCase(value);
    const category = label ? categories[label] : undefined;
    if (!category) throw new Error("Select specific supported use cases. Mixed and political registrations require additional review; contact support.");
    return category;
  }))];
}

const required = (max: number) => z.string().trim().min(1).max(max);
const https = z.string().trim().url().max(500).refine((v) => new URL(v).protocol === "https:", "Use a public https:// URL.");
const optional = (max: number) => z.string().trim().max(max).optional().default("");
export const verifierRegistrationSchema = z.object({
  legalEntityName: required(120).min(2), businessDba: optional(120), websiteUrl: z.string().trim().url().max(300),
  businessType: z.enum(["Sole Proprietor", "Private company / LLC / Partnership", "Public company", "Non-profit", "Government"]),
  businessRegistrationNumber: optional(100), businessRegistrationIdentifier: optional(40),
  businessRegistrationCountry: z.string().regex(/^[A-Z]{2}$/).optional().default("US"),
  contactFirstName: required(60), contactLastName: required(60), contactEmail: z.string().trim().email().max(200),
  contactPhoneCountry: z.string().regex(/^\+\d{1,4}$/), contactPhone: required(40),
  businessCountry: z.string().regex(/^[A-Z]{2}$/), addressLine1: required(200), addressLine2: optional(200),
  city: required(100), state: required(60), zip: required(20), monthlyVolume: tollfreeVolumeSchema,
  optInType: z.enum(["VERBAL", "WEB_FORM", "PAPER_FORM", "VIA_TEXT", "MOBILE_QR_CODE"]),
  useCaseCategories: z.array(z.string()).min(1).max(14), proofOfOptInUrl: https,
  proofShowsRequiredConsent: z.literal(true), useCaseDescription: required(500).min(40), sampleMessage: tollfreeSampleSchema,
  notificationEmail: z.string().trim().email().max(200), additionalInformation: required(500),
  optInConfirmationMessage: optional(1000), helpMessageSample: optional(1000),
  privacyPolicyUrl: https, termsUrl: https, optInKeywords: required(500),
  containsAgeGatedContent: z.boolean().optional().default(false), agreeToTos: z.literal(true),
}).superRefine((f, ctx) => {
  if (!tollfreePhoneSchema.safeParse(registrationPhone(f.contactPhoneCountry, f.contactPhone)).success)
    ctx.addIssue({ code: "custom", path: ["contactPhone"], message: "Enter a phone number with country code and 8–15 digits." });
  if (f.businessRegistrationNumber && !f.businessRegistrationIdentifier)
    ctx.addIssue({ code: "custom", path: ["businessRegistrationIdentifier"], message: "Select the registration authority." });
  if (f.businessRegistrationIdentifier === "EIN" && f.businessRegistrationNumber && !/^\d{2}-?\d{7}$/.test(f.businessRegistrationNumber))
    ctx.addIssue({ code: "custom", path: ["businessRegistrationNumber"], message: "Enter a 9-digit EIN." });
});

export function parseVerifierRegistration(input: unknown) {
  const result = verifierRegistrationSchema.safeParse(input);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new Error(`Registration (${String(issue?.path[0] ?? "details")}): ${issue?.message ?? "Complete the registration details."}`);
  }
  verifierUseCaseCategories(result.data.useCaseCategories);
  if (result.data.monthlyVolume === "5,000,000+") throw new Error("Select 5,000,000 or 10,000,000+ for monthly volume.");
  return result.data;
}

export function readVerifierRegistration(payload: unknown, notes?: string) {
  let input = payload;
  if (input == null && notes) {
    try { input = JSON.parse(notes); } catch { throw new Error("Complete the registration form before submitting."); }
  }
  return parseVerifierRegistration(input);
}