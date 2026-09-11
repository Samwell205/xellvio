import * as React from "react";
import { Text, Heading } from "@react-email/components";
import { XellvioLayout, Eyebrow, CTA, StatusBox, DetailRows, h1, p } from "./_xellvio-layout";

export type TollfreeSubmittedProps = {
  firstName: string;
  businessName: string;
  phoneNumber: string;
  dashboardUrl: string;
};

export default function TollfreeSubmitted({
  firstName, businessName, phoneNumber, dashboardUrl,
}: TollfreeSubmittedProps) {
  return (
    <XellvioLayout preview="Your toll-free verification is with the carrier for review.">
      <Eyebrow>Toll-free</Eyebrow>
      <Heading as="h1" style={h1}>Your verification is submitted</Heading>
      <Text style={p}>
        Hi {firstName} — we've sent your toll-free verification to the carrier for review. No action
        is needed from you right now.
      </Text>
      <DetailRows
        rows={[
          { label: "Business", value: businessName },
          { label: "Number", value: phoneNumber, mono: true },
        ]}
      />
      <StatusBox tone="info" label="What happens next:">
        Carrier review typically takes 3–7 business days. We'll email you as soon as there's a decision.
      </StatusBox>
      <CTA href={dashboardUrl}>View Status</CTA>
    </XellvioLayout>
  );
}

export const subject = "Your toll-free verification is under review";
export const previewData: TollfreeSubmittedProps = {
  firstName: "Maya",
  businessName: "Northwind Coffee Co.",
  phoneNumber: "+1 (833) 214-9080",
  dashboardUrl: "https://www.xellvio.com/app/numbers",
};

function Compat(d: Record<string, any>) {
  return (
    <TollfreeSubmitted
      firstName={String(d.firstName ?? "there")}
      businessName={String(d.businessName ?? "your business")}
      phoneNumber={String(d.phoneNumber ?? "")}
      dashboardUrl={String(d.dashboardUrl ?? d.setupUrl ?? "https://www.xellvio.com/app/setup-sms")}
    />
  );
}

export const template = {
  component: Compat,
  subject: "Your toll-free verification has been submitted",
  displayName: "Toll-free verification submitted",
  previewData: {
    firstName: "Alex",
    businessName: "Acme Co",
    phoneNumber: "+18885551234",
    dashboardUrl: "https://www.xellvio.com/app/setup-sms",
  },
};
