-- ============================================================
-- Xellvio migration — verification
-- Run on BOTH the old and the new database and diff the output.
-- ============================================================

\echo '--- row counts per table ---'
select relname as table_name, n_live_tup as rows
from pg_stat_user_tables
where schemaname = 'public'
order by relname;

\echo '--- exact counts for the financially critical tables ---'
select 'accounts'            as t, count(*) from public.accounts
union all select 'payments',            count(*) from public.payments
union all select 'credit_transactions', count(*) from public.credit_transactions
union all select 'seller_ledger',       count(*) from public.seller_ledger
union all select 'messages',            count(*) from public.messages
union all select 'message_send_attempts', count(*) from public.message_send_attempts
union all select 'verifier_transactions', count(*) from public.verifier_transactions
union all select 'verifier_wallets',    count(*) from public.verifier_wallets
union all select 'withdrawal_requests', count(*) from public.withdrawal_requests
order by 1;

\echo '--- balance totals (must match to the cent) ---'
select
  round(sum(credit_balance), 4)           as total_credit_balance,
  round(sum(seller_balance), 4)           as total_seller_balance,
  round(sum(seller_lifetime_earnings), 4) as total_seller_lifetime,
  sum(tollfree_setup_fee_due_cents)       as total_tf_fee_due_cents
from public.accounts;

\echo '--- ledger totals ---'
select type, count(*) as n, round(sum(amount), 4) as total
from public.credit_transactions group by type order by type;

\echo '--- per-account balance vs ledger drift (should be empty) ---'
select a.id, a.email,
       round(a.credit_balance, 4) as balance,
       round(coalesce(l.net, 0), 4) as ledger_net
from public.accounts a
left join (
  select account_id,
         sum(case when type in ('topup','refund') then amount else -amount end) as net
  from public.credit_transactions group by account_id
) l on l.account_id = a.id
where round(a.credit_balance, 4) is distinct from round(coalesce(l.net, 0), 4);

\echo '--- schema object counts ---'
select 'tables' as kind, count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE'
union all select 'enums',     count(*) from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname='public' and t.typtype='e'
union all select 'functions', count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
union all select 'policies',  count(*) from pg_policies where schemaname='public'
union all select 'triggers',  count(*) from pg_trigger where not tgisinternal
union all select 'indexes',   count(*) from pg_indexes where schemaname='public'
order by 1;

\echo '--- tables missing RLS (should be empty) ---'
select c.relname
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind='r' and not c.relrowsecurity
order by 1;

\echo '--- tables with no grants to authenticated (should be empty) ---'
select c.relname
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind='r'
  and not has_table_privilege('authenticated', c.oid, 'SELECT')
order by 1;

\echo '--- billing functions present (all must return true) ---'
select p.proname, true as exists
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in ('debit_account','topup_account','claim_campaign_messages',
                    'credit_seller','debit_seller_withdrawal','has_role',
                    'has_account_access','is_admin_or_service','get_acting_account_id',
                    'eligible_profile_ids','campaign_report_summary')
order by 1;
