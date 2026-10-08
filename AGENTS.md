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
