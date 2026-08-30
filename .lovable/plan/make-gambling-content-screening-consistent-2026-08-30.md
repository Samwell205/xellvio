# Make gambling-content screening consistent

## Problem
The same sports-betting promotion was sent yesterday but blocked today because the keyword scanner did not recognize the wording and the AI classifier produced different outcomes. The current message explicitly promotes a sports bettor, winning games, and an NCAA football winner, so it belongs to the platform's prohibited gambling category.

## Changes
1. Add deterministic gambling patterns for sports-bettor and paid/free sports-pick language so this content does not depend on variable AI judgment.
2. Add regression tests covering the exact message and safe ordinary football/event messages to avoid broad false positives.
3. Verify the campaign screening flow and build.

## Outcome
Identical betting promotions receive the same blocked result every time, while ordinary sports announcements remain allowed.
