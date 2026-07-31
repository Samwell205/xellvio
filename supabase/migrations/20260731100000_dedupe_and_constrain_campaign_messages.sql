-- The new batched campaign dispatcher (this session) found a real bug: its
-- in-memory "already planned" exclusion set could be silently treated as
-- empty if the underlying query ever failed without being checked for an
-- error, causing the same recipient to be re-planned (and would eventually
-- be re-charged/re-sent) on a later tick. Application-side, that's now
-- fixed to fail loudly instead of silently. This migration adds the actual
-- guarantee: a recipient can never have more than one message row per
-- campaign, enforced by the database, regardless of any future
-- application-level bug in the exclusion logic.

-- Clean up existing duplicates first (ALTER TABLE ADD CONSTRAINT will fail
-- otherwise). Only touch (campaign_id, profile_id) pairs where every
-- duplicate row is still 'queued' — i.e. never delivered, never charged,
-- claim_campaign_messages never ran for them — so keeping the earliest row
-- and deleting the rest is provably safe: no send or charge is ever lost.
-- Any pair with a row past 'queued' is left alone entirely, on purpose.
WITH dup_pairs AS (
  SELECT campaign_id, profile_id
  FROM public.messages
  WHERE profile_id IS NOT NULL
  GROUP BY campaign_id, profile_id
  HAVING COUNT(*) > 1 AND bool_and(status = 'queued')
),
ranked AS (
  SELECT m.id,
         ROW_NUMBER() OVER (PARTITION BY m.campaign_id, m.profile_id ORDER BY m.created_at ASC) AS rn
  FROM public.messages m
  JOIN dup_pairs dp ON dp.campaign_id = m.campaign_id AND dp.profile_id = m.profile_id
)
DELETE FROM public.messages
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

ALTER TABLE public.messages
  ADD CONSTRAINT messages_campaign_profile_unique UNIQUE (campaign_id, profile_id);
