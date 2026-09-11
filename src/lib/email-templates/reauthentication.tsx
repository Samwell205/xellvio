import * as React from "react";
import { Text, Heading, Hr } from "@react-email/components";
import { XellvioLayout, Eyebrow, CodeBox, h1, p, muted, divider, BRAND } from "./_xellvio-layout";

export type ReauthenticationProps = { siteName: string; token: string };

export default function Reauthentication({ siteName, token }: ReauthenticationProps) {
  return (
    <XellvioLayout preview={`Your ${siteName} confirmation code: ${token}`}>
      <Eyebrow>Security</Eyebrow>
      <Heading as="h1" style={h1}>Confirm it's you</Heading>
      <Text style={p}>{`Enter this code to confirm this action on your ${siteName} account.`}</Text>
      <CodeBox code={token} />
      <Text style={muted}>This code expires in 10 minutes. If you didn't request it, you can safely ignore this email.</Text>
      <Hr style={divider} />
      <Text style={{ ...muted, margin: "18px 0 0" }}>Never share this code. Xellvio staff will never ask you for it.</Text>
    </XellvioLayout>
  );
}

export const subject = (p: ReauthenticationProps) => `Confirm it\u2019s you for ${p.siteName}`;
export const previewData: ReauthenticationProps = { siteName: "Xellvio", token: "418205" };
