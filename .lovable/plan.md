## Goal

Replicate Telnyx's 3-step Toll-Free Verification wizard **exactly** inside Xellvio's Set up SMS page, and on submit auto-provision a US toll-free number on Telnyx and auto-submit the Verification Request via the Telnyx API. Also fix the `debit_account` RPC failure that currently blocks Submit.

## What the videos show (Telnyx's exact flow)

Right-side stepper stays visible across all 3 steps: **1. Business Details → 2. Assign Numbers → 3. Use Case Details**. Purple info banner on step 1: *"Fill in all details according to business details, not personal details."*

### Step 1 — Business Details (two-column grid, Next / Cancel)
- Business Name * · Corporate Website *
- What type of legal form is the organisation? (Sole Proprietor, Private company / LLC / Partnership, Public company, Non-profit, Government)
- DBA or brand name
- Business Registration Country * (defaults United States of America)
- First Name * · Last Name *
- Email * · Phone Number * (country-flag selector + national number)
- Status update webhook URL (optional)
- **Search for an address** (single search field) with *"Or enter it manually"* divider
- Address * · Extended Address
- City * · State * (dropdown for US = `DE - Delaware` style)
- ZIP * · Country * (dropdown)

### Step 2 — Assign Numbers (Next / Back)
- Tabs: **My Telnyx Numbers** · **Messaging Profiles** · **Hosted Numbers** (we only need the first)
- Table: Name / Numbers count / Assign button per row
- Pagination row

### Step 3 — Use Case Details (Create / Back)
- Expected messaging volume per month * (dropdown: 10 / 1,000 / 10,000 / 100,000 / 250,000 / 500,000 / 750,000 / 1,000,000 / 5,000,000 / 10,000,000)
- Use-case * (General Marketing, Account Notification, Customer Care, Delivery Notification, Fraud Alert, Higher Education, Marketing, Polling & Voting, Public Service Announcement, Security Alert, Two-Factor Authentication)
- Summarize use-case * (large textarea)
- Message content * (sample message)
- Opt-In workflow * · Additional use-case details *
- Opt-In workflow image URL * · Opt in keywords * (e.g. START, YES, UNSTOP)
- Opt in message · Help message
- Privacy policy URL * · Terms and conditions URL *
- ISV Reseller (blank if N/A) · Age-Gated Content (Yes / No, default No)

Final states seen after Create: page shows *"This request cannot be edited in its current status. Failed requests can be updated and resubmitted."* plus tabs **General / Numbers / Use Case Details** and an **Assigned Numbers** table listing the E.164 number.

## Plan

### 1. Fix `debit_account` RPC error (unblocks Submit today)
In `src/lib/tollfree-verification.functions.ts` change both `submitTollfreeVerification` and `payTollfreeFee` to pass `_campaign_id: null` (not `undefined`) so PostgREST binds all 4 named parameters of `public.debit_account(_account_id, _amount, _campaign_id, _description)`.

### 2. Rebuild the wizard UI to mirror Telnyx exactly
Rewrite `src/components/tollfree-wizard/TollfreeWizard.tsx` as 3 steps with the right-side stepper, using existing shadcn `Input / Select / Textarea / Button / RadioGroup`. New field additions vs current form:
- Legal form dropdown (map to `business_type`)
- DBA / brand name
- Business Registration Country
- Status update webhook URL (optional; default to our `/api/public/telnyx-status` public URL server-side if blank)
- Address auto-complete search field (uses browser geolocation-style datalist; graceful fallback to manual)
- Step-2 number list (see below)
- Opt-in keywords, Opt-in message, Help message, ISV Reseller, Age-Gated Content

### 3. Step 2 — Assign Numbers: pull-from-inventory + one-click auto-purchase
- New server fn `listAvailableTollfreeSenders` returns rows already in `sender_assets` for the tenant where `sender_kind='toll_free'` (name = friendly business name, phone_number).
- If none, show a single row **"Provision a new US toll-free number"** with an **Assign** button that calls a new fn `provisionTollfreeForTenant`:
  1. `POST /v2/available_phone_numbers?filter[features]=sms&filter[phone_number_type]=toll-free&filter[country_code]=US&filter[limit]=1`
  2. `POST /v2/number_orders` with that number
  3. Attach it to the tenant's messaging profile (`POST /v2/messaging_profiles` if missing, then `PATCH /v2/phone_numbers/{id}` to set `messaging_profile_id`)
  4. Insert/upsert into `sender_assets` (`verification_status='pending_verification'`)
- Charges the existing `$5` phone-number fee via `chargeNumberVerificationFee` (already in `src/lib/number-fee.server.ts`).

### 4. Step 3 — Create: auto-submit Verification Request
New server fn `submitTollfreeVerificationV2` (auth'd) that:
1. Validates the full payload with a Zod schema mirroring the fields above.
2. Debits the one-time $15 toll-free setup fee via `debit_account` (with `_campaign_id: null`) — falls back to `tollfree_setup_fee_due_cents` deferred model already in `topup_account` if balance short.
3. Calls the existing `submitTwilioTollfreeVerification` in `src/lib/tollfree-submit.server.ts` (already hits Telnyx `POST /messaging_tollfree/verification/requests`) with the assigned toll-free E.164 in `phone_numbers[]`.
4. Persists to `tollfree_verification_attempts` (verification_sid, status, raw payload).
5. Updates `sender_assets.telnyx_verification_id` and `verification_status='submitted'`.
6. Sends admin SMS + tenant email via existing `email-templates/tollfree-submitted.tsx`.
7. Returns `{ verificationSid, status }` — UI shows the read-only "This request cannot be edited…" screen with tabs **General / Numbers / Use Case Details** and the assigned number.

### 5. Status polling / read-only view
- Reuse `api.public.poll-verifications.ts` to fetch Telnyx status; on `verified` → set `sender_assets.verification_status='verified'`, on `rejected` → capture reason + email template `tollfree-rejected.tsx`.
- New route section on `/app/setup-sms` shows the three-tab summary card exactly like Telnyx's post-create screen.

## Technical Details

- **File changes**
  - `src/lib/tollfree-verification.functions.ts` — fix `_campaign_id: null` in 2 spots; add `submitTollfreeVerificationV2` + `listAvailableTollfreeSenders` + `provisionTollfreeForTenant`.
  - `src/lib/tollfree-submit.server.ts` — no changes needed; already maps to Telnyx correctly.
  - `src/lib/telnyx.server.ts` — add helpers: `searchAvailableTollfree`, `orderNumber`, `ensureMessagingProfile`, `attachNumberToProfile`.
  - `src/components/tollfree-wizard/TollfreeWizard.tsx` — full rewrite to 3-step Telnyx layout.
  - `src/routes/_authenticated.app.setup-sms.tsx` — render new wizard for `!hasAssets` and read-only summary once submitted.

- **No DB migration required** — `sender_assets`, `tollfree_verification_attempts`, `number_requests`, and `accounts.tollfree_setup_fee_due_cents` already exist.

- **Env / secrets** — `TELNYX_API_KEY` is already set.

- **Webhook** — status callback URL defaults to `https://xellvio.lovable.app/api/public/telnyx-status` (already implemented) so Telnyx's approval / rejection events flow back automatically.

## Out of Scope
- 10DLC / short-code flows (untouched).
- Admin-side review UI changes (Assigned Numbers table already exists in admin).
- Payment provider changes.
