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
- Screening rejects keyword/AI review flags; when AI review is unavailable (e.g. no AI credits) the shared rules fallback in ai-unavailable-fallback.ts decides (plain text sends, links/phone numbers held or blocked) so AI outages never stop tenants; shared keyword rules stabilize recurring risky demands. No timed approval; hard categories suspend; sendMessage rechecks keywords before each carrier call. Carrier spam refusals (40002): campaigns created after the rollout cutoff and with no previous attempts enroll in passive monitoring (campaign_spam_* tables and service-role-only SQL). Owner correction 2026-10-22 removes the initial-25 limit, 250-outstanding limit and feedback-timeout pause: missing carrier results must not hold normal dispatch. Keep the existing sender throughput, worker concurrency, pacing and rate-limit handling. Signed final receipts pause remaining sends + notify the tenant once when >=20 distinct finalized results contain >=20% spam refusals. Every paid claim goes through spam_gate_claim (no bare claim_campaign_messages call), with live campaign/account checks and unchanged original billing. Do not add per-message monitoring RPCs or full-campaign receipt scans to ordinary dispatch. Confirmed carrier pauses never auto-resume on account-hold lift; legacy feedback-timeout pauses require a deliberate screened resume, without waiting for a minimum number of receipts. See db-proposals/20261022-remove-carrier-feedback-delays.sql and carrier-pause-policy.test.ts.
- Receipt recovery is lookup-only, bounded to six workers with stable ID cursors; accept exact matching final receipts, try the other server-owned connection only on 404, and keep unconfirmed distinct from failure. Never resend or change balances during recovery.
- Voice rollout uses voice-rollout.server.ts verified identity gates for UI/RPC, relay and call tools; no admin bypass. Calendar is owner-only; paid activation still needs pricing, line approval and a pilot.
- Assistant actions require server-generated call-scoped tokens and active-call, ownership and pricing checks; event signatures alone do not authenticate tool requests.
- Voice uses shared pricing and allow-listed overrides. Owner-authorized transactional edits/deletion keep assistants separate; selected edits/switches require ended calls and reset pilot approval.
- Tenant owners must complete the business profile (see getMySession profileComplete) before the /app dashboard renders, and the UI shows the business name rather than "workspace".
- Calling-number monthly fees are charged by the database function charge_receptionist_number_renewals (hourly pg_cron), not an HTTP route, so a public caller can never trigger charges; failed renewals mark the number past_due and inbound calls are refused until paid.

- Number purchases first load the carrier's live regulatory requirements for the country and type, collect them into a carrier requirement group, and attach it to the order; texting readiness comes from textingPath in src/lib/receptionist/shared.ts so the UI never promises texts before carrier verification.
- Inbound voice reuses saved instructions, server-owned transfer destinations and startup-failure cleanup; billing excludes ringing time.
- Assisted number requests atomically create tickets and debit credits; retries reuse open requests and admin completion requires the exact carrier-approved number, without bypassing SMS or pilot gates.
- Account assistant uses route-owned persisted threads and transactional, on-screen-confirmed proposals; campaigns remain drafts until the existing launch review. Website voice shares authenticated tools through a persistent relay; model output never authorizes mutations.
- Assistant campaign sending uses an in-conversation test choice and exact final review with authenticated, expiry-bound transactional queueing; reuse test SMS and normal dispatch, never auto-launch from model output or bypass screening, sender, credit or consent checks. Advanced media/tracking drafts retain the builder's exact-preview flow.
- Short links use indexed destinations and context-owned tracking; dispatch uses persisted message IDs and bounded requests to avoid orphan links and timeout losses.
- Public signup CTAs use `/auth?mode=signup`.
- Signup uses the returned auth session; without one, show email confirmation rather than attempting password sign-in. Email-triggering signup requests are never automatically retried, and resend controls honor service cooldowns.
- Billing/test SMS use the acting business to avoid teammate mismatches: billing permission and separate payer; tests use business sender/profile/opt-outs/compliance, per-user quotas.
- Lifting a sending hold requeues only campaigns that hold paused (HOLD_PAUSE_FILTER, owner rule) and they are re-screened; dispatcher slots re-read live status, use status-conditional writes, and claim screening once per campaign+content (dispatch-campaign-guard.ts) so stale workers can't add abuse strikes.

- AssistantHome owns the shared conversation rail and welcome presentation for tenant/admin assistant routes; preserve existing route-owned chat and confirmation logic so design changes cannot authorize actions.
- Assistant uploads collect country and list name after file selection in a local conversation step, then call authenticated inspection; raw contact files never enter model messages and imports still need explicit opt-in confirmation.
- Account-wide assistant reads use a fixed permission-scoped area catalog and bounded projections; exact field edits use an allowlist and transactional confirmation with live membership, target locking, before-value checks and durable idempotent outcomes. Unsupported consequential actions stay in their existing reviewed flows.
- Assistant campaign cards resolve live account-scoped campaign state rather than saved proposal status; reports reuse campaign_report_summary aggregates after campaign permission and ownership checks, never download recipient history or infer delivery from launch.
- Assistant form design uses the design_signup_form tool and form_draft proposals confirmed through confirm_assistant_operation; forms save unpublished (never auto-publish) and restyles require the account-owned formId.
- Assistant follow-up replies receive bounded, user/account-scoped live operation status linked only by server-persisted tool outputs; this prevents historical pending proposals from contradicting confirmed saves without trusting client claims.
- Chat action cards belong once to their originating assistant turn (upload inspection uses turn metadata for presentation only); never append account-wide unmatched operations beneath the transcript, because they may belong to another conversation.
- AI design (builder "Design with AI", assistant forms and website drafts) goes through src/lib/ai-designer.server.ts with shared prompts in src/lib/builder/design-prompt.ts, so every surface gets the same creative block output and generated pictures stored in the tenant media library.
