import * as React from "react";
import { Text, Heading, Hr } from "@react-email/components";
import { XellvioLayout, Eyebrow, CTA, h1, p, muted, divider, BRAND } from "./_xellvio-layout";

export type EmailChangeProps = { newEmail: string; confirmationUrl: string };

export default function EmailChange({ newEmail, confirmationUrl }: EmailChangeProps) {
  return (
    <XellvioLayout preview="Confirm your new Xellvio email address.">
      <Eyebrow>Security</Eyebrow>
      <Heading as="h1" style={h1}>Confirm your new email address</Heading>
      <Text style={p}>
        You asked to change the email on your Xellvio account to{" "}
        <strong style={{ color: BRAND.dark }}>{newEmail}</strong>. Confirm the change to start using it.
      </Text>
      <CTA href={confirmationUrl}>Confirm email change</CTA>
      <Text style={{ ...muted, margin: "20px 0 0" }}>
        Until you confirm, your current email address stays active. This link expires in 60 minutes.
      </Text>
      <Hr style={divider} />
      <Text style={{ ...muted, margin: "18px 0 0", fontSize: "12px", color: BRAND.faint, wordBreak: "break-all" }}>
        Button not working? Paste this into your browser: {confirmationUrl}
      </Text>
    </XellvioLayout>
  );
}

export const subject = "Confirm your new email address";
export const previewData: EmailChangeProps = {
  newEmail: "maya@northwind.co",
  confirmationUrl: "https://www.xellvio.com/auth/email-change?token=sample-token",
};

export const EmailChangeEmail = EmailChange;
