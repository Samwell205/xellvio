
CREATE TABLE public.contact_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL,
  topic text NOT NULL DEFAULT 'General question',
  message text NOT NULL,
  status text NOT NULL DEFAULT 'new',
  user_agent text,
  ip text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT INSERT ON public.contact_messages TO anon, authenticated;
GRANT SELECT, UPDATE, DELETE ON public.contact_messages TO authenticated;
GRANT ALL ON public.contact_messages TO service_role;

ALTER TABLE public.contact_messages ENABLE ROW LEVEL SECURITY;

-- Anyone can submit a message (public contact form)
CREATE POLICY "anyone can submit a contact message"
ON public.contact_messages
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- Only admins can read/update/delete
CREATE POLICY "admins read contact messages"
ON public.contact_messages
FOR SELECT
TO authenticated
USING (public.has_role('admin'));

CREATE POLICY "admins update contact messages"
ON public.contact_messages
FOR UPDATE
TO authenticated
USING (public.has_role('admin'))
WITH CHECK (public.has_role('admin'));

CREATE POLICY "admins delete contact messages"
ON public.contact_messages
FOR DELETE
TO authenticated
USING (public.has_role('admin'));

CREATE TRIGGER trg_contact_messages_updated_at
BEFORE UPDATE ON public.contact_messages
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
