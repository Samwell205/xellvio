import * as React from "react";
import { Text, Heading } from "@react-email/components";
import { XellvioLayout, Eyebrow, CTA, DetailRows, h1, p, muted } from "./_xellvio-layout";

export type TeamInviteProps = {
  inviterName: string;
  workspaceName: string;
  inviteUrl: string;
  role: string;
};

export default function TeamInvite({ inviterName, workspaceName, inviteUrl, role }: TeamInviteProps) {
  return (
    <XellvioLayout preview={`${inviterName} added you to ${workspaceName} on Xellvio.`}>
      <Eyebrow>Invitation</Eyebrow>
      <Heading as="h1" style={h1}>
        {inviterName} invited you to join {workspaceName}
      </Heading>
      <Text style={p}>
        You've been added to the {workspaceName} workspace on Xellvio. Accept the invitation to
        start sending and tracking campaigns with your team.
      </Text>
      <DetailRows
        rows={[
          { label: "Workspace", value: workspaceName },
          { label: "Your role", value: role },
        ]}
      />
      <CTA href={inviteUrl}>Accept Invitation</CTA>
      <Text style={{ ...muted, margin: "20px 0 0" }}>
        This invitation expires in 7 days. If you weren't expecting it, you can ignore this email.
      </Text>
    </XellvioLayout>
  );
}

export const subject = (p: TeamInviteProps) =>
  `${p.inviterName} invited you to join ${p.workspaceName} on Xellvio`;
export const previewData: TeamInviteProps = {
  inviterName: "Daniel Osei",
  workspaceName: "Northwind SMS",
  inviteUrl: "https://www.xellvio.com/invite?token=sample-token",
  role: "Member",
};
