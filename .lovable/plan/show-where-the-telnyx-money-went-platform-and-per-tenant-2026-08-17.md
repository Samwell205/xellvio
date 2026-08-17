# Show where the Telnyx money went — platform and per tenant

You funded the Telnyx wallet and want to see, on the website, exactly where that money finished — for the whole platform or for any tenant. Right now you can't, because the carrier-cost figure the admin shows excludes `failed` messages (the carrier still bills those once submitted) and is never split by outcome, so it never ties back to the wallet balance drop.

## What you'll get

A **"Telnyx wallet spend"** breakdown, available at platform level and drill-down per tenant, that answers "where did the money go" in one screen:

```
Telnyx wallet
  Topped up (all time)            $2,000.00
  Current balance (live)            $445.72
  ──────────────────────────────────────────
  Spent so far                    $1,554.28   ← reconciles to top-ups − balance

  Where it went (last 30d)
    Delivered        97,273 msgs · 194,546 seg · $1,945.46
    Accepted/Sent       5,506 msgs ·  11,012 seg ·   $110.12
    Failed            36,778 msgs ·  73,556 seg ·   $735.56   ← wasted
    Undelivered        7,986 msgs ·  15,972 seg ·   $159.72   ← wasted
    Unconfirmed        1,630 msgs ·   3,260 seg ·    $32.60
    Toll-free verifications                         $XXX
  Per-segment rate used: US $0.0055 + $0.0045 pass-through = $0.01/seg
  (MMS billed at ×3 where applicable)
```

- **Every message submitted to the carrier is counted**, including `failed` and `sending`/`queued` — because the carrier bills the moment a message is accepted, regardless of final delivery status. This is the fix that makes the total reconcile to the wallet.
- **Split by outcome** so you can see how much carrier money went to messages that never landed (failed + undelivered) vs. actually delivered — the figure you're missing today.
- **Segment math is shown explicitly** (segments × per-segment rate), so it's obvious that a 2-segment body doubled the cost. No new rates, no pricing changes — it reuses `country_rates` exactly as the dispatcher charges.
- **Per-tenant drill-down**: pick a tenant, see the same breakdown for just their campaigns. Answers "how much carrier money did this tenant's sending cost me."
- **Reconciliation line**: spent = top-ups − current balance. If the sum of the outcome breakdown + verification fees doesn't match the wallet drop, the residual shows as an explicit "unaccounted" gap (same idea as the existing balance-drop audit, but using the corrected inclusive count).

## What changes

1. **Fix the carrier-cost source of truth** (`src/lib/admin-telnyx.functions.ts`): the `pullSince` status filter drops `failed` and `sending`/`queued` — extend it to include every status the carrier accepted, so the breakdown accounts for 100% of wallet spend. No behaviour change to what tenants are charged; this only affects the admin spend view.

2. **Add a spend-by-outcome aggregation**: group the same message rows by `status` (delivered / sent / failed / undelivered / delivery_unconfirmed / queued+sending) and return `{ messages, segments, carrier_cost }` per status, plus the per-segment rate used. Reuse the existing `realCarrierCost` helper (already handles segments + MMS multiplier + pass-through fee).

3. **New admin view**: a "Telnyx wallet" panel on the existing Admin → Telnyx area (or a new tab on the finance page) showing the platform breakdown above, and a tenant selector that re-runs the same aggregation scoped to one account's campaigns. Live balance comes from the existing `getTelnyxLiveBalance` server function; top-ups from `payments`.

4. **Per-tenant carrier column split**: on the finance page's per-tenant table, the single "Carrier cost" column gains an expandable breakdown by outcome for that tenant (delivered vs wasted), so you don't have to leave the table to see it.

## Out of scope

- No changes to what tenants are charged, no refunds, no balance adjustments.
- No changes to `country_rates` or sell prices.
- No changes to sending/dispatch behaviour — this is read-only visibility.
