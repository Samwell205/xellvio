# Roadmap

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
