# Fix: "Current balance is $0.00. Top up before submitting."

## What's happening

The Assign Numbers step shows the red blocker because `submitTollfreeVerification` requires ≥ $5 in tenant credits before it will reserve the toll-free number and submit verification. Your test account has $0 balance, so the wizard refuses to submit — that's why you can't buy a number.

This is our own gate in `src/lib/tollfree-verification.functions.ts` (`TOLLFREE_SETUP_FEE_USD = 5`), not a Telnyx restriction.

## Fix

Make submission work without an up-front credit balance, and defer the $5 fee so it never blocks provisioning.

### 1. `src/lib/tollfree-verification.functions.ts`
- In `submitTollfreeVerification`, stop throwing "Insufficient credit balance".
- New behavior:
  - If balance ≥ $5 and fee not yet paid → debit $5, mark `tollfree_setup_fee_paid_at`, proceed.
  - If balance < $5 → skip the debit, leave `tollfree_setup_fee_paid_at` null, proceed with number reservation + verification submit anyway.
  - Record the unpaid fee as a pending charge on the account (new column `tollfree_setup_fee_due_cents` default 0; set to 500 when we skip). Next successful top-up settles it automatically via a small update in `topup_account` flow — or simplest: just auto-debit on next top-up in the billing top-up server fn.
- Keep the refund path on Telnyx purchase failure only when we actually charged.

### 2. `src/components/tollfree-wizard/TollfreeWizard.tsx` (Assign Numbers step)
- Remove the red "Current balance is $0.00. Top up before submitting." line.
- Replace with a neutral note:
  > "The $5 setup fee is charged from credits when you submit. If your balance is $0, we'll still submit your request and collect the fee from your next top-up."
- Keep the informational "$5 one-time setup" banner at top.

### 3. Migration
Add nullable column `accounts.tollfree_setup_fee_due_cents integer not null default 0` so we can track deferred fees. GRANT unchanged (already covered by existing `accounts` grants).

### 4. Billing top-up hook
In whichever server fn credits the account on successful payment (NowPayments IPN / Paystack webhook / admin top-up), after crediting: if `tollfree_setup_fee_due_cents > 0` and new balance ≥ that amount, debit it and clear the column + set `tollfree_setup_fee_paid_at`.

## Result

You'll be able to click **Submit** on the wizard with $0 balance. Xellvio reserves the toll-free number via the parent Telnyx account and submits carrier verification immediately. The $5 fee is collected the next time you top up — never blocking provisioning again.

## Not changed
- Telnyx integration, wizard steps, verification payload — all untouched.
- Admin-side fee reporting still shows the charge; it's just deferred, not skipped.

Confirm and I'll implement.
