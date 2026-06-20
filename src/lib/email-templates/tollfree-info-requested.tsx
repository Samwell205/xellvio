import * as React from "react";
import { Text } from "@react-email/components";
import type { TemplateEntry } from "./registry";
import { XellvioLayout, StatusBox, CTA, h1, p, muted } from "./_xellvio-layout";

interface Props {
  firstName?: string;
  businessName?: string;
  message?: string;
  setupUrl?: string;
}

const Email = ({ firstName, businessName, message, setupUrl }: Props) => (
  <XellvioLayout preview="The carriers need a bit more info on your toll-free verification.">
    <Text style={h1}>We need a bit more info</Text>
    <Text style={p}>Hi {firstName || "there"},</Text>
    <Text style={p}>
      The carriers reviewing {businessName ? `${businessName}'s` : "your"} toll-free
      verification have asked for additional information before they can
      finish approving the number.
    </Text>
    <StatusBox tone="info">
      <strong>What they're asking for:</strong>
      <br />
      {message || "Please reply to this email with any details our team requested."}
    </StatusBox>
    <Text style={p}>
      Reply directly to this email with the details, or update your submission
      on the Set up SMS page.
    </Text>
    {setupUrl && <CTA href={setupUrl} label="Update submission" />}
    <Text style={muted}>
      Sent on behalf of the Xellvio compliance team.
    </Text>
  </XellvioLayout>
);

export const template = {
  component: Email,
  subject: "More info needed on your toll-free verification",
  displayName: "Toll-free info requested",
  previewData: {
    firstName: "Sam",
    businessName: "Acme Co",
    message: "Please confirm the URL where customers opt in to receive SMS.",
    setupUrl: "https://xellvio.lovable.app/app/setup-sms",
  },
} satisfies TemplateEntry;
