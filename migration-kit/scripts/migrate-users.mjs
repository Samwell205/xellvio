#!/usr/bin/env node
// ============================================================
// Xellvio migration — Phase 4: recreate auth users on the new project.
//
//   OLD_SUPABASE_URL=... OLD_SERVICE_KEY=... \
//   NEW_SUPABASE_URL=... NEW_SERVICE_KEY=... \
//   node migration-kit/scripts/migrate-users.mjs
//
// Lovable Cloud does NOT expose a service-role key, so OLD_* cannot be
// filled in from this project. Instead the script falls back to
// migration-kit/data/_auth_users.json, which you produce from the
// Cloud "Export data" feature (Cloud -> Advanced settings -> Export data)
// or from accounts.csv (id + email) as a last resort.
//
// Users are created with the SAME uuid so every existing row
// (accounts, user_roles, account_members, campaigns, ...) still resolves.
// Passwords cannot be carried over: each user gets a recovery email and
// sets a new password on first sign-in.
// ============================================================
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const NEW_URL = process.env.NEW_SUPABASE_URL;
const NEW_KEY = process.env.NEW_SERVICE_KEY;
const SEND_RESET = process.env.SEND_RESET !== "false";
const DRY_RUN = process.env.DRY_RUN === "true";

if (!NEW_URL || !NEW_KEY) {
  console.error("Set NEW_SUPABASE_URL and NEW_SERVICE_KEY.");
  process.exit(1);
}

function loadUsers() {
  const path = join(HERE, "..", "data", "_auth_users.json");
  const raw = JSON.parse(readFileSync(path, "utf8"));
  const rows = Array.isArray(raw) ? raw : (raw.users ?? []);
  return rows
    .map((u) => ({
      id: u.id,
      email: (u.email ?? "").toLowerCase().trim(),
      email_confirmed: Boolean(u.email_confirmed_at ?? u.confirmed_at ?? true),
      created_at: u.created_at,
      metadata: u.raw_user_meta_data ?? u.user_metadata ?? {},
    }))
    .filter((u) => u.id && u.email);
}

const admin = createClient(NEW_URL, NEW_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const users = loadUsers();
console.log(`${users.length} users to migrate${DRY_RUN ? " (dry run)" : ""}`);

let created = 0, existing = 0, failed = 0;

for (const u of users) {
  if (DRY_RUN) { console.log(`  would create ${u.email} (${u.id})`); continue; }

  const { error } = await admin.auth.admin.createUser({
    id: u.id,
    email: u.email,
    email_confirm: u.email_confirmed,
    user_metadata: u.metadata,
  });

  if (error) {
    if (/already (been )?registered|duplicate/i.test(error.message)) {
      existing++;
      console.log(`  = ${u.email} already exists`);
      continue;
    }
    failed++;
    console.error(`  ! ${u.email}: ${error.message}`);
    continue;
  }

  created++;
  console.log(`  + ${u.email}`);

  if (SEND_RESET) {
    const { error: mailErr } = await admin.auth.resetPasswordForEmail(u.email);
    if (mailErr) console.warn(`    (reset email failed: ${mailErr.message})`);
  }
}

console.log(`\ncreated=${created} existing=${existing} failed=${failed}`);
if (failed) process.exit(1);
