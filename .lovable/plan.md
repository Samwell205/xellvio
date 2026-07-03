# Next Batch — 4 Features

Building in this order so each unlocks the next.

## 1. Per-country pricing in composer

**Goal:** As tenant builds a campaign, show cost/SMS per country and a live total.

- New server fn `getCountryRatesForAudience` in `src/lib/pricing.functions.ts` — reads `country_rates` (already exists), returns `{ country_code, price_per_segment, recipients, subtotal }[]` for the current audience selection.
- Update campaign composer (`src/routes/_authenticated.app.campaigns.$id.tsx` or wherever composer lives) to render a breakdown table under the message editor:

  ```text
  Country     Recipients   Rate/SMS   Segments   Subtotal
  🇺🇸 US       1,240        $0.008     1          $9.92
  🇳🇬 NG         820        $0.045     2          $73.80
  ─────────────────────────────────────────────────────
  Total       2,060                              $83.72
  ```
- Recompute on audience/message change (debounced 400ms). Block "Send" if `credit_balance < total`.

## 2. Sender fallback rules

**Goal:** Per-recipient auto-pick of the best sender the tenant has.

- New helper `pickSender(accountId, countryCode)` in `src/lib/telnyx.server.ts`:
  1. If `country_code = US|CA` and tenant has verified `toll_free` → use TFN.
  2. Else if tenant has verified `alpha` for that country → use alpha ID.
  3. Else if tenant has a `local` number for that country → use local.
  4. Else → skip + log `no_sender` on the message row.
- Wire into `api.public.dispatch-campaign.ts`: replace current single-sender pick with per-message `pickSender`. Group by sender to still batch-send.
- Add `messages.sender_used` (text) + `messages.sender_kind` columns via migration for reporting.

## 3. Delivery reports dashboard

**Goal:** Per-campaign visibility into what actually happened.

- New route `src/routes/_authenticated.app.campaigns.$id.report.tsx`:
  - Header stats: Sent / Delivered / Failed / Cost / Delivery rate %.
  - Chart: delivery over time (recharts, already installed).
  - Breakdown by country: recipients, delivered, failed, cost.
  - Breakdown by sender kind (TFN vs alpha vs local).
  - Failed numbers table with reason + CSV export button.
- Server fn `getCampaignReport(campaignId)` in `src/lib/reports.functions.ts` — aggregates `messages` by `status`, `country_code`, `sender_kind`.
- Telnyx DLR webhook (`api.public.telnyx-dlr.ts`) — verify signature, update `messages.status` to `delivered`/`failed` + `failure_reason`. Already partially exists? Verify & extend.
- Add "View report" link on campaigns list.

## 4. 10DLC registration (US local at scale)

**Goal:** Tenants can register a Brand + Campaign to send from US local numbers at 10DLC rates (higher throughput, lower cost than TFN for high volume).

- Uses existing `tenant_10dlc_registrations` table (already in schema).
- New wizard route `src/routes/_authenticated.app.setup-10dlc.tsx`:
  - **Step 1 Brand:** legal name, EIN, address, brand type (private/public/non-profit), website, vertical, contact.
  - **Step 2 Campaign:** use case (marketing/mixed/low-volume), description, sample messages ×2, opt-in flow description, opt-in confirmation URL, help/stop keywords.
  - **Step 3 Numbers:** pick which US local numbers to attach.
  - **Step 4 Fee:** show $44 one-time brand + $10/mo campaign fee (Telnyx pricing) + our margin — **$50 setup fee in credits, no monthly** (matching TFN pattern).
- Server fns in `src/lib/tendlc.functions.ts`:
  - `submit10DLCRegistration` — debit fee, POST `/10dlc/brands` + `/10dlc/campaigns` to Telnyx, store IDs.
  - `get10DLCStatus` — pull latest.
- Cron job every 30 min → `api.public.refresh-10dlc-statuses.ts` — sync `pending → verified/rejected`.
- Admin view (`_authenticated.admin.senders.tsx`) — add 10DLC tab.

## Technical notes

- All Telnyx API calls stay in `telnyx.server.ts` (already the pattern).
- All fees debit via existing `debit_account` RPC, refund on failure via `topup_account` (same pattern as toll-free).
- Migrations: (a) `messages.sender_used`, `messages.sender_kind`, `messages.failure_reason`; (b) index on `messages(campaign_id, status)` for report perf.

## Rollout order

1. Migration + `pickSender` + wire dispatch (unblocks reporting fidelity).
2. Per-country pricing UI (fast win).
3. Delivery reports dashboard (needs sender_kind from #1).
4. 10DLC wizard (largest; ships last).

Ready to build all 4 in sequence?
