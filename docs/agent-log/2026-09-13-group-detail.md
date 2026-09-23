# T14 Group detail route

## Task
Add `/groups/:slug`: a member can open a group by slug and see its details, its members and
role-appropriate actions; the owner can rename it, rotate the invite link, delete it and remove
members; a member can leave. All proven against MSW.

## Model
Opus 5.

## Files changed
New:
- `frontend/src/components/ConfirmPanel.tsx`, `ConfirmPanel.test.tsx`
- `frontend/src/features/groups/groupQueries.ts` (group and members query options, ETag capture)
- `frontend/src/features/groups/groupMutations.ts` (patch, delete group, remove member)
- `frontend/src/features/groups/groupMutationErrors.ts` (code to outcome, pure)
- `frontend/src/features/groups/GroupMutationError.tsx`
- `frontend/src/features/groups/GroupDetail.tsx`, `MembersPanel.tsx`, `RenameGroupForm.tsx`,
  `RotateInviteAction.tsx`, `DeleteGroupAction.tsx`, `LeaveGroupAction.tsx`
- `frontend/src/pages/GroupDetailPage.tsx`, `GroupDetailPage.test.tsx`

Edited:
- `frontend/src/app/routes.tsx` (the `groups/:slug` route), `routes.test.tsx` (two cases added)
- `frontend/src/features/groups/GroupsList.tsx` (the name is now a link), `GroupsList.test.tsx`
- `frontend/src/features/groups/windowOptions.ts` (the private `label` is now an exported
  `clockLabel`; no behaviour change)
- `frontend/src/features/groups/InviteLinkPanel.tsx` (optional `heading` and `note` props,
  defaulting to the creation wording; no behaviour change for the existing caller)
- `frontend/src/mocks/fixtures.ts`, `frontend/src/mocks/handlers.ts`
- `docs/frontend/DECISIONS.md` (F21)

## What I did
Two queries, `["groups","detail",slug]` and `["groups","detail",slug,"members"]`, both started
before any branch returns in `GroupDetail`, so a failure in one leaves the other rendered. The
group query returns `{ group, etag }`: `unwrap` discards the response, so `groupQueries.ts` has
its own small reader that keeps the ETag and throws the same `ApiError`. `If-Match` is that
opaque value, never a string rebuilt from `version`.

Mutations follow the create-group pattern: an `Idempotency-Key` minted per distinct serialized
body and reused on a retry of the same body. `onSuccess` invalidates the detail key `exact` (the
members key is nested under it, so a prefix match would refetch the roster for a rename too) and
the list; deleting a group `removeQueries` its subtree instead.

Errors are switched on `code` only. `version_conflict` offers "Refresh the group", which
refetches and leaves the typed name in the field; `group_confirmed` and `not_owner`/`forbidden`
get their own sentence; a 404 on a member removal or on leaving is treated as already gone, with
a roster refetch and no error; everything else falls through to `ApiErrorNotice`. No title,
detail or status is ever rendered.

One `ConfirmPanel` in `src/components/` serves all four destructive confirmations. It is an
inline panel, not a modal: it traps no focus, adds no dependency, and cancelling is unmounting
it. `destructive` gives the confirm button the danger treatment *and* adds "This cannot be
undone." in words, because colour alone must not carry that.

The rotated `invite_url` is put into component state and the mutation is then `reset()`, so the
link is held in exactly one place and never reaches the query cache (F14).

The MSW group handlers are now stateful (a mutable copy of the fixtures, `resetMockGroups()` to
restore), so `npm run dev:mock` behaves like a server: a rename survives the refetch, a rotation
bumps the version, a delete makes the slug 404. Tests install their own counting handlers.

## Discrepancies noticed
1. **Contract, `PATCH /groups/{slug}`.** `GroupPatch` has `rotate_invite_token`, and
   `GroupWithInvite` says `invite_url` is "returned on creation and on rotation only", but the
   PATCH 200 response is typed `Group`, so the generated type has no `invite_url`. I did not
   change the spec. `RotateInviteAction` reads the property as a runtime narrowing of an extra
   key (`Reflect.get` plus a `typeof` check), never as a hand-written response type, and a
   server that sends none simply leaves the panel closed. **Contract change wanted:** the PATCH
   200 response should be `GroupWithInvite` (or a `oneOf` of the two).
2. `Group.window_start_minute` allows 1440 while `GroupCreate`/`GroupPatch` cap the start at
   1410. Harmless here, since the detail view only renders the value, but the two schemas
   disagree about what a stored group may contain.
3. `GET /groups/{slug}/members` returns a `MemberPage` with a cursor but takes no `limit` or
   `cursor` parameter, so a roster larger than one page cannot be paged. The frontend renders
   the first page only. Fine while `max_members` is small; worth a contract note.

## Assumptions made
- Two files outside the "new files" scope were edited additively rather than duplicated:
  `windowOptions.ts` (the clock label is now exported instead of copied) and `InviteLinkPanel.tsx`
  (optional heading and note props, existing defaults unchanged). Both were judged better than a
  second copy of the same logic. Say so if you would rather have duplicates.
- The name typed to confirm a deletion is compared strictly: no trimming, no case folding.
- Leaving sends the user id from the session store, not from the roster, so it does not depend
  on the members query having loaded.
- A not-found group replaces the whole screen rather than showing the roster beside it; see F21.

## Follow-ups for later
- Resolve discrepancy 1 with Alexander; until then the rotation panel depends on an undeclared
  response property.
- `member_count` and the roster can disagree briefly after a removal, because they are two
  queries invalidated in sequence. Harmless, but a single detail payload would avoid it.
- The detail screen deliberately links nowhere: availability, suggestions, proposals and the
  event download do not exist yet.

## Commands to verify
From `frontend/` on Node 24:

    npm run typecheck && npm run lint && npm run format:check
    npm test
    npm run build && npm run check:api
    grep -rnE "localStorage|sessionStorage" src/features src/pages
    grep -rnE "#[0-9a-fA-F]{3,8}" src --include='*.tsx' --include='*.ts'

By hand: `npm run dev:mock`, open a group from the list, rename it, rotate the invite link,
attempt a delete with a mistyped name, then complete one.
