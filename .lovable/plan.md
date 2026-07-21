
## Problem

When a tenant buys a pre-verified toll-free number, the current flow is:
1. Tenant pays $50 via Paystack → $50 is topped up into their SMS credit balance.
2. Marketplace "Buy" click debits $50 from credit balance to assign the number.

If step 2 never runs (tenant closes the page, `debit_account` errors, or the number is instead auto-assigned elsewhere), the $50 stays as spendable SMS credit. That's what happened for at least two tenants — `emmanuelolushola824@gmail.com` and `alexandershorinolu1@gmail.com` each show a `+$50 Paystack topup` in `credit_transactions` with no matching `debit_account` for the toll-free number, and each has a verified TFN on their account.

The $50 should behave as a one-time fee, never as SMS credit.

## Fix

### 1. Separate the TFN purchase from credit topup

Add a dedicated Paystack (and NowPayments) checkout intent for "toll-free number purchase":

- New `payments.purpose` value: `tfn_purchase` (or reuse existing `pack_id = null` + metadata flag). We'll add a `purpose` text column via migration if one doesn't exist, and store `tfn_purchase` for these payments.
- New server fn `initPaystackTfnCheckout` in `src/lib/billing-packs.functions.ts` mirroring `initPaystackCheckoutCustom`, but:
  - Fixed `amount = tfn_buyer_price_usd` (read from `platform_settings`).
  - `payments.credits = 0` and `payments.purpose = 'tfn_purchase'`.
- Extend `creditFromPayment` (same file): when `payment.purpose === 'tfn_purchase'`, do NOT call `topup_account`. Instead, call the existing `claimFromPool`/`buyImpl` logic to assign a number to the account (moved into an exported helper `assignTfnAfterPayment(userId, priceUsd)` in `src/lib/tfn-marketplace.functions.ts`). Mark payment `paid` afterwards. Refund path: if no number is available at assignment time, mark payment `refund_pending` and admin-notify — never silently keep the money as credit.
- Same treatment in the NowPayments IPN (`src/routes/api/public/nowpayments-ipn.ts`) — branch on `payment.purpose`.

### 2. Update the "Buy pre-verified number" UI

In `src/routes/_authenticated.app.toll-free-verification.tsx` (`MarketplaceBuyCard`):

- Replace the current `buyFn` (which requires prefunded credit) with a "Pay $50" button that calls `initPaystackTfnCheckout` and redirects to Paystack. On return, the callback page (`/app/billing`) already re-verifies via `verifyPaystack`; extend that to route to the toll-free page and toast the assigned number.
- Keep a fallback "Use my credit balance" only if `credit_balance >= $50`, which uses today's `purchaseTfnFromMarketplace` (unchanged — that path already debits correctly).
- Remove the language implying they must top up first.

### 3. Reverse the wrongly-kept $50 for affected tenants

One-time SQL run via the insert tool:

- Find every `credit_transactions` row where `type = 'topup'`, `amount = 50` and `description LIKE 'Paystack USD 50%'` whose account also has a `sender_assets` row with `sender_kind = 'toll_free'` created within 24h and no matching `debit_account` of $50 with description containing "toll-free" / "TFN" / "Purchased verified".
- For each match: subtract $50 from `accounts.credit_balance` (allow negative — the SMS sender already checks `< 0` on new debits, so future top-ups clear the debt naturally) and insert a `credit_transactions` row `type = 'debit'`, `amount = 50`, `description = 'Toll-free number fee (reconciliation)'`, `balance_after = accounts.credit_balance`.
- Confirmed affected today: `73d366b2-d9e0-4fb3-8635-a3707505ced0` and `68ff2e59-19b6-458e-9e5d-95b4a6cf2c78`. Query will catch any others.

### 4. Guard rails

- Add unique constraint `payments_provider_reference_key` if not already present (it is), and make `assignTfnAfterPayment` idempotent by keying off `payments.id` (skip if payment already `paid`).
- Log every failed pool claim so a stuck payment surfaces in admin.

## Technical Notes

- The current `purchaseTfnFromMarketplace` handler passes `_campaign_id: undefined` to the `debit_account` RPC — likely fine but we'll pass `null` explicitly to eliminate that as a failure mode.
- `platform_settings.tfn_buyer_price_usd` is already the source of truth for the $50, so no hardcoding.
- No changes to `shared_tollfree_pool` schema; `claimFromPool` already atomically removes and reassigns numbers.
