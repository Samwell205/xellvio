# Fix: blank `/app#` after Google sign-in

## What's happening
After the Google OAuth round-trip, the user lands on `https://xellvio.com/app#`. The Lovable OAuth handler writes the session to storage, but the React tree has *already* mounted and the `_authenticated` route's `beforeLoad` (which calls `supabase.auth.getUser()` + `ensureMyAccount()`) ran before the session was available — so the loader resolved to "no user / blank" and never re-ran. A manual refresh re-runs `beforeLoad`, the session is now in storage, and the dashboard renders. Classic OAuth/session race.

## Fix
Subscribe to Supabase auth events at the root and invalidate the router whenever the session changes. The `_authenticated` loader then re-runs the moment the OAuth callback writes the session, and the dashboard renders without a refresh.

### Change `src/routes/__root.tsx`
Inside `RootComponent`, add a `useEffect` that:
- Calls `supabase.auth.onAuthStateChange((event) => { ... })`
- On `SIGNED_IN`, `TOKEN_REFRESHED`, `SIGNED_OUT`, or `USER_UPDATED`, calls `router.invalidate()` so route loaders re-evaluate against the new session.
- Cleans up the subscription on unmount.

This is a tiny, isolated change — no other files need edits. It also makes sign-out reactive across tabs.

## Why this works
- `router.invalidate()` forces TanStack Router to re-run `beforeLoad`/`loader` for active matches.
- The Lovable OAuth callback only writes the session after navigation has already started, so without invalidation the gate sees "no user" on first render. Refreshing works only because it restarts the whole loader chain — which is exactly what `invalidate()` does, just automatically.

## Out of scope
- No changes to the auth page, OAuth call, or `_authenticated` loader logic.
- No new dependencies.
