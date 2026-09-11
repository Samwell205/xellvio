import * as React from "react";
import { Text, Heading, Hr, Link } from "@react-email/components";
import {
  XellvioLayout, Eyebrow, CTA, StatusBox, h1, p, muted, link, divider, BRAND, FONT,
} from "./_xellvio-layout";
import { LIFECYCLE, LifecycleKey, absolute } from "./lifecycle-copy";

export type GenericProps = {
  eyebrow?: string;
  heading: string;
  body: string;                       // "\n" splits into separate paragraphs
  ctaText?: string;
  ctaUrl?: string;
  preview: string;
  tone?: "success" | "warn" | "error" | "info";
  toneLabel?: string;
  toneBody?: string;
};

export default function Generic({
  eyebrow, heading, body, ctaText, ctaUrl, preview, tone, toneLabel, toneBody,
}: GenericProps) {
  const lines = (body || "").split("\n").map((s) => s.trim()).filter(Boolean);
  return (
    <XellvioLayout preview={preview}>
      {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
      <Heading as="h1" style={h1}>{heading}</Heading>
      {lines.map((line, i) => (
        <Text key={i} style={p}>{line}</Text>
      ))}
      {tone && toneBody ? (
        <StatusBox tone={tone} label={toneLabel}>{toneBody}</StatusBox>
      ) : null}
      {ctaText && ctaUrl ? <CTA href={ctaUrl}>{ctaText}</CTA> : null}
      <Hr style={divider} />
      <Text style={{ ...muted, margin: "18px 0 0" }}>
        You are receiving this because of activity on your Xellvio workspace. Manage what we send you in{" "}
        <Link href="https://www.xellvio.com/app/settings/notifications" style={link}>
          Settings → Communication preferences
        </Link>.
      </Text>
    </XellvioLayout>
  );
}

/** Build props for any lifecycle key from the copy map. */
export function genericPropsFor(key: LifecycleKey, vars: Record<string, string> = {}): GenericProps {
  const e = LIFECYCLE[key];
  const fill = (s: string) =>
    s.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k) => vars[k] ?? "");
  return {
    eyebrow: e.eyebrow,
    heading: fill(e.heading),
    body: fill(e.body),
    ctaText: e.ctaText,
    ctaUrl: e.ctaPath ? absolute(e.ctaPath) : undefined,
    preview: e.preview,
    tone: e.tone,
  };
}

export const subject = (key: LifecycleKey, vars: Record<string, string> = {}) =>
  LIFECYCLE[key].subject.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k) => vars[k] ?? "");

export const previewData: GenericProps = genericPropsFor("welcome", { first_name: "Maya" });
