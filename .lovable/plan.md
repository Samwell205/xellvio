# Stop paying twice per message, and stop paying for dead numbers

Two changes, both aimed at cutting carrier spend on campaigns like the FLORIDA sends.

## Why

Every recipient in the recent campaigns was billed as 2 SMS segments (body length 296-301 chars, limit is 160 per segment). At the US carrier rate of $0.0055 + $0.0045 pass-through = $0.01 per segment, each recipient cost $0.02 instead of $0.01. On top of that, 36,778 failed and 7,986 undelivered messages in the last 48h still cost carrier fees (~$895) because the numbers were landline/invalid/unroutable.

## 1. Segment and cost visibility in the campaign composer

- Live counter under the message body: character count, segment count (1 / 2 / 3...), and the segment boundary at 160 (70 for unicode/emoji bodies).
- A clear inline warning the moment the body crosses into a 2nd segment: "This message costs 2x — trim to 160 characters to halve the cost."
- Cost estimate panel shows the breakdown explicitly: recipients x segments x per-segment price = total, plus "what you'd save at 1 segment".
- Same segment/cost figures shown on the confirm-send dialog so it can't be missed.
- Uses the existing segment calculator (`src/lib/sms-segments.ts`) and the existing per-country pricing already used by the cost estimate — no pricing logic changes, no new rates.

## 2. Pre-send filtering of numbers that can never deliver

- Before planning a campaign, exclude recipients already recorded in `unroutable_numbers` (landline/invalid/carrier-blocked from previous sends). This cache already exists and is already populated by the dispatcher.
- Show the excluded count in the audience/cost estimate as its own line ("known undeliverable, excluded: N") so the number that gets charged is the number actually sent.
- Keep opt-out and suppression exclusions exactly as they are today.
- Also feed the recurring hard-failure codes (invalid destination / unroutable) into that cache when the carrier reports them, so the list keeps improving instead of re-paying for the same numbers every campaign.

## Technical notes

- Composer changes: `src/routes/_authenticated.app.campaigns.*` (message editor + cost estimate + send dialog), reusing `countSegments` from `src/lib/sms-segments.ts`.
- Audience/estimate counts: extend the existing eligibility functions (`eligible_profile_ids*`, `eligible_country_counts`, `unplanned_recipients_page`) with an anti-join against `unroutable_numbers`, keeping the current keyset/index paths so large lists stay fast.
- No changes to `country_rates`, no changes to how tenants are charged per segment, no refunds or balance adjustments.

## Out of scope

- Changing anyone's balance or issuing credits.
- Changing sell prices or margins.
