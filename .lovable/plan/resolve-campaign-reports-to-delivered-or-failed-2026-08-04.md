# Resolve campaign reports to Delivered or Failed

## Confirmed diagnosis

For **JEREMY 4**, all 9,998 recipients already have a final result:

- 1,164 were confirmed delivered.
- 4,209 returned explicit delivery errors.
- 4,625 were finalized by the carrier as `delivery_unconfirmed`; webhook evidence confirms this is the actual final provider status, not a stuck queue or missing webhook.

Because there is no positive delivery receipt for those 4,625 messages, they cannot truthfully be counted as delivered. The reporting problem is that the site exposes them as a separate “Not delivered” category instead of resolving them under Failed.

## Changes

1. **Use a binary final report**
   - Show only Delivered, Failed, and Awaiting for delivery outcomes.
   - Count `delivery_unconfirmed` as Failed everywhere users and admins view campaign totals, country breakdowns, charts, delivery rates, and exports.
   - JEREMY 4 will reconcile as **1,164 Delivered + 8,834 Failed = 9,998 recipients**.

2. **Keep the provider evidence internally**
   - Preserve the raw `delivery_unconfirmed` database status and webhook event for billing, dispute, and technical auditing.
   - Label its failure reason as “Delivery could not be confirmed by the recipient carrier” in failure details and CSV exports.
   - Do not falsely claim these messages were delivered, and do not resend them automatically because some recipients may have received them despite the missing receipt.

3. **Make future results consistent**
   - Update tenant reports, admin reports, campaign summary pages, status badges, PDFs, CSVs, and per-country totals so the separate Not Delivered/Unconfirmed result no longer appears.
   - Keep genuinely unfinished `sent` rows under Awaiting until a final provider result arrives.

## Validation

- Verify every campaign satisfies: `Delivered + Failed + Awaiting + Queued = Recipients`.
- Verify JEREMY 4 shows no separate Not Delivered count and no Awaiting backlog.
- Check tenant and admin views plus exported CSV/PDF totals for matching results.