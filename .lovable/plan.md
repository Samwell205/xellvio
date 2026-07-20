## What "Unconfirmed" actually means

Your numbers match Telnyx exactly (10,506 sent → 5,605 delivered, 4,901 not delivered). Nothing is broken — this is how international SMS works.

For every message, Telnyx does two things:

1. **Hand the message to the destination carrier** — this is "Sent / Accepted".
2. **Wait for the carrier to send back a Delivery Receipt (DLR)** — only then it becomes "Delivered".

**"Unconfirmed" = step 1 succeeded, step 2 never came back.** The carrier accepted your SMS but never told Telnyx whether the phone actually rang. Most of these were delivered — the carrier just didn't report it.

### Why this happens (in order of how common it is)

- **Destination carrier doesn't return DLRs.** Very common for MTN Nigeria, Airtel India, Etisalat UAE, many African/Asian networks. They accept your SMS, deliver it, and never send a receipt.
- **Fake DLRs / DLR stripping.** Some route carriers strip receipts to hide performance.
- **Registration-required countries.** UAE, Saudi, Kuwait, Nigeria etc. require a pre-registered Sender ID. Without one, your traffic is silently dropped or partially delivered with no DLR.
- **Handset off/out-of-coverage long enough for the DLR to time out.**
- **Number is a landline / VoIP / invalid** — carrier drops it but doesn't tell us.

### Why 358 also came back as "Undelivered"

Those are the ones where the carrier explicitly said "no" — usually invalid number, blocked, or filtered as spam.

## Plan

I will NOT change the delivery numbers (they are correct — that's what Telnyx reports). I'll make three practical improvements so this is understandable and actionable:

### 1. Rewrite the "Unconfirmed" explanation in the campaign report

On `_authenticated.app.campaigns.$id.tsx`, replace the current tooltip with a plain-English breakdown:

> "The carrier accepted this SMS but never returned a delivery receipt. Most of these were delivered — many international carriers (especially in Africa, the Middle East, and parts of Asia) simply don't confirm. This is normal and you were charged only for accepted messages."

Add a small "Learn more" link that opens a modal explaining DLRs, per-country reliability, and which countries typically don't return receipts.

### 2. Add a country breakdown to the report

Show a table under "Cost & deliverability":

```text
Country    Sent   Delivered   Unconfirmed   Undelivered   DLR rate
NG         3,200  1,120       2,050         30            35%
US         2,100  2,050       0             50            97%
...
```

This lets you see instantly that (for example) your low delivery number is concentrated in a couple of countries that never confirm — not a platform bug.

### 3. Add a "Retry unconfirmed after 24h" action

Right now the "Retry all failed" button only retries `failed` / `undelivered`. Add a second, opt-in button: **"Resend to unconfirmed (last 24h)"**. It:

- Filters `messages` for `status = 'delivery_unconfirmed'` on this campaign
- Skips numbers where the same content was already delivered on a later attempt
- Re-queues them through `api.public.dispatch-campaign` (uses your existing balance/pricing path)
- Warns before spending: "This will resend X messages for ~$Y. Recommended only if recipients report not receiving the message."

I will not auto-retry these — that would double-charge you for messages that were probably delivered.

### 4. Where I will NOT change anything

- The Telnyx polling logic is fine — after the 30-min reconciliation window a message that still has no DLR is legitimately "unconfirmed" forever. Polling longer won't turn them into "delivered".
- Billing stays as-is. Telnyx charges for accepted messages regardless of DLR, so tenants continue paying for `sent + delivered + unconfirmed`.

## Files I'll touch

- `src/routes/_authenticated.app.campaigns.$id.tsx` — tooltip, "Learn more" modal, country breakdown table, "Resend to unconfirmed" button.
- `src/lib/reports.functions.ts` — new `getCampaignDeliveryByCountry(campaignId)` server fn that groups messages by destination country ISO and returns sent/delivered/unconfirmed/undelivered/DLR%.
- `src/lib/campaign-control.functions.ts` — new `resendUnconfirmed(campaignId)` server fn that queues a retry batch limited to the current campaign and last 24h.
