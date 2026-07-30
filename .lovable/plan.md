# Maltida recovery and provider dispute

## Confirmed audit facts

- Maltida funded exactly **$200** and the platform has now removed exactly **$200**, leaving the tenant wallet at **$0.00**.
- The platform deducted **$117.248 on July 30** after deducting **$82.752 on July 29**.
- The three campaign ledger totals are **$77.184**, **$56.488**, and **$66.328**.
- Some failed messages were sent again on July 30. The existing audit identified **1,441 automatic retries**; these were not manually approved by the tenant.
- The local provider-transaction import contains no rows for this period, so the exact provider withdrawal/refund cannot honestly be claimed from that table. It must be reconciled against the provider message/transaction records.

## Implementation

1. **Freeze unauthorized resend exposure**
   - Confirm no background path can automatically retry failed or delivery-unconfirmed messages.
   - Require an explicit tenant/admin confirmation showing message count and charge before any retry.

2. **Create an exact attempt-level reconciliation**
   - Match every Maltida provider attempt to its campaign message, timestamp, final provider status, tenant debit, and estimated/actual provider charge.
   - Separate original sends, previously unsent messages resumed after the provider account recovered, and true duplicate retry attempts.
   - Identify messages accepted more than once and prevent them from being counted as valid tenant usage twice.

3. **Recover valid uncovered tenant charges**
   - Calculate only provider-accepted attempts that were not already included in Maltida’s $200 ledger deductions.
   - Apply one auditable correction transaction for that verified amount; if the wallet cannot cover it, record the balance as debt and suspend further sending until funded.
   - Do not charge Maltida for an unauthorized duplicate retry caused by the platform.

4. **Prepare and expose the provider dispute**
   - Produce an admin-visible dispute report listing unauthorized automatic retries, provider message IDs, timestamps, statuses, and the exact amount charged.
   - Add a downloadable CSV and ready-to-send dispute text requesting reimbursement for those attempts.
   - Keep the dispute amount separate from tenant debt so the same money is never recovered twice.

5. **Correct finance reporting**
   - Show original attempts, authorized retries, unauthorized retries, tenant charges, provider charges, amount recoverable from the tenant, and amount disputed with the provider as separate lines.
   - Add a recovery status so you can track pending, credited, rejected, or collected amounts.

6. **Notify Maltida only after reconciliation**
   - Send a clear account notice stating the verified correction, resulting balance/debt, campaign references, and support contact.
   - Do not expose the provider name, provider pricing, or internal infrastructure in tenant-facing text.

## Safety rules

- No estimated amount will be charged as if it were final.
- No duplicate collection from both Maltida and the provider for the same retry.
- Every adjustment will have an immutable ledger description and admin audit trail.