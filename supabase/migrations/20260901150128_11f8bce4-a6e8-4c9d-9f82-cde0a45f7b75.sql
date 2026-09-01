CREATE INDEX IF NOT EXISTS profiles_phone_e164_idx ON public.profiles USING btree (phone_e164);
CREATE INDEX IF NOT EXISTS messages_created_at_idx ON public.messages USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS messages_status_created_idx ON public.messages USING btree (status, created_at DESC);
ANALYZE public.profiles;
ANALYZE public.messages;