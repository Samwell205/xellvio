import * as React from "react";
import { Text } from "@react-email/components";
import type { TemplateEntry } from "./registry";
import { XellvioLayout, StatusBox, CTA, h1, p, muted } from "./_xellvio-layout";

interface Props {
  inviterName?: string;
  workspaceName?: string;
  role?: string;
  acceptUrl?: string;
}

const ROLE_LABEL: Record<string, string> = {
  viewer: "Viewer (can see campaigns, contacts, and messages)",
  editor: "Editor (can create and edit content)",
  admin: "Admin (full access incl. team management)",
};

const Email = ({ inviterName, workspaceName, role, acceptUrl }: Props) => (
  <XellvioLayout preview={`${inviterName ?? "Someone"} invited you to ${workspaceName ?? "their Xellvio workspace"}`}>
    <Text style={h1}>You've been invited to a Xellvio workspace</Text>
    <Text style={p}>
      <strong>{inviterName ?? "A teammate"}</strong> invited you to join{" "}
      <strong>{workspaceName ?? "their workspace"}</strong> on Xellvio.
    </Text>
    <StatusBox tone="info">
      <strong>Your role:</strong> {ROLE_LABEL[role ?? "viewer"] ?? role ?? "Viewer"}
    </StatusBox>
    <Text style={p}>
      Sign in (or create a free account) using <strong>this email address</strong> and you'll
      automatically gain access to the workspace.
    </Text>
    {acceptUrl && <CTA href={acceptUrl} label="Accept invitation" />}
    <Text style={muted}>
      If you weren't expecting this invitation, you can safely ignore this email.
    </Text>
  </XellvioLayout>
);

export const template = {
  component: Email,
  subject: "You've been invited to a Xellvio workspace",
  displayName: "Team invitation",
  previewData: {
    inviterName: "Alex",
    workspaceName: "Acme Co",
    role: "editor",
    acceptUrl: "https://xellvio.lovable.app/auth",
  },
} satisfies TemplateEntry;
