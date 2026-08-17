CREATE OR REPLACE FUNCTION public.apply_message_status_batch(_rows jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n integer := 0;
BEGIN
  WITH src AS (
    SELECT
      (r->>'id')::uuid AS id,
      r->>'status' AS status,
      r->>'provider_message_id' AS provider_message_id,
      NULLIF(r->>'sent_at','')::timestamptz AS sent_at,
      NULLIF(r->>'segments_count','')::int AS segments_count,
      r->>'sender_used' AS sender_used,
      r->>'sender_kind' AS sender_kind,
      r->>'error_code' AS error_code,
      r->>'failure_reason' AS failure_reason
    FROM jsonb_array_elements(_rows) AS r
  ), upd AS (
    UPDATE public.messages m
    SET status = s.status,
        provider_message_id = COALESCE(s.provider_message_id, m.provider_message_id),
        sent_at = COALESCE(s.sent_at, m.sent_at),
        segments_count = COALESCE(s.segments_count, m.segments_count),
        sender_used = COALESCE(s.sender_used, m.sender_used),
        sender_kind = COALESCE(s.sender_kind, m.sender_kind),
        error_code = s.error_code,
        failure_reason = s.failure_reason
    FROM src s
    WHERE m.id = s.id
    RETURNING m.id
  )
  SELECT count(*) INTO n FROM upd;
  RETURN n;
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_message_status_batch(jsonb) TO service_role;
