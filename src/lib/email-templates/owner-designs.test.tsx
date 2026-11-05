import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { render } from '@react-email/components';
import OwnerEmailDesign, { resolveGenericDesign, ownerDesignKey } from './owner-designs';

describe('owner email personalization safety', () => {
  it('never interprets tenant-provided content as executable HTML', async () => {
    const html = await render(createElement(OwnerEmailDesign, { designKey: 'ticket-reply', generic: true, heading: 'Reply', body: '<img src=x onerror="steal()">', ctaText: 'Open ticket', ctaUrl: 'https://xellvio.com/support/t/example' }));
    expect(html).toContain('&lt;img');
    expect(html).not.toContain('<img src="x"');
  });
  it('rejects executable links from dynamic fields', async () => {
    const html = await render(createElement(OwnerEmailDesign, { designKey: 'ticket-reply', generic: true, heading: 'Reply', body: 'Saved reply', ctaText: 'Unsafe', ctaUrl: 'javascript:alert(1)' }));
    expect(html).not.toContain('javascript:');
  });
  it('keeps the server-owned ticket link and complete reply', async () => {
    const html = await render(createElement(OwnerEmailDesign, { designKey: 'ticket-reply', generic: true, heading: 'Ticket #1041', body: 'Please confirm your consent audit before reinstatement.', ctaText: 'Open ticket', ctaUrl: 'https://xellvio.com/support/t/owned-token' }));
    expect(html).toContain('https://xellvio.com/support/t/owned-token');
    expect(html).toContain('Please confirm your consent audit before reinstatement.');
  });
  it('maps exact first-campaign and affected-account events without changing eligibility', () => {
    expect(resolveGenericDesign({}, 'lifecycle-first_success-11111111-1111-1111-1111-111111111111')).toBe('first-success');
    expect(resolveGenericDesign({}, 'account-status-business-sending_suspended-event')).toBe('sending-suspended');
    expect(ownerDesignKey('tollfree-info-requested')).toBe('tfv-more-info');
  });
});