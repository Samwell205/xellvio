import * as React from "react";
import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
  Hr,
} from "@react-email/components";

export const colors = {
  brand: "#0A84FF",
  dark: "#111827",
  muted: "#6b7280",
  border: "#e5e7eb",
  successBg: "#ecfdf5",
  successText: "#065f46",
  warnBg: "#fff7ed",
  warnText: "#9a3412",
  errBg: "#fef2f2",
  errText: "#991b1b",
};

const main: React.CSSProperties = {
  backgroundColor: "#ffffff",
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  margin: 0,
  padding: 0,
};

const container: React.CSSProperties = {
  maxWidth: "560px",
  margin: "0 auto",
  padding: "32px 24px",
};

const header: React.CSSProperties = {
  paddingBottom: "20px",
  borderBottom: `1px solid ${colors.border}`,
};

const brandText: React.CSSProperties = {
  fontSize: "22px",
  fontWeight: 700,
  color: colors.brand,
  margin: 0,
  letterSpacing: "-0.02em",
};

const footer: React.CSSProperties = {
  marginTop: "32px",
  paddingTop: "20px",
  borderTop: `1px solid ${colors.border}`,
  fontSize: "12px",
  color: colors.muted,
  lineHeight: "18px",
};

export function XellvioLayout({
  preview,
  children,
}: {
  preview: string;
  children: React.ReactNode;
}) {
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Text style={brandText}>Xellvio</Text>
          </Section>
          <Section style={{ paddingTop: "24px" }}>{children}</Section>
          <Hr style={{ border: "none", borderTop: `1px solid ${colors.border}`, margin: "32px 0 0" }} />
          <Section style={footer}>
            <Text style={{ margin: 0 }}>
              Xellvio · Global SMS & Toll-Free messaging
            </Text>
            <Text style={{ margin: "6px 0 0" }}>
              Questions? Reply to this email or contact{" "}
              <a href="mailto:admin@xellvio.com" style={{ color: colors.brand }}>
                admin@xellvio.com
              </a>
              .
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export const h1: React.CSSProperties = {
  fontSize: "22px",
  fontWeight: 700,
  color: colors.dark,
  margin: "0 0 12px",
  lineHeight: "28px",
};

export const p: React.CSSProperties = {
  fontSize: "15px",
  lineHeight: "24px",
  color: colors.dark,
  margin: "0 0 14px",
};

export const muted: React.CSSProperties = {
  fontSize: "13px",
  lineHeight: "20px",
  color: colors.muted,
  margin: "0 0 10px",
};

export function StatusBox({
  tone,
  children,
}: {
  tone: "success" | "warn" | "error" | "info";
  children: React.ReactNode;
}) {
  const map = {
    success: { bg: colors.successBg, fg: colors.successText },
    warn: { bg: colors.warnBg, fg: colors.warnText },
    error: { bg: colors.errBg, fg: colors.errText },
    info: { bg: "#eff6ff", fg: "#1e3a8a" },
  }[tone];
  return (
    <Section
      style={{
        backgroundColor: map.bg,
        color: map.fg,
        borderRadius: "8px",
        padding: "14px 16px",
        margin: "0 0 18px",
        fontSize: "14px",
        lineHeight: "20px",
      }}
    >
      {children}
    </Section>
  );
}

export function CTA({ href, label }: { href: string; label: string }) {
  return (
    <Section style={{ margin: "20px 0 8px" }}>
      <a
        href={href}
        style={{
          backgroundColor: colors.brand,
          color: "#ffffff",
          padding: "12px 22px",
          borderRadius: "8px",
          textDecoration: "none",
          fontWeight: 600,
          fontSize: "14px",
          display: "inline-block",
        }}
      >
        {label}
      </a>
    </Section>
  );
}

export { Heading };
