import { describe, expect, it } from 'vitest';
import { noticePrice, uniqueNoticeRecipients } from './sms-pricing-notice';
const rates = [
  { country_code: 'US', dial_prefix: '+1', sell_price: '0.0165' },
  { country_code: 'PR', dial_prefix: '+1787', sell_price: '0.048' },
];
describe('owner-selected SMS pricing', () => {
  it('charges $16.50 for 1,000 US segments', () => {
    expect(noticePrice(rates, '+12125550123')).toBe(16.50);
  });
  it('keeps Puerto Rico at $48 for both 787 and 939 area codes, even stored as US', () => {
    expect(noticePrice(rates, '+17875550123')).toBe(48);
    expect(noticePrice(rates, '+19395550123')).toBe(48);
  });
  it('deduplicates notice addresses and excludes suppressed recipients', () => {
    expect(uniqueNoticeRecipients([
      { email: 'Owner@example.com' }, { email: ' owner@example.com ' },
      { email: 'blocked@example.com' }, { email: null },
    ], ['BLOCKED@example.com'])).toEqual([{ email: 'Owner@example.com' }]);
  });
});