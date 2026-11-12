# Roadmap

## Integrated blog CMS
- [ ] Claude image uploads: accept image bytes or downloadable links, return hosted URLs for covers and inline pictures, verify storage and post readback
- [x] Database tests cover scheduling (deadline, early, time zones, reschedule, cancel, retries, errors, no idle job) and writer/editor/admin/customer permissions
- [x] Reuse existing content tables; add secure categories, revisions, redirects, publishing schedules, media metadata, settings and consented subscriptions
- [x] Admin blog loads; staff access management with confirmation and audited server permissions added; settings and real analytics load without browser errors
- [x] Add database-backed public blog, article/category/tag pages, Resources integration and SEO/sitemaps; public empty blog renders, latest build OK
- [x] Signed-in draft, actual image upload, preview, publish, listing/search/category, public image/SEO, edit readback, mobile no-overflow, unpublish 404 and sitemap removal verified; 10 publishing/security tests pass
- [x] Registration attribution uses the existing growth session and real signup-completed events; per-article visitors and CTA clicks available; temporary QA visits are counted as real test traffic
- [x] Scheduling now arms only the next UTC deadline, with up to one minute delay, bounded batches, locking and five-attempt retry/error records; zero blog jobs when no scheduled articles exist
- [x] Popular articles section (real 30-day unique visitors) and internal-traffic exclusion; ops/deploy checklist in docs/blog-operations.md
- [x] ChatGPT publishing: admin keys (hashed, revocable), create/update/publish API with image import, setup link and instructions; verified end-to-end
- [ ] Live browser checks as real writer/editor/customer accounts, true parallel-worker test, end-to-end upload/sitemap automation

## Google Sheets and ticket #1047
- [ ] Connect per-tenant Google Sheets, map columns and sync consent-confirmed contacts into existing SMS lists — Google connection setup required
- [x] Diagnose ticket #1047: three cannabis-flagged test attempts on November 11 triggered repeat-abuse suspension; reported cause without lifting it or replying

## Campaign accounting reconciliation
- [x] Campaign report uses actual tenant debits ($324.0495), includes submitted failures, labels estimates and partial prices, and never claims confirmed profit from estimated surcharges
- [x] Recovered all 19,349 submitted campaign message prices ($162.7552, excluding surcharges); lookup-only recovery available for other campaigns, no resend or wallet changes
- [x] Identified 31 post-claim personalization blocks ($0.5115) and eight carrier validation refusals ($0.2430); new planning skips restricted personalization before charging
- [x] Signed-in populated report/recovery checked on desktop/phone; 31 regression tests and build passed
- [ ] Publish report, price-sync and pre-charge planning corrections — explicit publish authorization required
- [ ] Resolve historical $0.7545 debit discrepancy — no refunds authorized; campaign-specific surcharge reconciliation remains unavailable from message prices

## Current monitoring corrections
- [x] Confirmed and removed global region blocking inferred from individual rejections; legacy block settings are no longer read or written
- [x] Restored all-route estimated cost/margin, separated recorded prices, and made recorded-price margin unavailable when any submitted price is missing; exports are labeled estimates
- [x] 31 regressions and build passed; populated signed-in campaign report checked on desktop/phone without sending, retrying, or charging; publish required for deployment
- [x] Flagged contacts now build planning rows through campaign-plan-rows.ts with every queued-row column (is_mms included), so one flagged contact can no longer reject the whole planning batch; 3 new regressions plus 117 sending/screening tests and build passed; publish required

## Owner-supplied email designs
- [x] Install 52 supplied designs with hosted logos and escaped React personalization
- [x] Apply designs to existing auth, support, lifecycle, verification, billing and campaign-alert email flows without changing sending rules; generic notices retain complete event-owned copy
- [x] All eight app and six auth previews render; desktop/phone logo loading and no overflow verified; 53 regression tests pass
- [ ] Publish checked designs; actual inbox delivery remains untested without triggering a real tenant event

## Tenant notice targeting and support consolidation
- [x] Catalog tenant emails, exact lifecycle/status/support/security copy, timing, audience and variables for owner redesign in Files; unimplemented monthly/permanent/renewal notices clearly marked
- [x] Reproduce and correct first-campaign email/dashboard targeting; immutable launch history and queued-send eligibility prevent historic replay
- [x] Consolidate new duplicate unresolved requests atomically, including paid requests; add confirmed admin merge preserving private messages/attachments; no current duplicate open businesses found
- [x] Add affected-business sending/account suspension/restoration notices and announcement audience selector; optional lifecycle email never falls back to built-in app emails
- [x] 40 message tests and isolated support/launch SQL tests passed; signed-in admin support and audience selector checked, no page errors
- [ ] Full tenant-session live milestone/merge/email delivery check — owner session is admin-only; no real tenant campaign, support merge or suspension was invented for testing
- [ ] Distinct permanent suspension, verifier-specific full status emails, information-request mapping and monthly number past-due email rollout — no corresponding confirmed state/trigger in this audit; templates/status rules require a separate rollout

## Current SMS pricing update
- [x] Set US tenant pricing to $16.50 per 1,000 segments; preserve Puerto Rico at $48
- [x] Verify shared public rates and pricing tests (30 tests passed)
- [x] Design branded pricing notice and send through existing external email service; 202 accepted, three suppressed addresses excluded
- [ ] Send remaining 30 eligible tenant notices — external email service daily quota reached; requires quota reset or plan upgrade, never switch to built-in bulk sends

## Website video blending
- [x] Blend the existing homepage and login videos into light and dark page backgrounds
- [x] Verify both themes on desktop and mobile without changing sign-in behavior; videos play, no horizontal overflow or page errors

## Verifier registration alignment
- [x] Audit shared form, submission validation, category mapping and separate number accounts
- [x] Require complete validated registration, correct category mapping, phone ownership and approval refresh
- [x] Registration and carrier safeguards passed; authorized My numbers page opens without runtime errors
- [ ] Verify real registration/readback — authorized verifier has no numbers; creating one incurs a real purchase, not performed

## SMS Smart Sending and number protection
- [x] Add business default and campaign override with adjustable repeat-send window
- [x] Enforce atomic business/phone skipping before charging; suppress confirmed invalid/landline destinations, not temporary failures
- [x] Show distinct skip reasons; isolated SQL scenarios and 38 regressions passed; build OK
- [x] Automatic carrier line-type check after CSV uploads, behind a per-business toggle ($0.01 per number not checked before; manual "Check phone types" bills the same); lookups routed +1 → primary account, other countries → international account; insufficient balance refuses before spending; 4 tests passed
- [ ] Verify tenant settings save/reload and campaign override in tenant UI — requesting owner's authorized session redirects to admin; no arbitrary tenant impersonation

## Finance, billing and contact lists
- [x] Remove automatic expired-report recalculation and carrier waits from Finance; Billing reuses saved aggregates instead of downloading ledger history
- [x] Redesign Finance and Billing with focused navigation, independent optional reports and compact settings
- [x] Redesign Contact lists with search, readable rows and separate confirmed delete actions
- [x] Verify signed-in Finance/Billing, search/settings, desktop/mobile overflow and 14 regressions; build OK. Cold Finance observed 4.4–4.7s; repeat Billing navigation 1.5s. No charges or sends.
- [ ] Verify Contact lists in a tenant session — current owner session redirects tenant pages to admin; not bypassed

## Active carrier balance
- [x] Replace the obsolete balance lookup with the funded Twilio account and align saved alert settings
- [x] Signed-in billing page and Refresh now show Twilio $29.99 / Healthy; 8 account-balance regressions passed, build OK. No SMS sent or charges made.

## Toll-free purchase safeguards
- [x] Use eligible inventory for offers and both paid checkouts; reject duplicate purchases
- [x] Record assignment failures for manual payment review and alert admins across card/crypto paths
- [x] Run purchase regressions without charging, assigning or refunding real accounts — 17 tests passed; build OK. Live paid checkout not performed.

## Main-account number protection
- [x] Carrier lookup confirms main account holds only +18664725941; no tenant line or sender uses it, so no replacement needed
- [x] Main-account inventory unavailable; assignment/purchase precheck and sending guards passed 18 tests. Admin visual check blocked by persistent Loading analytics

## Current tenant assignment conflict
- [x] Repair approved number ownership constraints without moving numbers; 13 ownership/assignment tests passed
- [x] Resume +18553820888 for the owner's selected business; active/verified after reload without charging or sending

## Assignment repair
- [x] Repair the interrupted assignment without moving the approved number or charging again
- [x] Add searchable tenant email selection and verify it in admin
- [x] Resume the owner's selected assignment and check saved approval/ownership; +18553820888 active/verified for the selected tenant after reload

## Toll-free assignment isolation
- [x] Explain the rejected saved connection and verify which connection the existing number setup uses
- [x] Audit verified inventory, existing assigned numbers and business sub-accounts: seven approved Twilio numbers across four sub-accounts, one linked business
- [x] Make verified-number assignment and purchase use the receiving business sub-account; show inventory in both admin number pages
- [x] Test isolation rules and verify inventory/assigned ownership without sending messages
- [x] Owner decided (2026-10-31): leave the seven approved numbers in their current sub-accounts; moving would require re-verification
- [ ] Verify a live transfer and tenant purchase — needs the owner's chosen receiving business; no arbitrary assignment or charge

- [x] Register toll-free numbers for CorellCorp (3, own sub-account) and SAMWELL LLC (2 new + existing +1 866-472-5941)
- [ ] Ready-made number store: tenants buy an approved number, it moves to their sub-account, $5/month to keep (upfront price not set by owner)
- [ ] Link the CorellCorp/Samwell numbers to their Xellvio accounts after approval (needs their sign-in emails)
- [ ] International route: register required country sender IDs (e.g. NG/UAE) before tenants send there; add Infobip inbound (replies/STOP) support for international numbers

## Email marketing
- [x] Content step: pick Template, Design from scratch, Plain message or HTML code; templates open straight into a click-to-edit email (words, pictures, buttons/links)
- [x] Add three bold original Studio designs inspired by Really Good Emails; categorize imported/basic/original templates; checked image loading, category filter, editing and mobile layout
- [x] Fix imported template images (HTTP upgraded to HTTPS), fitted previews, concise buttons and full-size preview; signed-in library images, pagination, selection/editing and mobile overflow checked; 14 tests passed
- [x] Separate email details, template selection, editing and review into focused steps; paginate genuine imported designs and separate saved/basic tabs
- [x] Import all 60 genuine provider prebuilt designs; authenticated shared-library readback confirmed
- [ ] Verify genuine-template selection/edit/reload in tenant campaign page — authorized owner test session is admin-only and cannot enter tenant routes
- [x] Show ready-made email previews upfront with category selection and direct editing; retain saved/shared template gallery
- [x] Contacts with phone, email, or both; uploads map an Email column
- [x] Email sending domain page (add, DNS records, Check) — xellvio.com added, waiting on GoDaddy records
- [x] Email in campaign builder (subject, sender, reply-to, visual designer, persisted drafts, test send control)
- [x] Durable bulk queue, unsubscribe, signed delivery/bounce/complaint events, reports
- [x] Free/Standard/Pro reservations and confirmed prepaid monthly bundles; SQL renewals
- [x] Authenticated design/save/reload, mobile layout, unsigned endpoint rejection; 19 focused tests passed
- [ ] Live email delivery and paid renewal verification — blocked by unverified sending domain; current provider capacity is 100/day; public callbacks need publishing
