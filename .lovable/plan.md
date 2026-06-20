## Goal

When a tenant launches a campaign that costs more than the current Twilio account balance, **don't block them and don't fail messages**. Instead:

1. Mark the campaign `paused_low_balance` and show it as "Sending — waiting for platform capacity" to the tenant.
2. Send urgent alerts to admin (3 emails + 1 SMS).
3. Keep checking Twilio balance; the moment it's funded enough, automatically resume sending. Admin can also click **Resume now**.

No tenant gets billed for messages that don't go out — they keep their credits until messages actually send (current debit flow already works per-message, this just defers the un-sent ones).

---

## Part 1 — Database

New migration adds:

- **`campaigns.status`** gains a new value: `paused_low_balance` (in addition to existing `draft`, `scheduled`, `sending`, `completed`, etc.).
- **`campaigns.paused_reason`** (TEXT, nullable) — human-readable reason shown to tenant.
- **`campaigns.paused_at`** (TIMESTAMPTZ, nullable).
- **`platform_settings`** new rows:
  - `twilio_alert_phone_e164` = `+2348106199368`
  - `twilio_alert_emails` = `sam@samwellagency.com,durosinmisamuel94@gmail.com,samueldurosinmi69@gmail.com`
  - `twilio_balance_buffer_usd` = `5` (require Twilio balance ≥ campaign cost + $5 safety buffer before resuming)

Existing `twilio_balance_snapshots` and threshold settings stay as-is.

---

## Part 2 — Server logic

### A. Pre-flight check before campaign starts sending

In `src/lib/campaigns.functions.ts` (the function that transitions a campaign from `scheduled` → `sending`):

1. Calculate total campaign cost (recipient_count × per-message rate) — already computed today.
2. Fetch latest Twilio balance via `twilio-balance.server.ts`.
3. If `twilio_balance < campaign_cost + buffer`:
   - Set campaign status to `paused_low_balance`, store `paused_reason = "Platform is temporarily at capacity. Your campaign will resume automatically once capacity is restored."`, set `paused_at = now()`.
   - Fire urgent alert (Part 2C).
   - Return success to the tenant (UI shows "processing" — see Part 3).
4. Otherwise proceed as normal.

### B. Per-message safety net (catches mid-campaign exhaustion)

In `src/lib/sms.functions.ts`, when Twilio returns error `20003` (insufficient funds) or `20429` for a single message:
- Pause the parent campaign (`paused_low_balance`), keep the un-sent recipients queued.
- Refund the tenant's credit for messages that didn't go out (reverse `debit_account` for un-sent count).
- Fire the urgent alert.

### C. Urgent alert (new helper `src/lib/twilio-alerts.server.ts`)

Sends in parallel:
- **3 emails** via existing Lovable email infrastructure (new template `twilio-capacity-alert.tsx`): subject `🚨 URGENT: Xellvio platform at capacity — Twilio needs funding`. Body shows current balance, paused campaign IDs, total $ blocked, link to admin billing page.
- **1 SMS** via Twilio (using master account, which still works for low-volume admin SMS even when balance is low — but if Twilio is fully empty, the SMS will fail silently; the 3 emails are the reliable channel).

Throttled: don't re-fire within 15 minutes for the same balance state.

### D. Auto-resume

Extend the existing hourly `twilio-balance-check` cron route (`src/routes/api.public.cron.twilio-balance-check.ts`):

After updating the snapshot, query `campaigns` where `status = 'paused_low_balance'`, ordered by `paused_at ASC`. For each one:
- If `twilio_balance ≥ remaining_cost + buffer`, flip status back to `sending`, clear `paused_reason`/`paused_at`, and re-enqueue remaining messages.
- Stop the loop the moment Twilio balance would drop below the buffer (don't unpause more campaigns than the balance can cover).

### E. Manual "Resume now" button

New server fn `resumeLowBalanceCampaigns` (admin only) that runs the same loop on demand. Wired to a button in the admin Twilio balance card.

---

## Part 3 — UI

### Tenant side (`/app/campaigns/:id`)

When `status = 'paused_low_balance'`, show a yellow banner instead of an error:

> ⏳ **Your campaign is processing.** We're temporarily waiting for platform capacity — your messages will start sending automatically within a few minutes. You haven't been charged for any un-sent messages.

Status badge: "Processing" (not "Failed" or "Paused"). Tenant sees no scary error.

### Admin side

- `TwilioBalanceCard` adds a **"Paused campaigns"** count + a **"Resume all now"** button (only enabled when balance is sufficient).
- Global `TwilioLowBalanceBanner` (already exists) gets a new variant: when ≥1 campaign is paused, banner turns red and says "X campaigns paused — fund Twilio now."

---

## Part 4 — Twilio Auto-Recharge (you do this once, manually)

In Twilio Console → Billing → Manage Billing → Auto-Recharge:
- Set **trigger threshold** high (e.g. recharge when balance drops below **$200**) so most campaigns never hit pause.
- Set **recharge amount** to something that comfortably covers a large campaign (e.g. **$500**).

This combined with the auto-pause/auto-resume system means: in 99% of cases Auto-Recharge handles it silently; in the rare 1% where a campaign exceeds the recharge amount, the pause/alert/resume flow kicks in.

---

## Files

**New:**
- `src/lib/twilio-alerts.server.ts`
- `src/lib/email-templates/twilio-capacity-alert.tsx`
- 1 migration (status enum value, columns, settings rows)

**Edited:**
- `src/lib/campaigns.functions.ts` (pre-flight check + resume fn)
- `src/lib/sms.functions.ts` (per-message 20003 handler + refund)
- `src/lib/twilio-balance.functions.ts` (expose paused-campaign count)
- `src/routes/api.public.cron.twilio-balance-check.ts` (auto-resume loop)
- `src/components/TwilioBalanceCard.tsx` (paused count + Resume button)
- `src/routes/_authenticated.admin.tsx` (banner variant)
- `src/routes/_authenticated.app.campaigns.$id.tsx` (tenant-facing yellow banner)
- `src/lib/email-templates/registry.ts` (register new template)

---

## Out of scope

- Auto-funding Twilio from code (Twilio doesn't expose this API to standard accounts).
- WhatsApp/Slack admin alerts (only email + SMS as requested).
- Letting tenants see Twilio balance details (privacy / they don't need to know).
