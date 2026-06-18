ALTER TABLE public.campaigns DROP CONSTRAINT IF EXISTS campaigns_status_check;
ALTER TABLE public.campaigns ADD CONSTRAINT campaigns_status_check CHECK (status IN ('draft','queued','scheduled','sending','sent','paused','cancelled','failed'));

ALTER TABLE public.campaigns DROP CONSTRAINT IF EXISTS campaigns_send_mode_check;
ALTER TABLE public.campaigns ADD CONSTRAINT campaigns_send_mode_check CHECK (send_mode IN ('immediate','now','scheduled','smart'));

ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_status_check;
ALTER TABLE public.messages ADD CONSTRAINT messages_status_check CHECK (status IN ('pending','queued','sending','sent','delivered','failed','undelivered'));

ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_type_check;
ALTER TABLE public.events ADD CONSTRAINT events_type_check CHECK (type ~ '^[a-z0-9_:-]+$');