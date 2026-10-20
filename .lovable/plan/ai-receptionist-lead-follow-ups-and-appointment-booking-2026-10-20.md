# AI receptionist, lead follow-ups and appointment booking

## What tenants will get
- A new **AI Receptionist** area inside Xellvio, with setup, call history, captured leads, appointments and usage.
- Two phone options: forward unanswered calls from an existing business number, or use a dedicated voice-enabled number. Existing SMS numbers are not automatically reassigned or replaced.
- A receptionist configured with the tenant’s business name, greeting, services, business hours, common questions and human handoff number. It identifies itself as an AI assistant and avoids claiming answers outside the supplied business information.
- Automatic lead capture, call summaries and team email notifications, plus configurable SMS follow-ups with consent and opt-out checks.
- Appointment booking through each tenant’s own Google Calendar, with business hours, timezone, appointment length and buffers. Sending a booking link remains an alternative when a calendar is disconnected.

## Calling experience
- Use Telnyx’s hosted AI assistant and voice calling capabilities rather than build a second phone service.
- Forwarding an existing business number requires the tenant to enable unanswered-call forwarding with their current phone service. Xellvio will show the destination number and a clear setup status; it cannot silently change an external phone line.
- Dedicated-number purchases and changes to existing number routing require explicit confirmation and displayed charges.
- Handle human handoff, unavailable calendars, caller hangups and failed transfers without claiming success. Keep recording disabled initially; provide configurable privacy notices and document transcript handling.
- Include a test checklist and explicit enable/pause controls. No tenant is automatically activated and no old campaign is restarted.

## Leads, messages and appointments
- Save call leads separately from the business’s editable receptionist content; deduplicate contacts within the workspace and retain consent evidence.
- A phone call is not blanket marketing consent. Ask for permission before texting; distinguish requested service follow-ups from marketing subscription.
- Route every follow-up through the existing message queue and charging, content screening, account, sender-registration and suppression checks. Show queued, sent, delivered and failed separately.
- Log notification attempts and outcomes; do not label a team alert delivered merely because an automation step completed.
- Read the connected calendar’s availability, account for all-day events and timezone/DST, and prevent overlapping Xellvio reservations. Recheck availability immediately before creating an appointment.
- Ask the caller to confirm the date, time and contact details. Report booked only after the calendar confirms the event. Support authorized rescheduling/cancellation and calendar reconnect states.

## Rollout and costs
1. Build the tenant settings, call/lead history, Google Calendar connection and appointment settings, with saved configuration and honest setup states.
2. Add hosted AI assistant provisioning, secure call handling, lead tools, notifications and compliant SMS follow-ups.
3. Add confirmed booking, rescheduling/cancellation and usage reporting.
4. Test a real owner-authorized call end to end, then enable a pilot workspace before wider tenant activation.

Voice numbers, phone minutes and AI usage incur additional costs. Add admin-configured pricing and usage allowances with no invented prices; paid tenant activation stays blocked until the owner sets and confirms those values. SMS pricing and existing number-sale rules remain unchanged.

## Technical implementation
- Keep the existing TanStack routes and design components; add distinct authenticated receptionist pages and their own page metadata, plus navigation in the existing labeled categories. Do not redesign the homepage or advertise unfinished calling as available.
- Add workspace-scoped receptionist configuration, server-owned voice-number/application mappings, call events, leads, follow-up jobs, appointments and usage records. Grant access explicitly and apply tenant isolation; changes are limited to the new feature’s tables/policies.
- Implement authenticated server functions with existing workspace/team authorization. Store assistant/application identifiers on the server; never trust AI-supplied workspace IDs.
- Use signature-verified, timestamp-checked Telnyx webhook handlers under `/api/public/`, durable event deduplication and retry-safe processing. Authenticate assistant tool callbacks and bind each action to a verified call and its server-resolved workspace.
- Assistant tools are allow-listed business operations, not arbitrary API/database commands. Protect calendar changes with confirmed inputs and idempotent operations.
- Google Calendar App User Connector client is linked with offline access. Implement encrypted per-user connection storage, secure popup completion and server-only calendar calls; bind the business calendar to its authorized workspace owner. Never use the platform owner’s calendar for other tenants.
- Check actual voice account access and number eligibility before provisioning. Do not assume messaging access proves calling or AI access.
- Preserve current SMS sending, safety rules, tenant balances and provider-neutral customer-facing language. No refund logic.

## Verification and prerequisites
- Automated tests: workspace isolation, permitted actions, webhook signatures/replay/idempotency, consent/opt-outs, activation gates, calendar overlap/timezones and confirmed-booking behavior.
- Signed-in browser checks: save and read settings, navigate calls/leads/appointments, calendar connect/reconnect, pause and setup-needed states.
- Real authorized pilot: incoming call → audible AI conversation → confirmed lead → consented SMS → team email → confirmed calendar booking read-back. Test cancellation, transfer failure and hangup cleanup.
- Google OAuth client must register `https://connector-gateway.lovable.dev/api/v1/app-users/oauth2/callback`; its External OAuth app must be published for lasting tenant connections. Configuration linking alone does not verify these settings.
- Real voice/SMS test calls need owner authorization and suitable test numbers. Published calling requires publishing the new handlers and registering their reachable webhook URLs; nothing will be published automatically.