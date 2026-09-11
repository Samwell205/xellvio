import * as React from "react";
import { Text, Heading } from "@react-email/components";
import { XellvioLayout, Eyebrow, CTA, StatusBox, DetailRows, h1, p, muted } from "./_xellvio-layout";

export type TollfreeRejectedProps = {
  firstName: string;
  reason: string;
  dashboardUrl: string;
};

export default function TollfreeRejected({ firstName, reason, dashboardUrl }: TollfreeRejectedProps) {
  return (
    <XellvioLayout preview="The carrier rejected your toll-free verification — here's what to fix.">
      <Eyebrow>Toll-free</Eyebrow>
      <Heading as="h1" style={h1}>Your verification was rejected</Heading>
      <Text style={p}>
        Hi {firstName} — the carrier rejected your toll-free verification request. You can correct
        the details and resubmit.
      </Text>
      <DetailRows rows={[{ label: "Carrier reason", value: reason }]} />
      <StatusBox tone="error" label="Common reasons:">
        Invalid or mismatched business information, or sample messages that don't match your stated
        use case.
      </StatusBox>
      <CTA href={dashboardUrl}>Review &amp; Resubmit</CTA>
      <Text style={{ ...muted, margin: "20px 0 0" }}>
        Reply to this email if you'd like us to look over your submission before you resubmit.
      </Text>
    </XellvioLayout>
  );
}

export const subject = "Action needed: your toll-free verification was rejected";
export const previewData: TollfreeRejectedProps = {
  firstName: "Maya",
  reason: "Business address does not match the registered entity.",
  dashboardUrl: "https://www.xellvio.com/app/numbers",
};
