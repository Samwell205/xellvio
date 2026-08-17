# Sending 100k SMS in one campaign

## Short answer

Send it as **one campaign**. Do not split it into chunks manually — the platform already
paces sending per tenant and per carrier rules, and splitting only makes the reports harder
to read (you'd get 10 separate delivery rates instead of one). Splitting does not make
anything faster, because the speed limit is the dispatcher, not the campaign size.

## What the speed limit actually is today

Confirmed from the dispatcher and the scheduler:

- The scheduler fires the send worker 4 times per minute (verified: 4 active dispatch jobs).
- Each worker run has a 40-second budget and claims up to 480 recipients per campaign.
- After yesterday's fix, each campaign holds one lease at a time, so two workers never send
  for the same campaign at once — and campaigns inside a single run are processed one after
  another, not side by side.

Net effect for a single big campaign: roughly 500-1,900 messages per minute, so 100k takes
between about **1 and 3.5 hours**. That matches what you saw on FLORIDA.

## What to change so 100k goes out in ~30-40 minutes

1. **Shard the campaign lease.** Instead of one lease per campaign, use a small fixed number
   of lease slots per campaign (4). Four workers can then send for the same campaign at the
   same time, while message claiming stays atomic so nobody sends a recipient twice.
2. **Process campaigns side by side inside one run.** Today a run walks its campaign list
   sequentially, so a run that spends its whole 40s budget on the first campaign never
   reaches the others. Run a bounded number of campaigns concurrently per invocation.
3. **Raise the per-tenant tick allowance to match the new parallelism**, keeping the same
   carrier-safe submission rate per sender type (toll-free stays highest, shared toll-free
   and personal numbers stay slow, MMS stays paced at its current low rate — MMS is the one
   thing carriers will block if pushed).
4. **Keep claim sizes matched to what a worker can finish** so nothing is left stranded and
   written off as a timeout — this is what produced the old `dispatch_timeout` failures.
5. **Verify with a real run**: send a test batch, then check that claimed = sent for each
   tick and that no messages sit in `sending` past the sweep window.

## Will every message deliver?

Every message will reach a final state — delivered or failed with a reason. But no platform
can promise 100% delivery on a 100k list, and it's honest to plan for that:

- Landlines and unroutable numbers are rejected by carriers (we now cache and skip known
  ones, so the same bad numbers don't burn spend twice).
- Carrier spam filtering (error 40008) rejects some traffic, especially picture messages and
  bursty first-time sends from a new number.
- Deliverability depends on your list quality and content wording as much as on throughput.

For a 100k send, expect the bulk to deliver within the window above, with a failure tail you
can inspect and selectively retry from the campaign report.

## Before you press send on 100k

- Make sure the account balance covers the full estimate — a mid-campaign shortfall halts
  sending and leaves the rest queued.
- Use a verified toll-free (or 10DLC) sender; shared and personal numbers are intentionally
  throttled much lower.
- Keep it as SMS if you can. MMS is paced roughly 4x slower and filtered far more heavily.

## Technical notes

Files touched: `src/routes/api.public.dispatch-campaign.ts` (lease sharding, concurrent
campaign processing inside a run, throttle table). One migration to accept sharded lease
names in the dispatch-lock helpers. No changes to pricing, billing, or reporting.
