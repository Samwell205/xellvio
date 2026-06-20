## Goal

Two layers of protection so your Twilio account never runs dry:

1. **Twilio Auto-Recharge** — Twilio automatically charges your saved card whenever your Twilio balance drops below a threshold you set. You enable this in the Twilio Console (no code in Xellvio needed).
2. **Low-balance alert in Xellvio admin** — a safety net I'll build: Xellvio checks your Twilio balance every hour, shows a banner in your admin dashboard, and emails you when it drops below a threshold.

---

## Part 1 — Twilio Auto-Recharge (you do this, 2 minutes)

I'll walk you through it in chat after the plan is approved. Short version:

- Twilio Console → **Admin** → **Account Billing** → **Auto-Recharge**
- Set: trigger threshold (e.g. recharge when balance < **$20**) and recharge amount (e.g. add **$50**)
- Confirm your saved card

That's it — Twilio handles the rest automatically, regardless of when/how customers fund their Xellvio balance.

---

## Part 2 — Low-balance alert (I build this)

### What you'll see

- **Admin → Billing → Twilio account** card showing current Twilio balance, last-checked time, status badge (Healthy / Low / Critical), and a "Refresh now" button.
- **Banner at the top of every admin page** when Twilio balance is below your threshold ("Twilio balance low: $12.40 — top up or check Auto-Recharge").
- **Email to you** (the admin) when the balance first crosses below the threshold, throttled so you only get one alert per drop (not one every hour).

### Settings (admin-configurable)

A small form in Admin → Settings:

- `twilio_low_balance_threshold_usd` (default $20)
- `twilio_critical_balance_threshold_usd` (default $5)
- `twilio_alert_email` (defaults to your admin email)
- `twilio_alerts_enabled` (on/off toggle)

### How it works under the hood

```text
┌─────────────────────────────────────────────────┐
│ pg_cron (every hour)                            │
│  └─ POST /api/public/cron/twilio-balance-check  │
│      ├─ Fetch Twilio Balance API                │
│      ├─ Save to twilio_balance_snapshots table  │
│      ├─ If below threshold & state changed:     │
│      │    • insert admin notification           │
│      │    • enqueue email to admin              │
│      └─ Return { balance, status }              │
└─────────────────────────────────────────────────┘
```

Email uses your existing Lovable email infrastructure — same one used for auth/transactional emails.

### Technical details

- **New table** `twilio_balance_snapshots` (balance, currency, checked_at, status). Admin-only RLS.
- **New rows** in `platform_settings` for the threshold/email/toggle settings.
- **New server route** `src/routes/api.public.cron.twilio-balance-check.ts` — calls Twilio's `Balance.json` endpoint via the connector gateway, writes a snapshot, fires alert if state transitions from healthy → low or low → critical.
- **New pg_cron job** running hourly that hits the route with the `apikey` header.
- **New admin server fn** `getTwilioBalance` for the dashboard card + "Refresh now" button (calls the same check).
- **UI**: a `TwilioBalanceCard` component on `_authenticated.admin.billing.tsx`, plus a `LowBalanceBanner` shown across admin routes when status ≠ healthy.

### What I'll NOT do

- Won't try to "auto-fund" Twilio from code. Twilio doesn't expose a self-recharge API to standard accounts — Auto-Recharge in the Twilio Console is the supported path.
- Won't expose Twilio balance to non-admin users.

---

## Out of scope (ask if you want these too)

- SMS/WhatsApp alerts to your phone (in addition to email).
- Daily summary email of Twilio spend.
- Automatic pausing of outbound campaigns when Twilio balance is critical.