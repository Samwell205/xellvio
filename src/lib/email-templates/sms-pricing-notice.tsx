import * as React from 'react';
import { Body, Container, Head, Heading, Html, Img, Link, Preview, Section, Text, Hr } from '@react-email/components';
import { BRAND, FONT, LOGO_URL } from './_xellvio-layout';

export interface PricingNoticeProps {
  usRate: number;
  prRate: number;
  name?: string;
  unsubscribeUrl?: string;
}
export const PRICING_NOTICE_SUBJECT = 'Your Xellvio SMS pricing update — November 5';
const text = { fontFamily: FONT, fontSize: '15px', lineHeight: '25px', color: BRAND.body };

/** External-service notice only: deliberately not registered with built-in app emails. */
export default function SmsPricingNotice({ usRate, prRate, name, unsubscribeUrl }: PricingNoticeProps) {
  return (
    <Html lang="en">
      <Head />
      <Preview>US SMS: ${(usRate * 1000).toFixed(2)} per 1,000 segments. Puerto Rico pricing stays unchanged.</Preview>
      <Body style={{ margin: 0, padding: '24px 12px', backgroundColor: BRAND.white, fontFamily: FONT }}>
        <Container style={{ maxWidth: '560px', width: '100%', margin: '0 auto' }}>
          <Section style={{ padding: '20px 0', borderBottom: `2px solid ${BRAND.dark}` }}>
            <table role="presentation"><tbody><tr>
              <td style={{ paddingRight: '10px' }}><Img src={LOGO_URL} width="30" height="30" alt="" /></td>
              <td style={{ fontFamily: FONT, fontSize: '24px', fontWeight: 750, color: BRAND.dark }}>Xellvio</td>
            </tr></tbody></table>
          </Section>
          <Text style={{ ...text, color: BRAND.muted, fontSize: '12px', margin: '26px 0 12px', fontWeight: 600 }}>ACCOUNT NOTICE / NOVEMBER 5, 2026</Text>
          <Heading as="h1" style={{ fontFamily: FONT, fontSize: '32px', lineHeight: '38px', color: BRAND.dark, margin: '0 0 24px', fontWeight: 750 }}>An update to your<br />SMS pricing.</Heading>
          <Text style={text}>Hi {name || 'there'},</Text>
          <Text style={text}>We’re updating the price of SMS sent to the United States. Effective November 5, 2026, the new rate is <strong>${usRate.toFixed(4)} per segment</strong> — ${(usRate * 1000).toFixed(2)} for 1,000 single-segment texts. Puerto Rico pricing remains unchanged.</Text>
          <Section style={{ margin: '28px 0', borderTop: `1px solid ${BRAND.border}`, borderBottom: `1px solid ${BRAND.border}` }}>
            {[{ country: 'United States', rate: usRate, status: 'NEW RATE' }, { country: 'Puerto Rico', rate: prRate, status: 'UNCHANGED' }].map(({ country, rate, status }) => (
              <Section key={country} style={{ padding: '20px 0' }}>
                <Text style={{ ...text, fontSize: '11px', color: BRAND.muted, margin: '0 0 5px', fontWeight: 600 }}>{status}</Text>
                <Text style={{ ...text, color: BRAND.dark, fontSize: '18px', fontWeight: 650, margin: '0 0 4px' }}>{country}</Text>
                <Text style={{ ...text, color: BRAND.dark, fontSize: '30px', lineHeight: '36px', fontWeight: 750, margin: 0 }}>${(rate * 1000).toFixed(2)} <span style={{ fontSize: '13px', fontWeight: 400, color: BRAND.muted }}>/ 1,000 segments</span></Text>
                <Text style={{ ...text, margin: '4px 0 0', fontSize: '13px', color: BRAND.muted }}>${rate.toFixed(4)} per segment</Text>
              </Section>
            ))}
          </Section>
          <Text style={{ ...text, fontWeight: 700, color: BRAND.dark }}>What this means for your account</Text>
          <Text style={text}>Your existing credit balance stays unchanged. The updated rate applies to new US SMS sends. Puerto Rico numbers with area codes 787 and 939 are identified automatically and priced separately.</Text>
          <Text style={text}>These examples cover single-segment SMS. Longer texts can use multiple segments; picture messages have separate pricing. Always review your campaign’s estimated cost before sending.</Text>
          <Section style={{ margin: '26px 0' }}><Link href="https://xellvio.com/pricing" style={{ display: 'inline-block', backgroundColor: BRAND.dark, color: BRAND.white, padding: '14px 22px', fontFamily: FONT, fontSize: '14px', fontWeight: 650, textDecoration: 'none', borderRadius: '4px' }}>View current pricing →</Link></Section>
          <Text style={text}>Thank you for choosing Xellvio.<br /><strong>The Xellvio team</strong></Text>
          <Hr style={{ borderColor: BRAND.border, margin: '28px 0 18px' }} />
          <Text style={{ ...text, fontSize: '12px', color: BRAND.muted, lineHeight: '20px' }}>Questions about your account? <Link href="https://xellvio.com/app/support" style={{ color: BRAND.body }}>Contact support</Link>.<br />This notice concerns pricing for your Xellvio account.{unsubscribeUrl ? <><br /><Link href={unsubscribeUrl} style={{ color: BRAND.muted }}>Unsubscribe from app emails</Link></> : null}</Text>
        </Container>
      </Body>
    </Html>
  );
}