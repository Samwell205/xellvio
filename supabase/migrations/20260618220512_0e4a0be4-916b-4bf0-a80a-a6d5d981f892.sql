
-- Refresh credit packs with a wider set of plans and realistic NGN/USD conversion (~₦1,550 / $1).
-- Deactivate old defaults first, then upsert a comprehensive ladder.
UPDATE public.credit_packs SET is_active = false;

INSERT INTO public.credit_packs (name, description, currency, price, credits, display_order, is_popular, is_active) VALUES
  -- USD packs (credits == USD value)
  ('Starter USD',       'Great for testing',          'USD',     5,      5,     10, false, true),
  ('Basic USD',         'Light monthly sending',      'USD',    10,     10,     11, false, true),
  ('Growth USD',        'Most popular for SMBs',      'USD',    25,     25,     12, true,  true),
  ('Pro USD',           'Active campaigns',           'USD',    50,     50,     13, false, true),
  ('Scale USD',         'High-volume senders',        'USD',   100,    100,     14, false, true),
  ('Business USD',      'Multi-country programs',     'USD',   250,    250,     15, false, true),
  ('Enterprise USD',    'Large monthly volume',       'USD',   500,    500,     16, false, true),
  ('Enterprise+ USD',   'Bulk credits, best value',   'USD',  1000,   1050,     17, false, true),

  -- NGN packs — priced at ~₦1,550 / $1 so credits stay in USD for accurate sending math
  ('Starter NGN',       'Great for testing',          'NGN',   7750,      5,    20, false, true),
  ('Basic NGN',         'Light monthly sending',      'NGN',  15500,     10,    21, false, true),
  ('Growth NGN',        'Most popular for SMBs',      'NGN',  38750,     25,    22, true,  true),
  ('Pro NGN',           'Active campaigns',           'NGN',  77500,     50,    23, false, true),
  ('Scale NGN',         'High-volume senders',        'NGN', 155000,    100,    24, false, true),
  ('Business NGN',      'Multi-country programs',     'NGN', 387500,    250,    25, false, true),
  ('Enterprise NGN',    'Large monthly volume',       'NGN', 775000,    500,    26, false, true),
  ('Enterprise+ NGN',   'Bulk credits, best value',   'NGN',1550000,   1050,    27, false, true);
