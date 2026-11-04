# Align verifier toll-free registration

## What is already shared
- Verifiers and tenants already use the same three-step registration form, including business/contact details, address, message volume, use case, sample SMS, opt-in proof, privacy policy and terms.
- Newly claimed verifier numbers are purchased individually in separate subaccounts.

## Corrections
1. Validate verifier submissions before any number purchase or submission, using the shared registration rules and requiring the form's consent confirmations. Missing details must never create a false “pending verification” status.
2. Translate the form’s use-case choices into the verification service’s accepted categories; the current default “General Marketing” incorrectly becomes `GENERAL_MARKETING` instead of `MARKETING`.
3. Fix status refresh to load the saved phone identifier, so submitted numbers can actually be checked for approval or rejection.
4. Display the assigned phone number in the shared form and preserve validated answers for corrections and resubmission.
5. Ensure manual number entry cannot claim carrier submission without ownership checks and a complete registration.

## Technical details
- Keep verifier ownership and active-account checks in the existing authenticated functions.
- Retain one newly provisioned number per subaccount and submit/check verification using its owning subaccount; do not move approved numbers.
- Centralize verifier payload validation and category mapping in a browser-safe rules module, reusing existing phone, sample-message and saved-volume normalization rules.
- Reject missing verification identifiers rather than recording a successful submission. Check number-replacement save errors before proceeding.
- Add focused regression tests for complete registration, missing consent/proof, category mapping, separate subaccount submission and status refresh.
- Add page-specific metadata to the verifier numbers page without changing unrelated pages.

## Verification and limits
- Run registration and verifier regression tests and check preview errors.
- Check the form in an authorized verifier session if one is available; otherwise report that limitation.
- Do not purchase numbers, submit real registrations, send SMS, charge accounts or guarantee carrier approval during testing.