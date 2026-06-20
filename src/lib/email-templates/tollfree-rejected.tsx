import * as React from "react";
import { Text } from "@react-email/components";
import type { TemplateEntry } from "./registry";
import { XellvioLayout, StatusBox, CTA, h1, p, muted } from "./_xellvio-layout";

interface Props {
  firstName?: string;
  businessName?: string;
  phoneNumber?: string;
  reason?: string;
  setupUrl?: string;
}

const Email = ({
  firstName,
  businessName,
  phoneNumber,
  reason,
  setupUrl,
}: Props) => (
  <XellvioLayout preview="Action needed on your toll-free verification.">
    <Text style={h1}>Action needed on your toll-free verification</Text>
    <Text style={p}>Hi {firstName || "there"},</Text>
    <Text style={p}>
      The carriers reviewed {businessName ? `${businessName}'s` : "your"} toll-free
      verification{phoneNumber ? ` for ${phoneNumber}` : ""} and asked for a
      change before they can approve it.
    </Text>
    <StatusBox tone="warn">
      <strong>What they flagged:</strong>
      <br />
      {reason || "The carrier did not return a specific reason. Please review your submission for completeness."}
    </StatusBox>
    <Text style={p}>
      Update your information on the Set up SMS page and resubmit — most issues
      are resolved on the next review.
    </Text>
    {setupUrl && <CTA href={setupUrl} label="Fix & resubmit" />}
    <Text style={muted}>
      Need help? Just reply to this email and our team will guide you through.
    </Text>
  </XellvioLayout>
);

export const template = {
  component: Email,
  subject: "Action needed on your toll-free verification",
  displayName: "Toll-free verification rejected",
  previewData: {
    firstName: "Sam",
    businessName: "Acme Co",
    phoneNumber: "+18885551234",
    reason: "Your website needs a visible Privacy Policy link.",
    setupUrl: "https://xellvio.lovable.app/app/setup-sms",
  },
} satisfies TemplateEntry;
