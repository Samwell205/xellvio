import { cachedReport } from './admin-report-cache.server';

export async function financeTenantReport(refresh = false) {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  return cachedReport('finance_tenants', async () => {
    const { data, error } = await (supabaseAdmin as any).rpc('admin_finance_tenants');
    if (error) throw new Error(error.message);
    return (data ?? []) as any[];
  }, { refresh, allowStale: true });
}