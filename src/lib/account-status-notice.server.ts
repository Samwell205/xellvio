export type AccountNoticeKind = 'sending_suspended' | 'sending_restored' | 'account_suspended' | 'account_restored';
export const ACCOUNT_NOTICE_COPY: Record<AccountNoticeKind, { subject: string; heading: string; body: string }> = {
  sending_suspended: { subject: 'SMS sending is on hold for your Xellvio account', heading: 'Your SMS sending is on hold', body: 'SMS sending has been paused for your business following a compliance review. Please review your messages, consent records and opt-out handling, then contact support to discuss the next steps. Your paused campaigns have not been marked as delivered.' },
  sending_restored: { subject: 'SMS sending has been restored on your Xellvio account', heading: 'Your SMS sending has been restored', body: 'Your business can send SMS again. Campaigns paused by the account hold will be reviewed through the normal sending checks. Campaigns you paused yourself or that still require review remain paused. Please review campaign status before starting another send.' },
  account_suspended: { subject: 'Your Xellvio account has been suspended', heading: 'Your account has been suspended', body: 'Access to your Xellvio account has been suspended. Please contact support to review the account decision and discuss the available next steps. This notice does not confirm that any pending messages were delivered.' },
  account_restored: { subject: 'Your Xellvio account has been restored', heading: 'Your account access has been restored', body: 'Access to your Xellvio account has been restored. Please review your account and campaigns before continuing. Separate sending or campaign restrictions, if any, still apply until they are reviewed.' },
};
export async function notifyAccountStatus(accountId: string, kind: AccountNoticeKind, eventId: string) {
  try {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { data: account, error } = await supabaseAdmin.from('accounts').select('email,contact_email,full_name').eq('id', accountId).maybeSingle();
    if (error) throw error;
    const to = account?.contact_email || account?.email;
    if (!to) return;
    const { sendBrandedEmail } = await import('./email/send-internal.server');
    const copy = ACCOUNT_NOTICE_COPY[kind];
    const result = await sendBrandedEmail({ templateName: 'generic', recipientEmail: to, idempotencyKey: `account-status-${accountId}-${kind}-${eventId}`, templateData: { ...copy, body: `Hi ${account?.full_name?.split(' ')[0] || 'there'},\n\n${copy.body}\n\nXellvio Support`, ctaText: 'Contact support', ctaUrl: 'https://xellvio.com/app/support' } });
    if (!result.success) console.error('[account status notice]', kind, result.reason);
  } catch (error) { console.error('[account status notice] failed', kind, error); }
}