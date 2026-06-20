WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY account_id, country_code, sender_kind
      ORDER BY
        (verification_sid IS NOT NULL) DESC,
        (phone_sid IS NOT NULL) DESC,
        created_at DESC,
        id DESC
    ) AS rn
  FROM public.sender_assets
)
DELETE FROM public.sender_assets sa
USING ranked r
WHERE sa.id = r.id
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS sender_assets_one_per_kind_idx
ON public.sender_assets(account_id, country_code, sender_kind);