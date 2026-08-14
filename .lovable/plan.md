# Fix MMS carrier rejection handling

## Confirmed diagnosis

Campaign **Test** sent one US MMS from a verified toll-free number. The platform submitted it successfully, but the recipient carrier returned final error **40008**: “The recipient carrier did not accept the message.” This is a downstream carrier rejection, not a queued-message or dispatcher failure. The carrier did not provide a more specific reason.

## Changes

1. **Add an explicit “Retry as SMS” path**
   - Let a tenant retry a failed MMS without the image while keeping the original campaign and message audit history.
   - Store a per-message SMS override so the dispatcher does not attach the campaign image on that retry.
   - Recalculate the retry using the normal SMS rate rather than the MMS rate.
   - Require confirmation and show the estimated resend charge before re-queuing; never retry or charge automatically.

2. **Make error 40008 understandable**
   - Replace “See carrier documentation” with: “Recipient carrier rejected this message. It reached the carrier, but was not accepted for delivery.”
   - For failed MMS, explain that retrying without the image may improve acceptance, but does not guarantee delivery.
   - Show the same accurate explanation in tenant and admin campaign reports.

3. **Preserve existing retry behavior**
   - Keep the normal Retry action for users who intentionally want to resend the MMS unchanged.
   - Add the SMS fallback as a separate action only for failed MMS.

4. **Verify end to end**
   - Confirm the SMS fallback queues without media, uses SMS pricing, sends through the existing verified sender, and keeps the original 40008 attempt visible in the audit/report.
   - Verify normal MMS retries and unrelated failure codes are unchanged.

## Technical details

- Add a nullable per-message delivery override through a database migration.
- Extend the authenticated retry server function to authorize ownership, perform a dry-run price check, record retry authorization, and set the override atomically.
- Update dispatcher media selection, message body, pricing, and throttling to honor the per-message override.
- Update tenant/admin report presentation and confirmation dialogs using existing design-system components.