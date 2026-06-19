
-- Attach existing guard triggers
DROP TRIGGER IF EXISTS accounts_block_sensitive_self_update ON public.accounts;
CREATE TRIGGER accounts_block_sensitive_self_update
  BEFORE UPDATE ON public.accounts
  FOR EACH ROW EXECUTE FUNCTION public.accounts_block_sensitive_self_update();

DROP TRIGGER IF EXISTS sender_assets_block_tenant_carrier_writes ON public.sender_assets;
CREATE TRIGGER sender_assets_block_tenant_carrier_writes
  BEFORE UPDATE ON public.sender_assets
  FOR EACH ROW EXECUTE FUNCTION public.sender_assets_block_tenant_carrier_writes();

-- Pin status='pending' on tenant INSERT for number_requests
DROP POLICY IF EXISTS "Users create own number requests" ON public.number_requests;
CREATE POLICY "Users create own number requests"
  ON public.number_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (
    account_id = auth.uid()
    AND requested_by = auth.uid()
    AND status = 'pending'::number_request_status
  );

-- Pin status='pending' on tenant INSERT for payments
DROP POLICY IF EXISTS "tenant creates own payments" ON public.payments;
CREATE POLICY "tenant creates own payments"
  ON public.payments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    account_id = auth.uid()
    AND status = 'pending'
  );
