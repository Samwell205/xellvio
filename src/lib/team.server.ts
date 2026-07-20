export interface TeamInviteEmailArgs {
  recipientEmail: string;
  memberId: string;
  inviter?: {
    full_name?: string | null;
    company?: string | null;
    email?: string | null;
  } | null;
  role: string;
}

export function buildTeamInviteUrl(email: string): string {
  const baseUrl = (process.env.PUBLIC_BASE_URL ?? "https://www.xellvio.com").replace(/\/$/, "");
  const params = new URLSearchParams({
    invite: email.trim().toLowerCase(),
    redirect: "/app",
  });
  return `${baseUrl}/auth?${params.toString()}`;
}

export async function sendTeamInviteEmail(args: TeamInviteEmailArgs) {
  const { sendBrandedEmail } = await import("@/lib/email/send-internal.server");
  const acceptUrl = buildTeamInviteUrl(args.recipientEmail);
  const result = await sendBrandedEmail({
    templateName: "team-invite",
    recipientEmail: args.recipientEmail,
    idempotencyKey: `team-invite-${args.memberId}-${Date.now()}`,
    includeUnsubscribe: false,
    sendImmediately: true,
    templateData: {
      inviterName:
        args.inviter?.full_name || args.inviter?.company || args.inviter?.email || "A teammate",
      workspaceName: args.inviter?.company || args.inviter?.full_name || "Xellvio workspace",
      role: args.role,
      acceptUrl,
    },
  });

  return { ...result, acceptUrl };
}