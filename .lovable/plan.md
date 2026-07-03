
# Verified Toll-Free Marketplace — /verify Portal

Separate portal for independent "Verifiers" who submit toll-free numbers, get them verified through our existing Twilio flow, and earn when tenants buy them. Tenants requesting a TFN see both options (buy verified vs verify their own); the "buy" option is disabled when the pool is empty. Flat price set by admin. Platform keeps 25% commission.

## 1. Data model (new tables, all separate from existing sellers system)

```text
verifiers                 (id, user_id [auth.users], full_name, email, created_at)
verifier_bank_accounts    (id, verifier_id, bank_name, bank_code, account_number,
                           account_name, resolved_at)
verifier_wallets          (id, verifier_id, balance_ngn, lifetime_earned_ngn, updated_at)
verifier_tfns             (id, verifier_id, phone_number, country, status
                           [pending_verification | verified | sold | rejected],
                           twilio_verification_sid, rejection_reason,
                           sold_to_account_id, sold_at, sale_price_ngn,
                           commission_ngn, payout_ngn, created_at)
verifier_transactions     (id, verifier_id, type [sale_credit | withdrawal_debit
                           | commission], amount_ngn, balance_after, tfn_id,
                           withdrawal_id, description, created_at)
verifier_withdrawals      (id, verifier_id, amount_ngn, status [pending | paid | rejected],
                           admin_note, requested_at, paid_at, paid_by)
platform_settings additions: tfn_flat_price_ngn (default e.g. 15000),
                             tfn_commission_pct (default 25)
```

RLS: verifiers can only read/write their own rows (`verifier_id` scoped to `auth.uid()` via `verifiers.user_id`). Admin (`has_role('admin')`) can read/write all. Service role bypasses.

Wallet mutations happen only through SECURITY DEFINER RPCs: `credit_verifier_on_sale`, `debit_verifier_withdrawal`, `mark_withdrawal_paid`.

## 2. Verifier portal — routes

```text
/verify                          Landing / marketing page (portal-specific)
/verify/auth                     Login + signup (independent session, same Supabase auth)
/verify/dashboard                Wallet, stats
/verify/dashboard/numbers        List TFNs + submit new
/verify/dashboard/numbers/new    Submit TFN → Twilio verification
/verify/dashboard/earnings       Transactions log
/verify/dashboard/withdrawals    Request + history
/verify/dashboard/settings       Bank details (Paystack resolve)
```

Session is the same Supabase auth, but users get a `verifier` row instead of an `account`. Guard: `_verifier/route.tsx` layout checks `verifiers` row exists for `auth.uid()`, redirects to `/verify/auth` otherwise. Existing tenant `_authenticated` layout is untouched.

Signup collects full name + email + password, then routes to a mandatory bank setup step (bank dropdown from Paystack `/bank`, account number → Paystack `/bank/resolve`, submit blocked until `account_name` returned).

## 3. Tenant TFN request flow (existing route updated)

`/app/toll-free-verification` now shows two cards up top:

- **Buy Verified Number** — instant. Shows current flat price. Button disabled with "No numbers available right now" when the pool is empty. On click: charge tenant balance, RPC picks one random `verifier_tfns` row where `status='verified'`, flips to `sold`, sets `sold_to_account_id`, inserts into `sender_assets` + `number_requests` as approved/provisioned, credits verifier wallet (75%), records 25% commission, sends emails to tenant + verifier.
- **Verify My Own Number** — existing flow, unchanged.

Both always visible; only the buy button toggles disabled state.

## 4. Admin panel additions (extend existing admin, don't duplicate)

New admin route `/admin/verifiers` with tabs:

- **Verifiers** — list, bank details, submitted TFNs, wallet balance
- **Verified Pool** — all `verified` TFNs, ability to manually assign one to any tenant account (dropdown of accounts) → triggers same sale flow
- **Submissions** — pending TFNs, manual approve/reject override
- **Withdrawals** — pending list, "Mark Paid" button (calls RPC that debits wallet + logs), rejection with note
- **Settings** — flat price + commission % (writes to `platform_settings`)

Existing `/admin/marketplace` and sellers system stays as-is (parallel, unaffected).

## 5. Landing page update

Add a section on `/` (marketing home) titled "Verified Toll-Free Marketplace" with two CTAs: "Buy verified numbers" (→ tenant signup) and "Earn by verifying" (→ `/verify`).

## 6. Integrations reused

- Paystack List Banks + Resolve Account (already wired in `src/lib/paystack.server.ts` for sellers — reuse the same helpers).
- Twilio toll-free verification (reuse `src/lib/tollfree-verification.functions.ts` submit path, but keyed to `verifier_tfns` instead of `tollfree_verification_attempts`).
- Email notifications via existing email queue (`enqueue_email`) for: verifier signup welcome, TFN submitted, TFN verified, TFN sold (to verifier), TFN purchased (to tenant), withdrawal requested (to admin), withdrawal paid (to verifier).

## 7. Order of implementation

1. Migration: all tables, RLS, GRANTs, RPCs, `platform_settings` rows.
2. Server functions: `verifier.functions.ts`, `verifier-tfn.functions.ts`, `verifier-withdrawal.functions.ts`, `tfn-marketplace.functions.ts` (tenant buy).
3. `_verifier` layout + `/verify/auth` + `/verify/dashboard/*` routes.
4. Update `/app/toll-free-verification` with the two-option UI.
5. Admin `/admin/verifiers` route with the tabs above.
6. Landing page section + CTA.
7. Email templates.

## Technical notes

- Currency stored as NGN integers to match existing seller ledger; price and commission are configurable via `platform_settings`.
- Random pool selection uses `ORDER BY random() LIMIT 1 FOR UPDATE SKIP LOCKED` inside the sale RPC to avoid double-selling under concurrency.
- All money mutations are RPCs with `SECURITY DEFINER`; verifier UI never writes to `verifier_wallets` directly.
- All new tables get `GRANT` blocks in the same migration per project conventions.

Approve this and I'll ship it in order (migration first, then code).
