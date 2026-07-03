
-- Clean up stale Twilio identifiers so Telnyx sends stop passing MG/AC/PN SIDs.

-- 1. Delete legacy Twilio toll-free asset rows (Option A: clean slate).
DELETE FROM public.sender_assets
WHERE sender_kind = 'toll_free'
  AND (
    phone_sid LIKE 'PN%'
    OR messaging_service_sid LIKE 'MG%'
    OR telnyx_phone_number_id IS NULL
  );

-- 2. Null out Twilio-shaped messaging_service_sid on remaining assets so the
--    code auto-provisions/uses a Telnyx messaging profile instead.
UPDATE public.sender_assets
SET messaging_service_sid = NULL
WHERE messaging_service_sid LIKE 'MG%'
   OR messaging_service_sid LIKE 'AC%';

UPDATE public.sender_assets
SET phone_sid = NULL
WHERE phone_sid LIKE 'PN%';

-- 3. Clear stale Twilio subaccount SIDs off accounts so ensureMessagingProfile
--    provisions a fresh Telnyx profile.
UPDATE public.accounts
SET twilio_subaccount_sid = NULL
WHERE twilio_subaccount_sid LIKE 'AC%'
   OR twilio_subaccount_sid LIKE 'MG%';

-- 4. Clear any telnyx_messaging_profile_id that isn't a valid UUID.
UPDATE public.accounts
SET telnyx_messaging_profile_id = NULL
WHERE telnyx_messaging_profile_id IS NOT NULL
  AND telnyx_messaging_profile_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
