# Match the three-step toll-free verification flow

## Goal
Make toll-free number registration follow the same three-part structure shown in the supplied reference, consistently in both the Xellvio customer account and Xellvio Verifier.

## Changes
- Replace the current eight-screen wizard with exactly three steps: **General**, **Numbers**, and **Use Case Details**.
- Put all business, contact, and address fields together under General.
- Show the assigned toll-free number as a simple list under Numbers; keep automatic number reservation and existing fee behavior unchanged.
- Put every carrier use-case field together under Use Case Details, including opt-in proof, URLs, keywords, message samples, and age-gated-content selection.
- Keep existing validation, saved values, resubmission handling, status tracking, and carrier submission behavior intact.
- Use the same shared three-step form in the tenant account and verifier account so both stay aligned.

## Verification
- Check navigation and field visibility across all three steps on desktop and mobile widths.
- Confirm an existing submission can still be reopened with saved values.
- Run the existing relevant tests and verify the preview builds without errors.

## Technical details
- Refactor the shared `TollfreeWizard` presentation and grouping only; preserve its payload field names and server-side submission contract.
- Keep provider-specific details hidden from customers while retaining current internal integration behavior.