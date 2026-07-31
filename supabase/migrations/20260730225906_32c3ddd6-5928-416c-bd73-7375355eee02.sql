UPDATE public.accounts
SET gorgias_api_key_enc = NULL,
    gorgias_enabled = false
WHERE gorgias_api_key_enc IS NOT NULL;