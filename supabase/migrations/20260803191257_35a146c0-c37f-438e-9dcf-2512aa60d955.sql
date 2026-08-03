DO $block$
DECLARE
  fn_sql text;
BEGIN
  SELECT pg_get_functiondef(p.oid)
  INTO fn_sql
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'claim_campaign_messages'
    AND pg_get_function_identity_arguments(p.oid) = '_campaign_id uuid, _limit integer';

  IF fn_sql IS NULL THEN
    RAISE EXCEPTION 'claim_campaign_messages(uuid, integer) was not found';
  END IF;

  fn_sql := replace(
    fn_sql,
    'LIMIT GREATEST(0, _limit)',
    'LIMIT LEAST(48, GREATEST(0, _limit))'
  );

  IF position('LIMIT LEAST(48, GREATEST(0, _limit))' in fn_sql) = 0 THEN
    RAISE EXCEPTION 'Could not apply the dispatcher claim safety cap';
  END IF;

  EXECUTE fn_sql;
END;
$block$;