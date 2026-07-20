## Goal

Let admin designate one approved toll-free number as a **shared pool number** and attach many tenants to it. When any of those tenants sends a campaign, Xellvio routes the send through the shared number's Telnyx Messaging Profile.

## Carrier reality (important)

On Telnyx a phone number can only live on ONE Messaging Profile at a time. So "sharing" is done at the **Xellvio layer**, not by duplicating the number on Telnyx:

- The TFN stays on ONE "shared" Messaging Profile owned by the platform (not any tenant).
- Multiple tenants get a `sender_assets` row pointing at the same `phone_number` + same `telnyx_messaging_profile_id`, marked `verified`.
- The dispatcher already picks a tenant's sender_asset by country → it will naturally send through the shared profile.
- Trade-offs (surfaced in the admin UI): inbound STOP/replies land on the shared profile and are fanned out to every tenant that has that number attached; Telnyx's per-profile reports won't separate tenants (Xellvio's per-campaign report still does).

## Changes

### 1. Schema (migration)
- Add `is_shared boolean default false` to `sender_assets`.
- Drop/relax the `unique (account_id, country_code, sender_kind)` behavior only where it blocks a second tenant reusing the same `phone_number`; keep `phone_number` NON-unique across accounts when `is_shared = true` (current upsert key already is `account_id,country_code,sender_kind`, so multiple tenants pointing at the same phone_number is already allowed — just verify and add an index on `phone_number` for fanout lookup).
- No change to `numbers` table ownership (single owner remains the platform's "pool" account, or we store one `numbers` row per attached tenant — plan uses: one `numbers` row per tenant attached, all with the same `phone_number`; drop uniqueness on `numbers.phone_number` if present, else keep pool as owner-only).

### 2. Server fns (`src/lib/admin-senders.functions.ts`)
- `adminCreateSharedTollfree({ phone_number, country })` — registers an already-approved TFN as a shared pool entry (creates/keeps it on a platform-owned Messaging Profile, marks verified, `is_shared=true`, no `account_id` tenant binding beyond a pool owner).
- `adminAttachSharedTollfree({ phone_number, account_id })` — inserts a `sender_assets` row for that tenant reusing the shared `telnyx_messaging_profile_id` + `phone_number`, `verification_status='verified'`, `is_shared=true`. Clears the tenant's toll-free setup fee.
- `adminDetachSharedTollfree({ phone_number, account_id })` — removes just that tenant's rows; does not touch Telnyx.
- `adminListSharedTollfree()` — lists shared numbers + attached tenants.

### 3. Inbound webhook (`src/routes/api.public.telnyx-status.ts`)
Already fans inbound SMS to every `account_id` in `sender_assets` matching the `to` number, so shared inbound already works. No change needed beyond confirming.

### 4. Admin UI (`src/routes/_authenticated.admin.senders.tsx`)
Add a new **"Shared toll-free pool"** panel with:
- "Register shared TFN" button (phone + country).
- Table of shared numbers, each with: phone, country, attached tenants, "Attach tenant" (searchable dropdown), and per-row "Detach" buttons.
- Inline warning about the trade-offs listed above.

## Where admin will click

`Admin → Senders → Shared toll-free pool` panel at the top of the page.

## Out of scope

- No changes to campaign compose, dispatcher, or per-tenant reporting (they already work per-tenant).
- No changes to Telnyx approval flow — this is for numbers that are already approved.
