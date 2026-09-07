# 2026-09-14 — Suggestions and proposals (T17)

## Task
Frontend round T17: a member can see ranked candidate windows for a chosen duration and, if they
own the group, turn one into a proposal or enter one manually, with proposals listed and
removable. New route `/groups/:slug/proposals`. No voting, confirmation, event download or feed.

## Model
Opus 5 (claude-opus-5).

## Files changed
New:
- `frontend/src/lib/instants.ts`, `instants.test.ts`
- `frontend/src/features/scheduling/`: `schedulingQueries.ts`, `schedulingMutations.ts`,
  `schedulingErrors.ts`, `members.ts`, `windows.ts`, `SuggestionsPanel.tsx`,
  `ManualProposalForm.tsx`, `ProposalsList.tsx`, `ProposalsBoard.tsx`, `testHarness.tsx`, and
  colocated tests for the four components
- `frontend/src/pages/ProposalsPage.tsx`, `ProposalsPage.test.tsx`

Changed:
- `frontend/src/app/routes.tsx` — the new route
- `frontend/src/app/routes.test.tsx` — two cases added (route renders; the detail link navigates)
  and `resetMockProposals()` added to the existing `beforeEach`, because MSW's `resetHandlers`
  does not touch handler module state
- `frontend/src/features/groups/GroupDetail.tsx` — a "See the proposals" link beside the
  availability link, visible to any member
- `frontend/src/mocks/fixtures.ts`, `handlers.ts` — suggestions, proposals and their fixtures
- `docs/frontend/DECISIONS.md` — F24

## What I did
`lib/instants.ts` formats an instant and a window in a given zone ("Mon 5 Oct 2026, 14:00", and
"… 14:00 to 15:30" when both ends share a local date) and derives a duration in minutes. It
reuses `slotDate`/`slotLabel` from `lib/slots.ts` and `formatCalendarDate` from `lib/date.ts`,
adding only the weekday; no `new Date` anywhere.

The data layer is `["scheduling", slug, …]`. Suggestions are `staleTime: 0` with
`refetchOnMount`/`refetchOnWindowFocus` set to `"always"`: they are computed from availability
that any member can change under the grid's polling, so a cached suggestion is a claim about
other people's answers that may already be false. The screen itself does not poll — it is read
on purpose rather than watched. Proposals use the conditional-read helper and its ETag.

Presentation: a suggestion's score is rendered as a proportion of the best score in the same
response ("Best fit", then "83% of the best fit") beside a decorative bar, never as the bare
number, because the contract says a score is comparable only within one response. A missing
member with no roster entry reads "an unknown member". The manual form composes the window from
the generated slot set — date, then that local day's slots, then a duration that is a multiple of
`slot_minutes` between the configured bounds — so an unaligned instant cannot be constructed; the
only client-side check is that the window does not run past the end of that day's slots.

## Discrepancies noticed
1. **`npm run typecheck` and `npm run build` already fail at HEAD (ffd9b9e)**, in a file outside
   this task's scope: `frontend/src/features/groups/groupMutations.ts:34` unwraps
   `PATCH /groups/{slug}` as `GroupWithInvite` (where `invite_url` is required) but the contract's
   response schema is `GroupPatched` (where it is optional). Verified pre-existing by checking out
   the committed `fixtures.ts` and re-running: one error, the same one. The fix is one identifier,
   but the file belongs to another workstream, so it is reported rather than edited. Everything
   this task added typechecks: no error mentions `scheduling`, `instants`, `ProposalsPage`,
   `routes` or `mocks`. `npx vite build` alone succeeds.
2. The task specified the suggestions query key as "scheduling", the slug, "suggestions" and the
   duration. The limit is in the key as well, because a key that omits a request parameter lets a
   change of limit render the previous request's body. Noted in F24.

## Assumptions made
- The `1..20` bounds on `limit` come from the contract rather than `GET /config` (config carries
  no such field), so they are named constants in `windows.ts` with a comment saying so. Every
  server-enforced limit — the duration bounds, `slot_minutes`, `max_proposals_per_group` — comes
  from `GET /config`.
- Proposals are sorted by start time in the client: the contract says nothing about the order of
  `ProposalPage.data`.
- A confirmed group withdraws the owner controls as well as showing the notice, since the
  contract answers `group_confirmed` for any proposal write to one.
- The mock's suggestion computation follows ARCHITECTURE 5.1 loosely (sliding window, mean of
  `2 × preferred + available`, best first) from the same matrix the availability handler serves.
  It exists so the development mock reacts to the grid; the backend's implementation is the
  authoritative one and nothing in the frontend depends on the two agreeing.

## Follow-ups for later
- Fix `groupMutations.ts:34` (`GroupWithInvite` → `GroupPatched`) so `typecheck` and `build` are
  green again. Not done here: wrong workstream's file.
- Voting, confirmation and the event download are the obvious next round; `Proposal.votes` is
  already rendered as a tally and `my_vote` is carried but unused.
- The suggestions and availability screens both define a small `Notice` paragraph inline. If a
  third appears, it should become a primitive in `src/components/`.

## Commands to verify
From `frontend/` on Node 24:
- `npm test` → 52 files, 390 tests, all passing, 17.51 s (baseline before this work: 46 files,
  340 tests, 17.62 s)
- `npm run lint` → 0
- `npm run format:check` → 0
- `npm run check:api` → 0
- `npx vite build` → 0 (`npm run build` fails only on the pre-existing error above)
- `npm run typecheck` → 1 pre-existing error, listed above
- `grep -rn "new Date(" src/lib/instants.ts src/features/scheduling` → no matches
- `grep -rnE "localStorage|sessionStorage" src/features/scheduling src/pages` → no matches
- `grep -rnE "#[0-9a-fA-F]{3,8}" src --include='*.tsx' --include='*.ts'` → no matches
- By hand: `npm run dev:mock`, open the group "Reading circle", follow "See the proposals"
