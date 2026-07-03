
## 1. Toll-free (US/CA) — charge $5 one-time in credits

**How the flow works after the change**
- Tenant fills the Toll-Free Wizard → clicks Submit.
- Server checks tenant credit balance ≥ $5. If not, returns `insufficient_credits` and the UI shows "Top up $5 to submit toll-free verification".
- Server debits $5 via `debit_account(..., description: 'Toll-free verification setup')`, then:
  1. Buys a US toll-free number on **your** Telnyx account (unchanged).
  2. Attaches it to the tenant's messaging profile.
  3. Submits the verification form to Telnyx.
- If Telnyx purchase or submission fails after debit → automatic refund via `topup_account` with description `Toll-free setup refund`.
- One US toll-free covers Canada — no separate purchase.

**Where it lives**
- `src/lib/tollfree-verification.functions.ts` — add `TOLLFREE_SETUP_FEE_USD = 5`, wrap `submitTollfreeVerification` with debit/refund. Update `getTollfreeFeeStatus` to return `{ amount: 5, label: "$5.00" }`.
- `src/routes/_authenticated.app.setup-sms.tsx` — surface the fee in the wizard header ("One-time $5 setup fee — covers carrier verification") and on the Submit button.

## 2. Auto-refresh toll-free status

- New pg_cron job `refresh-tollfree-verifications` every 10 minutes → hits `/api/public/refresh-tollfree-statuses` (new server route).
- Route iterates `sender_assets` where `sender_kind='toll_free'` and `verification_status IN ('submitted','in_review','pending')`, calls Telnyx `GET /verified_numbers/{id}` per row, updates status + timestamps.
- Client side: on the Set up SMS page, if a toll-free row is in `submitted`/`in_review`, poll `refreshTollfreeVerification` every 30s via TanStack Query `refetchInterval` so the tenant sees the transition without manual refresh.

## 3. "Requires registration" countries — polish

- Verify the amber chip + `RegistrationRequiredDialog` render for every country in `ALPHA_SENDER_REQUIRES_REGISTRATION`.
- Add a persistent banner at the top of Set up SMS when the tenant has ≥1 country in `requires_registration`: "3 countries need carrier registration before you can send. [Review]".
- Inside the dialog: link to the Telnyx portal deep link (`https://portal.telnyx.com/#/app/messaging/sender-ids`), 6-step walkthrough (already scaffolded), and a "I've registered — mark ready" button that flips `verification_status` to `verified`.

## 4. Admin view of all tenant senders

New route `src/routes/_authenticated.admin.senders.tsx` (gated by `has_role('admin')`):
- Table of every `sender_assets` row across all accounts.
- Columns: Tenant email, Country, Kind (toll_free / alpha / local), Sender, Status (color chip), Submitted at, Rejection reason, Telnyx IDs.
- Filters: status, country, kind.
- Actions per row: "Refresh from Telnyx", "Mark verified" (admin override), "Delete".
- Server functions in `src/lib/admin-senders.functions.ts` — all guarded by `has_role(userId, 'admin')` check.
- Link added to admin nav.

## Answers to your questions (in-app)

- US/CA toll-free: **purchased automatically in your Telnyx account** the moment the tenant submits the wizard. The tenant never touches Telnyx.
- Tenant pays **$5 in Xellvio credits, one-time**, at submit. You keep the number and pay Telnyx's ~$2/mo + $15 verification out of that + your ongoing margin from per-message rates.
- One US toll-free = US + Canada coverage. No second purchase for CA.

## What's next after this batch

1. **Per-country pricing surfaced in the UI** — currently `country_rates` exists; show tenants "SMS to NG = $X.XX / segment" on the composer.
2. **Sender rotation / fallback** — if a tenant has both an alpha ID and a toll-free, prefer toll-free for US/CA and alpha elsewhere (partially done, needs polish).
3. **Delivery reports dashboard** — per-campaign delivered / failed / undelivered chart pulled from `messages`.
4. **10DLC (US local)** — right now only toll-free covers US at low volume; 10DLC is the proper US path for scale.

Say "go" and I'll implement 1–4 above.
