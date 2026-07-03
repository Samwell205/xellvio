CREATE OR REPLACE FUNCTION public.topup_account(_account_id uuid, _amount numeric, _description text)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  new_balance NUMERIC;
  due_cents INTEGER;
  fee_amount NUMERIC;
  after_fee NUMERIC;
BEGIN
  UPDATE public.accounts SET credit_balance = credit_balance + _amount
    WHERE id = _account_id
    RETURNING credit_balance, tollfree_setup_fee_due_cents INTO new_balance, due_cents;
  IF new_balance IS NULL THEN RAISE EXCEPTION 'Account not found'; END IF;
  INSERT INTO public.credit_transactions(account_id, type, amount, balance_after, description)
    VALUES (_account_id, 'topup', _amount, new_balance, _description);

  -- Auto-settle any deferred toll-free setup fee
  IF COALESCE(due_cents, 0) > 0 THEN
    fee_amount := due_cents::numeric / 100.0;
    IF new_balance >= fee_amount THEN
      UPDATE public.accounts
        SET credit_balance = credit_balance - fee_amount,
            tollfree_setup_fee_due_cents = 0,
            tollfree_setup_fee_paid_at = COALESCE(tollfree_setup_fee_paid_at, now())
        WHERE id = _account_id
        RETURNING credit_balance INTO after_fee;
      INSERT INTO public.credit_transactions(account_id, type, amount, balance_after, description)
        VALUES (_account_id, 'debit', fee_amount, after_fee, 'Toll-free verification setup fee (deferred)');
      new_balance := after_fee;
    END IF;
  END IF;

  RETURN new_balance;
END;
$function$;