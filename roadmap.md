# Roadmap

- [x] Assess request to resend the reported content; keep gambling controls enforced and provide a compliant rewrite path instead of bypassing screening.
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
