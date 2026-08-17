# Fast, resumable CSV contact imports

Goal: import 100k+ numbers in well under a minute, with a cleaner progress UI, and never lose progress if the tab is refreshed or closed.

## Why it is slow today

The whole import runs in the browser, one small batch at a time:

- Each batch of 500 rows costs 3 separate database round trips (contacts, consent rows, list membership), so 100k rows = ~600 round trips.
- Phone validation tries up to 12 parse attempts per row before giving up, on the main thread, so the browser freezes during "Validating".
- Nothing is checkpointed: a refresh restarts the entire file from row 1.
- The whole file is parsed into memory at once and every row is rendered in the preview list.

## What changes

### 1. One bulk call per large batch (biggest win)

Add a single database routine that takes a batch of rows as one payload and, in one statement each, creates/updates the contacts, marks them subscribed, and adds them to the chosen list. The app calls it through a new server function in batches of 5,000 instead of 500 — roughly 20 calls for 100k rows instead of 600, with no per-row client work.

### 2. Faster phone validation

- Detect the common case first: already-E.164 (`+…`) or plain 10/11-digit US/CA numbers get normalised with cheap string logic, no library call.
- Only ambiguous numbers fall through to the full library parse, and the fallback country list is limited to the chosen default country plus the row's own country.
- Validation runs in chunks with the UI yielding between them, so the dialog stays responsive and shows live counts.

### 3. Resume after refresh

- When an import starts, a job record is created (file name, total rows, mapping, target list, rows completed).
- After every batch the row offset is saved, and the parsed file stays in browser storage for the session.
- If the tab is refreshed while an import is running, the dialog reopens with "Resume import — 42,000 of 100,000 done" and continues from the saved offset. Because contacts are upserted by phone number, re-running a batch never creates duplicates.
- A "Cancel import" action marks the job cancelled and stops cleanly.

### 4. Better import interface

- Streaming parse with a live "Reading file… 48,000 rows" counter instead of a frozen dialog.
- Raise the file limit from 10 MB to 50 MB so 100k–500k row files are accepted.
- Column mapping stays, but the row list becomes a virtualised preview (only visible rows render) with a search box and "Select all / Deselect all" acting on the whole file.
- Progress panel shows phase, rows done, percent, live throughput and estimated time remaining, plus a clear note that it now keeps going and can be resumed.
- Result summary keeps imported / invalid / duplicate counts with a downloadable CSV of rejected rows.

## Technical notes

- New migration: `public.bulk_import_profiles(_account_id uuid, _list_id uuid, _rows jsonb)` (security definer, verifies caller access via `has_account_access`) doing `insert … select from jsonb_to_recordset … on conflict do update`, plus set-based inserts into `consents` and `profile_list_members`; returns inserted/updated counts. Grants to `authenticated` and `service_role`.
- New migration: `public.contact_import_jobs` (account_id, file_name, total_rows, processed_rows, status, mapping jsonb, list_id) with RLS scoped through `has_account_access`, grants, and `updated_at` trigger.
- New `src/lib/audience-import.functions.ts`: `startImportJob`, `importProfilesBatch` (calls the bulk routine), `updateImportJobProgress`, `getActiveImportJob` — all behind `requireSupabaseAuth`.
- `src/routes/_authenticated.app.audience.tsx`: replace the client-side upsert loop in `runImport` with batched server calls, switch to `Papa.parse(file, { worker: true, step/chunk })`, extract the phone normaliser into `src/lib/phone-normalize.ts` (with tests), and split the import dialog into its own component with the new progress/resume UI.
- Row payloads keep the existing `custom_fields` behaviour so personalisation tokens continue to work.
