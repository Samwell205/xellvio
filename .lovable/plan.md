# Rebuild Xellvio’s homepage and remove stale editor updates

## What will change

- Rebuild the homepage in the chosen **Editorial Tech Minimal** direction: immediate visible headline, crisp black/white structure, blue with restrained lime accents, and one coherent product workspace instead of repeated floating mockup cards.
- Reduce the page to a clear sequence: offer, operating proof, product workflow, channels, global delivery, start steps, FAQ, and signup.
- Keep claims already used by Xellvio, avoid invented customer logos or testimonials, and preserve all current working destinations.
- Simplify the mobile presentation and footer so important choices are easier to scan.
- Improve first-load speed by removing the oversized scroll-driven homepage experience and deferring the support chat until the page is idle.
- Fix publishing, unpublishing, and web-address changes so landing pages and sign-up forms update immediately without a manual refresh.

## Validation

- Check the homepage at desktop and mobile sizes for visible first paint, readable text, working navigation, and no overlap.
- Verify publish-state changes refresh the page/form lists immediately.
- Confirm the app builds cleanly and no new browser errors appear.

## Technical notes

- Consolidate the homepage into focused local sections and semantic theme tokens; avoid hardcoded visual colors in page code.
- Replace simple entrance effects with lightweight CSS or static rendering and respect reduced-motion settings.
- Invalidate the correct page/form list after publish, unpublish, or address updates rather than waiting for autosave.
