CREATE INDEX IF NOT EXISTS messages_campaign_created_idx
  ON public.messages (campaign_id, created_at DESC);

CREATE INDEX IF NOT EXISTS messages_phone_created_idx
  ON public.messages (phone_e164, created_at DESC);

CREATE INDEX IF NOT EXISTS messages_phone_sender_created_idx
  ON public.messages (phone_e164, sender_used, created_at DESC)
  WHERE sender_used IS NOT NULL;

CREATE INDEX IF NOT EXISTS sms_thread_messages_account_direction_created_idx
  ON public.sms_thread_messages (account_id, direction, created_at DESC);

CREATE INDEX IF NOT EXISTS sms_thread_messages_phone_direction_created_idx
  ON public.sms_thread_messages (phone_e164, direction, created_at DESC);

CREATE INDEX IF NOT EXISTS sms_thread_messages_provider_sid_idx
  ON public.sms_thread_messages (provider_sid)
  WHERE provider_sid IS NOT NULL;

CREATE INDEX IF NOT EXISTS profiles_account_created_idx
  ON public.profiles (account_id, created_at DESC);

CREATE INDEX IF NOT EXISTS profile_list_members_list_profile_idx
  ON public.profile_list_members (list_id, profile_id);

CREATE INDEX IF NOT EXISTS consents_profile_channel_idx
  ON public.consents (profile_id, channel);

CREATE INDEX IF NOT EXISTS suppressions_account_phone_idx
  ON public.suppressions (account_id, phone_e164);