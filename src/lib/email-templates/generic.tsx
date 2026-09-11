import * as React from "react";
import { Section, Text, Hr } from "@react-email/components";
import type { TemplateEntry } from "./registry";
import { XellvioLayout, CTA, h1, p, colors } from "./_xellvio-layout";

interface Props {
  subject?: string;
  heading?: string;
  body?: string;
  ctaText?: string;
  ctaUrl?: string;
  eyebrow?: string;
}

const eyebrowStyle: React.CSSProperties = {
  display: "inline-block",
  backgroundColor: "#eff6ff",
  color: colors.brand,
  fontSize: "11px",
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  padding: "6px 10px",
  borderRadius: "999px",
  margin: "0 0 14px",
};

const Email = ({ heading, body, ctaText, ctaUrl, eyebrow }: Props) => (
  <XellvioLayout preview={heading ?? "Xellvio notification"}>
    <Section>
      <Text style={eyebrowStyle}>{eyebrow ?? "Xellvio"}</Text>
    </Section>
    <Text style={h1}>{heading ?? "Notification"}</Text>
    {(body ?? "")
      .split("\n")
      .map((line, i) => (
        <Text key={i} style={p}>
          {line || "\u00A0"}
        </Text>
      ))}
    {ctaUrl && ctaText && <CTA href={ctaUrl} label={ctaText} />}
    <Hr
      style={{
        border: "none",
        borderTop: `1px solid ${colors.border}`,
        margin: "24px 0 14px",
      }}
    />
    <Text style={{ fontSize: "13px", lineHeight: "20px", color: colors.muted, margin: 0 }}>
      You are receiving this because of activity on your Xellvio workspace. Manage what we send you
      in Settings → Communication preferences.
    </Text>
  </XellvioLayout>
);

export const template: TemplateEntry = {
  component: Email,
  subject: (d) => d.subject ?? "Xellvio notification",
  displayName: "Generic notification",
  previewData: {
    heading: "Your first campaign is ready",
    body: "Everything is set up — pick a template and send in a few clicks.",
    ctaText: "Open Xellvio",
    ctaUrl: "https://www.xellvio.com/app",
    eyebrow: "Product update",
  },
};
