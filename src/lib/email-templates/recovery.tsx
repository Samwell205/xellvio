import * as React from "react";
import { Text, Heading, Hr } from "@react-email/components";
import { XellvioLayout, Eyebrow, CTA, h1, p, muted, divider, BRAND } from "./_xellvio-layout";

export type RecoveryProps = { siteName: string; confirmationUrl: string };

export default function Recovery({ siteName, confirmationUrl }: RecoveryProps) {
  return (
    <XellvioLayout preview={`Reset your ${siteName} password — this link expires in 60 minutes.`}>
      <Eyebrow>Security</Eyebrow>
      <Heading as="h1" style={h1}>Reset your password</Heading>
      <Text style={p}>
        Someone asked to reset the password for your {siteName} account. Choose a new one using the button below.
      </Text>
      <CTA href={confirmationUrl}>Reset Password</CTA>
      <Text style={{ ...muted, margin: "20px 0 0" }}>
        This link expires in 60 minutes and can be used once. If you didn't request a reset, no action is needed — your password stays the same.
      </Text>
      <Hr style={divider} />
      <Text style={{ ...muted, margin: "18px 0 0", fontSize: "12px", color: BRAND.faint, wordBreak: "break-all" }}>
        Button not working? Paste this into your browser: {confirmationUrl}
      </Text>
    </XellvioLayout>
  );
}

export const subject = (p: RecoveryProps) => `Reset your password for ${p.siteName}`;
export const previewData: RecoveryProps = {
  siteName: "Xellvio",
  confirmationUrl: "https://www.xellvio.com/auth/recovery?token=sample-token",
};
