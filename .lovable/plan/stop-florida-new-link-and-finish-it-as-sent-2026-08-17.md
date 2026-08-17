# Stop "FLORIDA New Link" and finish it as Sent

Current state (checked just now): campaign `FLORIDA New Link` is still `sending`. Messages already created: 21,151 delivered, 16,478 sent, 1,585 undelivered, 60,286 failed. No queued/pending rows remain — the dispatcher is still planning more of the ~108k audience, which is why it keeps going.

## What to do

1. Stop further sending for this campaign only: set its status to `sent` (not `cancelled`) and mark it as finalized so the planner/dispatcher will not queue any more recipients or revive it.
2. Leave every existing message row untouched — delivered, sent, undelivered and failed counts, failure-code breakdown, link activity, cost and spend all stay exactly as they are now.
3. No refunds, no balance changes, no message status rewrites.
4. The report page will show status "Sent" with the same numbers, and the live "sending · N left" progress banner will disappear.

## Reusable control (small addition)

Add a "Stop and mark as sent" action next to "Cancel campaign" on the campaign report, so any in-flight campaign can be halted this way in future: it stops planning/dispatch, keeps the report as-is, and shows Sent instead of Cancelled. The existing "Cancel campaign" behaviour (which flags remaining rows as `cancelled_by_user`) stays unchanged.

## Technical notes

- New server fn `stopCampaignAsSent` in `src/lib/campaign-control.functions.ts`: guards on account/RLS, sets `campaigns.status = 'sent'` plus the finalized marker used by `finalizeIfComplete`, and does not touch `messages`.
- `src/routes/api.public.dispatch-campaign.ts`: ensure the revival path skips campaigns finalized this way, so it does not put unplanned recipients back in the queue.
- `src/routes/_authenticated.app.campaigns.$id.tsx`: add the button + confirm popover; reuse the existing progress/report rendering.
- Then apply it once to `b74aadaf-24b7-4dfa-b448-4c1e9f96528d`.
