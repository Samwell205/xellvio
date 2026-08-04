# Fix AI content scanner false positive for legitimate event/party services

## Problem
A tenant's Danish campaign for a party/event service was blocked by the AI content scanner with:

> "The message uses common 'delivery to door' drug-trafficking language ('no party without us', 'write to see selection') typical of unregulated mobile narcotics delivery services."

The message is ordinary event/party-service commerce. The keyword scan already passes clean. The AI layer is over-reading generic service phrases as drug-dealing slang.

## Plan

1. **Improve the AI classifier prompt**
   - Add explicit examples of allowed event/party/entertainment/rental services.
   - Clarify that "delivery to door" / "delivery to your door" is not drug-trafficking language by itself.
   - Require explicit drug/narcotic terms or unmistakable drug-dealing context before blocking as `illegal_drugs`.
   - Add the Danish message (or an English equivalent) as an allowed example.
   - Keep strict blocking for actual prohibited categories.

2. **Soften auto-suspend for AI-only blocks**
   - In the content screening firewall, treat AI-only high-confidence category hits as review-queue candidates (score 60–69) rather than immediate auto-suspend triggers (score 80+).
   - Reserve score 80+ for hard keyword blocks and unmistakable violations.
   - This prevents tenants from being auto-suspended for classifier false positives.

3. **Update tenant-facing block message**
   - Replace the generic "drop restricted keywords" copy with a clearer note that the message can be reviewed if they believe it was flagged in error.

4. **Validate the fix**
   - Run the exact Danish message through the updated keyword and AI scan paths.
   - Confirm it returns `allowed: true` and does not enqueue for review or suspend the tenant.

## Files to edit
- `src/lib/ai-content-scan.server.ts`
- `src/lib/content-screening.server.ts`
- `src/routes/_authenticated.app.campaigns.new.tsx` (block toast copy only)

## Outcome
Legitimate party/event service messages will pass the scanner, while actual drug, alcohol, gambling, fraud, etc. content remains blocked.
