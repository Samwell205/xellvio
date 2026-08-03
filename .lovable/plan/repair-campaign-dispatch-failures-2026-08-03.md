# Repair campaign dispatch failures

## Confirmed diagnosis

- The active **JEREMY 4** campaign has 9,998 recipients: 334 delivered, 5,438 still queued, 1,745 marked `dispatch_timeout`, and the remainder mostly carrier-rejected or invalid/non-mobile destinations.
- All 1,745 timeout rows have no provider message ID, but are still marked as charged, representing $27.0475 in reserved tenant credit.
- The scheduled dispatcher runs every minute, but its HTTP request does not set the intended 60-second timeout. The worker is therefore being interrupted after rows are claimed, producing the large `dispatch_timeout` group.
- Carrier codes `40001` and `40012` are genuine destination-list problems (landline, non-routable, or invalid numbers), not a website dispatch failure. They must remain failed and must not be retried automatically.

## Implementation

1. **Make dispatch finish safely within each scheduler call**
   - Reduce the number of messages claimed per invocation to a conservative batch and stop claiming new work before the request budget is exhausted.
   - Keep controlled concurrency and make every accepted-send status write retry reliably.
   - Move nonessential recovery work behind the outbound dispatch path so inbox recovery cannot consume the send budget while campaigns are waiting.

2. **Correct the scheduler configuration**
   - Replace the current dispatcher schedule with the same once-per-minute job using an explicit 60-second request timeout.
   - Keep the canonical non-redirecting endpoint and existing request authentication.

3. **Repair timeout accounting**
   - Fix the timeout refund trigger/function so a timeout with no provider ID clears its charge markers, restores the exact reserved credit once, and records an auditable refund transaction.
   - Backfill the 1,745 affected JEREMY 4 timeout rows so the tenant is not charged for uncertain sends.
   - Add idempotency protection so rerunning the repair cannot issue duplicate refunds.

4. **Resume safe work without duplicating uncertain sends**
   - Leave the existing 1,745 timeout recipients in a clearly separated “retry approval required” state because there is no provider ID proving whether the interrupted request reached the carrier.
   - Immediately allow the 5,438 untouched queued recipients to continue through the repaired dispatcher.
   - Preserve the existing explicit retry control for timeout recipients rather than silently risking duplicate SMS.

5. **Make the report explain the result accurately**
   - Separate system timeouts/refunded rows from carrier failures and invalid destinations.
   - Show actionable labels for landline/non-routable, invalid number, carrier rejected, and dispatch interrupted.
   - Ensure charged totals exclude refunded timeout rows and continue refreshing while queued work remains.

6. **Verify end to end**
   - Confirm scheduler calls complete successfully and no new `dispatch_timeout` rows appear.
   - Confirm queued counts decrease and accepted messages progress through sent/delivered statuses.
   - Reconcile tenant balance, debit entries, and timeout refunds exactly.
   - Validate a small campaign and the active large campaign report before marking the repair complete.

## Technical details

- Database changes will be applied as one reviewed migration covering the scheduler, refund function/trigger, and historical timeout repair.
- Application changes will be limited to the dispatcher and campaign reporting paths.
- Genuine carrier rejections will not be relabeled as successful or automatically resent.