-- ============================================================
-- Xellvio migration — Phase 2, step 1
-- Run this FIRST on your new Supabase project (SQL editor or psql).
-- Creates the extensions and schemas the baseline schema depends on.
-- ============================================================

create extension if not exists "pgcrypto"  with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;
create extension if not exists "pg_net"    with schema extensions;
create extension if not exists "pg_cron";
create extension if not exists "pgmq";

-- The baseline references these; Supabase ships them, this is just a guard.
create schema if not exists extensions;
create schema if not exists vault;

-- Message queues used by the transactional/auth email pipeline.
select pgmq.create('auth_emails')          where not exists (select 1 from pgmq.list_queues() q where q.queue_name = 'auth_emails');
select pgmq.create('transactional_emails') where not exists (select 1 from pgmq.list_queues() q where q.queue_name = 'transactional_emails');
