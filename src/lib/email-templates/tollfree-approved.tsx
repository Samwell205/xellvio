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
  <XellvioLayout preview="Good news — your toll-free number is approved.">
    <Text style={h1}>Your toll-free number is approved 🎉</Text>
    <Text style={p}>Hi {firstName || "there"},</Text>
    <Text style={p}>
      The carriers have approved {businessName ? `${businessName}'s` : "your"} toll-free
      verification{phoneNumber ? ` for ${phoneNumber}` : ""}. You can now send SMS
      campaigns to US and Canadian recipients at full carrier-trusted throughput.
    </Text>
    <StatusBox tone="success">
      <strong>You're cleared to send.</strong> No further action is needed —
      this same number covers both the US and Canada.
    </StatusBox>
    {dashboardUrl && <CTA href={dashboardUrl} label="Start a campaign" />}
    <Text style={muted}>
      Tip: warm up your new sender by starting with smaller, highly engaged
      segments before scaling volume.
    </Text>
  </XellvioLayout>
);

export const template = {
  component: Email,
  subject: "Your toll-free number is approved",
  displayName: "Toll-free verification approved",
  previewData: {
    firstName: "Alex",
    businessName: "Acme Co",
    phoneNumber: "+18885551234",
    dashboardUrl: "https://xellvio.lovable.app/app/campaigns/new",
  },
} satisfies TemplateEntry;
