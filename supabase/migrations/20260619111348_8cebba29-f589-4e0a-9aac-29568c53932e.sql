
-- Tighten accounts column-level grants so users cannot self-update admin-only
-- fields and cannot read sensitive Twilio credentials via the Data API.

-- UPDATE: revoke table-wide, grant only safe columns
REVOKE UPDATE ON public.accounts FROM authenticated;
GRANT UPDATE (
  full_name, company, phone, avatar_url,
  auto_recharge_enabled, auto_recharge_threshold, auto_recharge_amount,
  legal_business_name, business_address, business_reg_number,
  website_url, privacy_policy_url, terms_url, contact_email,
  terms_accepted_at, monthly_volume_estimate, use_case_description,
  sample_message, opt_in_description, opt_in_screenshot_url, sms_target_countries
) ON public.accounts TO authenticated;

-- SELECT: revoke table-wide, grant only non-credential columns
REVOKE SELECT ON public.accounts FROM authenticated;
GRANT SELECT (
  id, email, full_name, company, phone, avatar_url, created_at, updated_at,
  credit_balance, auto_recharge_enabled, auto_recharge_threshold, auto_recharge_amount,
  legal_business_name, business_address, business_reg_number,
  website_url, privacy_policy_url, terms_url, contact_email,
  onboarding_status, terms_accepted_at, suspended_at,
  subaccount_phone_number, subaccount_phone_sid, subaccount_messaging_service_sid,
  monthly_volume_estimate, use_case_description, sample_message,
  opt_in_description, opt_in_screenshot_url, sms_target_countries
) ON public.accounts TO authenticated;

-- service_role keeps full access (used by server functions with supabaseAdmin)
GRANT ALL ON public.accounts TO service_role;
