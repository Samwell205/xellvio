## What's actually wrong

Your Cloud instance isn't out of storage (disk 6% used, memory 22%, connections low). It's out of **disk read/write budget** — too many heavy reads per minute. The database health and slow-query data point at one clear source: the **campaign report page**.

Confirmed from the slow-query stats:

| Query | Calls | Avg time | Total time |
|---|---|---|---|
| Campaign messages + contact join (full download) | 11,588 | 1,570 ms | 5.0 hours |
| Same query, second variant | 6,313 | 1,437 ms | 2.5 hours |
| Per-status count on a campaign | 30,697 | 74 ms | 38 min |
| Multi-status count on a campaign | 19,925 | 86 ms | 28 min |

Together that's ~8 hours of pure database work — nearly all of the IO budget.

Why: `src/routes/_authenticated.app.campaigns.$id.tsx` downloads **every message row of the campaign** (up to 50,000 rows, 1,000 per request, each joined to the contacts table) and **re-downloads all of it every 30 seconds**, plus 8 separate counting queries every 15 seconds, plus a failures query and an events query. A single open report tab on a 8,000-message campaign is ~10 heavy queries per minute forever. Several tenants with tabs open saturates the disk.

The indexes are already in place — this is query volume and payload size, not missing indexes.

## The fix

1. **One aggregate function instead of eight count queries**
   Add a database function `campaign_report_summary(campaign_id)` that returns all status counts, per-country totals, cost/segment sums, and the failure breakdown in a single indexed pass. Replaces the progress query (8 round-trips), the failures query, and all the client-side aggregation currently done over 50k downloaded rows.

2. **Stop downloading all messages**
   The recipient table becomes server-paged: 100 rows per page with real pagination, filtered server-side by status/search. Stats come from the function in step 1, so no page ever needs the full row set. Exports keep working by streaming rows only when the user clicks Export.

3. **Cut the polling rate and stop polling dead campaigns**
   - Poll only while the campaign is actively sending (status `sending`/`queued`); completed campaigns poll not at all.
   - Active polling: summary every 20s, recipient page never auto-polls.
   - Pause all polling when the browser tab is hidden.

4. **Same treatment for the admin campaign page** (`_authenticated.admin.campaigns.$id.tsx`) and the tenant report page, which repeat the pattern at 20s/15s.

5. **Verify** with `EXPLAIN (ANALYZE, BUFFERS)` on the new function and re-check the slow-query ranking after deploy to confirm the messages query has dropped out of the top spots.

Expected effect: per-report database work drops from roughly 50,000 joined rows per 30 s to a few hundred rows plus one aggregate — on the order of a 50–100x reduction in read volume for that page. That should bring IO back well under budget without upgrading the instance.

## Also worth noting

The database shows **423,268 rolled-back transactions** since boot. That's high and usually means a hot code path is repeatedly failing (a constraint conflict or permission error in the dispatcher/webhook). I'd like to check the Postgres logs for the recurring error as part of this work — failed transactions still burn IO.

## Technical detail

- New migration: `public.campaign_report_summary(p_campaign_id uuid)` — `security definer`, `search_path = public`, ownership checked against the caller's account (or `has_role(auth.uid(),'admin')`), `GRANT EXECUTE TO authenticated`.
- Existing indexes `messages_campaign_status_idx` and `messages_campaign_created_idx` cover both the aggregate scan and the paged reads; no new indexes needed.
- Client changes are confined to the three route files plus a small shared `useCampaignSummary` hook; realtime subscriptions stay as they are and simply invalidate the summary query.
- No pricing, billing, or dispatch logic is touched.
