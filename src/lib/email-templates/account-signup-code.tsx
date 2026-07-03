import * as React from "react";
import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Text,
} from "@react-email/components";
import type { TemplateEntry } from "./registry";

interface Props {
  name?: string;
  code?: string;
  expiresMinutes?: number;
}

const Email = ({ name, code = "123456", expiresMinutes = 15 }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your Xellvio verification code is {code}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={brand}>Xellvio</Text>
        <Heading style={h1}>Your verification code</Heading>
        <Text style={text}>{name ? `Hi ${name},` : "Hi,"}</Text>
        <Text style={text}>Enter this code to finish creating your Xellvio account.</Text>
        <Text style={codeStyle}>{code}</Text>
        <Text style={muted}>This code expires in {expiresMinutes} minutes.</Text>
        <Text style={footer}>If you did not request this, you can ignore this email.</Text>
      </Container>
    </Body>
  </Html>
);

export const template: TemplateEntry = {
  component: Email,
  subject: "Your Xellvio verification code",
  displayName: "Account signup code",
  previewData: { name: "Jane", code: "123456", expiresMinutes: 15 },
};

const main = {
  backgroundColor: "#ffffff",
  fontFamily: "Arial, sans-serif",
};

const container = {
  margin: "0 auto",
  maxWidth: "520px",
  padding: "32px 24px",
};

const brand = {
  color: "#0A84FF",
  fontSize: "21px",
  fontWeight: "bold" as const,
  margin: "0 0 24px",
};

const h1 = {
  color: "#000000",
  fontSize: "22px",
  fontWeight: "bold" as const,
  lineHeight: "28px",
  margin: "0 0 16px",
};

const text = {
  color: "#111827",
  fontSize: "15px",
  lineHeight: "24px",
  margin: "0 0 12px",
};

const codeStyle = {
  backgroundColor: "#f3f4f6",
  border: "1px solid #d1d5db",
  borderRadius: "8px",
  color: "#000000",
  fontFamily: "Courier, monospace",
  fontSize: "32px",
  fontWeight: "bold" as const,
  letterSpacing: "6px",
  lineHeight: "40px",
  margin: "20px 0",
  padding: "18px 22px",
  textAlign: "center" as const,
};

const muted = {
  color: "#4b5563",
  fontSize: "13px",
  lineHeight: "20px",
  margin: "0 0 20px",
};

const footer = {
  borderTop: "1px solid #e5e7eb",
  color: "#6b7280",
  fontSize: "12px",
  lineHeight: "18px",
  margin: "28px 0 0",
  paddingTop: "18px",
};
