import * as React from 'react';
import OwnerEmailDesign from './owner-designs';

export interface PricingNoticeProps {
  usRate: number;
  prRate: number;
  name?: string;
  unsubscribeUrl?: string;
}
export const PRICING_NOTICE_SUBJECT = 'Your Xellvio SMS pricing update — November 5';

/** External-service notice only: deliberately not registered with built-in app emails. */
export default function SmsPricingNotice({ usRate, prRate, name, unsubscribeUrl }: PricingNoticeProps) {
  return <OwnerEmailDesign designKey="pricing-notice" generic unsubscribeUrl={unsubscribeUrl} eyebrow="Pricing update" heading="Updated SMS pricing" preview="Current SMS rates for the US and Puerto Rico." body={`Hi ${name || 'there'},\n\nUnited States: $${usRate.toFixed(4)} per segment — $${(usRate * 1000).toFixed(2)} per 1,000 segments.\n\nPuerto Rico: $${prRate.toFixed(4)} per segment — $${(prRate * 1000).toFixed(2)} per 1,000 segments.\n\nYour existing credit balance stays unchanged. Longer texts use multiple segments; picture messages are priced separately. Review your campaign estimate before sending.`} ctaText="View current pricing" ctaUrl="https://xellvio.com/pricing" />;
}
