# What's left — status & remaining work

Based on the last few rounds of changes (toll-free wizard, sender-ID dropdown, per-tenant messaging profile provisioning, content screening, ToS gate), here is a concrete list of what is DONE and what still needs work.

## Done
- Toll-free wizard submits to Telnyx end-to-end (address auto-fill, state dropdown, no external Telnyx redirects).
- Sender-ID country picker converted to a searchable dropdown with removable selected chips.
- Carrier-registration countries served via a second dropdown.
- Auto-creation of a Telnyx Messaging Profile per tenant on first `/app` visit (covers new signups and backfills existing accounts).
- Content screening firewall (score < 40 pass, 40–69 review queue, ≥ 70 block) wired into campaign dispatch, test sends, and inbox replies.
- ToS acceptance gate at account level (modal) and campaign level (checkbox), with `tos_acceptances` and `campaign_tos_acceptances` tables.
- Admin review queue page + tenant "kill switch" that disables the Messaging Profile and pauses active campaigns.
- Deferred $5 toll-free setup fee: `tollfree_setup_fee_due_cents` column exists and the wizard no longer blocks on $0 balance.

## Still to do

### 1. Settle the deferred toll-free setup fee on next top-up
The plan called for this but the top-up server function does not yet check `tollfree_setup_fee_due_cents` and auto-debit. Right now a deferred fee sits on the account forever.
- Update the credit top-up handler (NowPayments IPN, Paystack webhook, admin top-up) so that after crediting: if `tollfree_setup_fee_due_cents > 0` and new balance ≥ that amount, debit it, clear the column, and set `tollfree_setup_fee_paid_at`.

### 2. Verify the end-to-end sender-ID flow after the dropdown refactor
The chip grid was replaced with a dropdown in one pass. Worth a live check:
- Selecting a normal country adds/removes it (chip appears, save persists).
- Selecting US/CA opens the toll-free info dialog.
- Registration-required countries (Nigeria, India, UAE, …) still open the registration dialog from the second dropdown.
- Status pills (Verified / In review / Rejected / Covered by US) render inside dropdown items.

### 3. ToS wording review
`src/lib/tos.ts` currently holds placeholder legal text and `TOS_CURRENT_VERSION`. You said you'd review before publishing — that hasn't happened. Bumping the version will force every tenant to re-accept via the modal.

### 4. Admin visibility for compliance events
Screening results land in `content_screening_log` and blocked/held messages in `review_queue`, but there is no admin dashboard tile showing:
- Messages blocked in last 24h / 7d
- Messages held for review
- Tenants currently suspended
Add a small "Compliance" panel on the admin dashboard so you can see abuse trends without opening the review queue.

### 5. Tenant-facing feedback when a send is blocked or held
Right now a blocked message throws from the server function. The campaign/inbox UI shows a generic error. Add a friendly message that tells the tenant why it was blocked (category + score) and, for held messages, that it is pending admin review — otherwise tenants will keep retrying identical content.

### 6. Backfill: run `provisionCurrentAccount` for tenants who never open the app
The provisioning effect fires on first `/app` visit. Dormant accounts never trigger it. Optional one-off admin action or scheduled job to iterate accounts with `telnyx_messaging_profile_id IS NULL` and call `ensureMessagingProfileForAccount` server-side.

### 7. Nice-to-haves (say the word if you want any of these)
- Search input inside the sender-ID country dropdown (list is long).
- Bulk-select "All EU" / "All Africa" shortcuts.
- Auto-refresh of toll-free verification status on the setup page (currently only refreshes on button click).
- Public status page pulling `content_screening_log` aggregate metrics.

## What I'd tackle first
Items **1** (settle deferred fee), **5** (tenant feedback on blocked sends), and **2** (verify the dropdown flow with a real send) — they close the loops that most directly affect a paying tenant. Tell me which to start with (or "all of them") and I'll implement.
