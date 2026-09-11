import * as React from "react";
import { Text, Heading, Hr } from "@react-email/components";
import { XellvioLayout, Eyebrow, CodeBox, h1, p, muted, divider, BRAND } from "./_xellvio-layout";

export type VerifierSignupCodeProps = { code: string; phone: string };

export default function VerifierSignupCode({ code, phone }: VerifierSignupCodeProps) {
  return (
    <XellvioLayout preview={`Your Xellvio verification code: ${code}`}>
      <Eyebrow>Verify</Eyebrow>
      <Heading as="h1" style={h1}>Your Xellvio verification code</Heading>
      <Text style={p}>{<>Enter this code to verify the number <strong style={{ color: BRAND.dark }}>{phone}</strong> on your Xellvio account.</>}</Text>
      <CodeBox code={code} />
      <Text style={muted}>This code expires in 10 minutes. If you didn't request it, you can safely ignore this email.</Text>
      <Hr style={divider} />
      <Text style={{ ...muted, margin: "18px 0 0" }}>Never share this code. Xellvio staff will never ask you for it.</Text>
    </XellvioLayout>
  );
}

export const subject = "Your Xellvio verification code";
export const previewData: VerifierSignupCodeProps = { code: "418205", phone: "+1 (833) 214-9080" };

import AccountSignupCode from "./account-signup-code";

function VerifierSignupCodeCompat(d: Record<string, any>) {
  const code = String(d.code ?? "");
  return d.phone ? (
    <VerifierSignupCode code={code} phone={String(d.phone)} />
  ) : (
    <AccountSignupCode code={code} email={String(d.email ?? d.recipient ?? "")} />
  );
}

export const template = {
  component: VerifierSignupCodeCompat,
  subject: "Your Xellvio verification code",
  displayName: "Verifier signup code",
  previewData: { code: "123456", phone: "+18885551234" },
};
