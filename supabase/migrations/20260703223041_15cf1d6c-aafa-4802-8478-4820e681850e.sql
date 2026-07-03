
ALTER TABLE public.sender_assets DROP CONSTRAINT IF EXISTS sender_assets_verification_status_check;
ALTER TABLE public.sender_assets ADD CONSTRAINT sender_assets_verification_status_check
  CHECK (verification_status IN ('pending','submitted','verified','rejected','requires_registration'));

UPDATE public.sender_assets
SET verification_status = 'requires_registration'
WHERE sender_kind = 'sender_id'
  AND verification_status = 'verified'
  AND country_code IN ('US','CA','NG','IN','CN','SA','AE','QA','KW','BH','OM','EG','TR','PH','VN','TH','ID','MY','BD','PK','LK','MA','DZ','TN');
