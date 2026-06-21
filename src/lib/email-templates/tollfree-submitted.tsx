import * as React from "react";
import { Text } from "@react-email/components";
import type { TemplateEntry } from "./registry";
import { XellvioLayout, StatusBox, CTA, h1, p, muted } from "./_xellvio-layout";

interface Props {
  firstName?: string;
  businessName?: string;
  phoneNumber?: string;
  dashboardUrl?: string;
}

const Email = ({ firstName, businessName, phoneNumber, dashboardUrl }: Props) => (
  <XellvioLayout preview="Your toll-free verification has been submitted to the carriers.">
    <Text style={h1}>Your toll-free verification is on its way</Text>
    <Text style={p}>Hi {firstName || "there"},</Text>
    <Text style={p}>
      We've submitted {businessName ? `${businessName}'s` : "your"} toll-free
      verification request to the US carriers
      {phoneNumber ? ` for ${phoneNumber}` : ""}. This same approval also
      covers Canada — you don't need a separate request.
    </Text>
    <StatusBox tone="info">
      <strong>What happens next:</strong> Carrier review typically takes
      3–7 business days. We'll email you the moment there's an update.
    </StatusBox>
    <Text style={p}>
      You can keep building your audience and drafting campaigns in the
      meantime. Sending will unlock automatically once the number is verified.
    </Text>
    {dashboardUrl && <CTA href={dashboardUrl} label="Open your dashboard" />}
    <Text style={muted}>
      You're receiving this because you submitted a toll-free verification
      request on Xellvio.
    </Text>
  </XellvioLayout>
);

export const template = {
  component: Email,
  subject: "Your toll-free verification has been submitted",
  displayName: "Toll-free verification submitted",
  previewData: {
    firstName: "Alex",
    businessName: "Acme Co",
    phoneNumber: "+18885551234",
    dashboardUrl: "https://xellvio.lovable.app/app/setup-sms",
  },
} satisfies TemplateEntry;
