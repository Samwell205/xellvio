
## What I checked (real data, not assumptions)

**Maltida George** — account `e75b6c61…`, balance **$117.25**.

Payments: $100 (7/29 11:10) + $100 (7/29 12:15) = **$200 credited**. (There is also a 7/27 Paystack row for $50 marked `paid` but with **credits = 0.00** — it was never added to his wallet. Separate issue, flagged below.)

Actual wallet activity: **2 topups = $200.00**, **10,344 debits = $82.75**. 200 − 82.75 = **$117.25**. His wallet is correct.

## So why do the campaign reports say $79.98 / $79.94 / $79.98?

Because the admin report sums the `cost` column on **every message row**, including rows that were **never sent**. `cost` is written when the recipient row is created (a price estimate), but the wallet is only debited when a message is actually dispatched.

| Campaign | Rows | Actually attempted | Report shows | Actually charged |
|---|---|---|---|---|
| JEREMY 1 | 9,998 | 9,282 | $79.98 | $66.89 |
| JEREMY 2 | 9,993 | 583 (8,993 still queued) | $79.94 | $3.95 |
| JEREMY 3 | 9,998 | 600 (8,498 still queued) | $79.98 | $4.42 |
| **Total** | | | **$239.94** | **$82.75** ✅ |

The reporting is wrong, not the billing. Nobody was over- or under-charged here.

## Why campaigns 2 and 3 stalled

JEREMY 1 has 716 messages with carrier error **20012: "your account has been deactivated. It may be out of funds."** That is your carrier account running dry mid-send. After that, JEREMY 2 and JEREMY 3 could barely dispatch — 17,491 rows are still sitting in `queued`/`sending` platform-wide. The rest of the failures are normal list quality: 40001 landline/non-routable, 40012 invalid number, 40008 carrier rejected.

## The real problem: you are selling US SMS below cost

Your `country_rates` for **US**: `cost_price = $0.0040`, `sell_price = $0.0080`.

Your own carrier usage report (7/27–7/30, outbound SMS on toll-free) says:
- 10,553 sent → **Cost $100.56** = **$0.0095 per message**
- **Carrier Passthrough Fees $42.52** = **$0.0040 per message** — which the platform does **not** model at all
- Real cost ≈ **$0.0135 per message**

You charge **$0.0080**. You lose **≈ $0.0055 on every single US SMS.** That is the debt — it is not a billing bug, it's a pricing bug. On top of that, **inbound** messages cost you money too (659 inbound = $4.43 + $0.80 fees) and are billed to tenants at $0.

Platform-wide this compounds: 43,110 billed messages, $1,897.60 of tenant spend recorded, while the admin "carrier cost" figure was computed at $0.0040/msg — roughly **a third of true cost**, so every "gross profit" number you've been shown is badly overstated.

---

## The plan

### 1. Fix the reporting so spend means spend
- Change `admin_campaign_stats` so `tenant_cost` only sums messages that were actually attempted (`sent`, `delivered`, `delivery_unconfirmed`, `undelivered`, `failed`), and return a separate `reserved_cost` for the not-yet-sent remainder.
- Same fix in the tenant-facing campaign report and in `admin_finance_*`, so every screen agrees with `credit_transactions` (the true source of billing).
- Show "Charged so far" vs "Estimated remaining" as two distinct numbers, so a half-sent campaign can never look like a full charge again.

### 2. Model carrier passthrough fees
- Add `passthrough_fee` (per message) and `inbound_cost` columns to `country_rates`, defaulting from real usage data.
- Include passthrough in every carrier-cost calculation: campaign reports, finance analysis, per-country breakdown, balance-drop audit.
- Set US to the measured values: `cost_price = 0.0095`, `passthrough_fee = 0.0040`.

### 3. Re-price so margin is real
- Recompute `sell_price` from `(cost_price + passthrough_fee) × (1 + markup)`. For US at your current 101% markup that lands near **$0.027 per SMS**; I'll present the exact table for US/CA/GB/etc. and let you set the markup before anything goes live.
- Same treatment for MMS via the multipliers.
- Optionally bill inbound replies at cost + markup (currently free to tenants, costs you money).

### 4. Reconcile the real loss
- Produce an admin view: for each tenant, messages actually sent × true cost (incl. passthrough) vs what they were charged — so you can see exactly who was subsidised and by how much, before deciding whether to adjust anyone.
- Nothing is charged back to any tenant without your explicit go-ahead.

### 5. Loose ends
- Resolve the 7/27 $50 Paystack payment that shows `paid` with 0 credits — either credit it or mark it void.
- Decide what to do with the 17,491 stuck `queued`/`sending` rows from JEREMY 2/3: resume dispatch once the carrier balance is funded, or cancel them (they are unbilled either way).

### Technical notes
Touches: `admin_campaign_stats` RPC, `admin_finance_summary` / `admin_finance_tenants` / `admin_finance_daily`, `src/lib/admin-campaigns.functions.ts`, `src/lib/admin-finance.functions.ts`, `src/lib/admin-telnyx.functions.ts` (`realCarrierCost`), `src/lib/twilio-pricing.server.ts`, and a migration adding the two `country_rates` columns plus the US rate correction.

---

**Before I build:** confirm (a) the markup you want applied to the corrected US cost, and (b) whether inbound replies should start being billed. I'll show you the full new price table for approval before it goes live.
