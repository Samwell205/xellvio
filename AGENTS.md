<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- International cards use flw.server.ts and /api/public/card/webhook (icp_); hide provider names in UI.
- Toll-free registration uses one shared three-step wizard for tenant and verifier accounts so both submission experiences stay aligned with the carrier flow.
- Dashboard lifecycle card visibility is centralized in src/lib/lifecycle/visibility.ts so prior dismissal state cannot hide required workspace guidance.
- Tenant SMS API routes reuse the campaign queue and workspace API-key authentication; never add a direct carrier-send bypass because it would skip charging, compliance, and opt-out controls.
- "maintenance" announcements are operational: they bypass comm preferences and dismissal (getAnnouncements, AnnouncementBanner) and keep an un-dismissible alert.
- The admin Support copilot (src/lib/support-copilot.*, /admin/support) only executes allow-listed one-click actions after admin confirmation and re-validates them server-side, so AI output can never trigger arbitrary or refund changes.

- Admin routes share the theme-scoped admin shell and searchable grouped navigation; keep advanced tools discoverable without crowding core operations.
- The admin landing overview uses bounded operational reads, never full-history row downloads; all-time financial analysis belongs on the dedicated finance pages.
- All-time admin finance reports are served from `admin_report_cache` (src/lib/admin-report-cache.server.ts) with a short TTL and an explicit "Recalculate now"; they scan full message history and must not run on every page view.

- Support tickets (support-tickets.server.ts) are the only support channel: forms, in-app and email replies create/append tickets; closed tickets never accept replies (a reply opens a linked ticket).
- Screening rejects keyword/AI review flags; when AI review is unavailable (e.g. no AI credits) the fallback in ai-unavailable-fallback.ts decides — rule hits are blocked with the reason shown, everything else sends without admin approval, so AI outages never stop tenants; shared keyword rules stabilize recurring risky demands. No timed approval; hard categories suspend; sendMessage rechecks keywords before each carrier call. Carrier spam refusals (40002): campaigns created after the rollout cutoff with no previous attempts enroll in passive monitoring (campaign_spam_* tables, service-role-only SQL). Owner correction 2026-10-22: no initial-25/250-outstanding limits, no feedback-timeout pause — missing carrier results must not hold dispatch; keep existing throughput, concurrency, pacing and rate-limit handling. Signed final receipts pause remaining sends + notify the tenant once when >=20 distinct finalized results contain >=20% spam refusals. Paid claims go through spam_gate_claim only (live campaign/account checks, unchanged billing). No per-message monitoring RPCs or full-campaign receipt scans in dispatch. Confirmed carrier pauses never auto-resume on account-hold lift; legacy feedback-timeout pauses need a deliberate screened resume. See db-proposals/20261022-remove-carrier-feedback-delays.sql and carrier-pause-policy.test.ts.
- Receipt recovery is lookup-only, bounded to six workers with stable ID cursors; accept exact matching final receipts, try the other server-owned connection only on 404, and keep unconfirmed distinct from failure. Never resend or change balances during recovery.
- Voice rollout uses voice-rollout.server.ts verified identity gates for UI/RPC, relay and call tools; no admin bypass. Calendar is owner-only; paid activation still needs pricing, line approval and a pilot.
- Assistant actions require server-generated call-scoped tokens and active-call, ownership and pricing checks; event signatures alone do not authenticate tool requests.
- Voice uses shared pricing and allow-listed overrides. Owner-authorized transactional edits/deletion keep assistants separate; selected edits/switches require ended calls and reset pilot approval.
- Tenant owners must complete the business profile (see getMySession profileComplete) before the /app dashboard renders, and the UI shows the business name rather than "workspace".
- Calling-number monthly fees are charged by the database function charge_receptionist_number_renewals (hourly pg_cron), never an HTTP route, so a public caller can't trigger charges; failed renewals mark numbers past_due and inbound calls are refused until paid.

- Number purchases first load the carrier's live regulatory requirements for the country and type, collect them into a carrier requirement group, and attach it to the order; texting readiness comes from textingPath in src/lib/receptionist/shared.ts so the UI never promises texts before carrier verification.
- Inbound voice reuses saved instructions, server-owned transfer destinations and startup-failure cleanup; billing excludes ringing time.
- Assisted number requests atomically create tickets and debit credits; retries reuse open requests and admin completion requires the exact carrier-approved number, without bypassing SMS or pilot gates.
- Account assistant uses route-owned persisted threads and transactional, on-screen-confirmed proposals; campaigns remain drafts until the existing launch review. Website voice shares authenticated tools through a persistent relay; model output never authorizes mutations.
- Assistant campaign sending uses an in-conversation test choice and exact final review with authenticated, expiry-bound transactional queueing; reuse test SMS and normal dispatch — no auto-launch from model output, no bypassing screening/sender/credit/consent checks. Advanced media/tracking drafts keep the exact-preview flow.
- Short links use indexed destinations and context-owned tracking; dispatch uses persisted message IDs and bounded requests to avoid orphan links and timeout losses.
- Public signup CTAs use `/auth?mode=signup`.
- Signup uses the returned auth session; without one, show email confirmation rather than attempting password sign-in. Email-triggering signup requests are never automatically retried, and resend controls honor service cooldowns.
- Billing/test SMS use the acting business to avoid teammate mismatches: billing permission and separate payer; tests use business sender/profile/opt-outs/compliance, per-user quotas.
- Lifting a sending hold requeues only campaigns the hold paused (HOLD_PAUSE_FILTER, owner rule) and they are re-screened; dispatcher slots re-read live status, use status-conditional writes, and claim screening once per campaign+content (dispatch-campaign-guard.ts) so stale workers can't add abuse strikes.

- AssistantHome owns the shared conversation rail and welcome presentation for tenant/admin assistant routes; preserve existing route-owned chat and confirmation logic so design changes cannot authorize actions.
- Assistant uploads collect country and list name after file selection in a local conversation step, then call authenticated inspection; raw contact files never enter model messages and imports still need explicit opt-in confirmation.
- Account-wide assistant reads use a fixed permission-scoped area catalog and bounded projections; exact field edits use an allowlist and transactional confirmation with live membership, target locking, before-value checks and durable idempotent outcomes; unsupported consequential actions stay in existing reviewed flows.
- Assistant campaign cards resolve live account-scoped campaign state rather than saved proposal status; reports reuse campaign_report_summary aggregates after campaign permission and ownership checks, never download recipient history or infer delivery from launch.
- Assistant form design uses the design_signup_form tool and form_draft proposals confirmed through confirm_assistant_operation; forms save unpublished (never auto-publish) and restyles require the account-owned formId.
- Assistant follow-up replies receive bounded, user/account-scoped live operation status linked only by server-persisted tool outputs; this prevents historical pending proposals from contradicting confirmed saves without trusting client claims.
- Chat action cards belong once to their originating assistant turn (upload inspection uses turn metadata for presentation only); never append account-wide unmatched operations beneath the transcript, because they may belong to another conversation.
- AI design (builder "Design with AI", assistant forms, website drafts) goes through src/lib/ai-designer.server.ts with shared prompts in src/lib/builder/design-prompt.ts: one creative block output everywhere, generated pictures stored in the tenant media library.
- UK (+44) SMS without media routes through src/lib/sinch.server.ts inside sendMessage keeping screening, charging and opt-outs; its signed receipts (/api/public/sinch/webhook) feed the primary receipt handler so spam-gate and tenant webhooks stay identical. UK sender IDs need no pre-registration on that route.
- US/Canada backup SMS (src/lib/twilio-backup*.ts, /api/public/twilio/status) runs inside sendMessage only after explicit primary non-acceptance (401/402/403/503/funding), never on timeouts or carrier refusals, and only when platform_settings.twilio_backup_enabled is true — no duplicates, screening/charging/opt-outs kept.
- Dedicated toll-free lines (src/lib/twilio-lines*.ts) give each business its own Twilio subaccount; sendMessage prefers an active, paid-up line for US/Canada text, falling back to the shared route only on explicit refusal (never timeout or STOP 21610), so isolation never duplicates or bypasses checks. Monthly fees: charge_twilio_line_renewals (pg_cron), first month exactly once on request.
- International (non-US/CA/UK) SMS without media routes through src/lib/infobip.server.ts inside sendMessage; token-verified webhook (/api/public/infobip/webhook) feeds the primary receipt shape. INFOBIP_BASE_URL may redirect; apiBase() resolves once unauthenticated. Receipt lookup uses message-logs, never a resend.
