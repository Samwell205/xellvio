## Goal

Rebuild the toll-free verification submission UI to mirror Twilio's own wizard (screenshots provided), for both the tenant flow (`/app/toll-free-verification`) and the verifier submission flow (assigned TFN → "Submit for verification" on `/verify/dashboard/numbers`). The backend already posts to Twilio via `submitTollfreeVerification`; the plan focuses on wiring the new wizard UI to that existing pipeline (and to `submitAssignedTfn` for verifiers) with no protocol changes.

## Wizard structure (matches Twilio exactly)

Left rail with two sections and check/loader status icons:
1. **Basic Information** (already collected by us — auto-checked once the account/business fields exist).
2. **Registration Details** (the wizard the user steps through).

Registration Details sub-steps, in this order:

```text
1. Intro          — "Register your toll-free number" + checklist + Start
2. Business info  — Legal name, DBA (optional), Company type, Website URL
3. Business address — Country → address autocomplete → manual fields
4. Authorized rep — First/Last name, Email, Phone (country picker)
5. Use case       — Monthly SMS volume, Use case(s) multi-select,
                    Use case description (500), Sample message (1000)
6. Opt-in         — Opt-in type dropdown (Verbal / Web form / Paper form /
                    Via text / Mobile QR code) with the matching help panel,
                    Opt-in policy proof URLs (multi-line), T&Cs URL,
                    Privacy Policy URL
7. Additional     — Opt-in keywords, Opt-in message, Help message,
                    Age-gated content checkbox
8. Review & Submit — Read-only summary → Submit
```

Each step: Back / Next buttons, per-step Zod validation, progress persisted in local component state (and draft saved to the existing tenant record between steps so a refresh doesn't lose data).

## Backend wiring (no protocol changes)

- Tenant submission continues to call the existing `submitTollfreeVerification` server fn (already POSTs to `https://messaging.twilio.com/v1/Tollfree/Verifications` and stores status).
- Verifier submission (assigned TFN) continues to call `submitAssignedTfn`, but the notes textarea is replaced by the same wizard; on final submit we serialise the wizard payload into the `notes` field (JSON) so admins see the full submission, and — when the verifier is submitting on behalf of a tenant — also call `submitTollfreeVerification` with those fields against the tenant's Twilio subaccount.
- Twilio push happens server-side only; the wizard never talks to Twilio directly.
- Draft autosave: add a lightweight `saveTollfreeDraft` server fn that upserts partial JSON into the existing verification row (nullable columns already exist) so Back/Next survives refresh.

## UI/UX details from the screenshots

- Two-column layout: sticky left rail (step list with check + spinner icons) + wide content column, matching the Twilio white/dark neutral look but using this project's existing Tailwind tokens (no hard-coded colors).
- Opt-in type dropdown shows a contextual help card (bullet checklist + example screenshot area) that swaps based on the selected value — copy taken verbatim from the Twilio screenshots (Web form, Verbal, Paper form, Via text, Mobile QR code).
- Business address step: country select first, then Google Places-style autocomplete input with a "or edit address manually" link that reveals the 5 manual fields (street, apt/suite, city, state, zip). We'll use plain manual fields by default (no Places API dependency) with an optional autocomplete stub — the manual form matches Twilio's fallback exactly.
- Close (X) button top-right returns to the app dashboard.

## Files

New:
- `src/components/tollfree-wizard/` — `WizardShell.tsx`, `StepRail.tsx`, and one file per step (`StepIntro`, `StepBusinessInfo`, `StepAddress`, `StepAuthorizedRep`, `StepUseCase`, `StepOptIn`, `StepAdditional`, `StepReview`).
- `src/components/tollfree-wizard/schema.ts` — per-step Zod slices derived from the existing `TollfreeVerificationInput`.

Edited:
- `src/routes/_authenticated.app.toll-free-verification.tsx` — replace the current single long form with `<WizardShell mode="tenant" />` while keeping status/marketplace/fee sections above it.
- `src/routes/_verifier.verify.dashboard.numbers.tsx` — replace the plain notes textarea for `assigned` rows with `<WizardShell mode="verifier" tfnId={...} />` opened in a dialog; on submit calls `submitAssignedTfn` with the serialized payload.
- `src/lib/tollfree-verification.functions.ts` — add `saveTollfreeDraft` (partial upsert) and export a shared `WIZARD_STEP_KEYS` map. `submitTollfreeVerification` untouched.
- `src/lib/verifier.functions.ts` — extend `submitAssignedTfn` input to accept a structured `payload` object (still stored in `notes` as JSON); when the verifier is bound to a tenant TFN request, also invoke `submitTollfreeVerification` server-side using the tenant's account.

No DB migration needed — existing `tollfree_verification_attempts` columns already cover every field.

## Out of scope (unchanged)

- Twilio subaccount setup, fee/payment flow, marketplace purchase flow, admin views — all remain as-is.
- Email delivery / auth flows.