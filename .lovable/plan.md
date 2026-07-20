## Problem

Right now the invite flow only writes a row into `account_members` — nothing else uses it.

- Every server function scopes data by `userId` (the signed-in user's own id), so an invited user who signs up gets a brand-new empty workspace instead of the inviter's data. That's why the invitee sees "0 contacts / 0 campaigns" instead of the inviter's real data — they're on their own account, not the owner's.
- The sidebar shows every page to every user, and route loaders never check the `permissions` object on `account_members`. So even where sharing did work, an invited "Inbox agent" would still see Billing, Team, Settings, etc.

## What I'll build

### 1. Active workspace concept

Introduce a single "acting account id" helper used by every tenant server function:

- New `getActingAccount(context)` server helper: returns `{ accountId, role, permissions, isOwner }`.
  - If the signed-in user has an `active` row in `account_members` pointing at another owner, `accountId` = that owner's id, `role`/`permissions` come from the member row.
  - Otherwise `accountId` = their own `userId`, full permissions, `isOwner: true`.
- Replace `.eq("account_id", userId)` with `.eq("account_id", accountId)` in the tenant-facing server functions (campaigns, inbox, audience, segments, suppressions, dashboard, billing reads, sender setup, etc.). Owner-only functions (team management, billing top-up, sender registration submit) additionally assert `isOwner` or the relevant permission.

### 2. Permission enforcement

- Add a small `assertPermission(context, key)` helper that throws 403 if the acting member lacks that permission (owners always pass).
- Apply it inside the server functions grouped by area:
  - `campaigns.*` → `campaigns`
  - `inbox.*` → `inbox`
  - audience / segments / suppressions → matching keys
  - sender-setup / 10DLC / toll-free → `setup_sms`
  - billing reads → `billing` (top-up/checkout → owner only)
  - team.* → `team` (invite/remove/update → owner only)
  - settings write → `settings` (owner only for destructive ops)

### 3. Client-side session context + sidebar/route gating

- New `useSession()` hook backed by a lightweight `getMySession` server fn that returns `{ isOwner, role, permissions, ownerName }`.
- `AppSidebar`: filter the `items` array by permission; hide Team/Billing/Settings for non-owners without those keys; show a small "Working in {ownerName}'s workspace" label at the top when acting as a member.
- Each `_authenticated.app.*` route with a loader: `beforeLoad` reads the session from router context and `throw redirect({ to: "/app" })` (with a toast) when the required permission is missing. This keeps the fix as gating rather than rewriting business logic.

### 4. Invite acceptance UX

- After sign-in on `/auth?invite=…`, `claimPendingInvites` already links the row. Add a one-time toast "You joined {owner}'s workspace" and land the user on `/app` which will now show that workspace's data.
- Owners keep working in their own workspace; the acting-account resolver only switches when the signed-in user is NOT themselves an owner with data.

### Technical notes

- No schema changes required — `account_members.permissions jsonb`, `user_id`, `status='active'` already exist.
- RLS: tenant tables today use `account_id = auth.uid()`. I'll extend the policies to also allow rows where `EXISTS (SELECT 1 FROM account_members WHERE account_id = <row>.account_id AND user_id = auth.uid() AND status = 'active')`, so the acting-account queries actually return data. Writes get the same predicate plus a per-feature permission check via a `has_workspace_permission(_owner uuid, _key text)` SQL helper (SECURITY DEFINER, reads `account_members`).
- Admin routes are unaffected — they already redirect to `/admin`.
- Owner-only server fns (invite, remove member, checkout, delete account, sender registration submit) will explicitly reject non-owners even if they somehow reach them.

## Out of scope for this change

- Multi-workspace switching UI (a user belonging to several workspaces). For now, if a signed-in user is a member of exactly one other workspace and has no data of their own, they act inside that workspace. If they own their own account they always stay in it. I can add an explicit switcher afterwards if you want.
