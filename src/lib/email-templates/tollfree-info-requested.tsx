import * as React from "react";
import { Text, Heading } from "@react-email/components";
import { XellvioLayout, Eyebrow, CTA, StatusBox, h1, p, muted } from "./_xellvio-layout";

export type TollfreeInfoRequestedProps = { firstName: string; dashboardUrl: string };

export default function TollfreeInfoRequested({ firstName, dashboardUrl }: TollfreeInfoRequestedProps) {
  return (
    <XellvioLayout preview="The carrier needs a little more information to finish your verification.">
      <Eyebrow>Toll-free</Eyebrow>
      <Heading as="h1" style={h1}>More information needed</Heading>
      <Text style={p}>
        Hi {firstName} — your toll-free verification is on hold until the carrier receives a few more
        details.
      </Text>
      <StatusBox tone="warn" label="More information needed.">
        The carrier needs more information to complete your verification.
      </StatusBox>
      <CTA href={dashboardUrl}>Update Your Submission</CTA>
      <Text style={{ ...muted, margin: "20px 0 0" }}>
        Once you've updated your details we'll send the request back to the carrier automatically.
      </Text>
    </XellvioLayout>
  );
}

export const subject = "More information needed for your toll-free verification";
export const previewData: TollfreeInfoRequestedProps = {
  firstName: "Maya",
  dashboardUrl: "https://www.xellvio.com/app/numbers",
};

function Compat(d: Record<string, any>) {
  return (
    <TollfreeInfoRequested
      firstName={String(d.firstName ?? "there")}
      dashboardUrl={String(d.dashboardUrl ?? d.setupUrl ?? "https://www.xellvio.com/app/setup-sms")}
    />
  );
}

export const template = {
  component: Compat,
  subject: "More info needed on your toll-free verification",
  displayName: "Toll-free info requested",
  previewData: {
    firstName: "Alex",
    dashboardUrl: "https://www.xellvio.com/app/setup-sms",
  },
};
