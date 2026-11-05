INSERT INTO public.country_rates (country_code,country_name,dial_prefix,cost_price,passthrough_fee,sell_price,markup_percent,manual_override,mms_multiplier,mms_cost_multiplier,sender_supports_inbound,active)
VALUES ('PR','Puerto Rico','+1787',0.034,0,0.048,41,true,3,2.37,true,true)
ON CONFLICT (country_code) DO UPDATE SET cost_price=0.034, sell_price=0.048, manual_override=true, active=true, updated_at=now();

INSERT INTO public.lifecycle_announcements (title, body, kind, channels, published_at)
VALUES (
  'SMS pricing update: Puerto Rico',
  'Puerto Rico numbers (area codes 787 and 939) are now priced separately from the United States. Texts to Puerto Rico now cost $0.048 per message ($48 per 1,000). Texts to the United States stay at $0.0155 per message ($15.50 per 1,000). Your campaign review will show the exact cost before you send.',
  'feature', ARRAY['in_app','email'], now()
);