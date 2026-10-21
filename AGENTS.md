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
- Announcements of kind "maintenance" are operational notices, not product news: they must always reach every workspace, so they bypass communication preferences and dismissal (src/lib/lifecycle.functions.ts getAnnouncements, src/components/lifecycle/AnnouncementBanner.tsx). Keep the banner's un-dismissible alert for them.
- The admin Support copilot (src/lib/support-copilot.*, /admin/support) only executes allow-listed one-click actions after admin confirmation and re-validates them server-side, so AI output can never trigger arbitrary or refund changes.

- Admin routes share the theme-scoped admin shell and searchable grouped navigation; keep advanced tools discoverable without crowding core operations.
- The admin landing overview uses bounded operational reads, never full-history row downloads; all-time financial analysis belongs on the dedicated finance pages.
- All-time admin finance reports are served from `admin_report_cache` (src/lib/admin-report-cache.server.ts) with a short TTL and an explicit "Recalculate now"; they scan full message history and must not run on every page view.

- Support tickets (src/lib/support-tickets.server.ts, /admin/tickets, /app/support, /support/t/$token) are the only support channel: contact-form submissions, in-app requests and inbound email replies all create or append to tickets; closed tickets never accept replies (a reply opens a new linked ticket) so every conversation has one clear lifecycle.
- Content screening fails closed: any content-rule or AI flag blocks (never time-based auto-approval), hard categories suspend the workspace, and sendMessage re-runs the keyword scan before every carrier call so no send path can skip it.
- Sending preserves each tenant's profile/sender; additional connections use server-owned profile IDs and matching webhook keys. Never replace default credentials or resume old campaigns automatically.
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
- Short links use indexed destinations and context-owned tracking; dispatch uses persisted message IDs and bounded requests to avoid orphan links and timeout losses.
- Public signup CTAs use `/auth?mode=signup`.
- Billing/test SMS use the acting business to avoid teammate mismatches: billing permission and separate payer; tests use business sender/profile/opt-outs/compliance, per-user quotas.
