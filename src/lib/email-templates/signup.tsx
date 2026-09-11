import * as React from "react";
import { Text, Heading, Hr } from "@react-email/components";
import { XellvioLayout, Eyebrow, CodeBox, h1, p, muted, divider, BRAND } from "./_xellvio-layout";

export type SignupProps = { siteName: string; recipient: string; token: string };

export default function Signup({ siteName, recipient, token }: SignupProps) {
  return (
    <XellvioLayout preview={`Your ${siteName} code: ${token}`}>
      <Eyebrow>Verify</Eyebrow>
      <Heading as="h1" style={h1}>Confirm your email address</Heading>
      <Text style={p}>{<>Enter this code to confirm <strong style={{ color: BRAND.dark }}>{recipient}</strong> and finish creating your {siteName} account.</>}</Text>
      <CodeBox code={token} />
      <Text style={muted}>This code expires in 10 minutes. If you didn't request it, you can safely ignore this email.</Text>
      <Hr style={divider} />
      <Text style={{ ...muted, margin: "18px 0 0" }}>Never share this code. Xellvio staff will never ask you for it.</Text>
    </XellvioLayout>
  );
}

export const subject = (p: SignupProps) => `Your ${p.siteName} verification code`;
export const previewData: SignupProps = { siteName: "Xellvio", recipient: "maya@northwind.co", token: "418205" };
