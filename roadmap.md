# Roadmap

## Toll-free assignment isolation
- [ ] Audit verified inventory, existing assigned numbers and business sub-accounts
- [ ] Make verified-number assignment and purchase use the receiving business sub-account; show inventory in admin
- [ ] Test isolation rules and verify assigned-number ownership without sending messages

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
