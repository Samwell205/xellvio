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

- International card payments use Flutterwave server-side (src/lib/flw.server.ts, webhook /api/public/card/webhook, refs icp_); never name the provider in UI — owner requirement.
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
- All sending uses each tenant's original profile and sender (src/lib/telnyx-connection.ts routeOutbound is pass-through); the past failover window is kept only so delivery lookups for messages sent then use the additional connection.
- Additional messaging connections route by server-owned messaging profile IDs in src/lib/telnyx-connection.ts, with matching webhook keys and workspace-scoped sender assets; never replace the default credential or automatically resume old campaigns when activating a connection.
- Receptionist data uses authenticated, workspace-scoped server functions; calendar credentials are encrypted per owner and paid activation requires verified pricing, phone configuration and a pilot call, so setup cannot silently enable untested billable traffic.
- Receptionist calendar keys use the workspace owner's auth ID (the account ID in this application's identity model); only owners can connect, book or disconnect, so teammate sessions cannot replace workspace credentials.
- Receptionist assistant actions authenticate with a server-generated call-scoped token and recheck active-call, workspace and pricing gates; event signatures are not assumed to authenticate assistant tool requests.
