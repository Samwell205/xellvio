This is a large multi-area build (10 feature groups). To ship it well, I'll deliver it in phased milestones rather than one giant batch. Each phase is independently usable and gets shipped before moving on.

## Theme & Polish (applies across all phases)
- Black / Blue / White SaaS theme via design tokens in `src/styles.css` (no hardcoded colors)
- Framer-motion transitions on cards, tables, dialogs
- Mobile responsive; sticky sidebar; consistent empty/loading/error states
- Existing routes refactored to share new `<StatusBadge>`, `<PageHeader>`, `<DataTable>` primitives

## Phase 1 — Approval gates + Real-time dashboard
- New `<StatusBadge>` (pending / approved / rejected / active / failed)
- `useAccountReadiness()` hook: checks email_verified, sender_id approved, wallet balance > 0
- Send SMS + Campaign pages blocked with a clear checklist when not ready
- Overview dashboard: auto-refresh every 10s (wallet, delivery stats, recent campaigns, SMS status) via TanStack Query `refetchInterval`

## Phase 2 — Campaign Builder wizard
- 5-step flow on `/app/campaigns/new`: Audience → Message → Cost → Schedule → Confirm
- Step 1: pick All contacts / Group / Manual selection
- Step 2: editor with live phone preview, segment count, char count
- Step 3: cost = recipients × segments × rate (from wallet)
- Step 4: send now vs scheduled datetime
- Step 5: confirmation summary + send
- Backed by existing `campaigns` table; new `scheduled_at` column if missing

## Phase 3 — Contacts UX
- CSV upload: column mapping screen (auto-detect + dropdown overrides)
- Duplicate preview before insert
- Segment builder: filter by tag/group/country/created date

## Phase 4 — Message tracking
- `/app/messages/:id` detail page
- Timeline: Queued → Sent → Delivered → Failed with timestamps
- Provider, cost, retry attempts

## Phase 5 — Billing UX
- Invoice history table
- Payment timeline
- Credit purchase history
- Failed payment retry banner

## Phase 6 — Compliance
- Opt-out list management page
- Blacklist panel
- Country restrictions matrix (view + toggle)

## Phase 7 — Developer portal `/app/api`
- API docs (REST endpoints rendered from a static spec)
- Code examples tabs (Node / Python / PHP)
- Webhook tester (POST a sample payload to a URL)
- API key generate / revoke UI

## Phase 8 — Admin panel (`/app/admin`, gated by `has_role('admin')`)
- User management table (search, role grant, suspend)
- Fraud detection: flagged sends, velocity anomalies
- Revenue analytics (charts)
- Provider route management

## Database additions (single migration per phase as needed)
- `api_keys` (user_id, key_hash, label, last_used_at, revoked_at)
- `invoices` (user_id, amount, status, pdf_url)
- `opt_outs` (user_id, phone, reason)
- `blacklist` (user_id, phone)
- `country_restrictions` (country_code, enabled)
- `messages.status_history` jsonb column
- `campaigns.scheduled_at`

## Recommendation
Phases 1 + 2 give the most user-visible value fast (approval gates + working campaign builder = end-to-end send flow). I suggest I implement **Phase 1 and Phase 2 in this turn**, then you review and I continue with the rest in follow-up turns. Building all 10 areas in one shot would take far longer to review and is more likely to introduce regressions in the working flows you just got fixed.

Reply "go" to start with Phases 1 + 2, or tell me which phases to prioritize first.
