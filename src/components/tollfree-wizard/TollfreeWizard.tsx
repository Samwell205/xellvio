import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Check as CheckIcon, ChevronLeft, ChevronRight, Info, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { COUNTRIES, isoFromDial } from "@/lib/countries";
import { uploadOptInProof } from "@/lib/opt-in-proof.functions";
import { TOLLFREE_USE_CASES, TOLLFREE_VOLUMES, normalizeUseCase } from "@/lib/tollfree-use-cases";
import { toast } from "sonner";

// ---------- Constants (mirrors Twilio's own wizard) ----------

const VOLUMES = TOLLFREE_VOLUMES;

const OPT_IN_TYPES = [
  { v: "VERBAL", l: "Verbal" },
  { v: "WEB_FORM", l: "Web form" },
  { v: "PAPER_FORM", l: "Paper form" },
  { v: "VIA_TEXT", l: "Via text" },
  { v: "MOBILE_QR_CODE", l: "Mobile QR code" },
] as const;

const BUSINESS_TYPES = [
  "Sole Proprietor",
  "Private company / LLC / Partnership",
  "Public company",
  "Non-profit",
  "Government",
] as const;

const REGISTRATION_AUTHORITIES = [
  { v: "EIN", l: "EIN — US employer ID" },
  { v: "CBN", l: "CBN — Canadian business number" },
  { v: "CRN", l: "CRN — Company registration number" },
  { v: "PROVINCIAL_NUMBER", l: "Provincial number — Canada" },
  { v: "VAT", l: "VAT — Value-added tax number" },
  { v: "BRN", l: "BRN — Business registration number" },
  { v: "OTHER", l: "Other" },
] as const;

const CATEGORIES = TOLLFREE_USE_CASES;

const US_STATES: Array<{ v: string; l: string }> = [
  { v: "AL", l: "Alabama" }, { v: "AK", l: "Alaska" }, { v: "AZ", l: "Arizona" }, { v: "AR", l: "Arkansas" },
  { v: "CA", l: "California" }, { v: "CO", l: "Colorado" }, { v: "CT", l: "Connecticut" }, { v: "DE", l: "Delaware" },
  { v: "DC", l: "District of Columbia" }, { v: "FL", l: "Florida" }, { v: "GA", l: "Georgia" }, { v: "HI", l: "Hawaii" },
  { v: "ID", l: "Idaho" }, { v: "IL", l: "Illinois" }, { v: "IN", l: "Indiana" }, { v: "IA", l: "Iowa" },
  { v: "KS", l: "Kansas" }, { v: "KY", l: "Kentucky" }, { v: "LA", l: "Louisiana" }, { v: "ME", l: "Maine" },
  { v: "MD", l: "Maryland" }, { v: "MA", l: "Massachusetts" }, { v: "MI", l: "Michigan" }, { v: "MN", l: "Minnesota" },
  { v: "MS", l: "Mississippi" }, { v: "MO", l: "Missouri" }, { v: "MT", l: "Montana" }, { v: "NE", l: "Nebraska" },
  { v: "NV", l: "Nevada" }, { v: "NH", l: "New Hampshire" }, { v: "NJ", l: "New Jersey" }, { v: "NM", l: "New Mexico" },
  { v: "NY", l: "New York" }, { v: "NC", l: "North Carolina" }, { v: "ND", l: "North Dakota" }, { v: "OH", l: "Ohio" },
  { v: "OK", l: "Oklahoma" }, { v: "OR", l: "Oregon" }, { v: "PA", l: "Pennsylvania" }, { v: "PR", l: "Puerto Rico" },
  { v: "RI", l: "Rhode Island" }, { v: "SC", l: "South Carolina" }, { v: "SD", l: "South Dakota" }, { v: "TN", l: "Tennessee" },
  { v: "TX", l: "Texas" }, { v: "UT", l: "Utah" }, { v: "VT", l: "Vermont" }, { v: "VA", l: "Virginia" },
  { v: "WA", l: "Washington" }, { v: "WV", l: "West Virginia" }, { v: "WI", l: "Wisconsin" }, { v: "WY", l: "Wyoming" },
];

const CA_PROVINCES: Array<{ v: string; l: string }> = [
  { v: "AB", l: "Alberta" }, { v: "BC", l: "British Columbia" }, { v: "MB", l: "Manitoba" },
  { v: "NB", l: "New Brunswick" }, { v: "NL", l: "Newfoundland and Labrador" }, { v: "NS", l: "Nova Scotia" },
  { v: "NT", l: "Northwest Territories" }, { v: "NU", l: "Nunavut" }, { v: "ON", l: "Ontario" },
  { v: "PE", l: "Prince Edward Island" }, { v: "QC", l: "Quebec" }, { v: "SK", l: "Saskatchewan" },
  { v: "YT", l: "Yukon" },
];



const OPT_IN_HELP: Record<string, { title: string; example: string; include: string[]; notes: string[] }> = {
  VERBAL: {
    title: "Verbal",
    example: "A customer verbally agrees on a phone call to receive text messages. Keep a recording or written script proving consent.",
    include: [
      "Script the agent uses to obtain consent",
      "Clear description of the messages the customer will receive",
      "Message frequency information",
      "Standard message and data rates disclaimer",
      "HELP and STOP instructions",
      "Reference to Terms of Service and Privacy Policy",
    ],
    notes: [
      "Keep call recordings or a signed script as records of consent.",
      "Host the script or transcript on a public URL and paste it under Opt-in policy proof.",
    ],
  },
  WEB_FORM: {
    title: "Web form",
    example: "An embedded form on your website that prompts customers to enter their mobile phone number and opt into your texting campaign.",
    include: [
      "Phone number input field",
      "Consent checkbox (must NOT be pre-selected)",
      "Clear description of what type of messages they'll receive",
      "Message frequency information",
      "Standard disclaimers about message and data rates",
      "HELP and STOP instructions",
      "Links to Terms of Service and Privacy Policy",
      'Submit button with clear language (e.g., "Yes, sign me up!")',
    ],
    notes: [
      "Checkbox must be actively selected by the user, not pre-checked.",
      "If the form is behind a login or not yet published, host a screenshot on a public URL and paste it under Opt-in policy proof.",
    ],
  },
  PAPER_FORM: {
    title: "Paper form",
    example: "An in-store visitor completes a physical form that collects their phone number and consent to subscribe to your texting campaign.",
    include: [
      "Field for customer's mobile phone number",
      "Clear description of the texting service",
      "Message frequency information",
      "Checkbox or signature line for explicit consent",
      "Standard message and data rates disclaimer",
      "HELP and STOP instructions",
      "Links to Terms of Service and Privacy Policy",
      "Date field and customer signature",
    ],
    notes: [
      "Host a screenshot of the paper form on a public URL and paste it under Opt-in policy proof.",
      "Keep physical copies as records of consent.",
    ],
  },
  VIA_TEXT: {
    title: "Via text (keyword campaign)",
    example: 'Customer sees "Text DEALS to 12345 to get exclusive offers." They text the keyword and you respond with a welcome + terms message.',
    include: [
      "Clear keyword customers text to opt-in",
      "Short code or long code number to text",
      "Welcome message explaining the service",
      "Message frequency information",
      "Standard disclaimers",
      "HELP and STOP instructions",
      "Links to Terms and Privacy Policy",
      "Confirmation message",
    ],
    notes: [
      "Host a screenshot of the campaign collateral on a public URL and paste it under Opt-in policy proof.",
    ],
  },
  MOBILE_QR_CODE: {
    title: "Mobile / QR code",
    example: "A QR code that either links to a web opt-in form OR opens the customer's messaging app with a pre-populated opt-in message.",
    include: [
      "Pre-populated message with keyword and short code (for text flow)",
      "Clear instructions displayed with the QR code",
      "Follow-up confirmation flow as in Via Text",
      "Mobile-optimized form design (for web flow)",
      "Value proposition and brand name clearly visible",
    ],
    notes: [
      "If the QR code leads to a form behind a login or not yet published, host a screenshot on a public URL and paste it under Opt-in policy proof.",
      "Test QR codes on multiple devices before deployment.",
    ],
  },
};

// ---------- Form shape ----------

export type WizardForm = {
  legalEntityName: string;
  businessDba: string;
  websiteUrl: string;
  businessType: string;
  businessRegistrationNumber: string;
  businessRegistrationIdentifier: string;
  businessRegistrationCountry: string;
  contactFirstName: string;
  contactLastName: string;
  contactEmail: string;
  contactPhoneCountry: string;
  contactPhone: string;
  businessCountry: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  zip: string;
  monthlyVolume: string;
  optInType: string;
  useCaseCategories: string[];
  proofOfOptInUrl: string;
  proofShowsRequiredConsent: boolean;
  useCaseDescription: string;
  sampleMessage: string;
  notificationEmail: string;
  additionalInformation: string;
  optInConfirmationMessage: string;
  helpMessageSample: string;
  privacyPolicyUrl: string;
  termsUrl: string;
  optInKeywords: string;
  containsAgeGatedContent: boolean;
  agreeToTos: boolean;
};

export function defaultWizardForm(): WizardForm {
  return {
    legalEntityName: "", businessDba: "", websiteUrl: "", businessType: "",
    businessRegistrationNumber: "", businessRegistrationIdentifier: "",
    businessRegistrationCountry: "US",
    contactFirstName: "", contactLastName: "", contactEmail: "",
    contactPhoneCountry: "+1", contactPhone: "",
    businessCountry: "US", addressLine1: "", addressLine2: "",
    city: "", state: "", zip: "",
    monthlyVolume: "10,000", optInType: "WEB_FORM",
    useCaseCategories: ["General Marketing"],
    proofOfOptInUrl: "", proofShowsRequiredConsent: false,
    useCaseDescription: "", sampleMessage: "", notificationEmail: "",
    additionalInformation: "No additional information provided.", optInConfirmationMessage: "", helpMessageSample: "",
    privacyPolicyUrl: "", termsUrl: "", optInKeywords: "",
    containsAgeGatedContent: false, agreeToTos: false,
  };
}

// ---------- Three-step carrier flow ----------

type StepKey = "general" | "numbers" | "use-case-details";

const STEPS: Array<{ key: StepKey; label: string }> = [
  { key: "general", label: "General" },
  { key: "numbers", label: "Numbers" },
  { key: "use-case-details", label: "Use Case Details" },
];

// ---------- Per-substep validation ----------

function isEmail(v: string) { return /^[^@]+@[^@]+\.[^@]+$/.test(v.trim()); }
function isHttps(v: string) { return /^https:\/\//.test(v.trim()); }
function isHttp(v: string) { return /^https?:\/\//.test(v.trim()); }

function stepValid(f: WizardForm, key: StepKey): string | null {
  switch (key) {
    case "general":
      if (f.legalEntityName.trim().length < 2) return "Enter the legal business name.";
      if (!isHttp(f.websiteUrl)) return "Enter a valid website URL (https://…).";
      if (!f.businessType) return "Select a company type.";
      if (!f.contactFirstName.trim()) return "Enter first name.";
      if (!f.contactLastName.trim()) return "Enter last name.";
      if (!isEmail(f.contactEmail)) return "Enter a valid email.";
      if (!/^\+\d{1,4}$/.test(f.contactPhoneCountry)) return "Select a phone country code.";
      if (f.contactPhone.replace(/\D/g, "").length < 5) return "Enter a valid phone number.";
      if (!/^[A-Z]{2}$/.test(f.businessCountry)) return "Select a country.";
      if (!f.addressLine1.trim()) return "Enter address line 1.";
      if (!f.city.trim()) return "Enter city.";
      if (!f.state.trim()) return "Enter state / region.";
      if (!f.zip.trim()) return "Enter zip / postal code.";
      return null;
    case "numbers":
      return null;
    case "use-case-details":
      if (!f.monthlyVolume) return "Select a monthly SMS volume.";
      if (f.useCaseCategories.length === 0) return "Select at least one use case category.";
      if (f.useCaseDescription.trim().length < 40) return "Describe your use case in at least 40 characters.";
      if (f.useCaseDescription.trim().length > 500) return "Use-case summary must be 500 characters or fewer.";
      if (f.sampleMessage.trim().length < 20) return "Enter a sample message (min 20 characters).";
      if (f.sampleMessage.trim().length > 1000) return "Sample message must be 1,000 characters or fewer.";
      if (!f.optInType) return "Select an opt-in type.";
      if (!isHttps(f.proofOfOptInUrl)) return "Add a public https:// URL (or upload a screenshot) as opt-in policy proof.";
      if (!isHttps(f.privacyPolicyUrl)) return "Enter a public https:// Privacy Policy URL.";
      if (!isHttps(f.termsUrl)) return "Enter a public https:// Terms and Conditions URL.";
      if (!f.proofShowsRequiredConsent) return "Confirm your opt-in proof includes the required disclosures.";
      if (!isEmail(f.notificationEmail)) return "Enter a valid notification email.";
      if (!f.additionalInformation.trim()) return "Enter additional use-case details.";
      if (f.additionalInformation.trim().length > 500) return "Additional use-case details must be 500 characters or fewer.";
      if (!f.optInKeywords.trim()) return "Enter opt-in keywords, e.g. START, YES, SUBSCRIBE.";
      if (!f.agreeToTos) return "You must accept the carrier Terms of Service.";
      return null;
  }
}

// ---------- Smart defaults (only fill empty fields, never overwrite) ----------

export function applySmartDefaults(f: WizardForm): WizardForm {
  const name = (f.businessDba || f.legalEntityName).trim();
  let origin = "";
  try { if (isHttp(f.websiteUrl)) origin = new URL(f.websiteUrl.trim()).origin.replace(/^http:/, "https:"); } catch { /* ignore */ }
  const out = { ...f };
  const fill = <K extends keyof WizardForm>(k: K, v: WizardForm[K]) => {
    if (typeof out[k] === "string" && !(out[k] as string).trim() && v) out[k] = v;
  };
  fill("notificationEmail", f.contactEmail.trim());
  fill("optInKeywords", "START, YES, SUBSCRIBE");
  if (name) {
    fill("sampleMessage", `${name}: Thanks for joining! Enjoy updates and offers from us. Msg & data rates may apply. Reply HELP for help, STOP to opt out.`);
    fill("useCaseDescription", `${name} sends marketing offers, updates and account notifications to customers who opted in through our website sign-up form. Messages are sent up to 4 times per month.`);
    fill("optInConfirmationMessage", `${name}: You're subscribed to text updates. Msg frequency varies. Msg & data rates may apply. Reply HELP for help, STOP to cancel.`);
    fill("helpMessageSample", `${name}: For help, contact ${f.contactEmail.trim() || "us"}. Msg & data rates may apply. Reply STOP to cancel.`);
  }
  if (origin) {
    fill("privacyPolicyUrl", `${origin}/privacy`);
    fill("termsUrl", `${origin}/terms`);
  }
  return out;
}

const OPT_IN_LABEL: Record<string, string> = Object.fromEntries(OPT_IN_TYPES.map((o) => [o.v, o.l]));

// ---------- Component ----------

export type TollfreeWizardProps = {
  initial?: Partial<WizardForm>;
  disabled?: boolean;
  submitLabel?: string;
  helperBanner?: React.ReactNode;
  onSubmit: (form: WizardForm) => void | Promise<void>;
  submitting?: boolean;
  onClose?: () => void;
  reservedNumber?: string | null;
  verificationStatus?: string | null;
  feeAmount?: number;
  creditBalance?: number;
  feePaid?: boolean;
};

export function TollfreeWizard({
  initial, disabled, submitLabel = "Submit registration",
  helperBanner, onSubmit, submitting, onClose, reservedNumber,
  verificationStatus, feeAmount = 5, creditBalance = 0, feePaid = false,
}: TollfreeWizardProps) {
  const [form, setForm] = useState<WizardForm>(() => ({ ...defaultWizardForm(), ...(initial ?? {}) }));
  const [stepIdx, setStepIdx] = useState(0);
  const [completed, setCompleted] = useState<Set<StepKey>>(new Set());
  const step = STEPS[stepIdx];

  const update = <K extends keyof WizardForm>(k: K, v: WizardForm[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  function goNext() {
    const err = stepValid(form, step.key);
    if (err) { toast.error(err); return; }
    if (step.key === "general") setForm((f) => applySmartDefaults(f));
    setCompleted((c) => new Set(c).add(step.key));
    if (stepIdx < STEPS.length - 1) setStepIdx(stepIdx + 1);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function goBack() {
    if (stepIdx > 0) setStepIdx(stepIdx - 1);
  }

  async function handleSubmit() {
    for (const s of STEPS) {
      const err = stepValid(form, s.key);
      if (err) {
        const idx = STEPS.findIndex((x) => x.key === s.key);
        setStepIdx(idx);
        toast.error(err);
        return;
      }
    }
    await onSubmit({ ...form, agreeToTos: true });
  }

  const STEP_HINTS: Record<StepKey, string> = {
    general: "Who's sending",
    numbers: "Your number",
    "use-case-details": "What you'll text",
  };
  const progress = ((stepIdx + 1) / STEPS.length) * 100;

  return (
    <div className="overflow-hidden rounded-3xl border bg-card shadow-sm">
      {onClose && (
        <div className="border-b px-6 py-3">
          <Button type="button" variant="ghost" size="sm" onClick={onClose} className="h-auto px-0 text-xs text-muted-foreground hover:bg-transparent hover:text-foreground">
            ← Back to Toll Free Verification
          </Button>
        </div>
      )}
      <div className="border-b bg-muted/30 px-4 pt-5 sm:px-8">
        <ol className="grid grid-cols-3 gap-2" aria-label="Registration steps">
          {STEPS.map((item, index) => {
            const isCurrent = index === stepIdx;
            const isDone = completed.has(item.key) && !isCurrent;
            return (
              <li key={item.key}>
                <button
                  type="button"
                  onClick={() => setStepIdx(index)}
                  aria-current={isCurrent ? "step" : undefined}
                  className="group flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left transition-colors hover:bg-background/60"
                >
                  <span
                    className={`grid size-9 shrink-0 place-items-center rounded-full border text-sm font-semibold transition-all duration-300 ${
                      isCurrent
                        ? "scale-105 border-primary bg-primary text-primary-foreground shadow-md"
                        : isDone
                          ? "border-primary/40 bg-primary/10 text-primary"
                          : "bg-background text-muted-foreground"
                    }`}
                  >
                    {isDone ? <CheckIcon className="size-4" /> : index + 1}
                  </span>
                  <span className="hidden min-w-0 sm:block">
                    <span className={`block truncate text-sm font-medium ${isCurrent ? "text-foreground" : "text-muted-foreground"}`}>{item.label}</span>
                    <span className="block truncate text-xs text-muted-foreground">{STEP_HINTS[item.key]}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
        <div className="mt-4 h-1 w-full overflow-hidden rounded-full bg-border">
          <div className="h-full rounded-full bg-primary transition-all duration-500 ease-out" style={{ width: `${progress}%` }} />
        </div>
      </div>
      <div className="space-y-6 p-5 sm:p-8">
        {helperBanner}
        <fieldset disabled={disabled} className={disabled ? "pointer-events-none opacity-70" : ""}>
          <div key={step.key} className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500 motion-reduce:animate-none">
            {step.key === "general" && (
              <>
                <SectionCard n={1}><BusinessInfoStep form={form} update={update} /></SectionCard>
                <SectionCard n={2}><AuthorizedRepStep form={form} update={update} /></SectionCard>
                <SectionCard n={3}><BusinessAddressStep form={form} update={update} /></SectionCard>
              </>
            )}
            {step.key === "numbers" && (
              <SectionCard>
                <AssignNumbersStep
                  reservedNumber={reservedNumber}
                  verificationStatus={verificationStatus}
                  feeAmount={feeAmount}
                  creditBalance={creditBalance}
                  feePaid={feePaid}
                />
              </SectionCard>
            )}
            {step.key === "use-case-details" && (
              <>
                <div className="flex items-start gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-4 text-sm">
                  <Info className="mt-0.5 size-4 shrink-0 text-primary" />
                  <p>We pre-filled compliant wording from your business details. Read it over, adjust anything that isn't accurate, and add your sign-up form proof.</p>
                </div>
                <SectionCard n={1}><UseCaseStep form={form} update={update} /></SectionCard>
                <SectionCard n={2}><OptInStep form={form} update={update} /></SectionCard>
                <details className="group rounded-2xl border bg-background">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-5 sm:p-6">
                    <span>
                      <span className="block font-semibold">Extra carrier details</span>
                      <span className="block text-sm text-muted-foreground">Already filled in for you — open only if you want to change them.</span>
                    </span>
                    <ChevronRight className="size-5 shrink-0 text-muted-foreground transition-transform duration-300 group-open:rotate-90" />
                  </summary>
                  <div className="space-y-5 border-t p-5 sm:p-6"><AdditionalStep form={form} update={update} /></div>
                </details>
                <SectionCard n={3}><ReviewStep form={form} update={update} onEdit={(i) => setStepIdx(i)} /></SectionCard>
              </>
            )}
          </div>
        </fieldset>

        {!disabled && (
          <div className="sticky bottom-0 -mx-5 flex items-center justify-between gap-2 border-t bg-card/95 px-5 py-4 backdrop-blur sm:-mx-8 sm:px-8">
            <Button type="button" variant="outline" className="rounded-full" onClick={goBack} disabled={stepIdx === 0}>
              <ChevronLeft className="mr-1 size-4" /> Back
            </Button>
            <span className="hidden text-xs text-muted-foreground sm:block">Step {stepIdx + 1} of {STEPS.length}</span>
            {stepIdx < STEPS.length - 1 ? (
              <Button type="button" className="rounded-full px-6" onClick={goNext}>
                Continue <ChevronRight className="ml-1 size-4" />
              </Button>
            ) : (
              <Button type="button" className="rounded-full px-6" onClick={handleSubmit} disabled={submitting} size="lg">
                {submitting && <Loader2 className="mr-2 size-4 animate-spin" />}
                {submitLabel}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- Field helpers ----------

function SectionCard({ n, children }: { n?: number; children: React.ReactNode }) {
  return (
    <section className="relative space-y-5 rounded-2xl border bg-background p-5 transition-shadow hover:shadow-md sm:p-6">
      {n != null && (
        <span className="absolute -left-3 -top-3 grid size-7 place-items-center rounded-full border bg-card text-xs font-semibold text-muted-foreground shadow-sm">{n}</span>
      )}
      {children}
    </section>
  );
}
function Two({ children }: { children: React.ReactNode }) {
  return <div className="grid md:grid-cols-2 gap-4">{children}</div>;
}
function Three({ children }: { children: React.ReactNode }) {
  return <div className="grid md:grid-cols-3 gap-4">{children}</div>;
}
function Field({
  label, required, hint, children,
}: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="flex items-center gap-1 text-sm font-medium">
        <span>{label}</span>
        {required && <span className="text-destructive" aria-label="required">*</span>}
      </Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
function StepHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div>
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
    </div>
  );
}

// ---------- Substeps ----------

type StepProps = {
  form: WizardForm;
  update: <K extends keyof WizardForm>(k: K, v: WizardForm[K]) => void;
};

function BusinessInfoStep({ form, update }: StepProps) {
  return (
    <>
      <StepHeader
        title="General"
        subtitle="Enter the business and contact details for this verification request."
      />
      <div className="flex items-start gap-2 rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-sm text-muted-foreground">
        <Info className="mt-0.5 size-4 text-primary" />
        <span>Fill in all details according to business details, not personal details.</span>
      </div>
      <Two>
        <Field label="Legal entity name" required>
          <Input value={form.legalEntityName} onChange={(e) => update("legalEntityName", e.target.value)} placeholder="Acme LLC" />
        </Field>
        <Field label="Business DBA (optional)">
          <Input value={form.businessDba} onChange={(e) => update("businessDba", e.target.value)} placeholder="Doing Business As" />
        </Field>
      </Two>
      <Two>
        <Field label="Company type" required>
          <Select value={form.businessType} onValueChange={(v) => update("businessType", v)}>
            <SelectTrigger><SelectValue placeholder="Select a company type" /></SelectTrigger>
            <SelectContent>
              {BUSINESS_TYPES.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Website URL" required>
          <Input value={form.websiteUrl} onChange={(e) => update("websiteUrl", e.target.value)} placeholder="https://yourcompany.com" />
        </Field>
      </Two>
      {form.businessType && form.businessType !== "Sole Proprietor" && (
        <Three>
          <Field label="Registration number (optional)">
            <Input value={form.businessRegistrationNumber} onChange={(e) => update("businessRegistrationNumber", e.target.value)} placeholder="e.g. 12-3456789" />
          </Field>
          <Field label="Registration authority (optional)">
            <Select value={form.businessRegistrationIdentifier} onValueChange={(v) => update("businessRegistrationIdentifier", v)}>
              <SelectTrigger><SelectValue placeholder="Select authority" /></SelectTrigger>
              <SelectContent>
                {REGISTRATION_AUTHORITIES.map((a) => <SelectItem key={a.v} value={a.v}>{a.l}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Registration country (optional)">
            <Select value={form.businessRegistrationCountry} onValueChange={(v) => update("businessRegistrationCountry", v)}>
              <SelectTrigger><SelectValue placeholder="Select country" /></SelectTrigger>
              <SelectContent>
                {COUNTRIES.map((c) => <SelectItem key={c.iso} value={c.iso}>{c.iso} — {c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        </Three>
      )}
    </>
  );
}

function BusinessAddressStep({ form, update }: StepProps) {
  return (
    <>
      <StepHeader
        title="Business address"
        subtitle="Enter the primary physical address of the business."
      />
      <Field label="Country" required>
        <Select value={form.businessCountry} onValueChange={(v) => update("businessCountry", v)}>
          <SelectTrigger><SelectValue placeholder="Select country" /></SelectTrigger>
          <SelectContent>
            {COUNTRIES.map((c) => <SelectItem key={c.iso} value={c.iso}>{c.iso} — {c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </Field>
      <Two>
        <Field label="Address line 1" required>
          <AddressAutocomplete form={form} update={update} />
        </Field>
        <Field label="Address line 2 (optional)">
          <Input value={form.addressLine2} onChange={(e) => update("addressLine2", e.target.value)} placeholder="Apt / Suite / Unit" />
        </Field>
      </Two>
      <Three>
        <Field label="City" required>
          <Input value={form.city} onChange={(e) => update("city", e.target.value)} />
        </Field>
        <Field label="State / region" required>
          {form.businessCountry === "US" || form.businessCountry === "CA" ? (
            <Select value={form.state} onValueChange={(v) => update("state", v)}>
              <SelectTrigger><SelectValue placeholder={form.businessCountry === "CA" ? "Select province" : "Select state"} /></SelectTrigger>
              <SelectContent>
                {(form.businessCountry === "CA" ? CA_PROVINCES : US_STATES).map((s) => (
                  <SelectItem key={s.v} value={s.v}>{s.v} — {s.l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input value={form.state} onChange={(e) => update("state", e.target.value)} />
          )}
        </Field>

        <Field label="Zip / postal code" required>
          <Input value={form.zip} onChange={(e) => update("zip", e.target.value)} />
        </Field>
      </Three>
    </>
  );
}

function AssignNumbersStep({
  reservedNumber, verificationStatus, feeAmount, creditBalance, feePaid,
}: { reservedNumber?: string | null; verificationStatus?: string | null; feeAmount: number; creditBalance: number; feePaid: boolean }) {
  const willDeferFee = !feePaid && creditBalance < feeAmount;
  return (
    <>
      <StepHeader
        title="Assigned Numbers"
        subtitle="The toll-free number attached to this verification request."
      />
      <div className="overflow-hidden rounded-md border">
        <div className="overflow-x-auto px-4">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="text-left text-muted-foreground">
              <tr className="border-b">
                <th className="py-3 font-medium">Number</th>
                <th className="py-2 font-medium">Status</th>
                <th className="py-2 font-medium">Messaging Profile</th>
                <th className="py-2 font-medium">Type</th>
              </tr>
            </thead>
            <tbody>
              {reservedNumber ? (
                <tr className="border-b">
                  <td className="py-3 font-mono">{reservedNumber}</td>
                  <td className="py-3 capitalize">{(verificationStatus ?? "pending").replaceAll("_", " ")}</td>
                  <td className="py-3 text-muted-foreground">Default messaging profile</td>
                  <td className="py-3">Toll-free</td>
                </tr>
              ) : (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-muted-foreground">A toll-free number will be assigned when you submit.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <div className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
        Submit this wizard to reserve a number and start verification. The one-time ${feeAmount} setup fee is charged from credits at submit time.
        {willDeferFee && (
          <span className="block pt-1">
            Your balance is ${creditBalance.toFixed(2)}. We'll still submit your request now and collect the ${feeAmount} fee automatically from your next top-up.
          </span>
        )}
      </div>
    </>
  );
}

function AuthorizedRepStep({ form, update }: StepProps) {
  return (
    <>
      <StepHeader
        title="Authorized representative"
        subtitle="This is the person the carriers can contact if they need to follow up on the submission."
      />
      <Two>
        <Field label="First name" required>
          <Input value={form.contactFirstName} onChange={(e) => update("contactFirstName", e.target.value)} />
        </Field>
        <Field label="Last name" required>
          <Input value={form.contactLastName} onChange={(e) => update("contactLastName", e.target.value)} />
        </Field>
      </Two>
      <Field label="Email" required>
        <Input type="email" value={form.contactEmail} onChange={(e) => update("contactEmail", e.target.value)} />
      </Field>
      <div className="grid grid-cols-[140px_1fr] gap-2">
        <Field label="Country code" required>
          <Select
            value={form.contactPhoneCountry}
            onValueChange={(v) => {
              update("contactPhoneCountry", v);
              const iso = isoFromDial(v);
              if (iso && !form.businessCountry) update("businessCountry", iso);
            }}
          >
            <SelectTrigger><SelectValue placeholder="+1" /></SelectTrigger>
            <SelectContent>
              {COUNTRIES.map((c) => (
                <SelectItem key={`${c.iso}-${c.dial}`} value={c.dial}>{c.dial} {c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Phone number" required>
          <Input value={form.contactPhone} onChange={(e) => update("contactPhone", e.target.value)} placeholder="5551234567" />
        </Field>
      </div>
    </>
  );
}

function UseCaseStep({ form, update }: StepProps) {
  const currentUseCase = normalizeUseCase(form.useCaseCategories[0] ?? "") ?? "General Marketing";
  return (
    <>
      <StepHeader
        title="Use Case Details"
        subtitle="Describe the messages you will send and how recipients provide consent."
      />
      <Two>
        <Field label="Expected messaging volume per month" required>
          <Select value={form.monthlyVolume} onValueChange={(v) => update("monthlyVolume", v)}>
            <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
            <SelectContent>
              {VOLUMES.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Use-case" required>
          <Select
            value={currentUseCase}
            onValueChange={(v) => update("useCaseCategories", [v])}
          >
            <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
            <SelectContent className="max-h-72">
              {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
      </Two>
      <Field label="Summarize use-case" required hint="Explain who you're texting, what they'll receive, and how they signed up.">
        <Textarea rows={4} value={form.useCaseDescription} onChange={(e) => update("useCaseDescription", e.target.value)} placeholder="Use case details" />
      </Field>
      <Field label="Message content" required hint="A representative sample message. Must include STOP / HELP language and your business name.">
        <Textarea rows={4} value={form.sampleMessage} onChange={(e) => update("sampleMessage", e.target.value)} placeholder="Hi {first_name}, this is Acme with your appointment reminder. Msg & data rates may apply. Reply STOP to opt out, HELP for help." />
      </Field>
    </>
  );
}

function OptInStep({ form, update }: StepProps) {
  const help = OPT_IN_HELP[form.optInType] ?? OPT_IN_HELP.WEB_FORM;
  return (
    <>
      <StepHeader
        title="How people sign up"
        subtitle="Show the carrier where customers agree to get your texts."
      />
      <Field label="Where do they sign up?" required>
        <Select value={form.optInType} onValueChange={(v) => update("optInType", v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {OPT_IN_TYPES.map((o) => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}
          </SelectContent>
        </Select>
      </Field>

      <details className="rounded-xl border bg-muted/40 p-4 space-y-3 text-sm [&_summary]:cursor-pointer">
        <summary className="font-medium text-primary">What carriers want to see on a {help.title.toLowerCase()}</summary>
        <div>
          <div className="font-semibold">Example — {help.title}</div>
          <p className="text-muted-foreground mt-1">{help.example}</p>
        </div>
        <div>
          <div className="font-semibold">What to include</div>
          <ul className="list-disc pl-5 mt-1 space-y-0.5 text-muted-foreground">
            {help.include.map((i) => <li key={i}>{i}</li>)}
          </ul>
        </div>
        <div>
          <div className="font-semibold">Important notes</div>
          <ul className="list-disc pl-5 mt-1 space-y-0.5 text-muted-foreground">
            {help.notes.map((i) => <li key={i}>{i}</li>)}
          </ul>
        </div>
      </details>

      <Field
        label="Sign-up form link or screenshot"
        required
        hint="Paste a public URL that shows the exact point where recipients give consent (sign-up form, hosted PDF of the workflow, or a screenshot). URL must start with https://."
      >
        <Input
          value={form.proofOfOptInUrl}
          onChange={(e) => update("proofOfOptInUrl", e.target.value)}
          placeholder="https://yourcompany.com/optin"
        />
        <OptInProofUpload currentUrl={form.proofOfOptInUrl} onUploaded={(u) => update("proofOfOptInUrl", u)} />
        <label className="flex items-start gap-2 rounded-md border bg-muted/40 p-3 text-xs leading-relaxed mt-2">
          <Checkbox
            checked={form.proofShowsRequiredConsent}
            onCheckedChange={(v) => update("proofShowsRequiredConsent", v === true)}
            className="mt-0.5"
          />
          <span>
            I confirm this proof visibly shows the business name, phone field or SMS sign-up form,
            an optional/unchecked SMS opt-in checkbox, the message purpose, Msg &amp; data rates may apply,
            Reply STOP to opt out, HELP for help, and Privacy Policy / Terms links.
          </span>
        </label>
      </Field>

      <Two>
        <Field label="Terms and conditions URL" required>
          <Input value={form.termsUrl} onChange={(e) => update("termsUrl", e.target.value)} placeholder="https://yourcompany.com/terms" />
        </Field>
        <Field label="Privacy policy URL" required>
          <Input value={form.privacyPolicyUrl} onChange={(e) => update("privacyPolicyUrl", e.target.value)} placeholder="https://yourcompany.com/privacy" />
        </Field>
      </Two>
    </>
  );
}

function AdditionalStep({ form, update }: StepProps) {
  return (
    <>
      <StepHeader
        title="Additional details"
        subtitle="These carrier fields are required before we can submit the verification request."
      />
      <Field label="Notification email" required hint="Where we send updates about the carrier review.">
        <Input type="email" value={form.notificationEmail} onChange={(e) => update("notificationEmail", e.target.value)} />
      </Field>
      <Two>
        <Field label="Opt-in keywords" required>
          <Input value={form.optInKeywords} onChange={(e) => update("optInKeywords", e.target.value)} placeholder="JOIN START YES" />
        </Field>
        <Field label="Opt-in confirmation message (optional)">
          <Textarea rows={3} value={form.optInConfirmationMessage} onChange={(e) => update("optInConfirmationMessage", e.target.value)} />
        </Field>
      </Two>
      <Two>
        <Field label="HELP message sample (optional)">
          <Textarea rows={3} value={form.helpMessageSample} onChange={(e) => update("helpMessageSample", e.target.value)} />
        </Field>
        <Field label="Additional use-case details" required>
          <Textarea rows={3} value={form.additionalInformation} onChange={(e) => update("additionalInformation", e.target.value)} />
        </Field>
      </Two>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={form.containsAgeGatedContent}
          onCheckedChange={(v) => update("containsAgeGatedContent", v === true)}
        />
        Contains age-gated content
      </label>
    </>
  );
}

function ReviewStep({ form, update, onEdit }: StepProps & { onEdit?: (stepIdx: number) => void }) {
  const row = (label: string, value: React.ReactNode) => (
    <div className="grid grid-cols-1 gap-0.5 py-2 text-sm sm:grid-cols-[160px_1fr] sm:gap-3">
      <div className="text-muted-foreground">{label}</div>
      <div className="break-words font-medium">{value || <span className="text-muted-foreground">—</span>}</div>
    </div>
  );
  const group = (title: string, step: number, children: React.ReactNode) => (
    <div className="rounded-xl border p-4">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</span>
        {onEdit && <Button type="button" variant="ghost" size="sm" className="h-7 rounded-full text-xs" onClick={() => onEdit(step)}>Edit</Button>}
      </div>
      <div className="divide-y">{children}</div>
    </div>
  );
  const address = [form.addressLine1, form.addressLine2, form.city, `${form.state} ${form.zip}`.trim(), form.businessCountry].filter((x) => x && x.trim()).join(", ");
  const contact = [`${form.contactFirstName} ${form.contactLastName}`.trim(), form.contactEmail, form.contactPhone ? `${form.contactPhoneCountry} ${form.contactPhone}` : ""].filter(Boolean).join(" · ");
  return (
    <>
      <StepHeader
        title="Review & submit"
        subtitle="One last look. After you submit, the carrier usually replies within a few business days."
      />
      <div className="grid gap-3 lg:grid-cols-2">
        {group("Business", 0, <>
          {row("Legal name", form.legalEntityName)}
          {form.businessDba && row("Also known as", form.businessDba)}
          {row("Company type", form.businessType)}
          {row("Website", form.websiteUrl)}
          {row("Address", address)}
          {row("Contact", contact)}
        </>)}
        {group("Texting", 2, <>
          {row("Monthly volume", form.monthlyVolume)}
          {row("Use cases", form.useCaseCategories.join(", "))}
          {row("Sign-up method", OPT_IN_LABEL[form.optInType] ?? form.optInType)}
          {row("Sign-up proof", form.proofOfOptInUrl)}
          {row("Sample message", form.sampleMessage)}
          {row("Updates sent to", form.notificationEmail)}
        </>)}
      </div>
      <label className="flex items-start gap-2 rounded-md border bg-muted/40 p-3 text-sm">
        <Checkbox
          checked={form.agreeToTos}
          onCheckedChange={(v) => update("agreeToTos", v === true)}
          className="mt-0.5"
        />
        <span>
          I agree to the carrier Terms of Service. I certify that the associated business
          profile is the originator of these messages and that I will participate in traceback
          efforts initiated by the Secure Telephony Identity Policy Administrator and the US
          Telecom Traceback Group.
        </span>
      </label>
    </>
  );
}

// ---------- Opt-in proof uploader ----------

function OptInProofUpload({
  currentUrl, onUploaded,
}: { currentUrl: string; onUploaded: (url: string) => void }) {
  const upload = useServerFn(uploadOptInProof);
  const [busy, setBusy] = useState(false);
  const isUploaded = /\/api\/public\/opt-in-proof\//.test(currentUrl);

  async function handleFile(file: File) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error("File too large. Max 5MB."); return; }
    setBusy(true);
    try {
      const buf = await file.arrayBuffer();
      let binary = "";
      const bytes = new Uint8Array(buf);
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
      }
      const dataBase64 = btoa(binary);
      const res = await upload({
        data: { filename: file.name, contentType: file.type || "application/octet-stream", dataBase64 },
      });
      onUploaded(res.url);
      toast.success("Screenshot uploaded.");
    } catch (e: any) {
      toast.error(e?.message ?? "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex items-center gap-2">
        <label className="inline-flex items-center gap-2 text-xs font-medium rounded-md border border-dashed px-3 py-2 cursor-pointer hover:bg-muted/50">
          {busy ? <Loader2 className="size-3 animate-spin" /> : <span>📎</span>}
          {busy ? "Uploading…" : "Upload screenshot (PNG, JPG, PDF — max 5MB)"}
          <input
            type="file"
            className="hidden"
            accept="image/png,image/jpeg,image/webp,image/gif,application/pdf"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.target.value = "";
            }}
          />
        </label>
        {isUploaded && (
          <a href={currentUrl} target="_blank" rel="noreferrer" className="text-xs text-primary underline">
            View uploaded file
          </a>
        )}
      </div>
    </div>
  );
}
