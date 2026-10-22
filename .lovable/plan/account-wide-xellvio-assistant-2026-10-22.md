# Account-wide Xellvio assistant

## Already updated
The message box shows only Upload before file selection. After a contact file is selected, the conversation asks for the country only when local numbers require it, then the list name. Country names and codes are accepted. Import still requires explicit opt-in confirmation. Signed-in checks and 22 focused tests passed; nothing was imported, sent or published.

## Goal
Make the assistant work across the whole account, not just SMS. Cover every account area through supported, permission-checked actions rather than claiming it can do things that are not connected yet.

## Coverage
- **Settings:** read business details and preferences; propose and confirm supported edits.
- **Inbox and replies:** find conversations and leads, summarize responses, prepare replies and send only after confirmation through existing reply rules.
- **Websites, pages and forms:** find and edit drafts, manage lead-capture settings, preview changes and publish through existing checks after confirmation.
- **Billing and team:** explain balances and payments, manage permitted team actions, and use existing payment and ownership flows for consequential changes. Never invent balances or issue refunds without an explicit owner request.
- **Audience and campaigns:** inspect and import opted-in files, manage lists, prepare campaigns, test and confirm launch, and use existing eligible pause/resume controls.
- **Automations and flows:** inspect workflows, prepare changes, and confirm activation or stopping through existing controls.
- **AI receptionist, numbers and integrations:** manage supported settings and connections while retaining verified identity, approval, pricing and voice-pilot restrictions.
- **Support and remaining account tools:** create or update support tickets and inventory other account features so gaps stay explicit.

## Delivery stages
1. Inventory all account features and their existing actions. Connect permission-scoped reads and navigation across every area.
2. Add structured proposals for edits, drafts and changes, with exact targets and before/after previews in the conversation.
3. Connect confirmed execution to each area's existing actions. Sending, publishing, purchases, deleting records and changing access require explicit confirmation; chat text alone never authorizes them.
4. Verify each connected action with allowed and denied account/team roles, saved conversation restoration, cancellation, duplicate confirmation, stale targets and error handling. Use controlled test records; do not send paid messages, charge money or publish without separate authorization.

## Technical implementation
- Preserve route-owned saved conversations and the current assistant transport/model.
- Reuse shared domain server helpers behind authenticated functions; do not duplicate direct account-wide database writes in AI tools.
- Recheck acting-business ownership and feature permission when reading and when confirming an action.
- Use typed, expiry-bound, idempotent proposals and audit results. Revalidate the exact target before mutations.
- Keep file/customer text untrusted, raw contact uploads outside model history, and private information scoped to its business.
- Extend proposal persistence through reviewed tracked migrations only where needed; maintain existing campaign screening, opt-outs, billing and carrier-pause behavior.

## Completion criteria
Maintain an explicit action checklist for each area. Report an area complete only after its supported reads, drafts and confirmed changes pass verification. Unsupported or externally blocked actions must be explained honestly, not reported as successful.