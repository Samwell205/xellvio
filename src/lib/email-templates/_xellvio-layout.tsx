import * as React from "react";
import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Preview,
  Section,
  Text,
  Hr,
} from "@react-email/components";

/** Absolute URL — email clients cannot resolve relative asset paths. */
export const LOGO_URL =
  "https://www.xellvio.com/__l5e/assets-v1/2300f6b3-e5bc-484f-af06-e0cd5e2284a1/xellio-logo.png";

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

const outer: React.CSSProperties = {
  maxWidth: "600px",
  margin: "0 auto",
  padding: "24px 12px 32px",
};

const card: React.CSSProperties = {
  backgroundColor: "#ffffff",
  border: `1px solid ${colors.border}`,
  borderRadius: "14px",
  overflow: "hidden",
};

const header: React.CSSProperties = {
  padding: "22px 28px",
  borderBottom: `1px solid ${colors.border}`,
  backgroundColor: "#f8fafc",
};

const accentBar: React.CSSProperties = {
  height: "4px",
  backgroundColor: colors.brand,
  lineHeight: "4px",
  fontSize: "0px",
};

const footer: React.CSSProperties = {
  marginTop: "20px",
  padding: "0 8px",
  fontSize: "12px",
  color: colors.muted,
  lineHeight: "18px",
  textAlign: "center" as const,
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
        <Container style={outer}>
          <Section style={card}>
            <Section style={accentBar}>&nbsp;</Section>
            <Section style={header}>
              <Img
                src={LOGO_URL}
                alt="Xellvio"
                width="132"
                height="36"
                style={{ display: "block", border: 0, outline: "none", textDecoration: "none" }}
              />
            </Section>
            <Section style={{ padding: "28px" }}>{children}</Section>
            <Hr
              style={{
                border: "none",
                borderTop: `1px solid ${colors.border}`,
                margin: 0,
              }}
            />
            <Section style={{ padding: "18px 28px", backgroundColor: "#f8fafc" }}>
              <Text style={{ margin: 0, fontSize: "12px", color: colors.muted, lineHeight: "18px" }}>
                Questions? Reply to this email or contact{" "}
                <a href="mailto:admin@xellvio.com" style={{ color: colors.brand }}>
                  admin@xellvio.com
                </a>
                .
              </Text>
            </Section>
          </Section>
          <Section style={footer}>
            <Text style={{ margin: 0 }}>
              Xellvio · Global SMS &amp; Toll-Free messaging
            </Text>
            <Text style={{ margin: "4px 0 0" }}>
              <a href="https://www.xellvio.com" style={{ color: colors.muted }}>
                www.xellvio.com
              </a>
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
