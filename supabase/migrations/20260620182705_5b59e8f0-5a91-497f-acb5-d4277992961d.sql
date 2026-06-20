update public.credit_packs set is_active = false where currency = 'USD' and price > 500;
grant select on public.credit_packs to anon;