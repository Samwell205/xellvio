import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const SIGNUP_CODE_TTL_MINUTES = 15;
const LEGAL_VERSION = "2026-06-20";
const RESEND_COOLDOWN_SECONDS = 60;

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function generateSignupCode() {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return String(values[0] % 1_000_000).padStart(6, "0");
}

async function hashSignupCode(email: string, code: string) {
  const encoded = new TextEncoder().encode(`${normalizeEmail(email)}:${code}`);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function accountEmailExists(supabaseAdmin: any, email: string) {
  const normalized = normalizeEmail(email);
  const { data: account } = await supabaseAdmin
    .from("accounts")
    .select("id")
    .ilike("email", normalized)
    .maybeSingle();
  if (account) return true;

  let page = 1;
  while (page <= 20) {
    const { data: pageData, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    const hit = pageData.users.find((user: any) => user.email?.toLowerCase() === normalized);
    if (hit) return true;
    if (pageData.users.length < 200) break;
    page++;
  }
  return false;
}

export const sendAccountSignupCode = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({
      full_name: z.string().trim().min(2).max(120),
      email: z.string().email(),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const email = normalizeEmail(data.email);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (await accountEmailExists(supabaseAdmin, email)) {
      throw new Error("An account with this email already exists — please sign in instead.");
    }

    const { data: existingCode } = await supabaseAdmin
      .from("account_signup_codes")
      .select("updated_at")
      .eq("email", email)
      .maybeSingle();
    if (
      existingCode?.updated_at &&
      Date.now() - new Date(existingCode.updated_at).getTime() < RESEND_COOLDOWN_SECONDS * 1000
    ) {
      throw new Error("Please wait 60 seconds before requesting another code.");
    }

    const code = generateSignupCode();
    const codeHash = await hashSignupCode(email, code);
    const expiresAt = new Date(Date.now() + SIGNUP_CODE_TTL_MINUTES * 60_000).toISOString();

    const { error } = await supabaseAdmin
      .from("account_signup_codes")
      .upsert(
        {
          email,
          full_name: data.full_name,
          code_hash: codeHash,
          attempts: 0,
          consumed_at: null,
          expires_at: expiresAt,
        },
        { onConflict: "email" },
      );
    if (error) throw new Error(error.message);

    const { sendBrandedEmail } = await import("@/lib/email/send-internal.server");
    const result = await sendBrandedEmail({
      templateName: "account-signup-code",
      recipientEmail: email,
      idempotencyKey: `account-signup-code-${crypto.randomUUID()}`,
      templateData: {
        name: data.full_name,
        code,
        expiresMinutes: SIGNUP_CODE_TTL_MINUTES,
      },
      includeUnsubscribe: false,
    });

    if (!result.success) {
      throw new Error("Could not send the verification code. Please try again.");
    }

    return { ok: true };
  });

export const createAccountWithCode = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({
      full_name: z.string().trim().min(2).max(120),
      email: z.string().email(),
      password: z.string().min(8),
      code: z.string().regex(/^\d{6}$/),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const email = normalizeEmail(data.email);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: row, error: rowError } = await supabaseAdmin
      .from("account_signup_codes")
      .select("id,code_hash,attempts,expires_at,consumed_at")
      .eq("email", email)
      .maybeSingle();
    if (rowError) throw new Error(rowError.message);
    if (!row || row.consumed_at) throw new Error("Invalid verification code.");
    if (new Date(row.expires_at).getTime() < Date.now()) throw new Error("That code has expired. Please request a new one.");
    if ((row.attempts ?? 0) >= 5) throw new Error("Too many incorrect attempts. Please request a new code.");

    const submittedHash = await hashSignupCode(email, data.code);
    if (submittedHash !== row.code_hash) {
      await supabaseAdmin
        .from("account_signup_codes")
        .update({ attempts: (row.attempts ?? 0) + 1 })
        .eq("id", row.id);
      throw new Error("Invalid verification code.");
    }

    if (await accountEmailExists(supabaseAdmin, email)) {
      await supabaseAdmin
        .from("account_signup_codes")
        .update({ consumed_at: new Date().toISOString() })
        .eq("id", row.id);
      throw new Error("An account with this email already exists — please sign in instead.");
    }

    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.full_name },
    });
    if (createError || !created?.user?.id) {
      throw new Error(createError?.message?.includes("already") ? "An account with this email already exists — please sign in instead." : createError?.message ?? "Could not create account.");
    }

    const userId = created.user.id;
    const acceptedAt = new Date().toISOString();
    const { error: accountError } = await supabaseAdmin
      .from("accounts")
      .upsert({
        id: userId,
        email,
        contact_email: email,
        full_name: data.full_name,
        terms_accepted_at: acceptedAt,
        policies_accepted_version: LEGAL_VERSION,
        policies_accepted: {
          version: LEGAL_VERSION,
          accepted_at: acceptedAt,
          policies: ["terms", "aup", "anti-spam", "privacy"],
        },
      }, { onConflict: "id" });

    if (accountError) {
      await supabaseAdmin.auth.admin.deleteUser(userId).catch(() => null);
      throw new Error(accountError.message);
    }

    await supabaseAdmin
      .from("account_signup_codes")
      .update({ consumed_at: new Date().toISOString(), attempts: row.attempts ?? 0 })
      .eq("id", row.id);

    // Notify admins of the new signup (push + SMS)
    try {
      const { sendAdminPush } = await import("./admin-push.server");
      await sendAdminPush({
        title: "New Xellvio signup",
        body: `${data.full_name || email} just created an account (${email}).`,
        url: "/admin/accounts",
        tag: `signup-${userId}`,
      });
    } catch (e) { console.error("[signup] push notify failed", e); }
    try {
      const { sendAdminSms } = await import("./admin-notify.server");
      await sendAdminSms(`New Xellvio signup: ${data.full_name || email} <${email}>`);
    } catch (e) { console.error("[signup] sms notify failed", e); }

    return { ok: true };
  });
