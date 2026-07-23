
DO $$
DECLARE
  v_account uuid := '73d366b2-d9e0-4fb3-8635-a3707505ced0';
  v_refund numeric := 59.32;
  v_new_balance numeric;
BEGIN
  UPDATE public.accounts
     SET credit_balance = credit_balance + v_refund,
         updated_at = now()
   WHERE id = v_account
  RETURNING credit_balance INTO v_new_balance;

  INSERT INTO public.credit_transactions (account_id, type, amount, balance_after, description)
  VALUES (
    v_account,
    'topup',
    v_refund,
    v_new_balance,
    'MMS pricing adjustment refund: recalculated at $0.04 per MMS. Refund of $0.008 × 7415 successful MMS = $59.32.'
  );
END $$;
