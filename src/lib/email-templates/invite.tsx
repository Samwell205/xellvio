import * as React from "react";
import { Text, Heading, Link } from "@react-email/components";
import { XellvioLayout, Eyebrow, CTA, h1, p, muted, link } from "./_xellvio-layout";

export type InviteProps = { siteName: string; siteUrl: string; confirmationUrl: string };

export default function Invite({ siteName, siteUrl, confirmationUrl }: InviteProps) {
  return (
    <XellvioLayout preview={`You've been invited to join ${siteName}.`}>
      <Eyebrow>Invitation</Eyebrow>
      <Heading as="h1" style={h1}>You've been invited to join {siteName}</Heading>
      <Text style={p}>
        You've been invited to join{" "}
        <Link href={siteUrl} style={link}>{siteName}</Link>. Accept the invitation to set up your
        account and start sending.
      </Text>
      <CTA href={confirmationUrl}>Accept Invitation</CTA>
      <Text style={{ ...muted, margin: "20px 0 0" }}>
        This invitation expires in 7 days. If you weren't expecting it, you can ignore this email.
      </Text>
    </XellvioLayout>
  );
}

export const subject = (p: InviteProps) => `You've been invited to join ${p.siteName}`;
export const previewData: InviteProps = {
  siteName: "Xellvio",
  siteUrl: "https://www.xellvio.com",
  confirmationUrl: "https://www.xellvio.com/invite?token=sample-token",
};
