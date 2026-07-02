
## What we're building

A separate "Verified Numbers Marketplace" inside Xellvio. Two sides:

1. **Sellers** — a new account type with its own signup, login and dashboard at `/sellers`. They verify toll-free numbers (going through the same Twilio toll-free verification flow you already have), the numbers land in a marketplace pool, and when a tenant buys one, the seller earns money that they can withdraw.
2. **Buyers (tenants)** — on the existing "Set up SMS / toll-free verification" screen, a new option: *"Buy an already-verified number — instant, no verification needed"*. System picks a random available verified number from the pool, charges the tenant, credits the seller, and assigns the number to the tenant's account.
3. **Admin** — sees all seller listings, sees withdrawal requests, marks them paid manually.
4. **Landing page** — new section: *"Earn from verified toll-free numbers"* linking to `/sellers`.

## Sellers portal (`/sellers/*`)

Public:
- `/sellers` — marketing page explaining the program + earnings + CTA
- `/sellers/auth` — separate sign-up / sign-in (email + password + Google), tagged as `seller` account type

Authenticated (`/sellers/dashboard/*`):
- **Dashboard** — current balance, lifetime earnings, active listings, pending withdrawals
- **My numbers** — list of numbers with status: `verifying`, `available`, `sold`, `rejected`
- **Add a number** — reuses the existing toll-free verification form (business name, use case, sample message, opt-in proof screenshot). Seller pays the same $3.50 verification fee out of their own credit balance (or we can move it to free-for-sellers later — admin toggleable).
- **Payouts** — Nigerian bank details form + withdrawal request list
- **Settings** — profile + Google-linked account

## Nigerian bank verification (Paystack)

On the payout-details form:
- Bank dropdown — populated from Paystack `GET /bank?country=nigeria`
- Account number field (10 digits)
- On blur / "Verify" click → server fn calls Paystack `GET /bank/resolve?account_number=…&bank_code=…` → returns the real account name from NIBSS
- Show the resolved name; seller must click "Confirm" — that resolved name is stored as `bank_account_name` (they can't type it manually — this prevents fake accounts)

Uses your existing `PAYSTACK_SECRET_KEY`.

## Buyer flow on the toll-free page

Above the existing form, a new card: **"Skip the wait — buy a verified number"**. Shows current marketplace stock ("12 numbers available") and price. Click → confirm → system:
1. Charges tenant's credit balance the buyer price (admin-configured, e.g. $15)
2. Picks a random `available` seller listing, marks it `sold`, sets `buyer_account_id`
3. Credits the seller's payout balance with the seller price (admin-configured, e.g. $10)
4. Copies the Twilio number + verification profile into the tenant's `sender_assets` as verified (logical transfer — seller loses access, number stays on the same Twilio account)
5. Emails both sides

If stock is 0, the card shows "No verified numbers available right now — verify your own below" and the existing form stays.

## Admin console additions

- **Sellers → Listings** — every marketplace number, status, seller, buyer
- **Sellers → Withdrawals** — pending / paid / rejected. Row shows seller name, resolved bank name, bank, account number, amount. "Mark paid" button + notes field. Marking paid deducts from seller balance and emails them.
- **Sellers → Pricing** — two inputs: `buyer_price_usd`, `seller_payout_usd`, `verification_fee_for_sellers_usd`. Stored in `platform_settings`.
- Email notifications to admin when a new withdrawal is requested.

## Landing page update

New section on `/` between existing sections: *"Earn passive income — verify toll-free numbers and sell them"*, with 3 steps and a "Become a seller" button linking to `/sellers`.

---

## Technical section

### DB migration
- `accounts.account_type` enum add value `seller` (or a new column `is_seller boolean`). Sellers are still rows in `accounts` so we reuse auth + credit_balance for the verification fee, but they can't access `/app/*` — a route guard checks account_type.
- New `seller_payout_accounts` — `account_id`, `bank_code`, `bank_name`, `account_number`, `account_name` (resolved), `resolved_at`, `is_verified`.
- New `marketplace_listings` — `id`, `seller_account_id`, `sender_asset_id`, `phone_number`, `status` (`verifying|available|sold|rejected|withdrawn`), `buyer_account_id`, `sold_at`, `seller_payout_amount`, `buyer_price_amount`.
- New `seller_balances` — running available + lifetime totals (or derive from ledger).
- New `seller_ledger` — `account_id`, `type` (`sale_credit|withdrawal_debit|adjustment`), `amount`, `balance_after`, `listing_id`, `withdrawal_id`, `description`.
- New `withdrawal_requests` — `id`, `seller_account_id`, `amount`, `status` (`pending|paid|rejected`), `payout_account_snapshot` (jsonb), `admin_notes`, `paid_at`, `paid_by`.
- All with RLS: sellers see only their own rows; admins see all; grants for `authenticated` + `service_role`.
- SQL functions: `credit_seller(_account_id, _amount, _listing_id, _desc)`, `debit_seller_withdrawal(...)`, both `SECURITY DEFINER`, atomic like existing `debit_account`.
- `platform_settings` rows for the three prices.

### Server functions (`src/lib/marketplace.functions.ts`, `sellers.functions.ts`, `paystack-bank.functions.ts`)
- `listAvailableBanks()` — cached Paystack `/bank`
- `resolveBankAccount({ bank_code, account_number })` — Paystack `/bank/resolve`
- `savePayoutAccount(...)` — only accepts a previously-resolved name
- `listMyListings()`, `submitListingForVerification(...)` — wraps existing toll-free verification, then on approval webhook (`api.public.twilio-tollfree-status.ts`) also sets marketplace_listing status to `available`
- `getMarketplaceStock()` — count of `available` listings
- `purchaseRandomListing()` — atomic: pick a random `available` row `FOR UPDATE SKIP LOCKED`, debit buyer via `debit_account`, credit seller via `credit_seller`, insert into buyer's `sender_assets`, mark `sold`, send both emails
- `requestWithdrawal({ amount })`, `listMyWithdrawals()`
- `adminListListings()`, `adminListWithdrawals()`, `adminMarkWithdrawalPaid()`, `adminSetMarketplacePricing()`

### Routes
- `src/routes/sellers.tsx` (marketing) + `src/routes/sellers.auth.tsx`
- `src/routes/_sellers-authenticated/route.tsx` — ssr:false gate, redirects non-sellers to `/sellers/auth`, uses same Supabase auth
- `src/routes/_sellers-authenticated.sellers.dashboard.*.tsx` — dashboard, numbers, add-number, payouts, settings
- Buyer card: modify `_authenticated.app.toll-free-verification.tsx` to show the "buy verified" block on top
- Admin: `_authenticated.admin.marketplace-listings.tsx`, `_authenticated.admin.marketplace-withdrawals.tsx`, `_authenticated.admin.marketplace-pricing.tsx` + sidebar links
- Landing: add section to `src/routes/index.tsx`

### Emails (React Email templates in `src/lib/email-templates/`)
- `marketplace-number-sold.tsx` (to seller)
- `marketplace-number-purchased.tsx` (to buyer)
- `withdrawal-requested.tsx` (to admin)
- `withdrawal-paid.tsx` (to seller)

### Twilio "transfer"
Logical only: number stays on the platform Twilio account. We copy the verified `sender_assets` row to the buyer's `account_id` and revoke the seller's row (status `sold`, hide from their sender pool). No Twilio API call needed for the swap itself — the messaging service SID stays the same and inbound webhooks look up ownership by our DB.

### Route guards
- `/app/*` — existing gate, plus new check that blocks `seller`-only accounts (redirect to `/sellers/dashboard`)
- `/sellers/dashboard/*` — new gate that requires `is_seller = true`; non-sellers get an "Apply to become a seller" upsell page

### Out of scope for this pass
- Actual Twilio subaccount-to-subaccount transfer (Twilio requires a manual support ticket; not automatable)
- Automatic Paystack payouts (per your answer, admin pays manually)
- Seller KYC beyond bank-account name resolution
- Refunds when a bought number is later suspended by Twilio (admin-handled case-by-case for now)

Shall I build this?
