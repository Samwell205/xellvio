-- An MMS is one billable message with an attachment: no SMS segments, and the
-- price is rate x MMS multiplier (never multiplied by segment count).
UPDATE public.messages m
SET segments_count = 1,
    cost = ROUND(r.sell_price * r.mms_multiplier, 4)
FROM public.country_rates r
WHERE m.is_mms = true
  AND r.country_code = m.country_code
  AND (m.segments_count <> 1 OR m.cost <> ROUND(r.sell_price * r.mms_multiplier, 4));