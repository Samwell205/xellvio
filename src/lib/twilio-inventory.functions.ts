import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { z } from 'zod';
async function authorize(context: { supabase: any }) {
  const { data, error } = await context.supabase.rpc('has_role', { _role: 'admin' });
  if (error || data !== true) throw new Error('Forbidden');
}
export const adminTwilioInventory = createServerFn({ method: 'GET' }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  await authorize(context);
  return (await import('./twilio-inventory.server')).listTwilioInventory();
});
export const adminSyncTwilioInventory = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  await authorize(context);
  return (await import('./twilio-inventory.server')).syncTwilioInventory();
});
export const adminAssignTwilioInventory = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator((input: unknown) => z.object({ account_id: z.string().uuid(), phone_number: z.string().regex(/^\+1\d{10}$/) }).parse(input)).handler(async ({ context, data }) => {
  await authorize(context);
  return (await import('./twilio-inventory.server')).assignTwilioInventory(data.account_id, data.phone_number);
});
export const adminUnassignTwilioInventory = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator((input: unknown) => z.object({ phone_number: z.string().regex(/^\+1\d{10}$/) }).parse(input)).handler(async ({ context, data }) => {
  await authorize(context);
  await (await import('./twilio-inventory.server')).unassignTwilioInventory(data.phone_number);
  return { ok: true };
});