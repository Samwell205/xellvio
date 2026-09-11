import * as React from "react";
import {
  Html, Head, Body, Container, Section, Text, Heading, Hr, Img, Link, Preview,
} from "@react-email/components";

export const BRAND = {
  blue: "#0A84FF",
  blueTintBg: "#eff6ff",
  dark: "#111827",
  body: "#374151",
  muted: "#6b7280",
  faint: "#8b95a3",
  border: "#e5e7eb",
  tint: "#f8fafc",
  white: "#ffffff",
};

export const FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
export const MONO =
  "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Courier New', monospace";

export const LOGO_URL =
  "https://xellvio.com/__l5e/assets-v1/5b4a08c8-1bb1-412d-8a09-a1b2afd4d64c/xellvio-mark.png";


/* ---------- shared text styles ---------- */

export const h1: React.CSSProperties = {
  margin: "16px 0 0",
  fontFamily: FONT,
  fontSize: "22px",
  lineHeight: "30px",
  fontWeight: 700,
  color: BRAND.dark,
  letterSpacing: "-0.2px",
};

export const p: React.CSSProperties = {
  margin: "14px 0 0",
  fontFamily: FONT,
  fontSize: "15px",
  lineHeight: "24px",
  color: BRAND.body,
};

export const muted: React.CSSProperties = {
  margin: "16px 0 0",
  fontFamily: FONT,
  fontSize: "13px",
  lineHeight: "20px",
  color: BRAND.muted,
};

export const link: React.CSSProperties = {
  color: BRAND.blue,
  textDecoration: "none",
};

export const divider: React.CSSProperties = {
  borderColor: BRAND.border,
  borderTopWidth: "1px",
  margin: "26px 0 0",
};

/* ---------- eyebrow pill ---------- */

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <table role="presentation" cellPadding={0} cellSpacing={0} border={0} style={{ borderCollapse: "separate" }}>
      <tbody>
        <tr>
          <td
            style={{
              background: BRAND.blueTintBg,
              borderRadius: "999px",
              padding: "5px 11px",
              fontFamily: FONT,
              fontSize: "11px",
              lineHeight: "1",
              fontWeight: 700,
              letterSpacing: "0.9px",
              textTransform: "uppercase",
              color: BRAND.blue,
            }}
          >
            {children}
          </td>
        </tr>
      </tbody>
    </table>
  );
}

/* ---------- bulletproof CTA ---------- */

export function CTA({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <table role="presentation" cellPadding={0} cellSpacing={0} border={0} style={{ borderCollapse: "separate", marginTop: "24px" }}>
      <tbody>
        <tr>
          <td {...({ bgcolor: BRAND.blue } as any)} style={{ background: BRAND.blue, borderRadius: "8px", padding: "12px 22px" }}>
            <Link
              href={href}
              style={{
                display: "block",
                color: BRAND.white,
                fontFamily: FONT,
                fontSize: "14px",
                lineHeight: "20px",
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              {children}
            </Link>
          </td>
        </tr>
      </tbody>
    </table>
  );
}

/* ---------- 6-digit code box ---------- */

export function CodeBox({ code }: { code: string }) {
  return (
    <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} border={0} style={{ borderCollapse: "separate", marginTop: "22px" }}>
      <tbody>
        <tr>
          <td
            align="center"
            style={{
              background: "#f3f4f6",
              border: `1px solid ${BRAND.border}`,
              borderRadius: "10px",
              padding: "22px 16px",
              fontFamily: MONO,
              fontSize: "32px",
              lineHeight: "38px",
              fontWeight: 700,
              letterSpacing: "6px",
              color: BRAND.dark,
            }}
          >
            {code}
          </td>
        </tr>
      </tbody>
    </table>
  );
}

/* ---------- status box ---------- */

const TONES = {
  success: { bg: "#ecfdf5", bar: "#059669", text: "#065f46", strong: "#064e3b" },
  warn: { bg: "#fffbeb", bar: "#d97706", text: "#92400e", strong: "#78350f" },
  error: { bg: "#fef2f2", bar: "#dc2626", text: "#991b1b", strong: "#7f1d1d" },
  info: { bg: "#eff6ff", bar: BRAND.blue, text: "#0b3f78", strong: "#08315e" },
} as const;

export function StatusBox({
  tone = "info",
  label,
  children,
}: {
  tone?: keyof typeof TONES;
  label?: string;
  children: React.ReactNode;
}) {
  const t = TONES[tone];
  return (
    <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} border={0}
      style={{ borderCollapse: "collapse", marginTop: "18px", background: t.bg, borderLeft: `4px solid ${t.bar}`, borderRadius: "8px" }}>
      <tbody>
        <tr>
          <td style={{ padding: "14px 16px" }}>
            <Text style={{ margin: 0, fontFamily: FONT, fontSize: "14px", lineHeight: "22px", color: t.text }}>
              {label ? <strong style={{ color: t.strong }}>{label} </strong> : null}
              {children}
            </Text>
          </td>
        </tr>
      </tbody>
    </table>
  );
}

/* ---------- key/value detail rows ---------- */

export function DetailRows({ rows }: { rows: Array<{ label: string; value: React.ReactNode; mono?: boolean }> }) {
  return (
    <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} border={0}
      style={{ borderCollapse: "collapse", marginTop: "22px", background: BRAND.tint, border: `1px solid ${BRAND.border}`, borderRadius: "10px" }}>
      <tbody>
        {rows.map((r, i) => {
          const last = i === rows.length - 1;
          const cell: React.CSSProperties = {
            padding: "14px 16px",
            borderBottom: last ? "none" : `1px solid ${BRAND.border}`,
          };
          return (
            <tr key={r.label}>
              <td style={{ ...cell, width: "140px", fontFamily: FONT, fontSize: "13px", lineHeight: "20px", color: BRAND.muted }}>
                {r.label}
              </td>
              <td style={{ ...cell, fontFamily: r.mono ? MONO : FONT, fontSize: "14px", lineHeight: "20px", fontWeight: 600, color: BRAND.dark }}>
                {r.value}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/* ---------- layout ---------- */

export function XellvioLayout({
  preview,
  children,
}: {
  preview: string;
  children: React.ReactNode;
}) {
  return (
    <Html lang="en">
      <Head>
        <meta name="color-scheme" content="light dark" />
        <meta name="supported-color-schemes" content="light dark" />
      </Head>
      <Preview>{preview}</Preview>
      <Body style={{ margin: 0, padding: "24px 12px", background: "#eef1f5", fontFamily: FONT, WebkitFontSmoothing: "antialiased" }}>
        <Container style={{ width: "100%", maxWidth: "600px", margin: "0 auto", padding: 0 }}>
          <Section
            style={{
              background: BRAND.white,
              border: `1px solid ${BRAND.border}`,
              borderRadius: "14px",
              overflow: "hidden",
            }}
          >
            <Section style={{ height: "4px", lineHeight: "4px", fontSize: 0, background: BRAND.blue }} />
            <Section style={{ padding: "20px 28px", background: BRAND.white, borderBottom: `1px solid ${BRAND.border}` }}>
              <table role="presentation" cellPadding={0} cellSpacing={0} border={0}>
                <tbody>
                  <tr>
                    <td style={{ verticalAlign: "middle", paddingRight: "10px" }}>
                      <Img src={LOGO_URL} height="34" width="34" alt="Xellvio" style={{ display: "block", border: 0, height: "34px", width: "34px" }} />
                    </td>
                    <td style={{ verticalAlign: "middle", fontFamily: FONT, fontSize: "22px", lineHeight: "26px", fontWeight: 700, letterSpacing: "-0.3px", color: BRAND.dark }}>
                      Xellvio
                    </td>
                  </tr>
                </tbody>
              </table>
            </Section>

            <Section style={{ padding: "28px 24px 26px" }}>{children}</Section>
            <Section style={{ padding: "16px 28px", background: BRAND.tint, borderTop: `1px solid ${BRAND.border}` }}>
              <Text style={{ margin: 0, fontFamily: FONT, fontSize: "13px", lineHeight: "20px", color: BRAND.muted, textAlign: "center" }}>
                Questions? Reply to this email or contact{" "}
                <Link href="mailto:admin@xellvio.com" style={link}>admin@xellvio.com</Link>
              </Text>
            </Section>
          </Section>
          <Text style={{ margin: "16px 0 0", fontFamily: FONT, fontSize: "12px", lineHeight: "18px", color: BRAND.faint, textAlign: "center" }}>
            Xellvio · Global SMS &amp; Toll-Free messaging
            <br />
            <Link href="https://www.xellvio.com" style={{ color: BRAND.muted, textDecoration: "underline" }}>www.xellvio.com</Link>
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export { Hr };
