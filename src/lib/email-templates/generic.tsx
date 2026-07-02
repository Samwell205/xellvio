import * as React from "react";
import { Text } from "@react-email/components";
import type { TemplateEntry } from "./registry";
import { XellvioLayout, CTA, h1, p } from "./_xellvio-layout";

interface Props {
  subject?: string;
  heading?: string;
  body?: string;
  ctaText?: string;
  ctaUrl?: string;
}

const Email = ({ heading, body, ctaText, ctaUrl }: Props) => (
  <XellvioLayout preview={heading ?? "Xellvio notification"}>
    <Text style={h1}>{heading ?? "Notification"}</Text>
    {(body ?? "").split("\n").map((line, i) => (
      <Text key={i} style={p}>{line || "\u00A0"}</Text>
    ))}
    {ctaUrl && ctaText && <CTA href={ctaUrl} label={ctaText} />}
  </XellvioLayout>
);

export const template: TemplateEntry = {
  component: Email,
  subject: (d) => d.subject ?? "Xellvio notification",
  displayName: "Generic notification",
  previewData: { heading: "Hello", body: "This is a test." },
};
