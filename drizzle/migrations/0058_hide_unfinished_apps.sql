ALTER TABLE public.apps DISABLE TRIGGER apps_block_self_publish;
UPDATE public.apps SET status = 'draft'
WHERE status = 'published'
  AND slug NOT IN ('shopify','woocommerce','bigcommerce','stripe','paystack','hubspot','klaviyo','activecampaign','brevo','pipedrive','gohighlevel','intercom');
ALTER TABLE public.apps ENABLE TRIGGER apps_block_self_publish;