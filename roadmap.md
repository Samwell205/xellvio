# Roadmap

## Team funding and appearance (Oct 21)
- [ ] Resolve shared billing reads and top-up attribution to the business owner, preserving team permissions; investigate the reported paid top-up without duplicating credits.
- [ ] Default new visitors to light appearance and preserve explicit theme choices.
- [ ] Ensure card top-ups send branded payment confirmations; test shared billing and email safeguards.

## Campaign receipt recovery (Oct 21)
- [x] Repair incorrect delivery-lookup connection selection; completed signed-in admin recovery for campaign 4b459f06-932b-489e-897d-60475a4ff719. Final read: 15,733 delivered, 3,027 explicit failures, 2,593 carrier-finalized unconfirmed. Zero retries; charged amount $338.6440 and balance $32.2592 unchanged. Application changes not published in this task.
- [x] Keep unconfirmed delivery distinct from confirmed failures in campaign totals, reports, recipient badges and exports; 12 safeguard tests pass and signed-in recovery/read-back verified. Remaining unconfirmed outcomes need new carrier evidence, not an automatic resend.

## Public account-creation links (Oct 20)
- [x] Correct public Sign up/account-creation destinations; browser-tested all three desktop homepage links, mobile menu and 29 destinations across 12 public pages. Signup form opens, Log in stays unchanged, and no runtime errors occurred. Not published in this task.

## Restricted voice pilot and publishing (Oct 20)
- [x] Pilot email corrected by owner to samueldurosinmi69@gmail.com; reserve voice for its verified owner identity, including receptionist and website voice. Incorrect previous email is denied; SMS/text assistant stays available.
- [x] Enforce pilot access in receptionist actions, assistant drafts, relay startup and call tools; signed-in non-pilot UI and direct action denial verified. Exact-email allow/deny tests pass; real Samuel sign-in awaits account registration.
- [x] Current security scan complete with no critical findings; publishing requested with restricted voice rollout. Deployment completion and Samuel's live access remain unverified until deployment and his account registration.

## Monitoring fixes and multiple-assistant launch validation (Oct 20)
- [x] Repair four claimed monitoring findings: indexed redirect, request-entry budget/bounded calls, persisted link IDs and orphan-contact batch recovery; targeted safeguards and live redirect checked (no paid dispatch run).
- [x] Independent assistant edit/copy/select/archive/restore/delete checked in signed-in owner UI; settings read back separately; temporary QA records removed.
- [ ] Real call with routing, caller details and notifications — live settings have no number or deployed assistant, and call history is empty; requires a carrier-approved pilot number and consenting caller. No approval gates bypassed.

## Voice-enabled website account assistant (Oct 20)
- [x] Add contact-file inspection/import proposals and campaign drafting through ownership, consent and screening controls; drafts use the existing launch review.
- [x] Preserve user-supplied STOP wording without appending a duplicate opt-out line; safeguard tests pass.
- [x] Add documented model, voice and speed overrides plus confirmed business-agent drafts; selectors verified in the owner pilot screen without activating calling.
- [x] Verify signed-in chat, saved-thread restoration, CSV counts, consent gating/cancel and business-agent draft save/read-back; 32 safeguard tests pass.
- [ ] Verify two-way website voice, delegated tasks and Stop cleanup — test browser gathers zero audio-network candidates, so startup stops before contacting the voice service; needs a browser/network supporting WebRTC.
- [ ] Verify actual consented import and campaign launch/credit checks — no contacts imported or paid SMS sent during this check; requires authorized opted-in test contacts and a send destination.
- [ ] Complete remaining advanced workflow/knowledge controls and app-wide account actions — not implemented; current tools are limited to account reads and confirmed import/campaign/agent proposals.
- [ ] Verify phone provisioning and real call/SMS/calendar/renewal outcomes — requires an approved number, destination and authorized paid pilot; website voice is separate from phone calling.

## AI receptionist, follow-ups and bookings for all tenants
- [x] Build tenant-specific setup, call/lead/appointment views, encrypted owner calendar connection and guarded call-action handlers; verified signed-in setup save/read-back and unsigned-event rejection.
- [ ] Verify live assistant provisioning, human handoff and missed-call follow-up behavior — pricing is set; an approved number and authorized pilot remain required before activation.
- [ ] Verify hosted voice capabilities and account access before provisioning or activating paid calling; establish owner-approved tenant pricing before enabling paid usage.
- [ ] Link a per-user calendar client and verify tenant-isolated availability, confirmed bookings, cancellation and reconnect behavior.
- [ ] Verify a real authorized call through lead capture, compliant SMS follow-up, team alert and calendar read-back before enabling tenant traffic.

## Reopen only Samuel's workspace for testing
- [x] Enable the new connection for Samuel's Denmark sender BYENSOPTUR, preserve the original connection for other senders/workspaces, and leave old campaigns paused; user will run the Denmark test personally.
- [x] Read back samueldurosinmi69@gmail.com: workspace active, no account or sending suspension; existing sending profile still uses the original connection.
- [x] Wire Denmark test and new campaign sending to the additional connection with workspace ownership checks, existing screening, opt-outs, and account checks. Verified authenticated sender/test controls; no SMS sent.
- [ ] Confirm Denmark delivery — user explicitly wants to perform the test personally; updated app must be published before production uses the new routing. Other existing sender assets still use their original connection.

## International sending for all tenants
- [x] Route all workspaces' non-US/Canada traffic through the new connection; US/Canada paused; old campaigns stay paused; notice updated.
- [ ] Publish so production uses it; confirm first real deliveries.

## Additional approved Telnyx account
- [x] Create a messaging profile using the separately stored secondary credential (created and read back disabled; original connection unchanged).
- [x] Replace the secondary credential with the new account's key and public key; read back live: profile "House Of Ignis" (4001a150-a55c-460f-ae5d-02acca3f97a7) enabled, active US toll-free number +18337642473 attached to it. The profile created under the previous key no longer applies.
- [x] Ran the user-authorized test send from +18337642473 to +17699692461: accepted and queued, then delivery_failed with carrier error 40329 "Tollfree number is not verified" — sending is NOT ready.
- [x] Submitted toll-free verification for +18337642473 as SAMWELL (sole proprietor, General Marketing, 100,000/month): request f63bc2fb-2c05-5886-b96c-a1c4b227ffd5, read back as "Waiting For Telnyx". Deliberately no webhookUrl — the status route verifies signatures with the original account's key, so status must be polled until account-specific keys are wired.
- [ ] Poll request f63bc2fb-2c05-5886-b96c-a1c4b227ffd5 to a verified decision, then re-test delivery to a mobile (the earlier test number was a wireline) before claiming sending is ready.
- [x] Wire profile-specific sending and webhook verification; new profile enabled with Denmark allowed and delivery webhook read back. Toll-free number remains unverified and is not activated as a sending asset.

## Bandwidth messaging connection
- [ ] Help locate Bandwidth messaging credentials and confirm direct API access — user cannot find the required details; needs dashboard guidance before secure collection.
- [ ] Connect the authorized Bandwidth account securely and verify its messaging application and approved numbers.
- [ ] Integrate number-specific sending, delivery receipts and replies through existing compliance and charging controls.
- [ ] Verify one approved test send before enabling customer traffic; do not restart waiting campaigns automatically.

## GoHighLevel messaging connection
- [ ] User has not created a GoHighLevel account yet — blocked until signup; then confirm a paid plan with SMS enabled, a registered sending number, and API access before collecting credentials.

## Admin experience refresh
- [x] Redesign the shared admin shell and navigation with theme-aware styling and motion.
- [x] Replace the crowded overview with focused operational panels and remove its full-history loading bottleneck.
- [x] Verify authenticated loading, navigation, light/dark appearance, and narrow layouts.

- [x] Tenant SMS API: workspace keys, individual and bulk queueing, status/reply/sender/suppression reads, signed webhooks, and documentation.

- [x] Match the toll-free verification experience across tenant and verifier accounts to the carrier's exact three-step flow: General, Numbers, and Use Case Details.
- [x] Fix high-volume SMS dispatcher failures: safely requeue interrupted paid attempts, preserve idempotency, reduce worker pressure, and flush statuses sooner.
- [x] Assess request to resend the reported content; keep gambling controls enforced and provide a compliant rewrite path instead of bypassing screening.
- [x] Allow free community contest and matching-bonus messages without weakening paid betting or gambling controls.
- [x] Hide My Academy and SMS Pricing from teammates who weren't granted them (owner-only)
- [x] Real verified connections for every marketplace app; unverifiable apps refuse to connect
- [ ] External app-store listings (Shopify/BigCommerce/Wix/etc.) — needs partner accounts + public OAuth per platform (see docs/app-store-listings.md)
- [x] Authority & distribution workspace (admin): opportunities + relevance scoring, outreach pipeline & history, brand mentions, directories, linkable assets/research, distribution plan, referral results, brand profile
- [x] Public partner pages (/partners) for verified, published partnerships only, with sitemap + footer discovery
- [ ] Fill in real research: directories to submit to, partner conversations, first linkable asset (needs human research/outreach)

## Phase 7 — Conversion optimization, analytics & growth intelligence (done)
- [x] Privacy-conscious first-party event stream (`growth_events`, `growth_sessions`) — random session ids, no IP or personal data, coarse country only.
- [x] Public intake endpoint `/api/public/growth-events` with validation, truncation and a known-event allowlist.
- [x] Site-wide page-view and CTA tracking (delegated click capture, placement detection) wired in the root route.
- [x] Product milestone events on signup, campaign create/send, and template import.
- [x] Configurable activation definition, north-star events and minimum sample size (`growth_config`).
- [x] Admin "Growth intelligence" workspace: funnel, drop-off areas, journeys, page/CTA/placement performance, traffic-source-to-customer attribution, content and template attribution, activation and time-to-value, onboarding, adoption, retention, cohorts, segments, trends, alerts, experiments, insights, AI analyst, privacy notes.
- [x] Onboarding goal picker + first-touch attribution stored on the workspace.
- [x] Contextual next-step suggestions in the workspace dashboard, derived from real workspace data.
- [x] Safe experiment register with required sample size; no automatic winner declaration.

### Remaining (needs real traffic, not code)
- [ ] Let data accumulate, then run the first weekly/monthly growth review.
- [ ] Confirm the activation definition with the team before treating activation rate as a target.

## Customer lifecycle & onboarding automation — done
- Lifecycle profiles for every workspace (backfilled), real-action progress, stages.
- In-app: activation checklist, welcome state, first-send celebration, announcements, contextual tips, communication preferences.
- Scheduled hourly checks: onboarding reminders, celebration, 3/7/14-day re-engagement, low balance, feature discovery (preference + frequency aware).
- Admin > Customer success: overview, funnel, editable templates, announcements, workspace timeline, manual run.
- Note: existing workspaces only start receiving lifecycle messages after their next sign-in (no retroactive blast).

## Collect payments from customers (Sep 21)
- [x] Enable built-in payments (Paddle) for international card checkout — enabled, test+live provisioned
- [ ] Finish own-Stripe: publish and test checkout (publishable key is unnecessary for hosted checkout)
- [x] Replace the Lovable-managed Stripe key with the new Stripe account key, create its live webhook, save the signing secret, and disable the duplicate endpoint

Built-in payments (Paddle) enabled Sep 21. Next: create products, wire checkout when user asks.

## Sep 29
- [ ] Switch International card checkout from Stripe to Flutterwave (no Flutterwave branding on site) — waiting on user's go-ahead + Flutterwave secret key/hash
- [ ] Resend "batch 2" (6f6ace6d) 4,792 recipients blocked by carrier 40314 — waiting on carrier to re-enable messaging

## AI receptionist rollout (Oct 20)
- [x] Multiple named assistants with create/copy/archive/restore, separate saved settings, selected-agent synchronization and paused-call assignment safeguard. Signed-in admin creation/archive read-back verified; 32 tests pass. Added greeting modes/tags and neutral carrier error wording.
- [ ] Match advanced assistant controls: workflow editor, model/voice catalogs, managed knowledge sources, versions, browser/outbound test calls, widgets and simulation — not implemented in this increment; pricing and real-call validation must precede paid availability.
- [x] Read back current prices: $5/month number, $0.15 per rounded-up answered minute, $100 assisted verification and $50 verified toll-free product; SMS uses existing destination rates. No distinct advanced-feature prices are configured.
- [x] Add $100 assisted chosen-number verification requests, atomic credit debit and linked support tickets, 24-hour handling target, admin queue/status/notes/exact-number ordering; 28 tests pass and signed-in confirmation checked. Carrier approval is not guaranteed.
- [ ] Verify a funded assisted request and admin fulfilment end-to-end — requires an authorized $100 debit and a real number order; signed-in admin access is now verified.
- [x] Improve business-specific agent choices; share saved instructions with live call setup, add guarded team transfer and startup-failure handling, exclude ringing time from answered-minute fees; 24 safeguard tests, signed-in save/read-back and live UK number selection/paperwork display passed. Live call remains unverified.
- [x] Business profile (name, website, address, phone, industry, team size) required before dashboard
- [x] Calling numbers on sale ($5/mo, $0.15/min); UK mobile = calls+texts, other UK types calls-only
- [x] AI voice agent create/update; call forwarding instructions
- [x] Implement monthly renewal charging and past-due call gating; real renewal debit still requires an authorized funded-number test.
- [ ] Publish, then make a real test call (needs owner)
- [x] Verify Google Calendar client linked with offline access enabled.
- [ ] Verify Google OAuth app production status and complete real Calendar consent, booking/cancellation read-back (needs owner consent).
- [ ] Complete live number purchase and document submission; exact-number order guard and regulatory response parsing implemented, not a real purchased-line test.
