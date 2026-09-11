import * as React from "react";
import { Text, Heading, Hr } from "@react-email/components";
import { XellvioLayout, Eyebrow, CodeBox, h1, p, muted, divider, BRAND } from "./_xellvio-layout";

export type AccountSignupCodeProps = { code: string; email: string };

export default function AccountSignupCode({ code, email }: AccountSignupCodeProps) {
  return (
    <XellvioLayout preview={`Your Xellvio signup code: ${code}`}>
      <Eyebrow>Verify</Eyebrow>
      <Heading as="h1" style={h1}>Your Xellvio signup code</Heading>
      <Text style={p}>{<>Enter this code to confirm <strong style={{ color: BRAND.dark }}>{email}</strong> and activate your Xellvio account.</>}</Text>
      <CodeBox code={code} />
      <Text style={muted}>This code expires in 10 minutes. If you didn't request it, you can safely ignore this email.</Text>
      <Hr style={divider} />
      <Text style={{ ...muted, margin: "18px 0 0" }}>Never share this code. Xellvio staff will never ask you for it.</Text>
    </XellvioLayout>
  );
}

export const subject = "Your Xellvio signup code";
export const previewData: AccountSignupCodeProps = { code: "418205", email: "maya@northwind.co" };
