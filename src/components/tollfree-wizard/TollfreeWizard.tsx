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

// ---------- Substep definitions ----------

type SubStepKey =
  | "business-info"
  | "authorized-rep"
  | "business-address"
  | "assign-numbers"
  | "use-case"
  | "opt-in"
  | "additional"
  | "review";

const SUB_STEPS: Array<{ key: SubStepKey; label: string }> = [
  { key: "business-info", label: "Business info" },
  { key: "authorized-rep", label: "Contact details" },
  { key: "business-address", label: "Business address" },
  { key: "assign-numbers", label: "Assign numbers" },
  { key: "use-case", label: "Use case" },
  { key: "opt-in", label: "Opt-in" },
  { key: "additional", label: "Additional details" },
  { key: "review", label: "Review & submit" },
];

const MAIN_STEPS = [
  { label: "Business Details", keys: ["business-info", "authorized-rep", "business-address"] as SubStepKey[] },
  { label: "Assign Numbers", keys: ["assign-numbers"] as SubStepKey[] },
  { label: "Use Case Details", keys: ["use-case", "opt-in", "additional", "review"] as SubStepKey[] },
];

// ---------- Per-substep validation ----------

function isEmail(v: string) { return /^[^@]+@[^@]+\.[^@]+$/.test(v.trim()); }
function isHttps(v: string) { return /^https:\/\//.test(v.trim()); }
function isHttp(v: string) { return /^https?:\/\//.test(v.trim()); }

function stepValid(f: WizardForm, key: SubStepKey): string | null {
  switch (key) {
    case "business-info":
      if (f.legalEntityName.trim().length < 2) return "Enter the legal business name.";
      if (!isHttp(f.websiteUrl)) return "Enter a valid website URL (https://…).";
      if (!f.businessType) return "Select a company type.";
      // Registration number / authority / country are optional — Telnyx only
      // requires them for a subset of entity types and validates them itself.
      return null;
    case "business-address":
      if (!/^[A-Z]{2}$/.test(f.businessCountry)) return "Select a country.";
      if (!f.addressLine1.trim()) return "Enter address line 1.";
      if (!f.city.trim()) return "Enter city.";
      if (!f.state.trim()) return "Enter state / region.";
      if (!f.zip.trim()) return "Enter zip / postal code.";
      return null;
    case "assign-numbers":
      return null;
    case "authorized-rep":
      if (!f.contactFirstName.trim()) return "Enter first name.";
      if (!f.contactLastName.trim()) return "Enter last name.";
      if (!isEmail(f.contactEmail)) return "Enter a valid email.";
      if (!/^\+\d{1,4}$/.test(f.contactPhoneCountry)) return "Select a phone country code.";
      if (f.contactPhone.replace(/\D/g, "").length < 5) return "Enter a valid phone number.";
      return null;
    case "use-case":
      if (!f.monthlyVolume) return "Select a monthly SMS volume.";
      if (f.useCaseCategories.length === 0) return "Select at least one use case category.";
      if (f.useCaseDescription.trim().length < 40) return "Describe your use case in at least 40 characters.";
      if (f.useCaseDescription.trim().length > 500) return "Use-case summary must be 500 characters or fewer.";
      if (f.sampleMessage.trim().length < 20) return "Enter a sample message (min 20 characters).";
      if (f.sampleMessage.trim().length > 1000) return "Sample message must be 1,000 characters or fewer.";
      return null;
    case "opt-in":
      if (!f.optInType) return "Select an opt-in type.";
      if (!isHttps(f.proofOfOptInUrl)) return "Add a public https:// URL (or upload a screenshot) as opt-in policy proof.";
      if (!isHttps(f.privacyPolicyUrl)) return "Enter a public https:// Privacy Policy URL.";
      if (!isHttps(f.termsUrl)) return "Enter a public https:// Terms and Conditions URL.";
      if (!f.proofShowsRequiredConsent) return "Confirm your opt-in proof includes the required disclosures.";
      return null;
    case "additional":
      if (!isEmail(f.notificationEmail)) return "Enter a valid notification email.";
      if (!f.additionalInformation.trim()) return "Enter additional use-case details.";
      if (f.additionalInformation.trim().length > 500) return "Additional use-case details must be 500 characters or fewer.";
      if (!f.optInKeywords.trim()) return "Enter opt-in keywords, e.g. START, YES, SUBSCRIBE.";
      return null;
    case "review":
      if (!f.agreeToTos) return "You must accept the carrier Terms of Service.";
      return null;
  }
}

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
  const [subIdx, setSubIdx] = useState(0);
  const [completed, setCompleted] = useState<Set<SubStepKey>>(new Set());
  const sub = SUB_STEPS[subIdx];

  const update = <K extends keyof WizardForm>(k: K, v: WizardForm[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const currentMainStep = MAIN_STEPS.findIndex((step) => step.keys.includes(sub.key));

  function goNext() {
    const err = stepValid(form, sub.key);
    if (err) { toast.error(err); return; }
    setCompleted((c) => new Set(c).add(sub.key));
    if (subIdx < SUB_STEPS.length - 1) setSubIdx(subIdx + 1);
  }

  function goBack() {
    if (subIdx > 0) setSubIdx(subIdx - 1);
  }

  async function handleSubmit() {
    for (const s of SUB_STEPS) {
      const err = stepValid(form, s.key);
      if (err) {
        const idx = SUB_STEPS.findIndex((x) => x.key === s.key);
        setSubIdx(idx);
        toast.error(err);
        return;
      }
    }
    await onSubmit({ ...form, agreeToTos: true });
  }

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      {onClose && (
        <div className="border-b px-6 py-3">
          <button type="button" onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground">
            ← Back to Toll Free Verification
          </button>
        </div>
      )}
      <div className="grid lg:grid-cols-[minmax(0,1fr)_240px]">
        <div className="space-y-5 p-5 sm:p-6 lg:p-8">
          {helperBanner}
          <fieldset disabled={disabled} className={disabled ? "opacity-70 pointer-events-none" : ""}>
            <div className="space-y-5">
              {sub.key === "business-info" && <BusinessInfoStep form={form} update={update} />}
              {sub.key === "business-address" && <BusinessAddressStep form={form} update={update} />}
              {sub.key === "authorized-rep" && <AuthorizedRepStep form={form} update={update} />}
              {sub.key === "assign-numbers" && (
                <AssignNumbersStep
                  reservedNumber={reservedNumber}
                  verificationStatus={verificationStatus}
                  feeAmount={feeAmount}
                  creditBalance={creditBalance}
                  feePaid={feePaid}
                />
              )}
              {sub.key === "use-case" && <UseCaseStep form={form} update={update} />}
              {sub.key === "opt-in" && <OptInStep form={form} update={update} />}
              {sub.key === "additional" && <AdditionalStep form={form} update={update} />}
              {sub.key === "review" && <ReviewStep form={form} update={update} />}
            </div>
          </fieldset>

          {!disabled && (
            <div className="flex items-center justify-between gap-2">
              <Button type="button" variant="outline" onClick={goBack} disabled={subIdx === 0}>
                <ChevronLeft className="size-4 mr-1" /> Back
              </Button>
              {subIdx < SUB_STEPS.length - 1 ? (
                <Button type="button" onClick={goNext}>
                  Next <ChevronRight className="size-4 ml-1" />
                </Button>
              ) : (
                <Button type="button" onClick={handleSubmit} disabled={submitting} size="lg">
                  {submitting && <Loader2 className="size-4 mr-2 animate-spin" />}
                  {submitLabel}
                </Button>
              )}
            </div>
          )}
        </div>

        <aside className="border-t bg-muted/20 p-5 lg:border-l lg:border-t-0 lg:p-6">
          <ol className="space-y-0">
            {MAIN_STEPS.map((step, i) => {
              const allDone = step.keys.every((key) => completed.has(key));
              const state: "done" | "current" | "pending" = allDone && i !== currentMainStep ? "done" : i === currentMainStep ? "current" : "pending";
              return <RailRow key={step.label} index={i + 1} label={step.label} state={state} />;
            })}
          </ol>
          <div className="mt-5 border-l pl-4 space-y-2">
            {SUB_STEPS.map((s, i) => {
              const state = completed.has(s.key) && i !== subIdx ? "done" : i === subIdx ? "current" : "pending";
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => { if (state === "done" || i <= subIdx) setSubIdx(i); }}
                  className={`block w-full text-left text-xs ${state === "current" ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        </aside>
      </div>
    </div>
  );
}

// ---------- Rail ----------

function RailRow({ index, label, state }: { index: number; label: string; state: "done" | "current" | "pending" }) {
  return (
    <li className={`flex items-center gap-3 border-l-4 px-3 py-3 text-sm font-medium ${state === "current" ? "border-primary" : "border-border"}`}>
      <span
        className={`inline-flex size-5 items-center justify-center rounded-full border text-[11px] ${
          state === "done"
            ? "bg-success border-success text-success-foreground"
            : state === "current"
              ? "border-primary text-primary"
              : "border-border text-muted-foreground"
        }`}
      >
        {state === "done" ? <CheckIcon className="size-3" /> : index}
      </span>
      <span className={state === "pending" ? "text-muted-foreground" : ""}>{label}</span>
    </li>
  );
}

// ---------- Field helpers ----------

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
      <Label className="flex items-center justify-between gap-3 text-sm">
        <span>{label}</span>
        {required && <span className="text-xs italic text-muted-foreground">Required</span>}
      </Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
function StepHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div>
      <h2 className="text-xl font-semibold">{title}</h2>
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
        title="Business Details"
        subtitle="Enter the legal details of the business that will send SMS. These are shared with US carriers during verification."
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
      {form.businessType && (
        <Three>
          <Field label="Registration number" required>
            <Input value={form.businessRegistrationNumber} onChange={(e) => update("businessRegistrationNumber", e.target.value)} placeholder="e.g. 12-3456789" />
          </Field>
          <Field label="Registration authority" required>
            <Select value={form.businessRegistrationIdentifier} onValueChange={(v) => update("businessRegistrationIdentifier", v)}>
              <SelectTrigger><SelectValue placeholder="Select authority" /></SelectTrigger>
              <SelectContent>
                {REGISTRATION_AUTHORITIES.map((a) => <SelectItem key={a.v} value={a.v}>{a.l}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Registration country" required>
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
          <Input value={form.addressLine1} onChange={(e) => update("addressLine1", e.target.value)} placeholder="123 Main St" />
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
        title="Assign Numbers"
        subtitle="A US toll-free number is attached to this request automatically when you submit."
      />
      <div className="rounded-lg border">
        <div className="flex flex-wrap gap-3 border-b p-4">
          <Button type="button" variant="outline" size="sm" className="border-primary text-primary hover:text-primary">
            My Xellvio Numbers
          </Button>
          <Button type="button" variant="ghost" size="sm">Messaging Profiles</Button>
          <Button type="button" variant="ghost" size="sm">Hosted Numbers</Button>
        </div>
        <div className="overflow-x-auto p-4">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="text-left text-muted-foreground">
              <tr className="border-b">
                <th className="py-2 font-medium">Number</th>
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
                  <td colSpan={4} className="py-8 text-center text-muted-foreground">No toll free numbers assigned yet</td>
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
        title="How you'll use this number"
        subtitle="Carriers use this to decide whether your traffic matches the toll-free program."
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
        title="Describe your opt-in type and how recipients provide consent"
        subtitle="Provide a clear description of how recipients opt-in to receive your messages."
      />
      <Field label="Opt-in type" required>
        <Select value={form.optInType} onValueChange={(v) => update("optInType", v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {OPT_IN_TYPES.map((o) => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}
          </SelectContent>
        </Select>
      </Field>

      <div className="rounded-lg border bg-muted/40 p-4 space-y-3 text-sm">
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
      </div>

      <Field
        label="Opt-in policy proof"
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

function ReviewStep({ form, update }: StepProps) {
  const row = (label: string, value: React.ReactNode) => (
    <div className="grid grid-cols-[180px_1fr] gap-3 py-1.5 text-sm border-b last:border-0">
      <div className="text-muted-foreground">{label}</div>
      <div className="break-words">{value || <span className="text-muted-foreground">—</span>}</div>
    </div>
  );
  return (
    <>
      <StepHeader
        title="Review & submit"
        subtitle="Double-check the details below. Once submitted, this goes straight to the carriers for review."
      />
      <div className="rounded-md border p-4">
        {row("Legal name", form.legalEntityName)}
        {row("DBA", form.businessDba)}
        {row("Company type", form.businessType)}
        {row("Website", form.websiteUrl)}
        {row("Address", `${form.addressLine1}${form.addressLine2 ? `, ${form.addressLine2}` : ""}, ${form.city}, ${form.state} ${form.zip}, ${form.businessCountry}`)}
        {row("Contact", `${form.contactFirstName} ${form.contactLastName} — ${form.contactEmail} — ${form.contactPhoneCountry} ${form.contactPhone}`)}
        {row("Monthly volume", form.monthlyVolume)}
        {row("Use cases", form.useCaseCategories.join(", "))}
        {row("Opt-in type", form.optInType)}
        {row("Opt-in proof", form.proofOfOptInUrl)}
        {row("Sample message", form.sampleMessage)}
        {row("Notification email", form.notificationEmail)}
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
