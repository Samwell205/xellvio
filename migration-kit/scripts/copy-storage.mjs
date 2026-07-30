#!/usr/bin/env node
// ============================================================
// Xellvio migration — Phase 3b: copy storage objects to the new project.
//
//   OLD_SUPABASE_URL=... OLD_SERVICE_KEY=... \
//   NEW_SUPABASE_URL=... NEW_SERVICE_KEY=... \
//   node migration-kit/scripts/copy-storage.mjs
//
// Object paths are preserved exactly, because they are referenced from
// campaigns.media_url, accounts.opt_in_screenshot_url,
// academy_courses.cover_url and payments.proof_url.
// ============================================================
import { createClient } from "@supabase/supabase-js";

const BUCKETS = ["opt-in-assets", "payment-proofs", "campaign-media", "academy-covers"];

const { OLD_SUPABASE_URL, OLD_SERVICE_KEY, NEW_SUPABASE_URL, NEW_SERVICE_KEY } = process.env;
if (!OLD_SUPABASE_URL || !OLD_SERVICE_KEY || !NEW_SUPABASE_URL || !NEW_SERVICE_KEY) {
  console.error("Set OLD_SUPABASE_URL, OLD_SERVICE_KEY, NEW_SUPABASE_URL, NEW_SERVICE_KEY.");
  process.exit(1);
}

const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const src = createClient(OLD_SUPABASE_URL, OLD_SERVICE_KEY, opts);
const dst = createClient(NEW_SUPABASE_URL, NEW_SERVICE_KEY, opts);

async function* walk(bucket, prefix = "") {
  let offset = 0;
  for (;;) {
    const { data, error } = await src.storage.from(bucket).list(prefix, { limit: 100, offset });
    if (error) throw new Error(`${bucket}/${prefix}: ${error.message}`);
    if (!data?.length) return;
    for (const entry of data) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.id === null) yield* walk(bucket, path);   // folder
      else yield { path, mime: entry.metadata?.mimetype };
    }
    if (data.length < 100) return;
    offset += data.length;
  }
}

for (const bucket of BUCKETS) {
  console.log(`\n== ${bucket}`);
  await dst.storage.createBucket(bucket, { public: false }).catch(() => {});

  let copied = 0, failed = 0;
  for await (const obj of walk(bucket)) {
    const { data, error } = await src.storage.from(bucket).download(obj.path);
    if (error) { failed++; console.error(`  ! download ${obj.path}: ${error.message}`); continue; }

    const { error: upErr } = await dst.storage.from(bucket).upload(obj.path, data, {
      contentType: obj.mime ?? data.type ?? "application/octet-stream",
      upsert: true,
    });
    if (upErr) { failed++; console.error(`  ! upload ${obj.path}: ${upErr.message}`); continue; }

    copied++;
    if (copied % 25 === 0) console.log(`  ${copied} copied...`);
  }
  console.log(`  done: ${copied} copied, ${failed} failed`);
}
