# Voting reachability and in-group navigation

## Task

T18b: diagnose why a member could not reach vote controls on a group's proposals, fix it if the
cause was the permission gate, and add consistent in-group navigation across the group detail,
availability and proposals routes.

## Model

Sonnet 5

## Files changed

- `frontend/src/components/GroupNav.tsx` (new) — the shared breadcrumb component.
- `frontend/src/components/GroupNav.test.tsx` (new) — its colocated tests.
- `frontend/src/features/groups/GroupDetail.tsx` — renders `GroupNav`.
- `frontend/src/features/availability/AvailabilityBoard.tsx` — renders `GroupNav`, replacing the
  ad hoc "Back to the group" link.
- `frontend/src/features/scheduling/ProposalsBoard.tsx` — renders `GroupNav`; split the single
  `mayVote` flag into `mayManageAsOwner` and `mayVoteAsMember`, the latter now also requiring
  `my_role` to be present.
- `frontend/src/mocks/fixtures.ts` — added `memberGroupProposalFixture` (gives the already-listed
  `memberGroupFixture` a proposal) and `proposalsRoleUnknownGroupFixture` (an open group with a
  proposal and no `my_role`, for the role-absent voting test).
- `frontend/src/features/scheduling/ProposalsBoard.test.tsx` — four new voting tests.
- `frontend/src/pages/GroupDetailPage.test.tsx`, `AvailabilityPage.test.tsx`,
  `ProposalsPage.test.tsx` — navigation tests, and fixed three existing assertions that named the
  removed "Back to the group" link or a now-ambiguous `findByText` on the group's name (it now
  appears twice: once in the breadcrumb, once in the page's own description).
- `frontend/src/features/availability/AvailabilityBoard.test.tsx` — same "Back to the group"
  fix, retargeted at the breadcrumb's group-name link.

## What I did

**Diagnosis (step 2).** Read `ProposalsBoard.tsx` before touching it. The gate was already split
into two flags, not the single `my_role === "owner"` flag the task described — an earlier round
must have partly fixed this. `mayWrite` (owner-only actions) and the voting flag were already
independent, so the owner flag was not gating voting. The actual cause of Adrian's symptom was
the fixture: `dstGroupFixture`, the one open `my_role: "member"` group with a proposals test, has
no proposals wired into `proposalsBySlugFixture`, and no `my_role: "member"` group with proposals
existed anywhere, including in the groups the dev:mock groups list can reach. There was nothing
to hang a vote control beside.

While confirming this I found a real, narrower gap: the voting flag did not require `my_role` to
be present, so a caller with an unknown role and a visible proposal would have seen vote controls
— a role-dependent action shown without a role to base it on, contradicting the stated invariant
("no role-dependent action is shown" when `my_role` is absent) and untested by the existing
suite. Renamed the flags to `mayManageAsOwner` and `mayVoteAsMember` and added the `my_role !==
undefined` condition to the latter. Verified with a temporary revert that the new
"shows no voting control when my_role is absent" test fails against the old logic and passes
against the fix.

**Fixtures (step 3).** `memberGroupFixture` ("Thesis planning") is already an open group with
`my_role: "member"` and is already reachable by clicking through `/groups` in `npm run
dev:mock` — no other open member group is. Gave it one proposal
(`memberGroupProposalFixture`, a manual proposal inside its own daily window) rather than adding
a new group nobody would otherwise navigate to. Also added
`proposalsRoleUnknownGroupFixture`, a copy of the daylight-saving group's window with `my_role`
omitted and one proposal, purely for the automated role-absent-voting test — `roleUnknownGroupFixture`
already covers role absence for the detail screen but is `archived` and carries no proposals.
No token-like values were introduced.

**Navigation (step 4).** One `GroupNav` component in `src/components/`, taking `slug`,
`groupName` (`string | undefined` while the group read is pending) and `current`. It always
links back to `/groups` ("Your groups"), and on a sub-route also links up to the group (labelled
with the group's name) and across to the sibling sub-route; the current page is a `span
aria-current="page"` rather than a link, inside a `<nav aria-label="Group"><ol>...`. While the
name is unknown it renders a fixed-size neutral-wash placeholder in the same position rather than
omitting the crumb, so the breadcrumb's height and structure do not change when the name arrives.
No new colour: the placeholder reuses `bg-neutral-200`, and the current-page treatment is font
weight, not an accent.

All three boards now render `GroupNav` in every branch (pending, not-found, other-error, success)
rather than only in the success path, so it never pops in after the loading spinner and the
"renders without error while pending" requirement holds structurally, not just by accident.

**Step 5, permission conflation elsewhere.** Checked `AvailabilityBoard.tsx` and `GroupDetail.tsx`
for the same bug shape. `AvailabilityBoard`'s own-availability save is gated only on
`group.state === "confirmed"`, never on `my_role` — no conflation there. `GroupDetail`'s
owner-only actions (rename, delete, rotate invite) correctly check `role === "owner"`, and leaving
correctly checks `role === "member"`; both already withdraw when `my_role` is absent. No further
instances found in the files this task touched or was scoped to.

## Discrepancies noticed

None against the contract or architecture docs. The task's description of the current bug ("a
single flag ... currently group.my_role === 'owner' && !confirmed && !refusedOnLoad") did not
match the code as found; a prior round appears to have already separated the flags. Recorded the
actual diagnosis above rather than the task's premise.

## Assumptions made

- "Reachable in npm run dev:mock" means reachable by clicking through the app from `/groups`,
  not merely present somewhere in `fixtures.ts`, so the fix targeted `memberGroupFixture`
  specifically rather than the already-existing but unlisted `dstGroupFixture` or
  `proposalsGroupFixture`.
- The breadcrumb's sibling links (availability ↔ proposals) are omitted on the detail route
  itself, since `GroupDetail` already has its own explicit "Open the availability grid" / "See
  the proposals" links there; duplicating them in the breadcrumb seemed like clutter rather than
  a second way to the same place.

## Follow-ups for later

- None identified as blocking. If a future round wants the breadcrumb to also appear as
  cross-links on the detail page itself, that is a one-line change to `GroupNav`'s conditional.

## Commands to verify

Run from `frontend/` on Node 24 (`.nvmrc` says 24; `node --version` confirmed v24.21.0):

- `npm run typecheck` — exit 0
- `npm run lint` — exit 0
- `npm run format:check` — exit 0
- `npm test` — exit 0, 444 tests (baseline was 430), 62 files (baseline 61)
- `npm run build` — exit 0
- `npm run check:api` — exit 0
- `grep -rnE "#[0-9a-fA-F]{3,8}" src --include='*.tsx' --include='*.ts'` — no matches (exit 1)
- By hand: `npm run dev:mock`, sign in, open "Thesis planning" (a member group), reach its
  proposals, vote on the one proposal there, then use the breadcrumb to go back to the group and
  out to the groups list without the browser's back button.
