# Confirmed explanation and repair plan

## What happened

- Maltida George funded the account with **two successful $100 payments = $200 total**. The current tenant balance is **$0.00**.
- The three campaigns created **29,989 message rows**. The platform charged exactly **$200.00** across 25,000 successful debit entries:
  - **JEREMY 1:** $77.184
  - **JEREMY 2:** $56.488
  - **JEREMY 3:** $66.328
- Those campaign rows were priced at **$0.008 per SMS**, while the recorded US underlying cost is currently **$0.010 per SMS** before profit. That means these sends were priced about **20% below cost**, matching the losses shown in the screenshots.
- The failed SMS went out again because the dispatcher contains an automatic retry job. It requeues selected carrier-rejected messages after 10 minutes without tenant or admin approval.
- Today, that job retried **1,441 SMS** between approximately **12:26 and 13:06 UTC**:
  - **4 delivered**
  - **1,437 failed or were rejected again**
  - Estimated additional underlying retry cost: about **$14.41** at $0.01 each
- The retry happened automatically; the tenant did not manually start it.
- The platform also sends first and debits the tenant afterward, with up to 100 sends running concurrently. This ordering permits provider-accepted SMS to leave the platform while the tenant balance is reaching zero. A failed debit is currently swallowed instead of stopping the send. This is the principal control failure that allowed exposure beyond funded credit.
- Since the last stored provider-balance reading at **$546.92**, estimated underlying send usage across all tenants was about **$560.08**:
  - Maltida George: **$151.93**
  - Samuel Durosinmi: **$398.65**
  - Horizon Greatness: **$9.50**
  This explains why the provider balance could become negative. Maltida was a major part, but not the only tenant consuming that balance.

## Important distinction

The tenant is not showing a negative balance; Maltida is at **$0.00**. The negative screenshot is the platform’s provider balance. The platform became exposed because it paid more for sends than it collected, retried failed messages automatically, and allowed sending before confirming each debit.

## Fixes to implement

1. **Remove automatic resend behavior**
   - Disable the automatic retry job completely.
   - Keep retry as an explicit admin/tenant action with a clear message count and estimated charge shown before confirmation.
   - Do not resend `delivery_unconfirmed` messages automatically because some may already have reached recipients.

2. **Charge atomically before every provider attempt**
   - Replace the current “send, then debit” flow with one database operation that reserves/debits the exact charge before an SMS leaves the platform.
   - If the debit cannot complete, do not call the provider.
   - Preserve charges for provider-accepted sends and confirmed retry attempts, following the existing no-refund policy.

3. **Enforce a hard cost floor at dispatch time**
   - Recalculate each SMS from the current country cost, passthrough fee, segment count, MMS multiplier, and required markup immediately before queueing.
   - Reject/hold a campaign if its stored price is below the current minimum profitable selling price.
   - Prevent stale campaign rows from retaining an old $0.008 price when the valid US sell price is higher.

4. **Add campaign-level reservation and budget limits**
   - Reserve the full affordable campaign amount before processing.
   - Queue only the number of messages covered by that reservation.
   - Stop workers immediately when the reserved amount is exhausted, including during concurrent dispatch.

5. **Make every retry and attempt auditable**
   - Store a separate attempt record for the original send and every retry, including reason, provider status, tenant charge, underlying estimated cost, and who authorized it.
   - Show original sends and retries separately in Admin Finance and campaign reports.

6. **Correct reporting without changing historical balances automatically**
   - Recalculate these three campaigns to show original attempts, automatic retries, tenant charges, estimated underlying cost, and platform loss accurately.
   - Do not issue refunds, credits, or new tenant debits as part of this repair; any historical adjustment will require a separate explicit decision after the audit is visible.