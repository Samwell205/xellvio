
REVOKE EXECUTE ON FUNCTION public.credit_seller(uuid, numeric, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.debit_seller_withdrawal(uuid, numeric, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_seller(uuid, numeric, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.debit_seller_withdrawal(uuid, numeric, uuid, text) TO service_role;
