import { z } from "zod";
import { TOLLFREE_VOLUMES } from "./tollfree-use-cases";

export function normalizeTollfreeVolume(value: string | number): string {
  const raw = String(value).trim();
  return TOLLFREE_VOLUMES.find((volume) => volume.replace(/,/g, "") === raw.replace(/,/g, "")) ?? raw;
}

export const tollfreeVolumeSchema = z.string().transform(normalizeTollfreeVolume).pipe(z.enum(TOLLFREE_VOLUMES));
export const tollfreePhoneSchema = z.string().trim().regex(/^\+\d{8,15}$/, "Enter a phone number with country code and 8–15 digits, e.g. +15551234567.");
export const tollfreeSampleSchema = z.string().trim().min(20, "Enter a sample message of at least 20 characters.").max(320, "Sample message must be 320 characters or fewer.").refine((value) => /\bstop\b/i.test(value), "Add STOP opt-out instructions to your sample message.");

export function registrationPhone(countryCode: string, phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return phone.trim().startsWith("+") ? `+${digits}` : `${countryCode}${digits}`;
}

const str = (max: number) => z.string().trim().min(1).max(max);
export const dedicatedLineRegistrationSchema = z.object({
  businessName: str(120), website: z.string().trim().url().max(300),
  ein: z.string().trim().regex(/^(\d{2}-?\d{7})?$/, "Enter a 9-digit EIN or leave it empty").optional().default(""),
  street: str(200), city: str(100), state: str(60), postalCode: str(20), country: z.string().length(2),
  contactFirstName: str(60), contactLastName: str(60), contactEmail: z.string().trim().email().max(200),
  contactPhone: tollfreePhoneSchema,
  privacyUrl: z.string().trim().url().max(300), termsUrl: z.string().trim().url().max(300), optInImageUrl: z.string().trim().url().max(500),
  useCaseSummary: z.string().trim().min(40).max(1000), sampleMessage: tollfreeSampleSchema,
  monthlyVolume: tollfreeVolumeSchema,
});

const fieldLabels: Record<string, string> = {
  businessName: "Legal business name", website: "Website", ein: "EIN", street: "Street address",
  city: "City", state: "State / region", postalCode: "Postal code", country: "Country",
  contactFirstName: "Contact first name", contactLastName: "Contact last name", contactEmail: "Contact email",
  contactPhone: "Contact phone", privacyUrl: "Privacy policy URL", termsUrl: "Terms URL",
  optInImageUrl: "Sign-up proof", useCaseSummary: "Use-case summary", sampleMessage: "Sample message", monthlyVolume: "Monthly volume",
};

// Throw a readable error instead of serializing raw Zod issues to the customer.
export function parseDedicatedLineRegistration(input: unknown) {
  const result = dedicatedLineRegistrationSchema.safeParse(input);
  if (result.success) return result.data;
  const issue = result.error.issues[0];
  const field = String(issue?.path[0] ?? "");
  throw new Error(`${fieldLabels[field] ?? "Registration"}: ${issue?.message ?? "Check this field."}`);
}