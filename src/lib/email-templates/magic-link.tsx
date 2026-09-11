import * as React from "react";
import { Text, Heading, Hr } from "@react-email/components";
import { XellvioLayout, Eyebrow, CodeBox, h1, p, muted, divider, BRAND } from "./_xellvio-layout";

export type MagicLinkProps = { siteName: string; token: string };

export default function MagicLink({ siteName, token }: MagicLinkProps) {
  return (
    <XellvioLayout preview={`Your ${siteName} sign-in code: ${token}`}>
      <Eyebrow>Sign in</Eyebrow>
      <Heading as="h1" style={h1}>Your verification code</Heading>
      <Text style={p}>{`Enter this code to sign in to ${siteName}. No password needed.`}</Text>
      <CodeBox code={token} />
      <Text style={muted}>This code expires in 10 minutes. If you didn't request it, you can safely ignore this email.</Text>
      <Hr style={divider} />
      <Text style={{ ...muted, margin: "18px 0 0" }}>Never share this code. Xellvio staff will never ask you for it.</Text>
    </XellvioLayout>
  );
}

export const subject = (p: MagicLinkProps) => `Your ${p.siteName} verification code`;
export const previewData: MagicLinkProps = { siteName: "Xellvio", token: "418205" };
