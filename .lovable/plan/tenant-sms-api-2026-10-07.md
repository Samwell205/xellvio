# Tenant SMS API

## Goal
Give every Xellvio workspace its own secure, revocable API access for individual and bulk SMS, inbound replies, delivery updates, failure reasons, and automatic opt-out enforcement.

The existing messaging pipeline already validates destinations, screens content, selects verified senders, charges wallet credits, stores replies, and processes delivery receipts. The new API will sit in front of those controls rather than creating a separate sending path.

## Tenant experience

Add an **API & webhooks** area under workspace Settings where an owner or admin can:

- Create an API key, copy it once, name it, view its prefix and last-used time, and revoke it.
- Assign scopes such as `messages:send`, `messages:read`, `replies:read`, and `webhooks:manage`.
- Register HTTPS webhook endpoints and choose events.
- Copy a webhook signing secret once, rotate it, pause an endpoint, and inspect recent delivery attempts.
- See the production base URL, account limits, sender requirements, and a link to the full documentation.

Keys will belong to the workspace, not an individual team member. Existing marketplace developer keys and workspace-linking keys will remain separate and will not gain SMS access.

## Public API

Create a versioned, JSON REST API under `https://xellvio.com/api/public/v1`:

- `POST /messages` — queue one SMS using a verified workspace number.
- `POST /messages/bulk` — queue a bounded recipient batch and return a batch ID immediately.
- `GET /messages/:id` — return queued, sending, sent, delivered, delivery-unconfirmed, or failed status with a safe failure reason.
- `GET /batches/:id` — return totals and paginated recipient results.
- `GET /replies` — cursor-paginated inbound replies for the workspace.
- `GET /senders` — list only verified senders available to that workspace.
- `GET /suppressions/:phone` — show whether a recipient is blocked from further sends.

Requests will use `Authorization: Bearer <workspace API key>`. Responses will use stable IDs, UTC timestamps, documented error codes, pagination cursors, and request IDs.

## Sending behavior

- Validate all payloads server-side, including strict E.164 numbers, message length, batch size, sender ownership, HTTPS URLs, and bounded metadata.
- Require an explicit consent confirmation for every API-originated recipient.
- Reject suppressed recipients before queueing; a STOP reply continues to suppress the number automatically, while START can restore it under the existing rules.
- Allow either a verified sender ID in the request or safe automatic selection from the workspace's verified senders.
- Run the existing content screening, account suspension, Terms, country routing, pricing, balance, and frequency-cap checks.
- Queue sends through the existing campaign dispatcher so bulk requests inherit current pacing, idempotent provider calls, retries, message auditing, and delivery reconciliation.
- Require an `Idempotency-Key` on send requests and persist the request/result mapping so retries cannot create duplicate sends or duplicate charges.
- Keep charging inside the existing atomic claim-and-ledger flow. No refund behavior will be added or changed.
- Enforce database-backed per-key request limits and bounded bulk sizes. Sender throughput remains account-, route-, and sender-dependent and will be documented separately from HTTP request limits.

## Webhooks

Support signed tenant webhooks for:

- `message.sent`
- `message.delivered`
- `message.delivery_unconfirmed`
- `message.failed`
- `reply.received`
- `contact.opted_out`
- `contact.opted_in`
- `batch.completed`

Each payload will include an event ID, event type, workspace-safe resource data, and creation time. Deliveries will use HMAC signatures with timestamp protection, reject non-HTTPS/private destinations, and never include provider credentials or internal payloads.

Use a durable outbox with bounded retries, exponential backoff, attempt history, and idempotent event IDs. The existing inbound and delivery handlers will enqueue tenant events only after their database updates succeed.

## Data and permissions

Add narrowly scoped tables for tenant API keys, idempotency records, webhook endpoints, webhook events, and delivery attempts.

- Store API keys only as hashes; show the plaintext once.
- Encrypt webhook signing secrets at rest with a server-only project secret; show them once and support rotation.
- Enable row-level security and explicit grants on every new table.
- Allow workspace owners/admins to manage keys and endpoints; members may only use API-related screens when their existing permissions allow it.
- Authenticate every public API request on the server, resolve one workspace from the key, verify scope/revocation/suspension, and update `last_used_at`.
- Never infer roles from browser state and never expose internal provider or backend credentials.

## Documentation

Replace the currently aspirational `/docs` example with working documentation covering:

- Base URL and authentication
- Key creation and rotation
- Individual and bulk request examples
- Idempotency
- Verified-sender selection
- Consent and STOP behavior
- Message and batch statuses
- Failure codes
- Reply pagination
- Webhook setup, signature verification, retries, and event schemas
- HTTP request limits versus sender throughput

Include copyable cURL and JavaScript examples that match the implemented routes exactly. Customer-facing wording will remain provider-neutral.

## Technical details

- Use TanStack public server routes for the external REST endpoints and verify API keys inside every handler.
- Keep provider calls and privileged database access server-only.
- Reuse the existing dispatcher and `messages` records by creating an API-origin campaign plus validated queued recipient rows; do not expose the dispatcher endpoint itself.
- Add a small API service layer for authentication, scopes, idempotency, response formatting, and webhook enqueueing so route handlers stay consistent.
- Add database indexes for active key lookup, idempotency uniqueness, message/batch status reads, pending webhook deliveries, and reply pagination.
- Avoid unbounded parallel requests; respect the server runtime's outbound concurrency limit.

## Verification

Add focused tests for:

- Key hashing, scope enforcement, revocation, and workspace isolation
- E.164, consent, sender ownership, payload, and batch bounds
- Idempotent replay returning the original result without duplicate rows or charges
- Suppressed recipients being blocked for single and bulk sends
- Delivery and reply response shapes
- Webhook signature generation, event redaction, retries, and duplicate-event prevention
- Owner/admin management rules

Then run the relevant tests, check the preview build, exercise key creation and revocation, send only a controlled test message, confirm status/reply reads, and verify a signed webhook against a local test receiver. Publishing and any real customer sending will happen only after these checks pass.
