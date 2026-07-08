## Goal
Make Kuwait — and every other Telnyx-supported destination that currently requires carrier registration (UAE, Saudi Arabia, Qatar, Bahrain, Oman, Egypt, Turkey, Nigeria, India, Pakistan, Bangladesh, Sri Lanka, Philippines, Vietnam, Thailand, Indonesia, Malaysia, Morocco, Algeria, Tunisia, China) — reachable from the platform via an in-app registration flow.

## What actually blocks Kuwait today
Kuwait is already in the Telnyx destination whitelist and appears in the "Countries that require carrier registration" dropdown on `Setup SMS`. But:

1. It's tucked into a secondary amber panel that many users miss, so it feels like KW "isn't supported."
2. Even after a user submits, the sender_asset lands in `submitted` and the campaign builder only accepts `verified` senders — so KW stays effectively un-sendable until Telnyx approves (days–weeks) with no visibility in the campaign flow itself.
3. A few countries Telnyx supports (e.g. Jordan `JO`, Lebanon `LB`, Israel `IL`, South Africa `ZA`, Kenya `KE`, Ghana `GH`) are missing from `ALPHA_SENDER_REQUIRES_REGISTRATION` even though they realistically need registration — not the KW issue, but worth aligning while we're in here.

## Changes

### 1. Promote the registration flow in Setup SMS (`src/routes/_authenticated.app.setup-sms.tsx`)
- Merge registration-required countries into the main country picker instead of hiding them behind a separate amber panel. Each entry shows an inline badge: `Registration required`, `In review`, `Registered`, or `Rejected`.
- Selecting a registration-required country opens the existing `RegistrationRequiredDialog` directly (same handler as `RegistrationCountryDropdown`), no separate UX.
- Keep the amber panel as a compact "Pending registrations" summary once at least one is submitted.

### 2. Let campaigns target countries that are pending registration (`src/routes/_authenticated.app.campaigns.new.tsx`, `src/lib/campaigns.functions.ts`)
- In the campaign country breakdown, treat `submitted` / `in_review` sender_assets as "available with warning" instead of "no sender." Row shows an amber `Registration pending` chip; recipients are counted; user can still exclude them.
- On send / dispatch, if a country's sender is not yet `verified`, mark those recipients as `queued_awaiting_sender` in `messages` (new status handled the same way as the existing pending states) rather than failing the whole campaign. When the sender flips to `verified` (webhook or manual admin action), a follow-up dispatch pass picks them up.
- If the user has no sender at all for a country in the recipient list, keep the existing "Add a sender" block — unchanged.

### 3. Broaden supported destinations
- `src/lib/countries.ts` + `src/lib/telnyx.server.ts`: add `JO, LB, IL, ZA, KE, GH` (and any other Telnyx-supported ISO already in `COUNTRIES` but missing from `DEFAULT_WHITELISTED_DESTINATIONS`) to both `DEFAULT_WHITELISTED_DESTINATIONS` and `ALPHA_SENDER_REQUIRES_REGISTRATION` where the local operator requires it.
- On next call to `ensureMessagingProfileForAccount`, `updateMessagingProfileWhitelist` will re-push the expanded whitelist to Telnyx — no migration needed.

### 4. Admin visibility (`src/routes/_authenticated.admin.senders.tsx`)
- Add a "Country" filter option covering the newly-registrable countries so admins can see and manually flip a sender to `verified` after Telnyx approval (for the cases where the Telnyx webhook doesn't fire).

### 5. UX copy
- In the registration dialog and on the campaign page, add one line: "Carrier approval typically takes 3–10 business days. Messages queued for this country will start delivering automatically once approved."

## Not in scope
- Building an admin flow to talk to Telnyx's carrier-registration API beyond what `createAlphanumericSenderId` already does — Telnyx's approval is external and we can't shortcut it.
- Paddle / Stripe payment integration from the previous turn.
- Any database schema change (using existing `sender_assets.verification_status` values).

## Technical notes
- `messages.status` already tolerates non-terminal states (`queued`, `sending`); the new `queued_awaiting_sender` is a virtual bucket surfaced via a filtered query, not a new enum value, so no migration.
- The registration server fn `submitSenderIdRegistration` already exists and is reused as-is.
- Kuwait-specific fix is a subset of change #1 — no KW-only code path.