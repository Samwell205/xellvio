import * as React from "react";
import { Text, Heading } from "@react-email/components";
import { XellvioLayout, Eyebrow, CTA, StatusBox, DetailRows, h1, p } from "./_xellvio-layout";

export type TollfreeApprovedProps = {
  firstName: string;
  businessName: string;
  phoneNumber: string;
  dashboardUrl: string;
};

export default function TollfreeApproved({
  firstName, businessName, phoneNumber, dashboardUrl,
}: TollfreeApprovedProps) {
  return (
    <XellvioLayout preview="Your toll-free number is verified and ready for sending.">
      <Eyebrow>Toll-free</Eyebrow>
      <Heading as="h1" style={h1}>Your number is verified</Heading>
      <Text style={p}>
        Good news, {firstName} — the carrier approved your toll-free verification.
      </Text>
      <DetailRows
        rows={[
          { label: "Business", value: businessName },
          { label: "Number", value: phoneNumber, mono: true },
        ]}
      />
      <StatusBox tone="success" label="Approved.">
        Your toll-free number is verified and ready for sending.
      </StatusBox>
      <CTA href={dashboardUrl}>Start Sending</CTA>
    </XellvioLayout>
  );
}

export const subject = "Your toll-free number is verified";
export const previewData: TollfreeApprovedProps = {
  firstName: "Maya",
  businessName: "Northwind Coffee Co.",
  phoneNumber: "+1 (833) 214-9080",
  dashboardUrl: "https://www.xellvio.com/app/campaigns/new",
};
